import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  botId: string;

  @Column('uuid', { nullable: true })
  conversationId: string | null;

  @Column()
  name: string;

  @Column()
  contact: string;

  @Column('text', { default: '' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
