import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  botId: string;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column('int', { default: 0 })
  chunkCount: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  botId: string;

  @Index()
  @Column('uuid')
  documentId: string;

  @Column({ default: '' })
  heading: string;

  @Column('text')
  content: string;

  @Column('int')
  position: number;
}
