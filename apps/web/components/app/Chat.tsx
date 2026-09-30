'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { brand, FALLBACK_MODEL, MODELS, WELCOME_CREDITS } from '@fathom/config';
import { ApiError } from '@/lib/api';
import { streamChat, type ChatEvent } from '@/lib/chat';
import { Icon } from '../Icon';
import { LogoMark } from '../LogoMark';
import { useToast } from '../Toast';
import { fmt2, fmtCost } from './Shell';
import { short, useSession } from './Session';
import { useUi } from './Ui';

type SlotState = {
  model: string;
  text: string;
  status: 'waiting' | 'streaming' | 'done' | 'error';
  credits?: number;
  error?: string;
};
type Turn =
  | { id: number; kind: 'you'; text: string }
  | { id: number; kind: 'ai'; slots: SlotState[]; search?: 'running' | 'done' | 'unavailable'; sources?: number }
  | { id: number; kind: 'note'; text: string }
  | { id: number; kind: 'fail'; title: string; body: string; action?: { label: string; retry?: { q: string; model: string }; topup?: boolean } };

type NewTurn = Turn extends infer T ? (T extends Turn ? Omit<T, 'id'> : never) : never;

const SUGGESTIONS = [
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
    title: 'How memecoin launches work',
    sub: 'Bonding curves, snipers and bots',
    prompt:
      'Explain how memecoin launches work: bonding-curve launchpads, when liquidity migrates to a DEX, and how sniper bots and bundled wallets affect early buyers.',
  },
  {
    title: 'Check a token contract',
    sub: 'Red flags to look for before you buy',
    prompt:
      "What red flags should I check in a token's smart contract before buying it? Cover mint functions, blacklists, honeypots, taxes and owner privileges.",
  },
  {
    title: 'Bridge to Robinhood Chain safely',
    sub: 'The steps and the mistakes that cost money',
    prompt:
      'How do I safely bridge ETH or stablecoins from Ethereum to a layer 2 like Robinhood Chain? List the steps, how to verify the official bridge, and the common mistakes that lose funds.',
  },
  {
    title: 'Keep my wallet safe',
    sub: 'Seed phrase, token approvals and phishing',
    prompt:
      'How do I keep my crypto wallet safe? Cover storing the seed phrase, revoking old token approvals and spotting phishing sites and fake airdrops.',
  },
];

const modelName = (id: string) => MODELS.find((m) => m.id === id)?.name ?? id;
const RM = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let nextId = 1;

function AiIcon() {
  return (
    <div className="ic">
      <Icon name="mk" />
    </div>
  );
}

function Meta({ slot }: { slot: SlotState }) {
  return (
    <div className="meta">
      <span>{modelName(slot.model)}</span>
      <span>{fmtCost(slot.credits ?? 0)} credits</span>
      <span className="ok">
        <Icon name="shield" />
        Not stored
      </span>
    </div>
  );
}

function SlotBody({ slot, big }: { slot: SlotState; big?: boolean }) {
  const style = { fontSize: big ? undefined : 14, color: 'var(--ink2)', whiteSpace: 'pre-wrap' as const };
  if (slot.status === 'waiting') return <span className="shim" style={{ fontSize: 14 }}>Answering privately…</span>;
  if (slot.status === 'error')
    return <p style={{ fontSize: 13.5, color: '#FFC2C8' }}>{slot.error ?? 'Temporarily unavailable.'} Not charged.</p>;
  return (
    <span style={style}>
      {slot.text}
      {slot.status === 'streaming' && <span className="caret" />}
    </span>
  );
}

export function Chat() {
  const { me, config, lastSignIn, clearLastSignIn, setCredits, refreshMe } = useSession();
  const ui = useUi();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  const add = (t: NewTurn) => {
    const turn = { ...t, id: nextId++ } as Turn;
    setTurns((ts) => [...ts, turn]);
    return turn.id;
  };
  const patchAi = (id: number, f: (t: Extract<Turn, { kind: 'ai' }>) => Extract<Turn, { kind: 'ai' }>) =>
    setTurns((ts) => ts.map((t) => (t.id === id && t.kind === 'ai' ? f(t) : t)));

  // Greet once right after sign-in.
  useEffect(() => {
    if (!lastSignIn) return;
    add({
      kind: 'note',
      text: `Signed in as ${short(lastSignIn.address)}${lastSignIn.welcome ? ` · ${WELCOME_CREDITS} free credits added` : ''}`,
    });
    clearLastSignIn();
  }, [lastSignIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view while streaming, unless the user scrolled up.
  useEffect(() => {
    const el = thread.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const forget = useCallback(
    (silent = false) => {
      abort.current?.abort();
      const reset = () => {
        setTurns([]);
        setLeaving(false);
        if (!silent) add({ kind: 'note', text: 'New private chat' });
      };
      if (RM() || silent) return reset();
      setLeaving(true);
      setTimeout(reset, 700);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (ui.newChatSignal) forget();
  }, [ui.newChatSignal, forget]);

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

  function history(): { role: 'user' | 'assistant'; content: string }[] {
    const out: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const t of turns) {
      if (t.kind === 'you') out.push({ role: 'user', content: t.text });
      if (t.kind === 'ai' && t.slots[0]?.status === 'done' && t.slots[0].text) out.push({ role: 'assistant', content: t.slots[0].text });
    }
    // Drop a trailing user message that never got an answer, so roles keep alternating.
    while (out.length && out[out.length - 1]!.role === 'user') out.pop();
    return out.slice(-40);
  }

  async function send(opts: { text?: string; retry?: { q: string; model: string } } = {}) {
    const { retry } = opts;
    const q = (retry?.q ?? opts.text ?? input).trim();
    if (!q || busy) return;
    if (!me) return ui.openModal('wallet');
    const model = retry?.model ?? ui.model;
    const compare = !retry && ui.compare;
    const web = Boolean(ui.webSearch && config?.webSearch);
    const models = compare ? [model, ui.cmpModel] : [model];
    const msgs = [...history(), { role: 'user' as const, content: q }];

    if (!retry) {
      add({ kind: 'you', text: q });
      if (opts.text === undefined) {
        setInput('');
        if (inp.current) inp.current.style.height = 'auto';
      }
    }
    if (!config?.inference) {
      add({ kind: 'fail', title: 'AI models are not connected yet.', body: 'We\'re finishing the setup. You weren\'t charged.' });
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
    } catch (err) {
      if (ctrl.signal.aborted) return;
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
        const alt = down === FALLBACK_MODEL ? MODELS.find((m) => m.id !== down)!.id : FALLBACK_MODEL;
        add({
          kind: 'fail',
          title: `${modelName(down)} is temporarily unavailable.`,
          body: "We're restoring it now. You weren't charged.",
          action: { label: `Switch to ${modelName(alt)} and retry`, retry: { q, model: alt } },
        });
      } else if (e?.status === 401) {
        refreshMe();
        add({ kind: 'fail', title: 'Your session expired.', body: 'Connect your wallet again to continue. You weren\'t charged.' });
      } else if (e?.status === 429) {
        add({ kind: 'fail', title: 'You\'re sending messages quickly.', body: 'Wait a few seconds and try again. You weren\'t charged.' });
      } else {
        add({ kind: 'fail', title: `Couldn't reach ${brand.name}.`, body: 'Check your connection and try again. You weren\'t charged.' });
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
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
  const showChecklist = !ob.hidden && !(ob.msg && ob.cmp && ob.top && ob.verify);

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
              <li className="done"><i />Claim {WELCOME_CREDITS} free credits</li>
              <li className={ob.msg ? 'done' : undefined}><i />Send your first private message</li>
              <li className={ob.cmp ? 'done' : undefined}>
                <i />Try{' '}
                <button onClick={() => { ui.setCompare(true); inp.current?.focus(); }}>Compare mode</button>
              </li>
              <li className={ob.top ? 'done' : undefined}>
                <i />
                <button onClick={() => ui.openModal('topup')}>Top up credits</button>
              </li>
              <li className={ob.verify ? 'done' : undefined}>
                <i />
                <Link href="/trust" onClick={() => ui.markOnboard('verify')} style={{ color: 'var(--violet2)', textDecoration: 'underline' }}>
                  Verify the enclave
                </Link>
              </li>
            </ul>
          </div>
        )}
        <div className="thread-in" aria-live="polite">
          {turns.map((t) => {
            const gone = leaving ? ' gone' : '';
            if (t.kind === 'you') return <div key={t.id} className={`m you${gone}`} style={{ whiteSpace: 'pre-wrap' }}>{t.text}</div>;
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
            if (t.slots.length === 2)
              return (
                <div key={t.id} className={`m ai${gone}`}>
                  <AiIcon />
                  <div>
                    {search}
                    <div className="cmp">
                      {t.slots.map((s, i) => (
                        <div key={i}>
                          <h5>
                            {modelName(s.model)}
                            <small>{s.status === 'done' ? `${fmtCost(s.credits ?? 0)} cr` : s.status === 'error' ? 'unavailable' : ''}</small>
                          </h5>
                          <SlotBody slot={s} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            const s = t.slots[0]!;
            return (
              <div key={t.id} className={`m ai${gone}`}>
                <AiIcon />
                <div className="b">
                  {search}
                  <SlotBody slot={s} big />
                  {s.status === 'done' && <Meta slot={s} />}
                </div>
              </div>
            );
          })}
          {!turns.some((t) => t.kind === 'you') && !busy && (
            <div className="suggest" aria-label="Suggested questions">
              {SUGGESTIONS.map((x) => (
                <button key={x.title} onClick={() => void send({ text: x.prompt })}>
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
            {config?.webSearch && (
              <button className="chip" aria-pressed={ui.webSearch} onClick={() => ui.setWebSearch(!ui.webSearch)}>
                <Icon name="globe" />
                Web search
              </button>
            )}
            <span className="sp" />
            <button className="send" aria-label="Send" disabled={!input.trim() || busy} onClick={() => void send()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="chint">
          <span className="l">
            <Icon name="lock" />
            <span>Encrypted in transit · nothing is stored</span>
          </span>
          <button
            onClick={() => {
              forget();
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
