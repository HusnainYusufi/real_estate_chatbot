'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Chrome for authenticated pages: fixed sidebar + top bar. The /login route
 * renders bare (no shell).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-2 border-b bg-background/80 px-6 backdrop-blur">
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
