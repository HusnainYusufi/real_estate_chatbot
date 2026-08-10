import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ default: 'free' })
  plan: string;

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
