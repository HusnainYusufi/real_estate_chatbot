import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Provider = 'anthropic' | 'openai' | 'gemini';

export interface CatalogModel {
  id: string;
  provider: Provider;
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  default?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

function findCatalogFile(): string {
  const candidates = [
    path.resolve(__dirname, '../../../../seed-data/model-catalog.json'),
    path.resolve(__dirname, '../../../seed-data/model-catalog.json'),
    path.resolve(process.cwd(), 'seed-data/model-catalog.json'),
    path.resolve(process.cwd(), '../../seed-data/model-catalog.json'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  throw new Error('Could not locate seed-data/model-catalog.json');
}

/**
 * The model + pricing catalog (seed-data/model-catalog.json — operator
 * editable). Single source of truth for which models exist, which provider
 * serves them, and what a message costs.
 */
@Injectable()
export class CatalogService {
  readonly pricesAsOf: string;
  private readonly models: CatalogModel[];

  constructor() {
    const raw = JSON.parse(fs.readFileSync(findCatalogFile(), 'utf8')) as {
      pricesAsOf: string;
      models: CatalogModel[];
    };
    this.models = raw.models;
    this.pricesAsOf = raw.pricesAsOf;
  }

  list(): CatalogModel[] {
    return this.models;
  }

  defaultModel(): CatalogModel {
    return this.models.find((m) => m.default) ?? this.models[0];
  }

  get(modelId: string | null | undefined): CatalogModel | null {
    if (!modelId) return this.defaultModel();
    return this.models.find((m) => m.id === modelId) ?? null;
  }

  /** Provider for a model id — catalog first, then prefix heuristics. */
  providerFor(modelId: string | null | undefined): Provider {
    const known = this.get(modelId);
    if (known) return known.provider;
    const id = (modelId ?? '').toLowerCase();
    if (id.startsWith('gpt') || id.startsWith('o')) return 'openai';
    if (id.startsWith('gemini')) return 'gemini';
    return 'anthropic';
  }

  /** USD cost of one turn, from token usage. Unknown models cost 0 (logged upstream). */
  costUsd(modelId: string | null | undefined, usage: TokenUsage): number {
    const model = this.get(modelId);
    if (!model) return 0;
    const cost =
      (usage.inputTokens / 1_000_000) * model.inputPer1M +
      (usage.outputTokens / 1_000_000) * model.outputPer1M +
      (usage.cacheReadTokens / 1_000_000) * model.cacheReadPer1M;
    return Math.round(cost * 1_000_000) / 1_000_000; // 6 decimal places
  }
}
