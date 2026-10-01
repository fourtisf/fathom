'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { brand, FALLBACK_MODEL, MODELS, WELCOME_CREDITS } from '@fathom/config';
import { ApiError, post, type WelcomeDenied } from '@/lib/api';
import { streamChat, type ChatEvent } from '@/lib/chat';
import type { ToolState } from '@/lib/crypto-types';
import { PriceStrip, TokenCard, ToolLine } from './CryptoCards';
import { Icon } from '../Icon';
import { LogoMark } from '../LogoMark';
import { useCopy, useToast } from '../Toast';
import { useHistory, type ChatRecord } from './History';
import { Markdown } from './Markdown';
import { fmt2, fmtCost } from './Shell';
import { short, useSession } from './Session';
import { useUi } from './Ui';

type SlotState = {
  model: string;
  text: string;
  status: 'waiting' | 'streaming' | 'done' | 'error' | 'stopped';
  credits?: number;
  error?: string;
};
type Turn =
  | { id: number; kind: 'you'; text: string }
  | {
      id: number;
      kind: 'ai';
      slots: SlotState[];
      search?: 'running' | 'done' | 'unavailable';
      sources?: number;
      tools?: { token?: ToolState; price?: ToolState };
    }
  | { id: number; kind: 'note'; text: string }
  | {
      id: number;
      kind: 'fail';
      title: string;
      body: string;
      action?: { label: string; retry?: { q: string; model: string }; topup?: boolean; claim?: boolean };
    };
type NewTurn = Turn extends infer T ? (T extends Turn ? Omit<T, 'id'> : never) : never;

export const WELCOME_DENIED_TEXT: Record<WelcomeDenied | 'already_claimed', string> = {
  no_activity:
    'Free credits need a wallet with some activity on Robinhood Chain (at least one transaction or a balance). Try your main wallet.',
  ip_limit: 'Free credits are limited per network each day. Try again tomorrow.',
  daily_limit: "Today's free credits are all claimed. Try again tomorrow.",
  check_failed: "We couldn't check your wallet right now. Try again in a minute.",
  already_claimed: 'This wallet already received its free credits.',
};

const TOKEN_CHECK_PREFIX = 'Check this token for red flags: ';

const SUGGESTIONS: { title: string; sub: string; prompt: string; fill?: boolean }[] = [
  {
    title: `What is ${brand.name}?`,
    sub: 'Privacy, credits and how it works',
    prompt: `What is ${brand.name}, how does it keep my chats private, and how do credits work?`,
  },
  {
    title: 'Check a token for red flags',
    sub: 'Paste a contract address on Robinhood Chain',
    prompt: TOKEN_CHECK_PREFIX,
    fill: true,
  },
  {
    title: 'Crypto market today',
    sub: 'Live BTC, ETH and SOL prices',
    prompt: 'How does the crypto market look today? Give me the live BTC, ETH and SOL prices and the 24h moves.',
  },
  {
    title: 'Spot a memecoin rug pull',
    sub: 'Liquidity, dev wallets and mint authority',
    prompt:
      'How do I spot a memecoin rug pull before buying? Walk me through checking locked liquidity, dev and top-holder wallets, mint and freeze authority, and honeypot sell restrictions.',
  },
  {
    title: 'What is Robinhood Chain?',
    sub: 'The layer 2, USDG and tokenized stocks',
    prompt:
      'Explain what Robinhood Chain is, how it relates to Ethereum and Arbitrum, and what USDG and tokenized stocks are. Say clearly which details you are unsure about or may be out of date.',
  },
  {
    title: 'Bridge to Robinhood Chain safely',
    sub: 'The steps and the mistakes that cost money',
    prompt:
      'How do I safely bridge ETH or stablecoins from Ethereum to a layer 2 like Robinhood Chain? List the steps, how to verify the official bridge, and the common mistakes that lose funds.',
  },
];

const modelName = (id: string) => MODELS.find((m) => m.id === id)?.name ?? id;
const RM = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const newChatId = () => crypto.randomUUID().replace(/-/g, '');
let nextId = 1;

function AiIcon() {
  return (
    <div className="ic">
      <Icon name="mk" />
    </div>
  );
}

function Actions({ slot, onRegenerate }: { slot: SlotState; onRegenerate?: () => void }) {
  const copy = useCopy();
  return (
    <div className="meta">
      <span>{modelName(slot.model)}</span>
      <span>{slot.status === 'stopped' ? 'Stopped · not charged' : `${fmtCost(slot.credits ?? 0)} credits`}</span>
      <span className="ok">
        <Icon name="shield" />
        Not logged
      </span>
      <button className="mact" onClick={() => copy(slot.text, 'Answer copied')} aria-label="Copy answer">
        Copy
      </button>
      {onRegenerate && (
        <button className="mact" onClick={onRegenerate} aria-label="Regenerate answer">
          Regenerate
        </button>
      )}
    </div>
  );
}

function SlotBody({ slot, big }: { slot: SlotState; big?: boolean }) {
  if (slot.status === 'waiting') return <span className="shim" style={{ fontSize: 14 }}>Answering privately…</span>;
  if (slot.status === 'error')
    return <p style={{ fontSize: 13.5, color: '#FFC2C8' }}>{slot.error ?? 'Temporarily unavailable.'} Not charged.</p>;
  return (
    <div style={big ? undefined : { fontSize: 14 }}>
      <Markdown text={slot.text} />
      {slot.status === 'streaming' && <span className="caret" />}
    </div>
  );
}

function toRecord(turns: Turn[], createdAt: string, burn: ChatRecord['burn']): ChatRecord | null {
  const kept: ChatRecord['turns'] = [];
  for (const t of turns) {
    if (t.kind === 'you') kept.push({ kind: 'you', text: t.text });
    if (t.kind === 'ai') {
      const slots = t.slots
        .filter((s) => (s.status === 'done' || s.status === 'stopped') && s.text)
        .map((s) => ({ model: s.model, text: s.text, credits: s.credits }));
      const token = t.tools?.token?.status === 'done' ? t.tools.token.report : undefined;
      const prices = t.tools?.price?.status === 'done' ? t.tools.price.prices : undefined;
      if (slots.length) kept.push({ kind: 'ai', slots, ...(token ? { token } : {}), ...(prices?.length ? { prices } : {}) });
    }
  }
  const first = kept.find((t) => t.kind === 'you');
  if (!first || !kept.some((t) => t.kind === 'ai')) return null;
  const title = first.text.replace(/\s+/g, ' ').trim().slice(0, 60);
  return { v: 1, title, createdAt, burn, turns: kept };
}

function fromRecord(r: ChatRecord): Turn[] {
  return r.turns.map((t) =>
    t.kind === 'you'
      ? { id: nextId++, kind: 'you' as const, text: t.text }
      : {
          id: nextId++,
          kind: 'ai' as const,
          slots: t.slots.map((s) => ({ ...s, status: 'done' as const })),
          tools: {
            ...(t.token ? { token: { status: 'done' as const, report: t.token } } : {}),
            ...(t.prices ? { price: { status: 'done' as const, prices: t.prices } } : {}),
          },
        },
  );
}

export function Chat() {
  const { me, config, lastSignIn, clearLastSignIn, setCredits, refreshMe } = useSession();
  const ui = useUi();
  const history = useHistory();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [chatId, setChatId] = useState(newChatId);
  const [createdAt, setCreatedAt] = useState(() => new Date().toISOString());
  const thread = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const add = (t: NewTurn) => {
    const turn = { ...t, id: nextId++ } as Turn;
    setTurns((ts) => [...ts, turn]);
    return turn.id;
  };
  const patchAi = (id: number, f: (t: Extract<Turn, { kind: 'ai' }>) => Extract<Turn, { kind: 'ai' }>) =>
    setTurns((ts) => ts.map((t) => (t.id === id && t.kind === 'ai' ? f(t) : t)));

  useEffect(() => ui.setActiveChatId(chatId), [chatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Greet once right after sign-in, and explain when free credits weren't granted.
  useEffect(() => {
    if (!lastSignIn) return;
    add({
      kind: 'note',
      text: `Signed in as ${short(lastSignIn.address)}${lastSignIn.welcome ? ` · ${WELCOME_CREDITS} free credits added` : ''}`,
    });
    if (lastSignIn.welcomeDenied) {
      add({
        kind: 'fail',
        title: 'No free credits yet.',
        body: WELCOME_DENIED_TEXT[lastSignIn.welcomeDenied],
        action: lastSignIn.welcomeDenied === 'no_activity' ? undefined : { label: 'Try again', claim: true },
      });
    }
    clearLastSignIn();
  }, [lastSignIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view while streaming, unless the user scrolled up.
  useEffect(() => {
    const el = thread.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const persist = useCallback(
    async (ts: Turn[], burn = ui.burn) => {
      const record = toRecord(ts, createdAt, burn);
      if (!record) return;
      try {
        await history.save(chatId, record);
      } catch {
        toast("Couldn't save this chat. It's still here until you leave.", true);
      }
    },
    [history, chatId, createdAt, ui.burn, toast],
  );

  const reset = useCallback(
    (note?: string) => {
      setTurns([]);
      setLeaving(false);
      setChatId(newChatId());
      setCreatedAt(new Date().toISOString());
      ui.setBurn(me?.settings.defaultBurn ?? 'off');
      if (note) add({ kind: 'note', text: note });
    },
    [me?.settings.defaultBurn], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const forget = useCallback(
    (opts: { silent?: boolean; erase?: boolean } = {}) => {
      abort.current?.abort();
      if (opts.erase) void history.remove(chatId);
      const done = () => reset(opts.silent ? undefined : 'New private chat');
      if (RM() || opts.silent || !turnsRef.current.length) return done();
      setLeaving(true);
      setTimeout(done, 700);
    },
    [history, chatId, reset],
  );

  useEffect(() => {
    if (ui.newChatSignal) forget();
  }, [ui.newChatSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open a saved chat picked in the sidebar.
  useEffect(() => {
    const id = ui.openChatId;
    if (!id) return;
    ui.openChat(null);
    abort.current?.abort();
    void history.load(id).then((r) => {
      if (!r) return toast("This chat can't be opened on this device.", true);
      setTurns(fromRecord(r));
      setChatId(id);
      setCreatedAt(r.createdAt);
      ui.setBurn(r.burn);
    });
  }, [ui.openChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inp.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  // The burn selector lives in the top bar; re-save with the new timer and say what happens.
  const lastBurn = useRef(ui.burn);
  useEffect(() => {
    if (lastBurn.current === ui.burn) return;
    lastBurn.current = ui.burn;
    if (!turnsRef.current.length) return;
    if (ui.burn !== 'off') add({ kind: 'note', text: `This chat will self-destruct in ${ui.burn === '1h' ? '1 hour' : '24 hours'}` });
    void persist(turnsRef.current, ui.burn);
  }, [ui.burn]); // eslint-disable-line react-hooks/exhaustive-deps

  function historyFor(ts: Turn[]): { role: 'user' | 'assistant'; content: string }[] {
    const out: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const t of ts) {
      if (t.kind === 'you') out.push({ role: 'user', content: t.text });
      const s = t.kind === 'ai' ? t.slots.find((x) => (x.status === 'done' || x.status === 'stopped') && x.text) : undefined;
      if (s) out.push({ role: 'assistant', content: s.text });
    }
    // Keep roles alternating: drop user messages that never got an answer.
    const clean: typeof out = [];
    for (const m of out) {
      if (m.role === 'user' && clean.at(-1)?.role === 'user') clean.pop();
      clean.push(m);
    }
    while (clean.at(-1)?.role === 'user') clean.pop();
    return clean.slice(-40);
  }

  async function claimWelcome(failId: number) {
    try {
      const r = await post<{ credits: number; balance: number }>('/credits/welcome');
      setCredits(r.balance);
      setTurns((ts) => ts.filter((t) => t.id !== failId));
      add({ kind: 'note', text: `${WELCOME_CREDITS} free credits added` });
      refreshMe();
    } catch (e) {
      const code = e instanceof ApiError ? (e.code as keyof typeof WELCOME_DENIED_TEXT) : 'check_failed';
      toast(WELCOME_DENIED_TEXT[code] ?? WELCOME_DENIED_TEXT.check_failed, true);
    }
  }

  async function send(opts: { text?: string; retry?: { q: string; model: string }; regenerate?: boolean } = {}) {
    const { retry, regenerate } = opts;
    let base = turnsRef.current;
    let q: string;
    if (regenerate) {
      const lastYou = [...base].reverse().find((t) => t.kind === 'you') as Extract<Turn, { kind: 'you' }> | undefined;
      if (!lastYou) return;
      q = lastYou.text;
      base = base.slice(0, base.indexOf(lastYou) + 1);
      setTurns(base);
    } else {
      q = (retry?.q ?? opts.text ?? input).trim();
    }
    if (!q || busy) return;
    if (!me) return ui.openModal('wallet');
    const model = retry?.model ?? ui.model;
    const compare = !retry && ui.compare;
    const web = Boolean(ui.webSearch && config?.webSearch);
    const models = compare ? [model, ui.cmpModel] : [model];
    const msgs = [...historyFor(regenerate ? base.slice(0, -1) : base), { role: 'user' as const, content: q }];

    if (!retry && !regenerate) {
      add({ kind: 'you', text: q });
      // A new question always brings the thread to the bottom, even after a tall card.
      setTimeout(() => {
        const el = thread.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 0);
      if (opts.text === undefined) {
        setInput('');
        if (inp.current) inp.current.style.height = 'auto';
      }
    }
    if (!config?.inference) {
      add({ kind: 'fail', title: 'AI models are not connected yet.', body: "We're finishing the setup. You weren't charged." });
      return;
    }

    const aiId = add({
      kind: 'ai',
      slots: models.map((m) => ({ model: m, text: '', status: 'waiting' as const })),
      search: web ? 'running' : undefined,
    });
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;

    const onEvent = (e: ChatEvent) => {
      if (e.type === 'search') return patchAi(aiId, (t) => ({ ...t, search: e.status, sources: e.sources }));
      if (e.type === 'tool') {
        const state: ToolState =
          e.status === 'done' ? (e.tool === 'token' ? { status: 'done', report: e.report } : { status: 'done', prices: e.prices }) : { status: e.status };
        return patchAi(aiId, (t) => ({ ...t, tools: { ...t.tools, [e.tool]: state } }));
      }
      if (e.type === 'end') return setCredits(e.balance);
      patchAi(aiId, (t) => ({
        ...t,
        slots: t.slots.map((s, i) => {
          if (i !== e.slot) return s;
          if (e.type === 'delta') return { ...s, status: 'streaming', text: s.text + e.text };
          if (e.type === 'done') return { ...s, status: 'done', credits: e.credits };
          return { ...s, status: 'error', error: e.code === 'model_unavailable' ? 'Temporarily unavailable.' : 'Something went wrong.' };
        }),
      }));
    };

    try {
      await streamChat(
        { model, compareWith: compare ? ui.cmpModel : undefined, webSearch: web, messages: msgs },
        onEvent,
        ctrl.signal,
      );
      ui.markOnboard('msg');
      if (compare) ui.markOnboard('cmp');
      // Wait for React to apply the last events, then save the encrypted copy.
      setTimeout(() => void persist(turnsRef.current), 0);
    } catch (err) {
      if (ctrl.signal.aborted) {
        // Stopped by the user: keep what arrived; unfinished answers are never charged.
        patchAi(aiId, (t) => ({
          ...t,
          slots: t.slots.map((s) => (s.status === 'streaming' || s.status === 'waiting' ? { ...s, status: s.text ? 'stopped' : 'error', error: 'Stopped.' } : s)),
        }));
        refreshMe();
        setTimeout(() => void persist(turnsRef.current), 0);
        return;
      }
      setTurns((ts) => ts.filter((t) => t.id !== aiId));
      const e = err instanceof ApiError ? err : null;
      const body = (e?.body as { error?: { needed?: number; balance?: number; model?: string } } | undefined)?.error;
      if (e?.status === 402) {
        add({
          kind: 'fail',
          title: 'Not enough credits.',
          body: `This message needs about ${(body?.needed ?? 0).toFixed(2)} credits and you have ${fmt2(body?.balance ?? me.credits)}. You weren't charged.`,
          action: { label: 'Top up', topup: true },
        });
      } else if (e?.status === 503) {
        const down = body?.model ?? model;
        const alt =
          config.models.find((m) => m.status === 'ok' && m.id !== down)?.id ??
          (down === FALLBACK_MODEL ? MODELS.find((m) => m.id !== down)!.id : FALLBACK_MODEL);
        add({
          kind: 'fail',
          title: `${modelName(down)} is temporarily unavailable.`,
          body: "We're restoring it now. You weren't charged.",
          action: { label: `Switch to ${modelName(alt)} and retry`, retry: { q, model: alt } },
        });
      } else if (e?.status === 401) {
        refreshMe();
        add({ kind: 'fail', title: 'Your session expired.', body: "Connect your wallet again to continue. You weren't charged." });
      } else if (e?.status === 429) {
        add({ kind: 'fail', title: "You're sending messages quickly.", body: "Wait a few seconds and try again. You weren't charged." });
      } else {
        add({ kind: 'fail', title: `Couldn't reach ${brand.name}.`, body: "Check your connection and try again. You weren't charged." });
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function edit(turn: Extract<Turn, { kind: 'you' }>) {
    if (busy) return;
    setTurns((ts) => ts.slice(0, ts.indexOf(turn)));
    setInput(turn.text);
    setTimeout(() => {
      const el = inp.current;
      if (!el) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, 0);
  }

  function fillComposer(text: string) {
    setInput(text);
    setTimeout(() => {
      const el = inp.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(text.length, text.length);
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, 0);
  }

  if (!me) {
    return (
      <div className="apage chatwrap" style={{ display: 'flex' }}>
        <div className="gate">
          <div>
            <LogoMark />
            <h2>Connect to start chatting</h2>
            <p>Your wallet is your account. Sign one message, no gas, and get {WELCOME_CREDITS} free credits to try every model.</p>
            <button className="btn btn-dark btn-lg" onClick={() => ui.openModal('wallet')}>
              Connect wallet
            </button>
            <p style={{ fontSize: 13, marginTop: 14 }}>
              New to crypto?{' '}
              <button onClick={() => ui.openModal('start')} style={{ color: 'var(--violet2)', textDecoration: 'underline' }}>
                See how to get started
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const ob = ui.onboard;
  const claimed = me.welcomeClaimed !== false;
  const showChecklist = !ob.hidden && !(ob.msg && ob.cmp && ob.top && ob.verify && claimed);
  const lastAiId = [...turns].reverse().find((t) => t.kind === 'ai')?.id;

  return (
    <div className="apage chatwrap" style={{ display: 'flex' }}>
      <div className="thread" ref={thread}>
        {showChecklist && (
          <div className="checklist">
            <h4>
              Getting started <button onClick={() => ui.markOnboard('hidden')}>Hide</button>
            </h4>
            <ul>
              <li className="done"><i />Connect your wallet</li>
              <li className={claimed ? 'done' : undefined}>
                <i />
                {claimed ? `Claim ${WELCOME_CREDITS} free credits` : <button onClick={() => void claimWelcome(-1)}>Claim {WELCOME_CREDITS} free credits</button>}
              </li>
              <li className={ob.msg ? 'done' : undefined}><i />Send your first private message</li>
              <li className={ob.cmp ? 'done' : undefined}>
                <i />Try{' '}
                <button onClick={() => { ui.setCompare(true); inp.current?.focus(); }}>Compare mode</button>
              </li>
              <li className={ob.top ? 'done' : undefined}>
                <i />
                <button onClick={() => ui.openModal('topup')}>Top up credits</button> <em className="soonTag">soon</em>
              </li>
              <li className={ob.verify ? 'done' : undefined}>
                <i />
                <Link href="/trust" onClick={() => ui.markOnboard('verify')} style={{ color: 'var(--violet2)', textDecoration: 'underline' }}>
                  See how privacy works
                </Link>
              </li>
            </ul>
          </div>
        )}
        {history.enabled && !history.unlocked && turns.some((t) => t.kind === 'ai') && (
          <div className="savebar">
            <Icon name="lock" />
            <span>This chat isn&apos;t saved. Unlock encrypted history with one signature to keep it on your devices.</span>
            <button
              className="btn btn-light"
              onClick={() =>
                history
                  .unlock()
                  .then(() => persist(turnsRef.current))
                  .then(() => toast('History unlocked. This chat is saved, encrypted.'))
                  .catch((e: unknown) =>
                    toast(e instanceof Error && e.message === 'wallet_not_connected' ? 'Reconnect your wallet to unlock history.' : 'History stays locked.', true),
                  )
              }
            >
              Unlock
            </button>
          </div>
        )}
        <div className="thread-in" aria-live="polite">
          {turns.map((t) => {
            const gone = leaving ? ' gone' : '';
            if (t.kind === 'you')
              return (
                <div key={t.id} className={`m you${gone}`} style={{ whiteSpace: 'pre-wrap' }}>
                  {t.text}
                  {!busy && (
                    <button className="editbtn" onClick={() => edit(t)} aria-label="Edit message">
                      Edit
                    </button>
                  )}
                </div>
              );
            if (t.kind === 'note')
              return (
                <div key={t.id} className={`m note${gone}`}>
                  <Icon name="shield" />
                  {t.text}
                </div>
              );
            if (t.kind === 'fail')
              return (
                <div key={t.id} className={`m ai${gone}`}>
                  <AiIcon />
                  <div className="errbox">
                    <b>{t.title}</b> {t.body}
                    {t.action && (
                      <>
                        <br />
                        <button
                          className="btn btn-dark"
                          onClick={() => {
                            if (t.action?.topup) return ui.openModal('topup');
                            if (t.action?.claim) return void claimWelcome(t.id);
                            if (t.action?.retry) {
                              ui.setModel(t.action.retry.model);
                              setTurns((ts) => ts.filter((x) => x.id !== t.id));
                              void send({ retry: t.action.retry });
                            }
                          }}
                        >
                          {t.action.label}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            const search = t.search && (
              <div className="toolrun">
                {t.search === 'running' ? (
                  <>
                    <Icon name="globe" />
                    <span className="shim">Searching the web as {brand.name}…</span>
                  </>
                ) : t.search === 'done' ? (
                  <>
                    <Icon name="chk" />
                    Read {t.sources ?? 0} sources · your IP stayed hidden
                  </>
                ) : (
                  <>
                    <Icon name="info" />
                    Web search is unavailable right now, answering without it
                  </>
                )}
              </div>
            );
            const tk = t.tools?.token;
            const pr = t.tools?.price;
            const tools = (tk || pr) && (
              <>
                {tk && (tk.status !== 'done' || !tk.report) && <ToolLine tool="token" state={tk} chain={config?.chain?.name} />}
                {tk?.status === 'done' && tk.report && <TokenCard report={tk.report} />}
                {pr && (pr.status !== 'done' || !pr.prices?.length) && <ToolLine tool="price" state={pr} />}
                {pr?.status === 'done' && pr.prices && pr.prices.length > 0 && (
                  <>
                    <ToolLine tool="price" state={pr} />
                    <PriceStrip prices={pr.prices} />
                  </>
                )}
              </>
            );
            const finished = t.slots.every((s) => s.status !== 'waiting' && s.status !== 'streaming');
            const regen = finished && !busy && t.id === lastAiId ? () => void send({ regenerate: true }) : undefined;
            if (t.slots.length === 2)
              return (
                <div key={t.id} className={`m ai${gone}`}>
                  <AiIcon />
                  <div>
                    {search}
                    {tools}
                    <div className="cmp">
                      {t.slots.map((s, i) => (
                        <div key={i}>
                          <h5>
                            {modelName(s.model)}
                            <small>
                              {s.status === 'done' ? `${fmtCost(s.credits ?? 0)} cr` : s.status === 'error' ? 'unavailable' : s.status === 'stopped' ? 'stopped' : ''}
                            </small>
                          </h5>
                          <SlotBody slot={s} />
                          {(s.status === 'done' || s.status === 'stopped') && s.text && (
                            <CopyLink text={s.text} />
                          )}
                        </div>
                      ))}
                    </div>
                    {regen && (
                      <div className="meta">
                        <button className="mact" onClick={regen}>Regenerate both</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            const s = t.slots[0]!;
            return (
              <div key={t.id} className={`m ai${gone}`}>
                <AiIcon />
                <div className="b">
                  {search}
                  {tools}
                  <SlotBody slot={s} big />
                  {(s.status === 'done' || s.status === 'stopped') && <Actions slot={s} onRegenerate={regen} />}
                </div>
              </div>
            );
          })}
          {!turns.some((t) => t.kind === 'you') && !busy && (
            <div className="suggest" aria-label="Suggested questions">
              {SUGGESTIONS.filter((x) => !x.fill || config?.tokenCheck).map((x) => (
                <button key={x.title} onClick={() => (x.fill ? fillComposer(x.prompt) : void send({ text: x.prompt }))}>
                  <b>{x.title}</b>
                  <span>{x.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="composer-wrap">
        <div className="composer">
          <textarea
            ref={inp}
            rows={1}
            placeholder="Ask anything, privately…"
            aria-label="Message"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="cbar">
            <button
              className="chip"
              aria-pressed={ui.compare}
              onClick={() => {
                ui.setCompare(!ui.compare);
                toast(ui.compare ? 'Compare off' : 'Compare on');
              }}
            >
              <Icon name="columns" />
              Compare
            </button>
            {config?.tokenCheck && (
              <button
                className="chip"
                onClick={() => {
                  fillComposer(input.startsWith(TOKEN_CHECK_PREFIX) ? input : TOKEN_CHECK_PREFIX + input);
                  toast('Paste a contract address on Robinhood Chain');
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Check token
              </button>
            )}
            {config?.webSearch && (
              <button className="chip" aria-pressed={ui.webSearch} onClick={() => ui.setWebSearch(!ui.webSearch)}>
                <Icon name="globe" />
                Web search
              </button>
            )}
            <span className="sp" />
            {busy ? (
              <button className="send" aria-label="Stop answering" onClick={() => abort.current?.abort()}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="7" y="7" width="10" height="10" rx="2" />
                </svg>
              </button>
            ) : (
              <button className="send" aria-label="Send" disabled={!input.trim()} onClick={() => void send()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="chint">
          <span className="l">
            <Icon name={ui.burn !== 'off' ? 'flame' : 'lock'} />
            <span>
              {ui.burn !== 'off'
                ? `Encrypted · this chat self-destructs ${ui.burn === '1h' ? '1 hour' : '24 hours'} after it started`
                : history.enabled && history.unlocked
                  ? 'Never logged · saved encrypted to your wallet'
                  : 'Never logged · not saved'}
            </span>
          </span>
          <button
            onClick={() => {
              forget({ erase: true });
              toast('Chat forgotten. Nothing was kept.');
            }}
          >
            Forget this chat
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyLink({ text }: { text: string }) {
  const copy = useCopy();
  return (
    <button className="mact" style={{ marginTop: 8 }} onClick={() => copy(text, 'Answer copied')}>
      Copy
    </button>
  );
}
