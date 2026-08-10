import { Badge } from '@/components/ui/badge';

const VARIANT: Record<string, 'success' | 'destructive' | 'secondary' | 'muted'> = {
  active: 'success',
  trial: 'secondary',
  lead: 'muted',
  paused: 'destructive',
  churned: 'destructive',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANT[status] ?? 'muted'}>{status}</Badge>;
}
