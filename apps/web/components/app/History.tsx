'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CoinPrice, TokenReport } from '@/lib/crypto-types';
import { useConnection, useSignMessage } from 'wagmi';
import { api, type ChatBlob } from '@/lib/api';
import {
  decryptJson,
  deleteHistoryKey,
  deriveHistoryKey,
  encryptJson,
  historyKeyMessage,
  loadHistoryKey,
  storeHistoryKey,
} from '@/lib/history-crypto';
import { useSession } from './Session';
import type { Burn } from './Ui';

export type { Burn };

export const BURN_MS: Record<Burn, number | null> = { off: null, '1h': 3_600_000, '24h': 86_400_000 };

/** What gets encrypted. The server sees only the ciphertext of this object. */
export interface ChatRecord {
  v: 1;
  title: string;
  createdAt: string;
  burn: Burn;
  turns: (
    | { kind: 'you'; text: string; doc?: { name: string; pages: number | null; text: string; truncated: boolean } }
    | {
        kind: 'ai';
        slots: { model: string; text: string; credits?: number }[];
        /** Public on-chain report / live prices shown above the answer (encrypted like the rest). */
        token?: TokenReport;
        prices?: CoinPrice[];
      }
  )[];
}

export interface HistoryItem {
  id: string;
  title: string;
  burnAt: string | null;
  updatedAt: string;
  /** Encrypted with a key this browser doesn't have (e.g. a wallet that signs non-deterministically). */
  locked: boolean;
}

interface History {
  enabled: boolean;
  unlocked: boolean;
  items: HistoryItem[];
  unlock(): Promise<void>;
  refresh(): Promise<void>;
  save(id: string, record: ChatRecord): Promise<void>;
  load(id: string): Promise<ChatRecord | null>;
  remove(id: string): Promise<void>;
  /** Forget the local key (sign-out or history turned off). */
  lock(): Promise<void>;
}

const Ctx = createContext<History | null>(null);

export function useHistory(): History {
  const h = useContext(Ctx);
  if (!h) throw new Error('useHistory outside HistoryProvider');
  return h;
}

export function burnAtFor(record: ChatRecord): string | null {
  const ms = BURN_MS[record.burn];
  return ms ? new Date(new Date(record.createdAt).getTime() + ms).toISOString() : null;
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const connection = useConnection();
  const { mutateAsync: signMessage } = useSignMessage();
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const enabled = Boolean(me?.settings.saveHistory);
  // Refs so save/load right after unlock() see the new key, not a stale render's.
  const keyRef = useRef<CryptoKey | null>(null);
  const enabledRef = useRef(enabled);
  keyRef.current = key;
  enabledRef.current = enabled;

  const refreshWith = useCallback(async (k: CryptoKey) => {
    const blobs = await api<ChatBlob[]>('/chats');
    const now = Date.now();
    const out: HistoryItem[] = [];
    for (const b of blobs) {
      if (b.burnAt && new Date(b.burnAt).getTime() <= now) continue;
      try {
        const r = await decryptJson<ChatRecord>(k, b.ciphertext, b.iv);
        out.push({ id: b.id, title: r.title, burnAt: b.burnAt, updatedAt: b.updatedAt, locked: false });
      } catch {
        out.push({ id: b.id, title: 'Locked chat', burnAt: b.burnAt, updatedAt: b.updatedAt, locked: true });
      }
    }
    setItems(out);
  }, []);

  useEffect(() => {
    setKey(null);
    setItems([]);
    if (!me) return;
    let alive = true;
    void loadHistoryKey(me.address).then((k) => {
      if (!alive || !k) return;
      setKey(k);
      if (me.settings.saveHistory) void refreshWith(k).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [me?.address, me?.settings.saveHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlock = useCallback(async () => {
    if (!me) return;
    const address = (connection.address ?? me.address) as `0x${string}`;
    if (connection.status !== 'connected' || connection.address?.toLowerCase() !== me.address.toLowerCase()) {
      throw new Error('wallet_not_connected');
    }
    const signature = await signMessage({ message: historyKeyMessage(me.address), account: address });
    const k = await deriveHistoryKey(signature);
    await storeHistoryKey(me.address, k);
    keyRef.current = k;
    setKey(k);
    await refreshWith(k);
  }, [me, connection.address, connection.status, signMessage, refreshWith]);

  const refresh = useCallback(async () => {
    if (key && enabled) await refreshWith(key);
  }, [key, enabled, refreshWith]);

  const save = useCallback(
    async (id: string, record: ChatRecord) => {
      const k = keyRef.current;
      if (!k || !enabledRef.current) return;
      const { ciphertext, iv } = await encryptJson(k, record);
      const burnAt = burnAtFor(record);
      await api(`/chats/${id}`, { method: 'PUT', body: JSON.stringify({ ciphertext, iv, burnAt }) });
      setItems((xs) => [
        { id, title: record.title, burnAt, updatedAt: new Date().toISOString(), locked: false },
        ...xs.filter((x) => x.id !== id),
      ]);
    },
    [],
  );

  const load = useCallback(
    async (id: string) => {
      const key = keyRef.current;
      if (!key) return null;
      const blobs = await api<ChatBlob[]>('/chats');
      const b = blobs.find((x) => x.id === id);
      if (!b) return null;
      try {
        return await decryptJson<ChatRecord>(key, b.ciphertext, b.iv);
      } catch {
        return null;
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await api(`/chats/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const lock = useCallback(async () => {
    if (me) await deleteHistoryKey(me.address);
    keyRef.current = null;
    setKey(null);
    setItems([]);
  }, [me]);

  // Burned chats disappear from the list on time, even before the server purge runs.
  useEffect(() => {
    if (!items.some((i) => i.burnAt)) return;
    const t = setInterval(() => {
      const now = Date.now();
      setItems((xs) => xs.filter((x) => !x.burnAt || new Date(x.burnAt).getTime() > now));
    }, 30_000);
    return () => clearInterval(t);
  }, [items]);

  return (
    <Ctx.Provider value={{ enabled, unlocked: !!key, items, unlock, refresh, save, load, remove, lock }}>
      {children}
    </Ctx.Provider>
  );
}
