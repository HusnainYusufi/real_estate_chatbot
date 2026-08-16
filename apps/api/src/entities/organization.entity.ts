import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: 'free' })
  plan: string;

  /** Assigned pricing package (sets the limit + the price you bill). */
  @Column('uuid', { nullable: true })
  packageId: string | null;

  /** Monthly price billed to this client (snapshot of the package price). */
  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  monthlyPriceUsd: string;

  /** CRM lifecycle: lead | trial | active | paused | churned */
  @Column({ default: 'active' })
  status: string;

  /** Operator notes about this client (CRM). */
  @Column('text', { default: '' })
  notes: string;

  /** Assistant replies per calendar month. Enforced in ChatService. */
  @Column({ default: 1000 })
  monthlyMessageLimit: number;

  @CreateDateColumn()
  createdAt: Date;
}
