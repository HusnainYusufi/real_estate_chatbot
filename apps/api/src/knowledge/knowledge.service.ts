import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chunkDocument } from '../common/chunker';
import { KnowledgeChunk, KnowledgeDocument } from '../entities/knowledge.entity';
import { ingestUrl } from './url-ingest';

export interface KnowledgeSearchHit {
  documentTitle: string;
  heading: string;
  content: string;
  rank: number;
}

@Injectable()
export class KnowledgeService implements OnModuleInit {
  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly documents: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk)
    private readonly chunks: Repository<KnowledgeChunk>,
  ) {}

  /** GIN index for full-text search over chunks (idempotent). */
  async onModuleInit(): Promise<void> {
    await this.chunks.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_fts
      ON knowledge_chunks
      USING GIN (to_tsvector('english', coalesce(heading, '') || ' ' || content))
    `);
  }

  listDocuments(botId: string): Promise<Omit<KnowledgeDocument, 'content'>[]> {
    return this.documents.find({
      where: { botId },
      select: ['id', 'botId', 'title', 'chunkCount', 'createdAt'],
      order: { createdAt: 'ASC' },
    });
  }

  async addDocument(botId: string, title: string, content: string): Promise<KnowledgeDocument> {
    const doc = await this.documents.save(
      this.documents.create({ botId, title, content, chunkCount: 0 }),
    );
    const chunks = chunkDocument(content).map((c) =>
      this.chunks.create({
        botId,
        documentId: doc.id,
        heading: c.heading,
        content: c.content,
        position: c.position,
      }),
    );
    await this.chunks.save(chunks, { chunk: 100 });
    doc.chunkCount = chunks.length;
    return this.documents.save(doc);
  }

  /**
   * "Train" a bot from a website: fetch the URL (optionally crawl the site),
   * extract readable text, and index each page as a knowledge document.
   */
  async addFromUrl(
    botId: string,
    url: string,
    opts: { crawl?: boolean; maxPages?: number } = {},
  ): Promise<{ documents: { id: string; title: string; url: string; chunkCount: number }[] }> {
    const pages = await ingestUrl(url, opts);
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();

    const documents = [];
    for (const page of pages) {
      const title = page.title || `${host} — ${new URL(page.url).pathname}`;
      const doc = await this.addDocument(botId, title.slice(0, 200), page.text);
      documents.push({ id: doc.id, title: doc.title, url: page.url, chunkCount: doc.chunkCount });
    }
    return { documents };
  }

  async removeDocument(botId: string, documentId: string): Promise<void> {
    const doc = await this.documents.findOneBy({ id: documentId, botId });
    if (!doc) throw new NotFoundException('Document not found');
    await this.chunks.delete({ documentId });
    await this.documents.remove(doc);
  }

  async botHasKnowledge(botId: string): Promise<boolean> {
    return (await this.chunks.countBy({ botId })) > 0;
  }

  /** Postgres full-text search, scoped to one bot. */
  async search(botId: string, query: string, limit = 4): Promise<KnowledgeSearchHit[]> {
    const rows: {
      title: string;
      heading: string;
      content: string;
      rank: number;
    }[] = await this.chunks.query(
      `
      SELECT d.title, k.heading, k.content,
             ts_rank(
               to_tsvector('english', coalesce(k.heading, '') || ' ' || k.content),
               plainto_tsquery('english', $2)
             ) AS rank
      FROM knowledge_chunks k
      JOIN knowledge_documents d ON d.id = k.document_id
      WHERE k.bot_id = $1
        AND to_tsvector('english', coalesce(k.heading, '') || ' ' || k.content)
            @@ plainto_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT $3
      `,
      [botId, query, limit],
    );
    return rows.map((r) => ({
      documentTitle: r.title,
      heading: r.heading,
      content: r.content,
      rank: Number(r.rank),
    }));
  }
}
