import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  botId: string;

  @Index()
  @Column('uuid')
  orgId: string;

  /** Where the conversation happens: 'web' (widget) or 'whatsapp'. */
  @Column('varchar', { default: 'web' })
  channel: string;

  /** Channel-specific peer id (WhatsApp chat JID like 628…@c.us). */
  @Index()
  @Column('varchar', { nullable: true })
  externalId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  conversationId: string;

  @Column('varchar')
  role: 'user' | 'assistant';

  /**
   * Raw Anthropic message content (string or content-block array), stored
   * verbatim so multi-turn tool use and thinking blocks replay correctly.
   */
  @Column('jsonb')
  content: unknown;

  /** Plain text extracted for dashboards/transcripts. */
  @Column('text', { default: '' })
  displayText: string;

  @Column('int', { default: 0 })
  inputTokens: number;

  @Column('int', { default: 0 })
  outputTokens: number;

  @Column('int', { default: 0 })
  cacheReadTokens: number;

  /** USD cost of this turn, computed from the model catalog at write time. */
  @Column('numeric', { precision: 12, scale: 6, default: 0 })
  costUsd: string;

  @CreateDateColumn()
  createdAt: Date;
}
