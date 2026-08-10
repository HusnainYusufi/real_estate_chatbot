import * as path from 'node:path';
import * as dotenv from 'dotenv';

// Single .env at the repo root (../../.. from src/ or dist/). Missing files
// are ignored — in containers everything arrives as real env vars.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://chatbot:chatbot@localhost:5432/chatbot',
  /** Dev convenience: auto-sync schema. Use real migrations in production. */
  dbSync: process.env.DB_SYNC !== 'false',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  aiEngineUrl: process.env.AI_ENGINE_URL ?? 'http://localhost:8000',
  /** Shared secret between the API and the AI engine. */
  internalApiKey: process.env.INTERNAL_API_KEY ?? 'dev-internal-key-change-me',

  /** How OTHER services (OpenWA webhooks) reach this API. */
  publicApiUrl: process.env.PUBLIC_API_URL ?? 'http://localhost:4000',
  /** OpenWA gateway (self-hosted WhatsApp automation). */
  openwaUrl: process.env.OPENWA_URL ?? 'http://localhost:2785',
  openwaApiKey: process.env.OPENWA_API_KEY ?? '',
  /** Secret we register with OpenWA; it signs webhook deliveries with it. */
  openwaWebhookSecret:
    process.env.OPENWA_WEBHOOK_SECRET ?? 'dev-openwa-webhook-secret-change-me',
  /** Encrypts provider API keys at rest (AES-256-GCM). */
  encryptionKey: process.env.ENCRYPTION_KEY ?? 'dev-encryption-key-change-me',

  /** Voice agent service (LiveKit-based) for outbound calling. */
  voiceAgentUrl: process.env.VOICE_AGENT_URL ?? 'http://localhost:8100',
};

if (config.jwtSecret === 'dev-only-secret-change-me') {
  console.warn('[config] JWT_SECRET is not set — using an insecure dev default.');
}
