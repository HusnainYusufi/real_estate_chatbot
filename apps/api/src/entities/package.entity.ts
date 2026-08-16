import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A pricing plan an operator sells to clients, e.g. "Starter — 1,000
 * responses / month for $49". Defined once, assigned to any number of clients.
 */
@Entity('packages')
export class Package {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  name: string;

  @Column('varchar', { nullable: true })
  description: string | null;

  /** Included assistant replies per calendar month. */
  @Column('int')
  monthlyResponseLimit: number;

  /** What you charge the client per month, in the currency below. */
  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  priceUsd: string;

  @Column('varchar', { default: 'USD' })
  currency: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
