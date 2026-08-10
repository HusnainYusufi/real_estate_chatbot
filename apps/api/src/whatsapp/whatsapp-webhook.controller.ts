import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config';
import { WhatsappService } from './whatsapp.service';

/**
 * Receives OpenWA webhook deliveries. Verified via HMAC-SHA256 of the raw
 * body against the secret we registered with the session
 * (header: X-Webhook-Signature: sha256=<hex>).
 */
@Controller('v1/channels/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly whatsapp: WhatsappService) {}

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>): { ok: boolean } {
    const raw = req.rawBody;
    if (!raw || !this.verifySignature(raw, req.headers)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      this.logger.warn('webhook with unparseable body — ignoring');
      return { ok: true };
    }

    // Ack immediately; processing (model call, reply) runs async.
    this.whatsapp.handleEvent(payload);
    return { ok: true };
  }

  private verifySignature(raw: Buffer, headers: Request['headers']): boolean {
    const header =
      headers['x-webhook-signature'] ??
      headers['x-signature'] ??
      headers['x-hub-signature-256'];
    if (typeof header !== 'string' || !header) return false;

    const provided = header.replace(/^sha256=/, '').trim();
    const expected = crypto
      .createHmac('sha256', config.openwaWebhookSecret)
      .update(raw)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}
