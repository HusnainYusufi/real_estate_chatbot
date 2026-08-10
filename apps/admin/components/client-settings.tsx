'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { ClientDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/status-badge';

const STATUSES = ['lead', 'trial', 'active', 'paused', 'churned'];

export function ClientSettings({
  orgId,
  org,
  onSaved,
}: {
  orgId: string;
  org: ClientDetail['organization'];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(org.status);
  const [plan, setPlan] = useState(org.plan);
  const [limit, setLimit] = useState(org.monthlyMessageLimit);
  const [notes, setNotes] = useState(org.notes);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await api.patch(`/v1/admin/clients/${orgId}`, {
        status,
        plan,
        monthlyMessageLimit: Number(limit),
        notes,
      });
      setSaved(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Account &amp; CRM</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Edit'}
        </Button>
      </CardHeader>
      <CardContent>
        {!open ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            <StatusBadge status={org.status} />
            <span>plan {org.plan}</span>
            <span>·</span>
            <span>limit {org.monthlyMessageLimit.toLocaleString()}/mo</span>
            {org.notes && (
              <>
                <span>·</span>
                <span className="truncate">{org.notes.slice(0, 80)}</span>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly message limit</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (internal)</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Renewal date, contacts, special terms…"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-sm text-success">
                  <Check className="size-4" /> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
