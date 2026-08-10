import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BotsService } from '../bots/bots.service';
import { Bot } from '../entities/bot.entity';
import { KnowledgeService } from '../knowledge/knowledge.service';

export interface BotTemplate {
  id: string;
  name: string;
  tagline?: string;
  persona: string;
  instructions?: string;
  guardrails?: string;
  greeting?: string;
  suggestedQuestions?: string[];
  leadCaptureEnabled?: boolean;
  knowledgeFiles?: string[];
}

function findSeedDataDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../../seed-data'), // src|dist/templates → repo root
    path.resolve(__dirname, '../../../seed-data'),
    path.resolve(process.cwd(), 'seed-data'),
    path.resolve(process.cwd(), '../../seed-data'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'templates'))) return dir;
  }
  throw new Error('Could not locate seed-data/templates directory');
}

/**
 * Vertical bot templates (law-firm, real-estate, tax, …) loaded from
 * seed-data/templates. Adding a vertical = drop a JSON + markdown files there.
 */
@Injectable()
export class TemplatesService {
  private readonly seedDir = findSeedDataDir();

  list(): BotTemplate[] {
    const dir = path.join(this.seedDir, 'templates');
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((file) => {
        const spec = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as BotTemplate;
        return { ...spec, id: file.replace(/\.json$/, '') };
      });
  }

  get(templateId: string): BotTemplate {
    const template = this.list().find((t) => t.id === templateId);
    if (!template) throw new NotFoundException(`Unknown template "${templateId}"`);
    return template;
  }

  /** Create a bot for an org from a template, including its starter knowledge. */
  async instantiate(
    bots: BotsService,
    knowledge: KnowledgeService,
    orgId: string,
    templateId: string,
    overrides: { name?: string; greeting?: string } = {},
  ): Promise<Bot> {
    const template = this.get(templateId);
    const bot = await bots.create(orgId, {
      name: overrides.name?.trim() || template.name,
      tagline: template.tagline,
      persona: template.persona,
      instructions: template.instructions,
      guardrails: template.guardrails,
      greeting: overrides.greeting ?? template.greeting,
      suggestedQuestions: template.suggestedQuestions,
      leadCaptureEnabled: template.leadCaptureEnabled,
    });
    for (const file of template.knowledgeFiles ?? []) {
      const filePath = path.join(this.seedDir, 'knowledge', file);
      if (!fs.existsSync(filePath)) continue;
      await knowledge.addDocument(bot.id, file.replace(/\.md$/, ''), fs.readFileSync(filePath, 'utf8'));
    }
    return bot;
  }
}
