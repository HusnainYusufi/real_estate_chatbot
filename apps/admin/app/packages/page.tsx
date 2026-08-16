'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import type { Package } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const BLANK = { name: '', description: '', monthlyResponseLimit: 1000, priceUsd: 49 };

export default function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setPackages(await api.get<Package[]>('/v1/admin/packages'));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/v1/admin/packages', {
        name: form.name,
        description: form.description || undefined,
        monthlyResponseLimit: Number(form.monthlyResponseLimit),
        priceUsd: Number(form.priceUsd),
      });
      setForm({ ...BLANK });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create package');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Packages"
        description="Define the plans you sell — a monthly response quota at a price. Assign them to clients on each client's page."
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your plans</CardTitle>
        </CardHeader>
        <CardContent>
          {!packages ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages yet — create one below.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Responses / month</TableHead>
                  <TableHead>Price / month</TableHead>
                  <TableHead>Price / response</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((p) => {
                  const price = Number(p.priceUsd);
                  const perMsg = p.monthlyResponseLimit ? price / p.monthlyResponseLimit : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.description && (
                          <div className="text-xs text-muted-foreground">{p.description}</div>
                        )}
                      </TableCell>
                      <TableCell>{p.monthlyResponseLimit.toLocaleString()}</TableCell>
                      <TableCell className="font-medium">${price.toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground">${perMsg.toFixed(4)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={async () => {
                            if (!confirm(`Delete package "${p.name}"?`)) return;
                            await api.del(`/v1/admin/packages/${p.id}`);
                            await load();
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>New package</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Starter"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="For small sites"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Responses / month</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthlyResponseLimit}
                  onChange={(e) =>
                    setForm({ ...form, monthlyResponseLimit: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Price / month ($)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceUsd}
                  onChange={(e) => setForm({ ...form, priceUsd: Number(e.target.value) })}
                />
              </div>
            </div>
            <Button type="submit" disabled={busy || !form.name.trim()}>
              <Plus className="size-4" />
              {busy ? 'Creating…' : 'Create package'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
