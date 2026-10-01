import type { Metadata } from 'next';
import { Suspense } from 'react';
import { brand } from '@fathom/config';
import { Scanner } from '@/components/scan/Scanner';

export const metadata: Metadata = {
  title: `Token Scanner · ${brand.name}`,
  description:
    'Free token scanner for Robinhood Chain. Paste a contract address and see the red flags in seconds: mint, blacklist, taxes, owner, proxy and holder concentration. No wallet needed.',
  alternates: { canonical: '/scan' },
  openGraph: {
    title: `Token Scanner · ${brand.name}`,
    description: 'Paste a contract address on Robinhood Chain and see the red flags in seconds. Free, no wallet needed.',
    url: '/scan',
  },
};

export default function ScanPage() {
  return (
    <Suspense>
      <Scanner />
    </Suspense>
  );
}
