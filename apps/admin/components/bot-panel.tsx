'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Globe, Phone, PhoneOutgoing, Send, Trash2 } from 'lucide-react';
import { api, API_BASE, money, widgetUrl } from '@/lib/api';
import type {
  Bot,
  Call,
  CatalogModel,
  Conversation,
  KnowledgeDoc,
  Lead,
  PhoneNumber,
  TranscriptMessage,
  WhatsappStatus,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Tab = 'overview' | 'test' | 'knowledge' | 'conversations' | 'leads' | 'whatsapp' | 'voice';
const TABS: Tab[] = [
  'overview',
  'test',
  'knowledge',
  'conversations',
  'leads',
  'whatsapp',
  'voice',
];

export function BotPanel({
  orgId,
  bot,
  models,
  onChanged,
}: {
  orgId: string;
  bot: Bot;
  models: CatalogModel[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const base = `/v1/admin/clients/${orgId}/bots/${bot.id}`;

  return (
    <Card>
      <CardHeader className="space-y-0 pb-0">
        <div className="flex items-center gap-2">
          <CardTitle>{bot.name}</CardTitle>
          {bot.leadCaptureEnabled && <Badge>lead capture</Badge>}
          <Badge variant={bot.status === 'active' ? 'success' : 'destructive'}>{bot.status}</Badge>
        </div>
        <div className="mt-4 flex gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition-colors',
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'whatsapp' ? 'WhatsApp' : t}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {tab === 'overview' && (
          <Overview orgId={orgId} bot={bot} models={models} onChanged={onChanged} />
        )}
        {tab === 'test' && <TestChat bot={bot} />}
        {tab === 'knowledge' && <Knowledge base={base} />}
        {tab === 'conversations' && <Conversations orgId={orgId} base={base} />}
        {tab === 'leads' && <Leads base={base} />}
        {tab === 'whatsapp' && <WhatsApp base={base} />}
        {tab === 'voice' && <Voice base={base} />}
      </CardContent>
    </Card>
  );
}

// ── Voice (phone calls) ──────────────────────────────────────────────────────

function Voice({ base }: { base: string }) {
  const [numbers, setNumbers] = useState<PhoneNumber[] | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [dialTo, setDialTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [openCall, setOpenCall] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [n, c] = await Promise.all([
      api.get<PhoneNumber[]>(`${base}/voice/numbers`),
      api.get<Call[]>(`${base}/voice/calls`),
    ]);
    setNumbers(n);
    setCalls(c);
  }, [base]);

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [reload]);

  async function attach(e: React.FormEvent) {
    e.preventDefault();
    setBusy('attach');
    setError('');
    try {
      await api.post(`${base}/voice/numbers`, { number: newNumber.trim() });
      setNewNumber('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to attach number');
    } finally {
      setBusy('');
    }
  }

  async function call(e: React.FormEvent) {
    e.preventDefault();
    setBusy('call');
    setError('');
    try {
      await api.post(`${base}/voice/call`, { toNumber: dialTo.trim() });
      setDialTo('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Give this bot a phone number so it answers inbound calls, and place outbound calls that the
        bot handles — same persona, knowledge, and lead capture as chat.
      </p>

      {/* Numbers */}
      <div className="space-y-2">
        <Label>Phone numbers (inbound)</Label>
        {numbers && numbers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {numbers.map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1 text-sm"
              >
                <Phone className="size-3.5 text-muted-foreground" />
                <span className="font-mono">{n.number}</span>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await api.del(`${base}/voice/numbers/${n.id}`);
                    await reload();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={attach} className="flex gap-2">
          <Input
            className="max-w-xs font-mono"
            placeholder="+14155550100"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={busy === 'attach' || !newNumber.trim()}>
            Attach number
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          The number must exist on your SIP trunk (provisioned via the carrier + LiveKit). See the
          Voice setup notes in the README.
        </p>
      </div>

      {/* Outbound test call */}
      <div className="space-y-2 border-t pt-4">
        <Label>Place an outbound call</Label>
        <form onSubmit={call} className="flex gap-2">
          <Input
            className="max-w-xs font-mono"
            placeholder="+14155551234"
            value={dialTo}
            onChange={(e) => setDialTo(e.target.value)}
          />
          <Button type="submit" disabled={busy === 'call' || !dialTo.trim()}>
            <PhoneOutgoing className="size-4" />
            {busy === 'call' ? 'Dialing…' : 'Call'}
          </Button>
        </form>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Call history */}
      <div className="border-t pt-4">
        <Label>Call history</Label>
        {calls.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No calls yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Direction</TableHead>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((c) => (
                <React.Fragment key={c.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setOpenCall(openCall === c.id ? null : c.id)}
                  >
                    <TableCell>
                      <Badge variant={c.direction === 'inbound' ? 'muted' : 'default'}>
                        {c.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.peerNumber}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'completed' ? 'success' : 'muted'}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.durationSeconds}s</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                  {openCall === c.id && Array.isArray(c.transcript) && c.transcript.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="space-y-2 rounded-md bg-muted/40 p-4">
                          {c.transcript.map((m, i) => (
                            <div key={i}>
                              <div
                                className={cn(
                                  'text-xs font-semibold uppercase',
                                  m.role === 'assistant' ? 'text-primary' : 'text-muted-foreground',
                                )}
                              >
                                {m.role === 'assistant' ? 'bot' : 'caller'}
                              </div>
                              <p className="text-sm">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview({
  orgId,
  bot,
  models,
  onChanged,
}: {
  orgId: string;
  bot: Bot;
  models: CatalogModel[];
  onChanged: () => void;
}) {
  const url = widgetUrl(bot.publicId);
  const embed = `<iframe src="${url}" style="width:100%;height:640px;border:0;border-radius:12px"></iframe>`;
  const [model, setModel] = useState(bot.model ?? '');
  const [savingModel, setSavingModel] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const defaultModel = models.find((m) => m.default);

  async function saveModel(value: string) {
    setModel(value);
    setSavingModel(true);
    setSaved(false);
    try {
      await api.patch(`/v1/admin/clients/${orgId}/bots/${bot.id}`, { model: value || null });
      setSaved(true);
      onChanged();
    } finally {
      setSavingModel(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete bot "${bot.name}" and all its data? This cannot be undone.`)) return;
    await api.del(`/v1/admin/clients/${orgId}/bots/${bot.id}`);
    onChanged();
  }

  return (
    <div className="space-y-5">
      <div className="max-w-md space-y-1.5">
        <Label>
          AI model
          {savingModel && <span className="ml-2 text-xs text-muted-foreground">saving…</span>}
          {saved && !savingModel && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-success">
              <Check className="size-3" /> saved
            </span>
          )}
        </Label>
        <Select value={model} onChange={(e) => saveModel(e.target.value)}>
          <option value="">
            Platform default{defaultModel ? ` (${defaultModel.label})` : ''}
          </option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} · {m.provider} (${m.inputPer1M}/${m.outputPer1M} per 1M)
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Switch providers freely — the key must be connected under AI providers, or the bot will
          report it&apos;s not configured.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Share link</Label>
        <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm text-primary hover:underline">
          {url}
        </a>
      </div>

      <div className="space-y-1.5">
        <Label>Embed on the client&apos;s website</Label>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{embed}</pre>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(embed);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy embed code'}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
          <Trash2 className="size-4" />
          Delete bot
        </Button>
      </div>
    </div>
  );
}

// ── Test chat (playground) ───────────────────────────────────────────────────

interface ChatLine {
  role: 'user' | 'bot' | 'status';
  text: string;
}

function TestChat({ bot }: { bot: Bot }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const convId = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    setLines((l) => [...l, { role: 'user', text: message }]);

    let botIdx = -1;
    const appendBot = (delta: string) => {
      setLines((l) => {
        const copy = [...l];
        if (botIdx === -1 || copy[botIdx]?.role !== 'bot') {
          copy.push({ role: 'bot', text: delta });
          botIdx = copy.length - 1;
        } else {
          copy[botIdx] = { role: 'bot', text: copy[botIdx].text + delta };
        }
        return copy;
      });
    };

    try {
      const res = await fetch(`${API_BASE}/v1/public/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: bot.publicId,
          conversationId: convId.current,
          message,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = 'message';
          let data = '';
          for (const ln of frame.split('\n')) {
            if (ln.startsWith('event: ')) event = ln.slice(7).trim();
            else if (ln.startsWith('data: ')) data += ln.slice(6);
          }
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (event === 'conversation') convId.current = parsed.conversationId;
          else if (event === 'text') appendBot(parsed.text);
          else if (event === 'tool_use') {
            botIdx = -1;
            const label =
              parsed.name === 'search_knowledge'
                ? 'Searching the knowledge base…'
                : `Running ${parsed.name}…`;
            setLines((l) => [...l, { role: 'status', text: label }]);
          } else if (event === 'refusal') {
            setLines((l) => [...l, { role: 'bot', text: "I can't help with that." }]);
          } else if (event === 'error') {
            setLines((l) => [...l, { role: 'status', text: '⚠ ' + parsed.message }]);
          }
        }
      }
    } catch (err) {
      setLines((l) => [...l, { role: 'status', text: '⚠ ' + (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Chat with the bot exactly as a visitor would — it uses this bot&apos;s knowledge base and
        tools. When it searches your documents you&apos;ll see it here.
      </p>
      <div
        ref={scrollRef}
        className="h-80 space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4"
      >
        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {bot.greeting || `Say hello to ${bot.name}.`}
          </p>
        )}
        {lines.map((l, i) =>
          l.role === 'status' ? (
            <p key={i} className="text-xs italic text-muted-foreground">
              {l.text}
            </p>
          ) : (
            <div key={i} className={cn('flex', l.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                  l.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-card text-card-foreground',
                )}
              >
                {l.text}
              </div>
            </div>
          ),
        )}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something your knowledge base should answer…"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLines([]);
            convId.current = null;
          }}
        >
          Reset
        </Button>
      </form>
    </div>
  );
}

// ── Knowledge ───────────────────────────────────────────────────────────────

function Knowledge({ base }: { base: string }) {
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // URL ingestion
  const [url, setUrl] = useState('');
  const [crawl, setCrawl] = useState(false);
  const [maxPages, setMaxPages] = useState(10);
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlMsg, setUrlMsg] = useState('');

  const reload = useCallback(() => api.get<KnowledgeDoc[]>(`${base}/documents`).then(setDocs), [base]);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`${base}/documents`, { title, content });
      setTitle('');
      setContent('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function ingest(e: React.FormEvent) {
    e.preventDefault();
    setUrlBusy(true);
    setUrlMsg('');
    setError('');
    try {
      const res = await api.post<{ documents: { title: string }[] }>(`${base}/documents/url`, {
        url: url.trim(),
        crawl,
        maxPages,
      });
      setUrlMsg(`Indexed ${res.documents.length} page(s) from the site.`);
      setUrl('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'URL ingestion failed');
    } finally {
      setUrlBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {!docs ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents yet — the bot answers from its persona only.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Added</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.title}</TableCell>
                <TableCell>{d.chunkCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(d.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      await api.del(`${base}/documents/${d.id}`);
                      await reload();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Train from a website URL */}
      <form onSubmit={ingest} className="space-y-3 border-t pt-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Globe className="size-4 text-muted-foreground" />
          Train from a website
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.example.com/"
          />
          <Button type="submit" variant="outline" disabled={urlBusy || !url.trim()}>
            {urlBusy ? 'Fetching…' : 'Fetch & index'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={crawl}
              onChange={(e) => setCrawl(e.target.checked)}
              className="accent-[var(--primary)]"
            />
            Crawl the whole site
          </label>
          {crawl && (
            <label className="flex items-center gap-2 text-muted-foreground">
              up to
              <Input
                type="number"
                min={1}
                max={30}
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
                className="h-8 w-20"
              />
              pages
            </label>
          )}
        </div>
        {urlMsg && <p className="text-sm text-success">{urlMsg}</p>}
        <p className="text-xs text-muted-foreground">
          Fetches the page text and indexes it. Sites that render content with JavaScript may return
          little text — paste it manually below if so.
        </p>
      </form>

      {/* Paste a document */}
      <form onSubmit={upload} className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Add document manually</p>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pricing & services overview"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Content (markdown — headings become search sections)</Label>
          <Textarea
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={'## Our services\nWe offer…'}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Indexing…' : 'Upload & index'}
        </Button>
      </form>
    </div>
  );
}

// ── Conversations ───────────────────────────────────────────────────────────

function Conversations({ orgId, base }: { orgId: string; base: string }) {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);

  useEffect(() => {
    api.get<Conversation[]>(`${base}/conversations`).then(setItems);
  }, [base]);

  async function open(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setTranscript(
      await api.get<TranscriptMessage[]>(`/v1/admin/clients/${orgId}/conversations/${id}/messages`),
    );
  }

  if (!items) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No conversations yet.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>Peer</TableHead>
          <TableHead>Last activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((c) => (
          <React.Fragment key={c.id}>
            <TableRow className="cursor-pointer" onClick={() => open(c.id)}>
              <TableCell>
                <Badge variant={c.channel === 'whatsapp' ? 'success' : 'muted'}>{c.channel}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {c.externalId ?? c.id.slice(0, 8)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(c.updatedAt).toLocaleString()}
              </TableCell>
            </TableRow>
            {openId === c.id && (
              <TableRow>
                <TableCell colSpan={3}>
                  <div className="space-y-3 rounded-md bg-muted/40 p-4">
                    {transcript.map((m) => (
                      <div key={m.id}>
                        <div
                          className={cn(
                            'text-xs font-semibold uppercase',
                            m.role === 'assistant' ? 'text-primary' : 'text-muted-foreground',
                          )}
                        >
                          {m.role}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                      </div>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Leads ───────────────────────────────────────────────────────────────────

function Leads({ base }: { base: string }) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  useEffect(() => {
    api.get<Lead[]>(`${base}/leads`).then(setLeads);
  }, [base]);

  if (!leads) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (leads.length === 0) return <p className="text-sm text-muted-foreground">No leads captured yet.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead>Captured</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="font-medium">{l.name}</TableCell>
            <TableCell className="font-mono text-xs">{l.contact}</TableCell>
            <TableCell className="text-muted-foreground">{l.notes}</TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(l.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── WhatsApp ────────────────────────────────────────────────────────────────

function WhatsApp({ base }: { base: string }) {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.get<WhatsappStatus>(`${base}/whatsapp`);
      setStatus(s);
      setNotConnected(false);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        setNotConnected(true);
        setStatus(null);
      } else {
        setError(err instanceof Error ? err.message : 'Status check failed');
      }
    }
  }, [base]);

  useEffect(() => {
    void refresh();
    timer.current = setInterval(() => void refresh(), 4000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      setStatus(await api.post<WhatsappStatus>(`${base}/whatsapp`));
      setNotConnected(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect WhatsApp from this bot?')) return;
    await api.del(`${base}/whatsapp`);
    setStatus(null);
    setNotConnected(true);
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  if (notConnected) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Attach the client&apos;s WhatsApp number: create the session, then scan the QR with the
          phone (WhatsApp → Linked devices). Use a dedicated business number — this runs on an
          unofficial gateway (OpenWA) and carries a ban risk.
        </p>
        <Button onClick={connect} disabled={busy}>
          {busy ? 'Creating session…' : 'Connect WhatsApp'}
        </Button>
      </div>
    );
  }

  if (!status) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status:</span>
        <Badge variant={status.connected ? 'success' : 'muted'}>{status.status}</Badge>
        {status.phone && <span className="font-mono text-xs">{status.phone}</span>}
      </div>
      {status.qr && (
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={status.qr}
            alt="WhatsApp pairing QR"
            className="size-56 rounded-md border bg-white"
          />
          <p className="text-xs text-muted-foreground">
            Scan with the client&apos;s phone: WhatsApp → Linked devices
          </p>
        </div>
      )}
      {status.connected && (
        <p className="text-sm text-muted-foreground">
          Connected — messages to this number are now answered by the bot automatically.
        </p>
      )}
      <Button variant="ghost" size="sm" className="text-destructive" onClick={disconnect}>
        <Trash2 className="size-4" />
        Disconnect
      </Button>
    </div>
  );
}
