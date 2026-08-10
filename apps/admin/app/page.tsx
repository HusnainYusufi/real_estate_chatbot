'use client';

import { Bot, DollarSign, MessageSquare, Search, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, getToken, money } from '@/lib/api';
import type { Client, Paginated } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUSES = ['', 'lead', 'trial', 'active', 'paused', 'churned'];

export default function ClientsPage() {
  const router = useRouter();
  const [data, setData] = useState<Paginated<Client> | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    try {
      setData(await api.get<Paginated<Client>>(`/v1/admin/clients?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [q, status, page]);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    setPage(1);
  }, [q, status]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const totals = (data?.items ?? []).reduce(
    (a, c) => ({ bots: a.bots + c.botCount, cost: a.cost + c.costThisMonth }),
    { bots: 0, cost: 0 },
  );

  return (
    <>
      <PageHeader
        title="Clients"
        description="Manage every workspace, bot, and their AI spend."
        action={
          <Link href="/clients/new" className={buttonVariants()}>
            <UserPlus className="size-4" />
            Onboard client
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Clients" value={data?.total ?? '—'} icon={Users} />
        <StatCard label="Bots (this page)" value={data ? totals.bots : '—'} icon={Bot} />
        <StatCard
          label="AI cost (this page, mo)"
          value={data ? money(totals.cost) : '—'}
          icon={DollarSign}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select
              className="sm:w-44"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === '' ? 'All statuses' : s}
                </option>
              ))}
            </Select>
          </div>

          {error && <p className="py-6 text-center text-sm text-destructive">{error}</p>}

          {!data && !error ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <MessageSquare className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No clients match your filters.</p>
              <Link href="/clients/new" className={buttonVariants({ variant: 'outline' })}>
                Onboard your first client
              </Link>
            </div>
          ) : (
            data && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Bots</TableHead>
                    <TableHead>Replies (mo)</TableHead>
                    <TableHead>Cost (mo)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/clients/${c.id}`)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">{c.plan}</TableCell>
                      <TableCell>{c.botCount}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.messagesThisMonth.toLocaleString()} / {c.monthlyMessageLimit.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{money(c.costThisMonth)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {data && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {data.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
