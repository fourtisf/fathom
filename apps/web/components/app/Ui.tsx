'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_MODEL, FALLBACK_MODEL } from '@fathom/config';
import { useSession } from './Session';

export type ModalId = 'wallet' | 'start' | 'topup' | 'delete' | 'newkey' | null;
export type Burn = 'off' | '1h' | '24h';
export type OnboardKey = 'msg' | 'cmp' | 'top' | 'verify';

interface Ui {
  modal: ModalId;
  openModal(id: ModalId): void;
  closeModal(): void;
  model: string;
  cmpModel: string;
  compare: boolean;
  webSearch: boolean;
  setModel(id: string): void;
  setCompare(on: boolean): void;
  setWebSearch(on: boolean): void;
  /** Incremented to ask the chat page to start a fresh chat. */
  newChatSignal: number;
  newChat(): void;
  onboard: Partial<Record<OnboardKey, boolean>> & { hidden?: boolean };
  markOnboard(k: OnboardKey | 'hidden'): void;
  /** Auto-delete timer for the current chat. */
  burn: Burn;
  setBurn(b: Burn): void;
  /** Saved chat the user picked in the sidebar; the chat page loads it. */
  openChatId: string | null;
  openChat(id: string | null): void;
  /** Chat currently shown, for highlighting in the sidebar. */
  activeChatId: string | null;
  setActiveChatId(id: string | null): void;
  /** One-time secret shown after creating an API key. */
  newKey: string | null;
  setNewKey(k: string | null): void;
}

const Ctx = createContext<Ui | null>(null);

export function useUi(): Ui {
  const u = useContext(Ctx);
  if (!u) throw new Error('useUi outside UiProvider');
  return u;
}

const storeKey = (addr: string) => `nx_onboard_${addr.toLowerCase()}`;

export function UiProvider({ children }: { children: ReactNode }) {
  const { me, config } = useSession();
  const [modal, setModal] = useState<ModalId>(null);
  const [model, setModelState] = useState<string>(DEFAULT_MODEL);
  const [cmpModel, setCmpModel] = useState<string>(FALLBACK_MODEL);
  const [compare, setCompareState] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [newChatSignal, setSignal] = useState(0);
  const [onboard, setOnboard] = useState<Ui['onboard']>({});
  const [burn, setBurn] = useState<Burn>('off');
  const [openChatId, openChat] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Onboarding progress is a per-wallet UI preference, kept in this browser only.
  useEffect(() => {
    if (!me) return setOnboard({});
    try {
      setOnboard(JSON.parse(localStorage.getItem(storeKey(me.address)) ?? '{}'));
    } catch {
      setOnboard({});
    }
    setWebSearch(me.settings.webSearch);
    setBurn(me.settings.defaultBurn);
  }, [me?.address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default to models that are actually online: a provider may not serve every model in the menu.
  useEffect(() => {
    const ok = config?.models.filter((m) => m.status === 'ok').map((m) => m.id) ?? [];
    if (!ok.length) return;
    const primary = ok.includes(model) ? model : ok[0]!;
    if (primary !== model) setModelState(primary);
    if (!ok.includes(cmpModel) || cmpModel === primary) {
      const alt = ok.find((id) => id !== primary);
      if (alt) setCmpModel(alt);
    }
  }, [config?.models]); // eslint-disable-line react-hooks/exhaustive-deps

  const markOnboard = useCallback(
    (k: OnboardKey | 'hidden') =>
      setOnboard((o) => {
        if (o[k]) return o;
        const next = { ...o, [k]: true };
        if (me) {
          try {
            localStorage.setItem(storeKey(me.address), JSON.stringify(next));
          } catch {}
        }
        return next;
      }),
    [me],
  );

  const setModel = (id: string) => {
    if (compare && id === cmpModel) setCmpModel(model);
    setModelState(id);
  };
  const setCompare = (on: boolean) => {
    if (on && cmpModel === model) setCmpModel(model === DEFAULT_MODEL ? FALLBACK_MODEL : DEFAULT_MODEL);
    setCompareState(on);
  };

  return (
    <Ctx.Provider
      value={{
        modal,
        openModal: setModal,
        closeModal: () => setModal(null),
        model,
        cmpModel,
        compare,
        webSearch,
        setModel,
        setCompare,
        setWebSearch,
        newChatSignal,
        newChat: () => setSignal((n) => n + 1),
        onboard,
        markOnboard,
        burn,
        setBurn,
        openChatId,
        openChat,
        activeChatId,
        setActiveChatId,
        newKey,
        setNewKey,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
