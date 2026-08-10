import * as crypto from 'node:crypto';
import { config } from '../config';

/**
 * AES-256-GCM for secrets at rest (provider API keys).
 * Key is derived from ENCRYPTION_KEY; ciphertext format: iv.tag.data (base64).
 */
const key = crypto.createHash('sha256').update(config.encryptionKey).digest();

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

export function decryptSecret(ciphertext: string): string {
  const [iv, tag, data] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
