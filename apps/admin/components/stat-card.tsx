import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          {Icon && <Icon className="size-4 text-muted-foreground" />}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
