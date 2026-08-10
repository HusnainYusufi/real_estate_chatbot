import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { config } from '../config';

/**
 * Thin HTTP client for a self-hosted OpenWA gateway
 * (https://github.com/rmyndharis/OpenWA — REST API on port 2785).
 *
 * All WhatsApp specifics are contained here: if you later switch to the
 * official WhatsApp Cloud API (or another gateway), this is the only file
 * plus WhatsappService that changes.
 */
@Injectable()
export class OpenWAClient {
  private readonly logger = new Logger(OpenWAClient.name);

  get configured(): boolean {
    return Boolean(config.openwaApiKey);
  }

  /** POST /api/sessions → { id, name, status, ... } */
  createSession(name: string): Promise<{ id: string; name: string; status: string }> {
    return this.request('POST', '/api/sessions', { name });
  }

  /** POST /api/sessions/:id/start */
  startSession(sessionId: string): Promise<unknown> {
    return this.request('POST', `/api/sessions/${sessionId}/start`);
  }

  /** GET /api/sessions/:id → { status: created|initializing|qr_ready|authenticating|ready|disconnected|action_required|failed, phone, ... } */
  getSession(sessionId: string): Promise<{ status: string; phone?: string | null }> {
    return this.request('GET', `/api/sessions/${sessionId}`);
  }

  /** DELETE /api/sessions/:id — best-effort teardown. */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.request('DELETE', `/api/sessions/${sessionId}`);
    } catch (err) {
      this.logger.warn(`deleteSession(${sessionId}) failed: ${err}`);
    }
  }

  /**
   * GET /api/sessions/:id/qr — normalized to a data URI the admin panel can
   * render directly in an <img>. Handles both image and JSON responses.
   */
  async getQrDataUri(sessionId: string): Promise<string | null> {
    const res = await this.rawRequest('GET', `/api/sessions/${sessionId}/qr`);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${contentType};base64,${buf.toString('base64')}`;
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    for (const key of ['qr', 'qrCode', 'base64', 'data', 'image']) {
      const value = body[key];
      if (typeof value === 'string' && value.length > 0) {
        return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
      }
    }
    return null;
  }

  /** POST /api/sessions/:id/webhooks — subscribe this API to inbound events. */
  registerWebhook(sessionId: string, url: string, secret: string): Promise<unknown> {
    return this.request('POST', `/api/sessions/${sessionId}/webhooks`, {
      url,
      events: ['message.received', 'session.status'],
      secret,
    });
  }

  /** POST /api/sessions/:id/messages/send-text */
  sendText(sessionId: string, chatId: string, text: string): Promise<unknown> {
    return this.request('POST', `/api/sessions/${sessionId}/messages/send-text`, {
      chatId,
      text,
    });
  }

  /** POST /api/sessions/:id/chats/typing — presence indicator (best-effort). */
  async sendTyping(sessionId: string, chatId: string, state: 'typing' | 'paused'): Promise<void> {
    try {
      await this.request('POST', `/api/sessions/${sessionId}/chats/typing`, { chatId, state });
    } catch {
      // Presence is cosmetic — never fail a reply over it.
    }
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.rawRequest(method, path, body);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenWA ${method} ${path} → ${res.status}: ${detail.slice(0, 300)}`);
    }
    return (await res.json().catch(() => ({}))) as T;
  }

  private async rawRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<globalThis.Response> {
    if (!this.configured) {
      // 503 (not 500) so the panel shows an actionable message, not "Internal server error".
      throw new ServiceUnavailableException(
        'WhatsApp gateway not configured. Start the OpenWA service (docker compose up -d openwa), ' +
          'create an API key in its dashboard, set OPENWA_API_KEY in .env, and restart the API.',
      );
    }
    try {
      return await fetch(`${config.openwaUrl}${path}`, {
        method,
        headers: {
          'X-API-Key': config.openwaApiKey,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      // Connection refused / DNS / timeout — gateway down or unreachable.
      throw new ServiceUnavailableException(
        `Could not reach the WhatsApp gateway at ${config.openwaUrl}. Is the OpenWA service running? (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
  }
}
