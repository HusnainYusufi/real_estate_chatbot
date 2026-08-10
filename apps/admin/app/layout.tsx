import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/app-shell';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Chatbot Suite — Admin',
  description: 'Operator panel: onboard clients, provision bots, connect WhatsApp.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
