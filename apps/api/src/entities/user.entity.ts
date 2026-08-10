import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  orgId: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  name: string;

  @Column({ default: 'owner' })
  role: string;

  /** Platform operator: full access to /v1/admin/* across all client orgs. */
  @Column({ default: false })
  platformAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
