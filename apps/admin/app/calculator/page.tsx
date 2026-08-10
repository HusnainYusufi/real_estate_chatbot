'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, getToken, money } from '@/lib/api';
import type { CatalogModel, ModelsResponse } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export default function CalculatorPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<ModelsResponse | null>(null);
  const [modelId, setModelId] = useState('');
  const [inputTokens, setInputTokens] = useState(1500);
  const [outputTokens, setOutputTokens] = useState(400);
  const [msgsPerMonth, setMsgsPerMonth] = useState(3000);
  const [markup, setMarkup] = useState(300);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    api.get<ModelsResponse>('/v1/admin/models').then((c) => {
      setCatalog(c);
      setModelId(c.models.find((m) => m.default)?.id ?? c.models[0]?.id ?? '');
    });
  }, [router]);

  const model: CatalogModel | undefined = useMemo(
    () => catalog?.models.find((m) => m.id === modelId),
    [catalog, modelId],
  );

  const perMessage = model
    ? (inputTokens / 1_000_000) * model.inputPer1M + (outputTokens / 1_000_000) * model.outputPer1M
    : 0;
  const monthlyCost = perMessage * msgsPerMonth;
  const suggestedPrice = monthlyCost * (1 + markup / 100);
  const pricePerMessage = perMessage * (1 + markup / 100);

  return (
    <>
      <PageHeader
        title="Cost calculator"
        description="Estimate what a bot costs to run, then price a client plan with margin."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {catalog?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.provider}) — ${m.inputPer1M}/${m.outputPer1M} per 1M
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Input tokens / msg</Label>
                <Input
                  type="number"
                  value={inputTokens}
                  onChange={(e) => setInputTokens(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Output tokens / msg</Label>
                <Input
                  type="number"
                  value={outputTokens}
                  onChange={(e) => setOutputTokens(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Messages / month</Label>
              <Input
                type="number"
                value={msgsPerMonth}
                onChange={(e) => setMsgsPerMonth(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Markup: {markup}%</Label>
              <input
                type="range"
                min={0}
                max={1000}
                step={25}
                value={markup}
                onChange={(e) => setMarkup(Number(e.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Cost / message" value={money(perMessage)} />
            <Metric label="Cost / month" value={money(monthlyCost)} />
            <Metric label="Price / message" value={money(pricePerMessage)} accent />
            <Metric label="Plan price / month" value={money(suggestedPrice)} accent />
          </div>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5">
              <p className="text-sm">
                <span className="font-semibold">Margin: {money(suggestedPrice - monthlyCost)}</span>{' '}
                / month
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sell at {money(suggestedPrice)} to bill {msgsPerMonth.toLocaleString()} messages that
                cost you {money(monthlyCost)}.
              </p>
            </CardContent>
          </Card>
          {catalog && (
            <p className="text-xs text-muted-foreground">
              List prices as of {catalog.pricesAsOf}. Actual per-client cost is tracked from real
              usage on each client&apos;s page.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tracking-tight ${accent ? 'text-primary' : ''}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
