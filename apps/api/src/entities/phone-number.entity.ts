import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** A phone number (DID) mapped to a bot for inbound voice calls. */
@Entity('phone_numbers')
export class PhoneNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** E.164, e.g. +14155550100. Unique across the platform. */
  @Index({ unique: true })
  @Column('varchar')
  number: string;

  @Index()
  @Column('uuid')
  botId: string;

  @Index()
  @Column('uuid')
  orgId: string;

  @Column({ default: 'inbound_outbound' })
  usage: string; // inbound | outbound | inbound_outbound

  @CreateDateColumn()
  createdAt: Date;
}
