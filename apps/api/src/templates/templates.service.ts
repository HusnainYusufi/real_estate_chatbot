import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Repository } from 'typeorm';
import { BotsService } from '../bots/bots.service';
import { Bot } from '../entities/bot.entity';
import { Template } from '../entities/template.entity';
import { KnowledgeService } from '../knowledge/knowledge.service';

export interface UpsertTemplateDto {
  name: string;
  tagline?: string | null;
  persona: string;
  instructions?: string | null;
  guardrails?: string | null;
  greeting?: string | null;
  suggestedQuestions?: string[];
  leadCaptureEnabled?: boolean;
  knowledgeSeed?: string | null;
}

/**
 * Bot personas ("industry templates") stored in the DB and managed at runtime.
 * On first boot (empty table) we import the bundled seed-data templates so the
 * menu isn't empty; after that everything is created/edited from the panel —
 * no redeploy.
 */
@Injectable()
export class TemplatesService implements OnModuleInit {
  constructor(
    @InjectRepository(Template) private readonly templates: Repository<Template>,
  ) {}

  async onModuleInit(): Promise<void> {
    if ((await this.templates.count()) > 0) return;
    const seedDir = findSeedDataDir();
    if (!seedDir) return;
    const dir = path.join(seedDir, 'templates');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const knowledgeSeed = (spec.knowledgeFiles ?? [])
        .map((f: string) => {
          const p = path.join(seedDir, 'knowledge', f);
          return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
        })
        .filter(Boolean)
        .join('\n\n');
      await this.templates.save(
        this.templates.create({
          name: spec.name,
          tagline: spec.tagline ?? null,
          persona: spec.persona,
          instructions: spec.instructions ?? null,
          guardrails: spec.guardrails ?? null,
          greeting: spec.greeting ?? null,
          suggestedQuestions: spec.suggestedQuestions ?? [],
          leadCaptureEnabled: spec.leadCaptureEnabled ?? false,
          knowledgeSeed: knowledgeSeed || null,
        }),
      );
    }
  }

  list(): Promise<Template[]> {
    return this.templates.find({ order: { createdAt: 'ASC' } });
  }

  async get(id: string): Promise<Template> {
    const t = await this.templates.findOneBy({ id });
    if (!t) throw new NotFoundException(`Unknown template "${id}"`);
    return t;
  }

  create(dto: UpsertTemplateDto): Promise<Template> {
    return this.templates.save(
      this.templates.create({
        name: dto.name,
        tagline: dto.tagline ?? null,
        persona: dto.persona,
        instructions: dto.instructions ?? null,
        guardrails: dto.guardrails ?? null,
        greeting: dto.greeting ?? null,
        suggestedQuestions: dto.suggestedQuestions ?? [],
        leadCaptureEnabled: dto.leadCaptureEnabled ?? false,
        knowledgeSeed: dto.knowledgeSeed ?? null,
      }),
    );
  }

  async update(id: string, dto: Partial<UpsertTemplateDto>): Promise<Template> {
    const t = await this.get(id);
    Object.assign(t, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.tagline !== undefined && { tagline: dto.tagline }),
      ...(dto.persona !== undefined && { persona: dto.persona }),
      ...(dto.instructions !== undefined && { instructions: dto.instructions }),
      ...(dto.guardrails !== undefined && { guardrails: dto.guardrails }),
      ...(dto.greeting !== undefined && { greeting: dto.greeting }),
      ...(dto.suggestedQuestions !== undefined && { suggestedQuestions: dto.suggestedQuestions }),
      ...(dto.leadCaptureEnabled !== undefined && { leadCaptureEnabled: dto.leadCaptureEnabled }),
      ...(dto.knowledgeSeed !== undefined && { knowledgeSeed: dto.knowledgeSeed }),
    });
    return this.templates.save(t);
  }

  async remove(id: string): Promise<void> {
    await this.templates.remove(await this.get(id));
  }

  /** Create a bot for an org from a template, including its starter knowledge. */
  async instantiate(
    bots: BotsService,
    knowledge: KnowledgeService,
    orgId: string,
    templateId: string,
    overrides: { name?: string; greeting?: string } = {},
  ): Promise<Bot> {
    const template = await this.get(templateId);
    const bot = await bots.create(orgId, {
      name: overrides.name?.trim() || template.name,
      tagline: template.tagline ?? undefined,
      persona: template.persona,
      instructions: template.instructions ?? undefined,
      guardrails: template.guardrails ?? undefined,
      greeting: overrides.greeting ?? template.greeting ?? undefined,
      suggestedQuestions: template.suggestedQuestions,
      leadCaptureEnabled: template.leadCaptureEnabled,
    });
    if (template.knowledgeSeed?.trim()) {
      await knowledge.addDocument(bot.id, `${template.name} starter knowledge`, template.knowledgeSeed);
    }
    return bot;
  }
}

function findSeedDataDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../../seed-data'),
    path.resolve(__dirname, '../../../seed-data'),
    path.resolve(process.cwd(), 'seed-data'),
    path.resolve(process.cwd(), '../../seed-data'),
  ];
  return candidates.find((d) => fs.existsSync(path.join(d, 'templates'))) ?? null;
}
