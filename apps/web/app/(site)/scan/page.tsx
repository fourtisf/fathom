import type { Metadata } from 'next';
import { Suspense } from 'react';
import { brand } from '@fathom/config';
import { Scanner } from '@/components/scan/Scanner';

export const metadata: Metadata = {
  title: `Token Scanner · ${brand.name}`,
  description:
    'Free multi-chain token scanner: Robinhood Chain, Solana, Ethereum, Base, BNB Chain and more. Paste a token address and see the red flags in seconds: mint, freeze, honeypot, taxes, owner, liquidity and holder concentration. No wallet needed.',
  alternates: { canonical: '/scan' },
  openGraph: {
    title: `Token Scanner · ${brand.name}`,
    description: 'Paste a token address from Robinhood Chain, Solana, Ethereum, Base and more. See the red flags in seconds. Free, no wallet needed.',
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
