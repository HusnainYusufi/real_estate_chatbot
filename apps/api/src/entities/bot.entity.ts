import {
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A tenant-configurable custom action: the model sees it as a tool; when
 * called, the AI engine POSTs the input to the tenant's webhook.
 */
export interface CustomToolConfig {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  webhookUrl: string;
  secret?: string;
}

@Entity('bots')
export class Bot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  orgId: string;

  /** Non-guessable id used by the embeddable widget (no auth required). */
  @Index({ unique: true })
  @Column('uuid')
  @Generated('uuid')
  publicId: string;

  @Column()
  name: string;

  @Column('varchar', { nullable: true })
  tagline: string | null;

  @Column('text')
  persona: string;

  @Column('text', { nullable: true })
  instructions: string | null;

  @Column('text', { nullable: true })
  guardrails: string | null;

  @Column('text', { nullable: true })
  greeting: string | null;

  @Column('jsonb', { default: () => "'[]'" })
  suggestedQuestions: string[];

  @Column('varchar', { nullable: true })
  model: string | null;

  @Column('int', { nullable: true })
  maxTokens: number | null;

  @Column('varchar', { nullable: true })
  effort: string | null;

  @Column({ default: false })
  leadCaptureEnabled: boolean;

  @Column('jsonb', { default: () => "'[]'" })
  customTools: CustomToolConfig[];

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
