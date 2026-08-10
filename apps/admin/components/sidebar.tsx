'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, Calculator, KeyRound, LogOut, UserPlus, Users } from 'lucide-react';
import { setToken } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const NAV = [
  { href: '/', label: 'Clients', icon: Users, exact: true },
  { href: '/clients/new', label: 'Onboard client', icon: UserPlus },
  { href: '/calculator', label: 'Cost calculator', icon: Calculator },
  { href: '/settings', label: 'AI providers', icon: KeyRound },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Bot className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">Chatbot Suite</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => {
            setToken(null);
            router.push('/login');
          }}
        >
          <LogOut className="size-4" />
          Log out
        </Button>
      </div>
    </aside>
  );
}
