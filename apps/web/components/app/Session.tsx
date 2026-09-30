'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useConnection, useDisconnect, useSignMessage, useSwitchChain } from 'wagmi';
import { createSiweMessage } from 'viem/siwe';
import { brand } from '@fathom/config';
import { api, ApiError, post, type AppConfig, type Me } from '@/lib/api';
import { useToast } from '../Toast';

interface SignInResult {
  address: string;
  credits: number;
  welcome: boolean;
}

interface Session {
  config: AppConfig | null;
  configError: boolean;
  me: Me | null;
  meLoading: boolean;
  /** Wallet is connected to a different chain than Noxsea runs on. */
  wrongNetwork: boolean;
  /** Set right after a successful sign-in, so the chat can greet the user once. */
  lastSignIn: SignInResult | null;
  clearLastSignIn(): void;
  signIn(address: `0x${string}`): Promise<void>;
  signOut(): Promise<void>;
  switchNetwork(): Promise<void>;
  /** Wallet's reason when the last automatic switch failed; the UI then offers manual network details. */
  switchError: string | null;
  setCredits(credits: number): void;
  refreshMe(): void;
}

const Ctx = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function isUserRejection(e: unknown): boolean {
  // wagmi wraps some wallet failures (e.g. a refused wallet_addEthereumChain) in UserRejectedRequestError,
  // so the innermost error with a numeric code decides; names and messages are only a fallback.
  const chain: { code?: number; name?: string; message?: string }[] = [];
  for (let cur: unknown = e; cur && chain.length < 8; cur = (cur as { cause?: unknown }).cause) {
    chain.push(cur as { code?: number; name?: string; message?: string });
  }
  const coded = [...chain].reverse().find((x) => typeof x.code === 'number');
  if (coded) return coded.code === 4001;
  return chain.some((x) => x.name === 'UserRejectedRequestError' || /user (rejected|denied)|rejected the request/i.test(x.message ?? ''));
}

export function SessionProvider({
  config,
  configError,
  children,
}: {
  config: AppConfig | null;
  configError: boolean;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const connection = useConnection();
  const { mutateAsync: signMessage } = useSignMessage();
  const { mutateAsync: switchChain } = useSwitchChain();
  const { mutateAsync: disconnect } = useDisconnect();
  const [lastSignIn, setLastSignIn] = useState<SignInResult | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
  });
  const me = meQuery.data ?? null;

  const signIn = useCallback(
    async (address: `0x${string}`) => {
      const { nonce } = await api<{ nonce: string }>('/auth/nonce');
      const now = new Date();
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: `Sign in to ${brand.name}. This is free and does not send a transaction.`,
        uri: window.location.origin,
        version: '1',
        chainId: config?.chain?.id ?? connection.chainId ?? 1,
        nonce,
        issuedAt: now,
        expirationTime: new Date(now.getTime() + 10 * 60_000),
      });
      const signature = await signMessage({ message, account: address });
      const res = await post<SignInResult>('/auth/verify', { message, signature });
      setLastSignIn(res);
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    [config?.chain?.id, connection.chainId, signMessage, qc],
  );

  const signOut = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    await disconnect().catch(() => {});
    qc.setQueryData(['me'], null);
    qc.removeQueries({ queryKey: ['credits'] });
  }, [disconnect, qc]);

  // Switching accounts in the wallet ends the session for the old address.
  const prevAddress = useRef<string | undefined>();
  useEffect(() => {
    const addr = connection.address?.toLowerCase();
    if (me && addr && prevAddress.current && addr !== prevAddress.current && addr !== me.address.toLowerCase()) {
      void signOut().then(() => toast('Wallet account changed. Connect again to continue.'));
    }
    prevAddress.current = addr;
  }, [connection.address, me, signOut, toast]);

  const wrongNetwork = Boolean(
    me && config?.chain && connection.status === 'connected' && connection.chainId !== config.chain.id,
  );

  const switchNetwork = useCallback(async () => {
    if (!config?.chain) return;
    setSwitchError(null);
    toast('Approve the network switch in your wallet');
    try {
      // wagmi falls back to wallet_addEthereumChain (name, RPC, explorer) when the wallet doesn't know the chain.
      await switchChain({ chainId: config.chain.id });
      toast(`Switched to ${config.chain.name}`);
    } catch (e) {
      if (isUserRejection(e)) return toast('Network switch cancelled');
      const x = e as { shortMessage?: string; details?: string; message?: string };
      const reason = (x.details || x.shortMessage || x.message || 'Unknown error').split('\n')[0]!.replace(/\.+$/, '').slice(0, 160);
      setSwitchError(reason);
      toast('Could not switch automatically. Add the network manually.', true);
    }
  }, [config?.chain, switchChain, toast]);

  useEffect(() => {
    if (!wrongNetwork) setSwitchError(null);
  }, [wrongNetwork]);

  const setCredits = useCallback(
    (credits: number) => qc.setQueryData<Me | null>(['me'], (m) => (m ? { ...m, credits } : m)),
    [qc],
  );

  return (
    <Ctx.Provider
      value={{
        config,
        configError,
        me,
        meLoading: meQuery.isPending,
        wrongNetwork,
        lastSignIn,
        clearLastSignIn: () => setLastSignIn(null),
        signIn,
        signOut,
        switchNetwork,
        switchError,
        setCredits,
        refreshMe: () => void qc.invalidateQueries({ queryKey: ['me'] }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
