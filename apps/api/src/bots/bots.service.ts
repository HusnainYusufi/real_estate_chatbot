import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bot, CustomToolConfig } from '../entities/bot.entity';
import type { UpsertBotDto } from './bots.dto';

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED_TOOL_NAMES = new Set(['search_knowledge', 'capture_lead']);

@Injectable()
export class BotsService {
  constructor(@InjectRepository(Bot) private readonly bots: Repository<Bot>) {}

  list(orgId: string): Promise<Bot[]> {
    return this.bots.find({ where: { orgId }, order: { createdAt: 'ASC' } });
  }

  async getOwned(orgId: string, botId: string): Promise<Bot> {
    const bot = await this.bots.findOneBy({ id: botId, orgId });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  getByPublicId(publicId: string): Promise<Bot | null> {
    return this.bots.findOneBy({ publicId, status: 'active' });
  }

  /** Internal lookup by primary id (no org scoping — for trusted callers). */
  getById(id: string): Promise<Bot | null> {
    return this.bots.findOneBy({ id });
  }

  async create(orgId: string, dto: UpsertBotDto): Promise<Bot> {
    this.validateCustomTools(dto.customTools);
    const bot = this.bots.create({
      orgId,
      name: dto.name,
      tagline: dto.tagline ?? null,
      persona: dto.persona,
      instructions: dto.instructions ?? null,
      guardrails: dto.guardrails ?? null,
      greeting: dto.greeting ?? null,
      suggestedQuestions: dto.suggestedQuestions ?? [],
      model: dto.model ?? null,
      maxTokens: dto.maxTokens ?? null,
      effort: dto.effort ?? null,
      leadCaptureEnabled: dto.leadCaptureEnabled ?? false,
      customTools: dto.customTools ?? [],
    });
    return this.bots.save(bot);
  }

  async update(orgId: string, botId: string, dto: Partial<UpsertBotDto>): Promise<Bot> {
    const bot = await this.getOwned(orgId, botId);
    if (dto.customTools) this.validateCustomTools(dto.customTools);
    Object.assign(bot, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.tagline !== undefined && { tagline: dto.tagline }),
      ...(dto.persona !== undefined && { persona: dto.persona }),
      ...(dto.instructions !== undefined && { instructions: dto.instructions }),
      ...(dto.guardrails !== undefined && { guardrails: dto.guardrails }),
      ...(dto.greeting !== undefined && { greeting: dto.greeting }),
      ...(dto.suggestedQuestions !== undefined && { suggestedQuestions: dto.suggestedQuestions }),
      ...(dto.model !== undefined && { model: dto.model }),
      ...(dto.maxTokens !== undefined && { maxTokens: dto.maxTokens }),
      ...(dto.effort !== undefined && { effort: dto.effort }),
      ...(dto.leadCaptureEnabled !== undefined && { leadCaptureEnabled: dto.leadCaptureEnabled }),
      ...(dto.customTools !== undefined && { customTools: dto.customTools }),
      ...(dto.status !== undefined && { status: dto.status }),
    });
    return this.bots.save(bot);
  }

  async remove(orgId: string, botId: string): Promise<void> {
    const bot = await this.getOwned(orgId, botId);
    await this.bots.remove(bot);
  }

  private validateCustomTools(tools: CustomToolConfig[] | undefined): void {
    for (const tool of tools ?? []) {
      if (!TOOL_NAME_RE.test(tool.name)) {
        throw new BadRequestException(
          `Tool name "${tool.name}" must match ${TOOL_NAME_RE} (lowercase, digits, underscores)`,
        );
      }
      if (RESERVED_TOOL_NAMES.has(tool.name)) {
        throw new BadRequestException(`Tool name "${tool.name}" is reserved`);
      }
      if (!tool.description || tool.description.length < 10) {
        throw new BadRequestException(
          `Tool "${tool.name}" needs a real description — the model decides when to call it based on this text`,
        );
      }
      let url: URL;
      try {
        url = new URL(tool.webhookUrl);
      } catch {
        throw new BadRequestException(`Tool "${tool.name}" has an invalid webhookUrl`);
      }
      if (url.protocol !== 'https:' && process.env.ALLOW_INSECURE_WEBHOOKS !== '1') {
        throw new BadRequestException(
          `Tool "${tool.name}": webhookUrl must be https (set ALLOW_INSECURE_WEBHOOKS=1 for local dev)`,
        );
      }
      if (typeof tool.inputSchema !== 'object' || tool.inputSchema === null) {
        throw new BadRequestException(`Tool "${tool.name}" needs a JSON-schema inputSchema object`);
      }
    }
  }
}
