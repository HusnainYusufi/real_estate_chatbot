import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** A voice call handled by a bot (inbound or outbound). */
@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  botId: string;

  @Index()
  @Column('uuid')
  orgId: string;

  @Column('varchar')
  direction: string; // inbound | outbound

  /** The other party's number (E.164). */
  @Column('varchar')
  peerNumber: string;

  /** LiveKit room name, for tracing. */
  @Column('varchar', { nullable: true })
  room: string | null;

  @Column('varchar', { default: 'in_progress' })
  status: string; // in_progress | completed | failed | no_answer

  /** Full turn-by-turn transcript [{role, text}]. */
  @Column('jsonb', { default: () => "'[]'" })
  transcript: unknown;

  @Column('int', { default: 0 })
  durationSeconds: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
