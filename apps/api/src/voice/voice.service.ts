import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotsService } from '../bots/bots.service';
import { CatalogService } from '../catalog/catalog.service';
import { config } from '../config';
import { Call } from '../entities/call.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { ProvidersService } from '../providers/providers.service';

const E164 = /^\+[1-9]\d{6,14}$/;

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    @InjectRepository(PhoneNumber) private readonly numbers: Repository<PhoneNumber>,
    @InjectRepository(Call) private readonly calls: Repository<Call>,
    private readonly bots: BotsService,
    private readonly catalog: CatalogService,
    private readonly providers: ProvidersService,
  ) {}

  // ── Number mapping (admin) ───────────────────────────────────────────────

  async attachNumber(orgId: string, botId: string, number: string): Promise<PhoneNumber> {
    const bot = await this.bots.getOwned(orgId, botId);
    const normalized = number.trim();
    if (!E164.test(normalized)) {
      throw new BadRequestException('Number must be E.164 format, e.g. +14155550100');
    }
    const existing = await this.numbers.findOneBy({ number: normalized });
    if (existing) throw new ConflictException('That number is already attached to a bot');
    return this.numbers.save(
      this.numbers.create({ number: normalized, botId: bot.id, orgId }),
    );
  }

  async listNumbers(orgId: string, botId: string): Promise<PhoneNumber[]> {
    await this.bots.getOwned(orgId, botId);
    return this.numbers.find({ where: { botId }, order: { createdAt: 'ASC' } });
  }

  async detachNumber(orgId: string, numberId: string): Promise<void> {
    const row = await this.numbers.findOneBy({ id: numberId, orgId });
    if (!row) throw new NotFoundException('Number not found');
    await this.numbers.remove(row);
  }

  // ── Outbound call (admin / API) ──────────────────────────────────────────

  async placeOutboundCall(orgId: string, botId: string, toNumber: string): Promise<Call> {
    const bot = await this.bots.getOwned(orgId, botId);
    const to = toNumber.trim();
    if (!E164.test(to)) {
      throw new BadRequestException('Destination must be E.164, e.g. +14155551234');
    }
    // A caller-ID DID must be attached for outbound.
    const from = await this.numbers.findOne({
      where: [
        { botId, usage: 'outbound' },
        { botId, usage: 'inbound_outbound' },
      ],
      order: { createdAt: 'ASC' },
    });

    const call = await this.calls.save(
      this.calls.create({
        botId: bot.id,
        orgId,
        direction: 'outbound',
        peerNumber: to,
        status: 'in_progress',
      }),
    );

    try {
      const res = await fetch(`${config.voiceAgentUrl}/calls/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Key': config.internalApiKey },
        body: JSON.stringify({
          bot_id: bot.id,
          to_number: to,
          from_number: from?.number ?? null,
          call_id: call.id,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        call.status = 'failed';
        await this.calls.save(call);
        throw new ServiceUnavailableException(
          (detail as { detail?: string }).detail ??
            `Voice agent returned ${res.status}. Is it running and is the SIP trunk configured?`,
        );
      }
      const data = (await res.json()) as { room?: string };
      call.room = data.room ?? null;
      return this.calls.save(call);
    } catch (err) {
      call.status = 'failed';
      await this.calls.save(call).catch(() => undefined);
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        `Could not reach the voice agent at ${config.voiceAgentUrl}. Is it running?`,
      );
    }
  }

  listCalls(orgId: string, botId: string): Promise<Call[]> {
    return this.calls.find({
      where: { orgId, botId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ── Internal (voice agent → us) ──────────────────────────────────────────

  /** Resolve the bot + provider key for a call, by dialed number or bot id. */
  async resolveForCall(input: { phone?: string; botId?: string }) {
    let bot = null;
    if (input.botId) {
      bot = await this.bots.getById(input.botId);
    } else if (input.phone) {
      const mapping = await this.numbers.findOneBy({ number: input.phone.trim() });
      if (mapping) bot = await this.bots.getById(mapping.botId);
    }
    if (!bot || bot.status !== 'active') throw new NotFoundException('No active bot for this call');

    const provider = this.catalog.providerFor(bot.model);
    const apiKey = await this.providers.resolveKey(bot.orgId, provider);
    return {
      id: bot.id,
      name: bot.name,
      persona: bot.persona,
      instructions: bot.instructions,
      guardrails: bot.guardrails,
      greeting: bot.greeting,
      model: bot.model,
      provider,
      apiKey,
      leadCaptureEnabled: bot.leadCaptureEnabled,
      hasKnowledge: true, // engine calls search_knowledge; it returns empty if none
    };
  }

  async createCallRecord(input: {
    botId: string;
    direction: string;
    peerNumber: string;
    room?: string;
  }): Promise<{ callId: string }> {
    const bot = await this.bots.getById(input.botId);
    if (!bot) throw new NotFoundException('Bot not found');
    const call = await this.calls.save(
      this.calls.create({
        botId: bot.id,
        orgId: bot.orgId,
        direction: input.direction,
        peerNumber: input.peerNumber,
        room: input.room ?? null,
        status: 'in_progress',
      }),
    );
    return { callId: call.id };
  }

  async finishCallRecord(
    callId: string,
    input: { transcript?: unknown; status?: string; durationSeconds?: number },
  ): Promise<void> {
    const call = await this.calls.findOneBy({ id: callId });
    if (!call) return;
    if (input.transcript !== undefined) call.transcript = input.transcript;
    if (input.status) call.status = input.status;
    if (typeof input.durationSeconds === 'number') call.durationSeconds = input.durationSeconds;
    else call.durationSeconds = Math.round((Date.now() - call.createdAt.getTime()) / 1000);
    await this.calls.save(call);
  }
}
