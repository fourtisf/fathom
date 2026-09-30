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
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur; i++) {
    const x = cur as { code?: number; name?: string; message?: string; cause?: unknown };
    if (x.code === 4001 || x.name === 'UserRejectedRequestError' || /user (rejected|denied)|rejected the request/i.test(x.message ?? ''))
      return true;
    cur = x.cause;
  }
  return false;
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
    toast('Approve the network switch in your wallet');
    try {
      await switchChain({ chainId: config.chain.id });
      toast(`Switched to ${config.chain.name}`);
    } catch (e) {
      toast(isUserRejection(e) ? 'Network switch cancelled' : 'Could not switch network. Switch it in your wallet.', true);
    }
  }, [config?.chain, switchChain, toast]);

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
        setCredits,
        refreshMe: () => void qc.invalidateQueries({ queryKey: ['me'] }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
