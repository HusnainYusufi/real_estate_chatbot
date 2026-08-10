'use client';

import { Bot, DollarSign, MessageSquare, Plus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import type { Bot as BotType, ClientDetail, ModelsResponse, Template } from '@/lib/types';
import { BotPanel } from '@/components/bot-panel';
import { ClientSettings } from '@/components/client-settings';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export default function ClientPage() {
  const { id: orgId } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [bots, setBots] = useState<BotType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [catalog, setCatalog] = useState<ModelsResponse | null>(null);
  const [error, setError] = useState('');

  const [templateId, setTemplateId] = useState('');
  const [botName, setBotName] = useState('');
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [d, b] = await Promise.all([
        api.get<ClientDetail>(`/v1/admin/clients/${orgId}`),
        api.get<BotType[]>(`/v1/admin/clients/${orgId}/bots`),
      ]);
      setDetail(d);
      setBots(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client');
    }
  }, [orgId]);

  useEffect(() => {
    void reload();
    api.get<Template[]>('/v1/admin/templates').then((list) => {
      setTemplates(list);
      if (list.length > 0) setTemplateId(list[0].id);
    });
    api.get<ModelsResponse>('/v1/admin/models').then(setCatalog);
  }, [reload]);

  async function addBot(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError('');
    try {
      await api.post(`/v1/admin/clients/${orgId}/bots`, {
        templateId,
        ...(botName.trim() ? { name: botName.trim() } : {}),
      });
      setBotName('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bot');
    } finally {
      setAdding(false);
    }
  }

  if (error && !detail) return <p className="text-sm text-destructive">{error}</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const org = detail.organization;
  const used = detail.usage.reduce((s, u) => s + u.assistantMessages, 0);
  const cost = detail.usage.reduce((s, u) => s + (u.costUsd || 0), 0);

  return (
    <>
      <PageHeader
        title={org.name}
        description={`Client login: ${detail.users.map((u) => u.email).join(', ')}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Bots" value={bots.length} icon={Bot} />
        <StatCard
          label="AI replies this month"
          value={used.toLocaleString()}
          sub={`limit ${org.monthlyMessageLimit.toLocaleString()}/mo`}
          icon={MessageSquare}
        />
        <StatCard label="Your AI cost this month" value={money(cost)} icon={DollarSign} />
      </div>

      <div className="mb-6">
        <ClientSettings orgId={orgId} org={org} onSaved={reload} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Give them a bot</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addBot} className="flex flex-col gap-3 sm:flex-row">
            <Select
              className="sm:max-w-xs"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.tagline}
                </option>
              ))}
            </Select>
            <Input
              className="sm:max-w-xs"
              placeholder="Custom bot name (optional)"
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
            />
            <Button type="submit" disabled={adding || !templateId}>
              <Plus className="size-4" />
              {adding ? 'Creating…' : 'Create bot'}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Templates ship with a tuned persona, guardrails, and a starter knowledge base. Upload the
            client&apos;s own documents afterwards.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {bots.map((bot) => (
          <BotPanel
            key={bot.id}
            orgId={orgId}
            bot={bot}
            models={catalog?.models ?? []}
            onChanged={reload}
          />
        ))}
      </div>
    </>
  );
}
