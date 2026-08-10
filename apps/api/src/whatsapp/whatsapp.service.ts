import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotsService } from '../bots/bots.service';
import { ChatService } from '../chat/chat.service';
import { config } from '../config';
import { WhatsappChannel } from '../entities/whatsapp-channel.entity';
import { OpenWAClient } from './openwa.client';

export interface ChannelStatus {
  connected: boolean;
  status: string;
  phone: string | null;
  /** Data-URI QR image while pairing (status qr_ready). */
  qr: string | null;
  sessionName: string;
}

/** Parsed inbound message from an OpenWA webhook (shape-tolerant). */
interface InboundMessage {
  chatId: string;
  body: string;
  fromMe: boolean;
  isGroup: boolean;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  /** Serialize turns per conversation peer so rapid messages don't interleave. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(WhatsappChannel)
    private readonly channels: Repository<WhatsappChannel>,
    private readonly openwa: OpenWAClient,
    private readonly bots: BotsService,
    private readonly chat: ChatService,
  ) {}

  // ── Provisioning (admin/dashboard) ───────────────────────────────────────

  /**
   * Attach WhatsApp to a bot: create + start an OpenWA session and register
   * our webhook. Returns status incl. the pairing QR once available.
   */
  async connect(orgId: string, botId: string): Promise<ChannelStatus> {
    const bot = await this.bots.getOwned(orgId, botId);
    const existing = await this.channels.findOneBy({ botId: bot.id });
    if (existing) throw new ConflictException('This bot already has a WhatsApp channel');

    const sessionName = `bot-${bot.id.slice(0, 8)}`;
    const session = await this.openwa.createSession(sessionName);

    // Best-effort: pairing (QR scan) must succeed even if the webhook can't be
    // registered. OpenWA's SSRF guard rejects private/localhost webhook URLs,
    // so inbound auto-reply won't work in local dev (the API isn't publicly
    // reachable) — but the number still pairs and can send/receive manually.
    // In production, PUBLIC_API_URL is a public HTTPS URL and this succeeds.
    try {
      await this.openwa.registerWebhook(
        session.id,
        `${config.publicApiUrl}/v1/channels/whatsapp/webhook`,
        config.openwaWebhookSecret,
      );
    } catch (err) {
      this.logger.warn(
        `Webhook registration failed for ${sessionName} (inbound auto-reply disabled until ` +
          `PUBLIC_API_URL is a publicly reachable HTTPS URL): ${
            err instanceof Error ? err.message : err
          }`,
      );
    }

    await this.openwa.startSession(session.id);

    await this.channels.save(
      this.channels.create({
        botId: bot.id,
        orgId,
        sessionId: session.id,
        sessionName,
        status: session.status ?? 'created',
      }),
    );
    return this.status(orgId, botId);
  }

  /** Live status + QR, refreshed from OpenWA and cached on the channel row. */
  async status(orgId: string, botId: string): Promise<ChannelStatus> {
    await this.bots.getOwned(orgId, botId);
    const channel = await this.channels.findOneBy({ botId });
    if (!channel) throw new NotFoundException('No WhatsApp channel for this bot');

    let status = channel.status;
    let phone = channel.phone;
    let qr: string | null = null;
    try {
      const session = await this.openwa.getSession(channel.sessionId);
      status = session.status ?? status;
      phone = session.phone ?? phone;
      if (status === 'qr_ready') qr = await this.openwa.getQrDataUri(channel.sessionId);
    } catch (err) {
      this.logger.warn(`status refresh failed for ${channel.sessionName}: ${err}`);
    }
    if (status !== channel.status || phone !== channel.phone) {
      channel.status = status;
      channel.phone = phone;
      await this.channels.save(channel);
    }
    return {
      connected: status === 'ready',
      status,
      phone,
      qr,
      sessionName: channel.sessionName,
    };
  }

  async disconnect(orgId: string, botId: string): Promise<void> {
    await this.bots.getOwned(orgId, botId);
    const channel = await this.channels.findOneBy({ botId });
    if (!channel) throw new NotFoundException('No WhatsApp channel for this bot');
    await this.openwa.deleteSession(channel.sessionId);
    await this.channels.remove(channel);
  }

  async channelForBot(botId: string): Promise<WhatsappChannel | null> {
    return this.channels.findOneBy({ botId });
  }

  // ── Inbound (webhook) ────────────────────────────────────────────────────

  /** Entry point for verified OpenWA webhook deliveries. Fast-ack: heavy work
   * runs async so OpenWA never times out waiting on the model. */
  handleEvent(payload: Record<string, unknown>): void {
    const event = String(payload.event ?? payload.type ?? '');
    const sessionRef = String(
      payload.sessionId ?? payload.session ?? payload.sessionName ?? '',
    );

    if (event.startsWith('session')) {
      void this.refreshSessionStatus(sessionRef).catch((err) =>
        this.logger.warn(`session status refresh failed: ${err}`),
      );
      return;
    }

    const message = this.parseInbound(payload);
    if (!message || message.fromMe || message.isGroup || !message.body.trim()) return;

    // Serialize per chat so rapid consecutive messages stay ordered.
    const key = `${sessionRef}:${message.chatId}`;
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev
      .then(() => this.reply(sessionRef, message))
      .catch((err) => this.logger.error(`whatsapp reply failed: ${err}`))
      .finally(() => {
        if (this.queues.get(key) === next) this.queues.delete(key);
      });
    this.queues.set(key, next);
  }

  private async reply(sessionRef: string, message: InboundMessage): Promise<void> {
    const channel = await this.findChannelBySessionRef(sessionRef);
    if (!channel) {
      this.logger.warn(`webhook for unknown session "${sessionRef}" — ignoring`);
      return;
    }
    const bot = await this.bots.getById(channel.botId);
    if (!bot || bot.status !== 'active') return;

    if (await this.chat.overMonthlyLimit(bot.orgId)) {
      await this.openwa.sendText(
        channel.sessionId,
        message.chatId,
        'Sorry — this assistant is temporarily unavailable. Please try again later.',
      );
      return;
    }

    const conversation = await this.chat.conversationForExternalPeer(
      bot,
      'whatsapp',
      message.chatId,
    );

    await this.openwa.sendTyping(channel.sessionId, message.chatId, 'typing');
    try {
      // WhatsApp can't stream tokens — collect the final text and send once.
      const result = await this.chat.runTurn(bot, conversation, message.body, () => {});
      const text = result.text.trim() || 'Sorry, I could not generate a reply. Please try again.';
      await this.openwa.sendText(channel.sessionId, message.chatId, text.slice(0, 60_000));
    } finally {
      await this.openwa.sendTyping(channel.sessionId, message.chatId, 'paused');
    }
  }

  private async refreshSessionStatus(sessionRef: string): Promise<void> {
    const channel = await this.findChannelBySessionRef(sessionRef);
    if (!channel) return;
    const session = await this.openwa.getSession(channel.sessionId);
    channel.status = session.status ?? channel.status;
    channel.phone = session.phone ?? channel.phone;
    await this.channels.save(channel);
  }

  private async findChannelBySessionRef(ref: string): Promise<WhatsappChannel | null> {
    if (!ref) return null;
    return (
      (await this.channels.findOneBy({ sessionId: ref })) ??
      (await this.channels.findOneBy({ sessionName: ref }))
    );
  }

  /** Tolerant extraction — OpenWA nests the message under message/data/payload. */
  private parseInbound(payload: Record<string, unknown>): InboundMessage | null {
    const raw = (payload.message ?? payload.data ?? payload.payload ?? payload) as Record<
      string,
      unknown
    >;
    if (typeof raw !== 'object' || raw === null) return null;
    const chatId = String(raw.chatId ?? raw.from ?? '');
    const body = String(raw.body ?? raw.text ?? '');
    if (!chatId) return null;
    return {
      chatId,
      body,
      fromMe: Boolean(raw.fromMe),
      isGroup: Boolean(raw.isGroup) || chatId.endsWith('@g.us'),
    };
  }
}
