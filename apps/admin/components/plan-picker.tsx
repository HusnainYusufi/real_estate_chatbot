'use client';

import { useEffect, useState } from 'react';
import { api, money } from '@/lib/api';
import type { ClientDetail, Package } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';

/** Assign a pricing package to a client, and show the margin at that plan. */
export function PlanPicker({
  orgId,
  org,
  costThisMonth,
  onSaved,
}: {
  orgId: string;
  org: ClientDetail['organization'];
  costThisMonth: number;
  onSaved: () => void;
}) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [selected, setSelected] = useState(org.packageId ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Package[]>('/v1/admin/packages').then(setPackages).catch(() => setPackages([]));
  }, []);

  async function assign() {
    setBusy(true);
    setSaved(false);
    try {
      await api.post(`/v1/admin/clients/${orgId}/package`, {
        packageId: selected || undefined,
      });
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const price = Number(org.monthlyPriceUsd || 0);
  const margin = price - costThisMonth;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan &amp; billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1.5">
            <label className="text-sm font-medium">Package</label>
            <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Custom (no package)</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.monthlyResponseLimit.toLocaleString()} / mo · ${Number(p.priceUsd).toFixed(0)}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={assign} disabled={busy || selected === (org.packageId ?? '')}>
            {busy ? 'Saving…' : 'Assign'}
          </Button>
          {saved && <span className="text-sm text-success">Saved ✓</span>}
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
          <div>
            <div className="text-muted-foreground">Client pays</div>
            <div className="mt-0.5 text-lg font-semibold">{money(price)}/mo</div>
          </div>
          <div>
            <div className="text-muted-foreground">Your AI cost (this mo)</div>
            <div className="mt-0.5 text-lg font-semibold">{money(costThisMonth)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Margin</div>
            <div
              className="mt-0.5 text-lg font-semibold"
              style={{ color: margin >= 0 ? 'var(--success)' : 'var(--destructive)' }}
            >
              {money(margin)}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Limit is enforced monthly ({org.monthlyMessageLimit.toLocaleString()} responses on the
          current plan). AI cost is measured from real token usage; margin updates as usage grows.
        </p>
      </CardContent>
    </Card>
  );
}
