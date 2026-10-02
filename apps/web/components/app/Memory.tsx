'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import { useHistory } from './History';
import { useSession } from './Session';

/**
 * Private memory: facts the user wants the assistant to know. Encrypted in this browser with the
 * wallet-derived key (the same one as chat history); the server stores only ciphertext. While memory
 * is on, the decrypted facts are sent with each chat message and never stored or logged by the server.
 */

export const MAX_FACTS = 30;
export const MAX_FACT_CHARS = 200;

interface MemoryRecord {
  v: 1;
  enabled: boolean;
  facts: string[];
}

interface Memory {
  /** Wallet key available, so memory can be read and written. */
  ready: boolean;
  loading: boolean;
  enabled: boolean;
  facts: string[];
  /** Locked chats from a different key: the blob exists but can't be opened here. */
  unreadable: boolean;
  setEnabled(on: boolean): Promise<void>;
  add(fact: string): Promise<void>;
  remove(index: number): Promise<void>;
  clear(): Promise<void>;
  /** Text to send with a chat, or undefined when memory is off or empty. */
  forChat(): string | undefined;
}

const Ctx = createContext<Memory | null>(null);

export function useMemory(): Memory {
  const m = useContext(Ctx);
  if (!m) throw new Error('useMemory outside MemoryProvider');
  return m;
}

export function MemoryProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const history = useHistory();
  const [rec, setRec] = useState<MemoryRecord>({ v: 1, enabled: true, facts: [] });
  const [loading, setLoading] = useState(false);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    setRec({ v: 1, enabled: true, facts: [] });
    setUnreadable(false);
    if (!me || !history.unlocked) return;
    let alive = true;
    setLoading(true);
    api<{ ciphertext: string; iv: string }>('/memory')
      .then(async (b) => {
        const r = await history.open<MemoryRecord>(b.ciphertext, b.iv);
        if (!alive) return;
        if (r && Array.isArray(r.facts)) setRec({ v: 1, enabled: r.enabled !== false, facts: r.facts.filter((f) => typeof f === 'string').slice(0, MAX_FACTS) });
        else setUnreadable(true);
      })
      .catch((e) => {
        if (!(e instanceof ApiError && e.status === 404)) console.warn('memory load failed');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [me?.address, history.unlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const write = useCallback(
    async (next: MemoryRecord) => {
      const sealed = await history.seal(next);
      if (!sealed) throw new Error('locked');
      await api('/memory', { method: 'PUT', body: JSON.stringify(sealed) });
      setRec(next);
      setUnreadable(false);
    },
    [history],
  );

  const value: Memory = {
    ready: history.unlocked,
    loading,
    enabled: rec.enabled,
    facts: rec.facts,
    unreadable,
    setEnabled: (on) => write({ ...rec, enabled: on }),
    add: async (fact) => {
      const f = fact.replace(/\s+/g, ' ').trim().slice(0, MAX_FACT_CHARS);
      if (!f || rec.facts.includes(f)) return;
      await write({ ...rec, facts: [...rec.facts, f].slice(-MAX_FACTS) });
    },
    remove: (i) => write({ ...rec, facts: rec.facts.filter((_, j) => j !== i) }),
    clear: async () => {
      await api('/memory', { method: 'DELETE' });
      setRec({ v: 1, enabled: rec.enabled, facts: [] });
      setUnreadable(false);
    },
    forChat: () => (history.unlocked && rec.enabled && rec.facts.length ? rec.facts.join('\n') : undefined),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
