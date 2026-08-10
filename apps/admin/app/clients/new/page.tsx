'use client';

import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OnboardResult {
  organization: { id: string; name: string };
  user: { email: string };
  initialPassword: string;
}

export default function NewClientPage() {
  const [organizationName, setOrganizationName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult(
        await api.post<OnboardResult>('/v1/admin/clients', {
          organizationName,
          contactName,
          email,
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const creds = `Login: ${result.user.email}\nPassword: ${result.initialPassword}`;
    return (
      <>
        <PageHeader title="Client created" description={result.organization.name} />
        <Card className="max-w-lg border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Share these credentials now</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Login</span>
                <code className="rounded bg-muted px-2 py-0.5 font-mono">{result.user.email}</code>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Password</span>
                <code className="rounded bg-muted px-2 py-0.5 font-mono">
                  {result.initialPassword}
                </code>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The password is shown only once and cannot be retrieved again.
            </p>
            <div className="flex gap-2">
              <Link
                href={`/clients/${result.organization.id}`}
                className={buttonVariants()}
              >
                Set up their bots
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(creds);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy credentials'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Onboard a client" description="Create their workspace and owner login." />
      <Card className="max-w-lg">
        <CardContent className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org">Business name</Label>
              <Input
                id="org"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Acme Realty LLC"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact">Contact person</Label>
              <Input
                id="contact"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Contact email (becomes their login)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@acmerealty.com"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create client'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
