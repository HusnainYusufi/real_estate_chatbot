import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { BotsService } from '../bots/bots.service';
import { CatalogService } from '../catalog/catalog.service';
import { config } from '../config';
import { Bot } from '../entities/bot.entity';
import { Conversation, Message } from '../entities/conversation.entity';
import { Organization } from '../entities/organization.entity';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ProvidersService } from '../providers/providers.service';
import { extractDisplayText, SseFrameParser } from './sse';

interface EngineTurn {
  role: 'user' | 'assistant';
  content: unknown;
}

export type ChatEventSink = (event: string, data: unknown) => void;

export interface TurnResult {
  /** Final assistant text (for non-streaming channels like WhatsApp). */
  text: string;
  usage: Record<string, number> | null;
}

/**
 * Channel-agnostic chat pipeline. The web widget consumes it as SSE via
 * chat(); other channels (WhatsApp) call runTurn() with their own sink.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  /** One in-flight response per conversation. */
  private readonly inFlight = new Set<string>();

  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly bots: BotsService,
    private readonly knowledge: KnowledgeService,
    private readonly catalog: CatalogService,
    private readonly providers: ProvidersService,
  ) {}

  // ── Web widget entry point (SSE) ─────────────────────────────────────────

  async chat(
    botPublicId: string,
    conversationId: string | null,
    userText: string,
    res: Response,
  ): Promise<void> {
    const bot = await this.bots.getByPublicId(botPublicId);
    if (!bot) {
      res.status(404).json({ error: 'Bot not found or inactive' });
      return;
    }
    if (await this.overMonthlyLimit(bot.orgId)) {
      res.status(429).json({ error: 'This workspace has reached its monthly message limit.' });
      return;
    }

    let conversation =
      conversationId != null
        ? await this.conversations.findOneBy({ id: conversationId, botId: bot.id })
        : null;
    if (!conversation) conversation = await this.createConversation(bot, 'web', null);

    if (this.inFlight.has(conversation.id)) {
      res.status(409).json({ error: 'A response is already streaming for this conversation' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send: ChatEventSink = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('conversation', { conversationId: conversation.id });

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    try {
      await this.runTurn(bot, conversation, userText, send, abort.signal);
    } catch (err) {
      this.logger.error(`web chat failed: ${err instanceof Error ? err.message : err}`);
      send('error', { message: 'The assistant is temporarily unavailable. Please try again.' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  // ── Shared pipeline (any channel) ────────────────────────────────────────

  /**
   * Run one full turn: persist the user message, stream from the AI engine,
   * relay events to `sink`, persist the resulting turns, return final text.
   * Throws if a turn is already running for this conversation.
   */
  async runTurn(
    bot: Bot,
    conversation: Conversation,
    userText: string,
    sink: ChatEventSink,
    signal?: AbortSignal,
  ): Promise<TurnResult> {
    if (this.inFlight.has(conversation.id)) {
      throw new Error('A response is already in flight for this conversation');
    }
    this.inFlight.add(conversation.id);
    try {
      const history = await this.loadHistory(conversation.id);
      await this.messages.save(
        this.messages.create({
          conversationId: conversation.id,
          role: 'user',
          content: userText,
          displayText: userText,
        }),
      );

      const result = await this.relayFromEngine(
        bot,
        conversation.id,
        history,
        userText,
        sink,
        signal,
      );
      await this.persistTurns(bot, conversation, result.turns, result.usage);

      const lastAssistant = [...result.turns].reverse().find((t) => t.role === 'assistant');
      return {
        text: lastAssistant ? extractDisplayText(lastAssistant.content) : '',
        usage: result.usage,
      };
    } finally {
      this.inFlight.delete(conversation.id);
    }
  }

  async createConversation(
    bot: Bot,
    channel: string,
    externalId: string | null,
  ): Promise<Conversation> {
    return this.conversations.save(
      this.conversations.create({ botId: bot.id, orgId: bot.orgId, channel, externalId }),
    );
  }

  /** Find or create the conversation for a channel peer (e.g. WhatsApp JID). */
  async conversationForExternalPeer(bot: Bot, channel: string, externalId: string) {
    const existing = await this.conversations.findOneBy({ botId: bot.id, channel, externalId });
    return existing ?? this.createConversation(bot, channel, externalId);
  }

  async overMonthlyLimit(orgId: string): Promise<boolean> {
    const org = await this.orgs.findOneBy({ id: orgId });
    if (!org) return true;
    const [{ count }]: { count: number }[] = await this.messages.query(
      `SELECT COUNT(*)::int AS count
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.org_id = $1
         AND m.role = 'assistant'
         AND m.created_at >= date_trunc('month', now())`,
      [orgId],
    );
    return count >= org.monthlyMessageLimit;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async relayFromEngine(
    bot: Bot,
    conversationId: string,
    history: EngineTurn[],
    userText: string,
    sink: ChatEventSink,
    signal?: AbortSignal,
  ): Promise<{ turns: EngineTurn[]; usage: Record<string, number> | null }> {
    const provider = this.catalog.providerFor(bot.model);
    const apiKey = await this.providers.resolveKey(bot.orgId, provider);

    const payload = {
      conversation_id: conversationId,
      api_key: apiKey, // null → engine falls back to its env credentials
      bot: {
        id: bot.id,
        name: bot.name,
        persona: bot.persona,
        instructions: bot.instructions,
        guardrails: bot.guardrails,
        model: bot.model,
        provider,
        max_tokens: bot.maxTokens,
        effort: bot.effort,
        lead_capture_enabled: bot.leadCaptureEnabled,
        has_knowledge: await this.knowledge.botHasKnowledge(bot.id),
        custom_tools: (bot.customTools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
          webhook_url: t.webhookUrl,
          secret: t.secret ?? null,
        })),
      },
      messages: [...history, { role: 'user', content: userText }],
    };

    const upstream = await fetch(`${config.aiEngineUrl}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': config.internalApiKey,
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '');
      throw new Error(`AI engine returned ${upstream.status}: ${detail.slice(0, 300)}`);
    }

    const parser = new SseFrameParser();
    const decoder = new TextDecoder();
    let turns: EngineTurn[] = [];
    let usage: Record<string, number> | null = null;

    try {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        for (const frame of parser.push(decoder.decode(chunk, { stream: true }))) {
          if (frame.event === 'turns') {
            turns = (frame.data as { messages: EngineTurn[] }).messages ?? [];
          } else {
            if (frame.event === 'done') {
              usage = (frame.data as { usage: Record<string, number> }).usage ?? null;
            }
            sink(frame.event, frame.data);
          }
        }
      }
    } catch (err) {
      if (!signal?.aborted) throw err;
      // Caller went away — keep whatever turns arrived.
    }

    return { turns, usage };
  }

  private async persistTurns(
    bot: Bot,
    conversation: Conversation,
    turns: EngineTurn[],
    usage: Record<string, number> | null,
  ): Promise<void> {
    if (turns.length === 0) return;
    const lastAssistantIdx = turns.reduce((last, t, i) => (t.role === 'assistant' ? i : last), -1);
    const cost = usage
      ? this.catalog.costUsd(bot.model, {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.cacheReadTokens ?? 0,
        })
      : 0;
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      await this.messages.save(
        this.messages.create({
          conversationId: conversation.id,
          role: turn.role,
          content: turn.content,
          displayText: extractDisplayText(turn.content),
          ...(i === lastAssistantIdx && usage
            ? {
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
                cacheReadTokens: usage.cacheReadTokens ?? 0,
                costUsd: cost.toFixed(6),
              }
            : {}),
        }),
      );
    }
    conversation.updatedAt = new Date();
    await this.conversations.save(conversation);
  }

  private async loadHistory(conversationId: string): Promise<EngineTurn[]> {
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((m) => ({ role: m.role, content: m.content }));
  }
}
