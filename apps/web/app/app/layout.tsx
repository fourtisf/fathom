import type { Metadata } from 'next';
import { AppProviders } from '@/components/app/Providers';
import { AppShell } from '@/components/app/Shell';

export const metadata: Metadata = { title: 'App', robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
