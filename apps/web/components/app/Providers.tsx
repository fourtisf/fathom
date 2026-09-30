'use client';

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { createConfig, http, WagmiProvider, type Config } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors/injected';
import { walletConnect } from 'wagmi/connectors/walletConnect';
import { defineChain, type Chain } from 'viem';
import { brand } from '@fathom/config';
import { api, type AppConfig } from '@/lib/api';
import { SessionProvider } from './Session';
import { UiProvider } from './Ui';

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '';

function toChain(c: AppConfig['chain']): Chain | null {
  if (!c) return null;
  return defineChain({
    id: c.id,
    name: c.name,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [c.rpcUrl] } },
    ...(c.explorerUrl ? { blockExplorers: { default: { name: `${c.name} explorer`, url: c.explorerUrl } } } : {}),
  });
}

function makeWagmi(appChain: Chain | null): Config {
  // Sign-in never sends a transaction, so an unconfigured chain only disables network checks.
  const chain = appChain ?? mainnet;
  const origin = typeof window === 'undefined' ? brand.siteUrl : window.location.origin;
  return createConfig({
    chains: [chain],
    connectors: [
      injected({ shimDisconnect: true }),
      ...(WC_PROJECT_ID
        ? [
            walletConnect({
              projectId: WC_PROJECT_ID,
              showQrModal: true,
              metadata: {
                name: brand.name,
                description: brand.socialDescription,
                url: origin,
                icons: [`${origin}/brand/noxsea-icon-512.png`],
              },
            }),
          ]
        : []),
    ],
    transports: { [chain.id]: http() },
    ssr: true,
  });
}

export const hasWalletConnect = WC_PROJECT_ID !== '';

function WithConfig({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfig>('/config'),
    refetchInterval: 30_000,
  });
  const chain = useMemo(() => toChain(q.data?.chain ?? null), [q.data?.chain]);
  // Build once per chain; changing chains remounts the wallet layer.
  const wagmi = useMemo(() => makeWagmi(chain), [chain]);

  if (q.isPending) return <div className="gate" style={{ minHeight: '100dvh' }} aria-busy="true" />;

  return (
    <WagmiProvider config={wagmi} key={chain?.id ?? 0}>
      <SessionProvider config={q.data ?? null} configError={q.isError}>
        <UiProvider>{children}</UiProvider>
      </SessionProvider>
    </WagmiProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <WithConfig>{children}</WithConfig>
    </QueryClientProvider>
  );
}
