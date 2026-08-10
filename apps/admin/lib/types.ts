export interface Client {
  id: string;
  name: string;
  plan: string;
  status: string;
  notes: string;
  monthlyMessageLimit: number;
  createdAt: string;
  botCount: number;
  userCount: number;
  messagesThisMonth: number;
  costThisMonth: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CatalogModel {
  id: string;
  provider: 'anthropic' | 'openai' | 'gemini';
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  default?: boolean;
}

export interface ModelsResponse {
  pricesAsOf: string;
  models: CatalogModel[];
  configuredProviders: string[];
}

export interface ProviderKey {
  id: string;
  provider: string;
  keyPreview: string;
  createdAt: string;
}

export interface Bot {
  id: string;
  publicId: string;
  name: string;
  tagline: string | null;
  persona: string;
  greeting: string | null;
  status: string;
  leadCaptureEnabled: boolean;
  model: string | null;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  tagline: string;
  leadCaptureEnabled: boolean;
  knowledgeFiles: string[];
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  notes: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  channel: string;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

export interface WhatsappStatus {
  connected: boolean;
  status: string;
  phone: string | null;
  qr: string | null;
  sessionName: string;
}

export interface PhoneNumber {
  id: string;
  number: string;
  usage: string;
  createdAt: string;
}

export interface Call {
  id: string;
  direction: string;
  peerNumber: string;
  status: string;
  durationSeconds: number;
  transcript: { role: string; text: string }[];
  createdAt: string;
}

export interface ClientDetail {
  organization: {
    id: string;
    name: string;
    plan: string;
    status: string;
    notes: string;
    monthlyMessageLimit: number;
    createdAt: string;
  };
  users: { id: string; email: string; name: string; role: string }[];
  usage: {
    botId: string;
    name: string;
    assistantMessages: number;
    conversations: number;
    inputTokens: string;
    outputTokens: string;
    costUsd: number;
  }[];
}
