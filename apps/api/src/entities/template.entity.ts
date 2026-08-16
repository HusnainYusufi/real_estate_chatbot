import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A reusable bot persona ("industry template"), stored in the DB and managed
 * at runtime from the admin panel — no redeploy to add or edit one.
 */
@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
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

  @Column({ default: false })
  leadCaptureEnabled: boolean;

  /** Optional starter knowledge (markdown), indexed into new bots on create. */
  @Column('text', { nullable: true })
  knowledgeSeed: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
