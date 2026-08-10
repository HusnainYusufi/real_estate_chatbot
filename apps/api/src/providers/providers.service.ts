import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { decryptSecret, encryptSecret } from '../common/crypto';
import { ProviderKey } from '../entities/provider-key.entity';
import type { Provider } from '../catalog/catalog.service';

const PROVIDERS: Provider[] = ['anthropic', 'openai', 'gemini'];

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ProviderKey) private readonly keys: Repository<ProviderKey>,
  ) {}

  /** Save/replace a key. orgId null = platform-wide. "Paste a key and boom." */
  async setKey(provider: string, apiKey: string, orgId: string | null = null) {
    if (!PROVIDERS.includes(provider as Provider)) {
      throw new BadRequestException(`Unknown provider "${provider}". Use: ${PROVIDERS.join(', ')}`);
    }
    const trimmed = apiKey.trim();
    if (trimmed.length < 8) throw new BadRequestException('That does not look like an API key');

    const existing = await this.keys.findOneBy({
      provider,
      orgId: orgId === null ? IsNull() : orgId,
    });
    if (existing) await this.keys.remove(existing);

    const saved = await this.keys.save(
      this.keys.create({
        provider,
        orgId,
        encryptedKey: encryptSecret(trimmed),
        last4: trimmed.slice(-4),
      }),
    );
    return this.masked(saved);
  }

  async list(orgId: string | null = null) {
    const rows = await this.keys.find({
      where: { orgId: orgId === null ? IsNull() : orgId },
      order: { provider: 'ASC' },
    });
    return rows.map((r) => this.masked(r));
  }

  async remove(id: string): Promise<void> {
    const row = await this.keys.findOneBy({ id });
    if (!row) throw new NotFoundException('Key not found');
    await this.keys.remove(row);
  }

  /**
   * Key for a chat request: the org's own key wins, then the platform key,
   * then null (the AI engine falls back to its environment variables).
   */
  async resolveKey(orgId: string, provider: string): Promise<string | null> {
    const own = await this.keys.findOneBy({ provider, orgId });
    if (own) return decryptSecret(own.encryptedKey);
    const platform = await this.keys.findOneBy({ provider, orgId: IsNull() });
    return platform ? decryptSecret(platform.encryptedKey) : null;
  }

  /** Which providers have a usable stored key (platform level). */
  async configuredProviders(): Promise<string[]> {
    const rows = await this.keys.find({ where: { orgId: IsNull() } });
    return [...new Set(rows.map((r) => r.provider))];
  }

  private masked(row: ProviderKey) {
    return {
      id: row.id,
      provider: row.provider,
      orgId: row.orgId,
      keyPreview: `…${row.last4}`,
      createdAt: row.createdAt,
    };
  }
}
