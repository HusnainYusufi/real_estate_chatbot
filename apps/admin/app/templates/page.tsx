'use client';

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import type { Template } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Draft = {
  name: string;
  tagline: string;
  persona: string;
  instructions: string;
  guardrails: string;
  greeting: string;
  suggestedQuestions: string;
  leadCaptureEnabled: boolean;
  knowledgeSeed: string;
};

const BLANK: Draft = {
  name: '',
  tagline: '',
  persona: '',
  instructions: '',
  guardrails: '',
  greeting: '',
  suggestedQuestions: '',
  leadCaptureEnabled: false,
  knowledgeSeed: '',
};

function toDraft(t: Template): Draft {
  return {
    name: t.name,
    tagline: t.tagline ?? '',
    persona: t.persona,
    instructions: t.instructions ?? '',
    guardrails: t.guardrails ?? '',
    greeting: t.greeting ?? '',
    suggestedQuestions: (t.suggestedQuestions ?? []).join('\n'),
    leadCaptureEnabled: t.leadCaptureEnabled,
    knowledgeSeed: t.knowledgeSeed ?? '',
  };
}

function toPayload(d: Draft) {
  return {
    name: d.name,
    tagline: d.tagline || undefined,
    persona: d.persona,
    instructions: d.instructions || undefined,
    guardrails: d.guardrails || undefined,
    greeting: d.greeting || undefined,
    suggestedQuestions: d.suggestedQuestions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    leadCaptureEnabled: d.leadCaptureEnabled,
    knowledgeSeed: d.knowledgeSeed || undefined,
  };
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // null = create mode
  const [draft, setDraft] = useState<Draft>({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setTemplates(await api.get<Template[]>('/v1/admin/templates'));
  }
  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router]);

  function startCreate() {
    setEditingId(null);
    setDraft({ ...BLANK });
  }
  function startEdit(t: Template) {
    setEditingId(t.id);
    setDraft(toDraft(t));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editingId) await api.patch(`/v1/admin/templates/${editingId}`, toPayload(draft));
      else await api.post('/v1/admin/templates', toPayload(draft));
      startCreate();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save persona');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Personas"
        description="Reusable bot templates by industry — created and edited here at runtime, no redeploy. Pick one when you give a client a bot."
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* List */}
        <div className="space-y-3">
          {!templates ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            templates.map((t) => (
              <Card key={t.id} className={editingId === t.id ? 'border-primary' : ''}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.leadCaptureEnabled && <Badge>lead capture</Badge>}
                      {t.knowledgeSeed && <Badge variant="muted">has knowledge</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t.tagline}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.persona}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={async () => {
                        if (!confirm(`Delete persona "${t.name}"?`)) return;
                        await api.del(`/v1/admin/templates/${t.id}`);
                        if (editingId === t.id) startCreate();
                        await load();
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Editor */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{editingId ? 'Edit persona' : 'New persona'}</CardTitle>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={startCreate}>
                <X className="size-4" /> Cancel edit
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="SmileDesk"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tagline</Label>
                  <Input
                    value={draft.tagline}
                    onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                    placeholder="Dental clinic assistant"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Persona (who the bot is — required)</Label>
                <Textarea
                  rows={3}
                  value={draft.persona}
                  onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
                  placeholder="a warm dental-clinic assistant that helps patients with appointments…"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Instructions (how it should work)</Label>
                <Textarea
                  rows={2}
                  value={draft.instructions}
                  onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                  placeholder="Check the knowledge base before answering about services or pricing."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Guardrails (what it must not do)</Label>
                <Textarea
                  rows={2}
                  value={draft.guardrails}
                  onChange={(e) => setDraft({ ...draft, guardrails: e.target.value })}
                  placeholder="- Never give a medical diagnosis."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Greeting</Label>
                <Input
                  value={draft.greeting}
                  onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
                  placeholder="Hi! How can I help with your appointment?"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Suggested questions (one per line)</Label>
                <Textarea
                  rows={3}
                  value={draft.suggestedQuestions}
                  onChange={(e) => setDraft({ ...draft, suggestedQuestions: e.target.value })}
                  placeholder={'Do you take my insurance?\nHow much is a cleaning?'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Starter knowledge (optional — markdown, indexed into new bots)</Label>
                <Textarea
                  rows={3}
                  value={draft.knowledgeSeed}
                  onChange={(e) => setDraft({ ...draft, knowledgeSeed: e.target.value })}
                  placeholder="## Hours\nMon–Fri 9–5…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.leadCaptureEnabled}
                  onChange={(e) => setDraft({ ...draft, leadCaptureEnabled: e.target.checked })}
                  className="accent-[var(--primary)]"
                />
                Enable lead capture (collect name + contact)
              </label>
              <Button type="submit" disabled={busy || !draft.name.trim() || !draft.persona.trim()}>
                {editingId ? null : <Plus className="size-4" />}
                {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create persona'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
