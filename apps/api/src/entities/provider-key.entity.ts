import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A stored LLM provider API key (encrypted at rest).
 * orgId = null → platform-wide key used by every client's bots;
 * orgId set   → that client's own key (BYO-key), takes precedence.
 */
@Entity('provider_keys')
export class ProviderKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid', { nullable: true })
  orgId: string | null;

  @Index()
  @Column('varchar')
  provider: string; // anthropic | openai | gemini

  @Column('text')
  encryptedKey: string;

  /** Last 4 characters, for display ("sk-…AbCd"). */
  @Column('varchar')
  last4: string;

  @CreateDateColumn()
  createdAt: Date;
}
