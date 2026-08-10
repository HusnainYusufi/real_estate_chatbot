'use client';

import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import type { ModelsResponse, ProviderKey } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic — Claude', hint: 'sk-ant-…' },
  { id: 'openai', label: 'OpenAI — GPT', hint: 'sk-…' },
  { id: 'gemini', label: 'Google — Gemini', hint: 'AIza…' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [catalog, setCatalog] = useState<ModelsResponse | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [k, c] = await Promise.all([
      api.get<ProviderKey[]>('/v1/admin/providers'),
      api.get<ModelsResponse>('/v1/admin/models'),
    ]);
    setKeys(k);
    setCatalog(c);
  }

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    load().catch((err) => setError(err.message));
  }, [router]);

  async function save(provider: string) {
    const apiKey = (drafts[provider] ?? '').trim();
    if (!apiKey) return;
    setBusy(provider);
    setError('');
    try {
      await api.post('/v1/admin/providers', { provider, apiKey });
      setDrafts((d) => ({ ...d, [provider]: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setBusy('');
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this key? Bots on this provider will stop working.')) return;
    await api.del(`/v1/admin/providers/${id}`);
    await load();
  }

  const keyFor = (p: string) => keys.find((k) => k.provider === p);

  return (
    <>
      <PageHeader
        title="AI providers"
        description="Paste an API key to enable a provider platform-wide. Keys are encrypted at rest and shown only as the last 4 digits."
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-5">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Free key for demos</p>
            <p className="mt-1 text-muted-foreground">
              Google Gemini has a free tier with no credit card. Create a key at{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                aistudio.google.com/apikey
              </a>
              , paste it as the <strong>Gemini</strong> key below, then set your bots to{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">gemini-2.5-flash</code> on each
              bot&apos;s Overview tab.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {PROVIDERS.map((p) => {
          const existing = keyFor(p.id);
          const models = catalog?.models.filter((m) => m.provider === p.id) ?? [];
          return (
            <Card key={p.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  {existing ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : (
                    <Circle className="size-5 text-muted-foreground" />
                  )}
                  <CardTitle>{p.label}</CardTitle>
                </div>
                {existing ? (
                  <Badge variant="success">connected · {existing.keyPreview}</Badge>
                ) : (
                  <Badge variant="muted">not connected</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Models: {models.map((m) => m.label).join(', ') || '—'}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    className="sm:max-w-sm"
                    placeholder={existing ? 'Paste a new key to replace' : p.hint}
                    value={drafts[p.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  />
                  <Button
                    disabled={busy === p.id || !(drafts[p.id] ?? '').trim()}
                    onClick={() => save(p.id)}
                  >
                    {busy === p.id ? 'Saving…' : existing ? 'Replace key' : 'Connect'}
                  </Button>
                  {existing && (
                    <Button variant="outline" onClick={() => remove(existing.id)}>
                      Remove
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {catalog && (
        <p className="mt-4 text-xs text-muted-foreground">
          Catalog prices last checked {catalog.pricesAsOf}.
        </p>
      )}
    </>
  );
}
