'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { brand, FALLBACK_MODEL, MAX_CHAT_IMAGES, MODELS, PERSONAS, VISION_MODEL, getPersona, WELCOME_CREDITS, modelDisplayName } from '@fathom/config';
import { ApiError, post, type WelcomeDenied } from '@/lib/api';
import { streamChat, type ChatEvent } from '@/lib/chat';
import type { ToolState } from '@/lib/crypto-types';
import { DocError, readDocument, withDocument, type DocText } from '@/lib/pdf-text';
import { ImageError, isImageFile, readImage } from '@/lib/image-input';
import type { ShareDoc } from '@/lib/share-doc';
import { AuditCard, PriceStrip, TokenCard, ToolLine } from './CryptoCards';
import { Icon } from '../Icon';
import { LogoMark } from '../LogoMark';
import { useCopy, useToast } from '../Toast';
import { useHistory, type ChatRecord } from './History';
import { useMemory } from './Memory';
import { Markdown } from './Markdown';
import { fmt2, fmtCost } from './Shell';
import { short, useSession } from './Session';
import { useUi } from './Ui';
import { ListenButton, MicButton, VoiceBar, readAloud, stopReading, useVoiceInput } from './Voice';
import { resolveVoiceLang } from '@/lib/voice/languages';
import { ModelLogo } from '../ModelLogo';

type SlotState = {
  model: string;
  text: string;
  status: 'waiting' | 'streaming' | 'done' | 'error' | 'stopped';
  credits?: number;
  error?: string;
};
type Turn =
  | { id: number; kind: 'you'; text: string; doc?: DocText; images?: string[]; imageCount?: number }
  | {
      id: number;
      kind: 'ai';
      slots: SlotState[];
      search?: 'running' | 'done' | 'unavailable';
      sources?: number;
      tools?: { token?: ToolState; price?: ToolState; audit?: ToolState };
      research?: { stage: 'planning' | 'searching' | 'writing'; queries?: string[]; sources?: number };
    }
  | { id: number; kind: 'note'; text: string }
  | { id: number; kind: 'img'; status: 'waiting' | 'done' | 'error'; size: ImgSize; src?: string; credits?: number; error?: string }
  | {
      id: number;
      kind: 'fail';
      title: string;
      body: string;
      action?: { label: string; retry?: { q: string; model: string }; topup?: boolean; claim?: boolean };
    };
type ImgSize = 'square' | 'landscape' | 'portrait';
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
const AUDIT_PREFIX = 'Audit this contract: ';

const SUGGESTIONS: { title: string; sub: string; prompt: string; fill?: boolean }[] = [
  {
    title: `What is ${brand.name}?`,
    sub: 'Privacy, credits and how it works',
    prompt: `What is ${brand.name}, how does it keep my chats private, and how do credits work?`,
  },
  {
    title: 'Check a token for red flags',
    sub: 'Paste a token address: Robinhood Chain, Solana, Base and more',
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

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
const FEAT_ICONS: Record<'vision' | 'research' | 'image' | 'audit' | 'voice' | 'memory', ReactNode> = {
  vision: svg(
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>,
  ),
  research: svg(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.2-4.2M8.5 11h5M11 8.5v5" />
    </>,
  ),
  image: svg(
    <>
      <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" />
      <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>,
  ),
  audit: svg(
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
  voice: svg(
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </>,
  ),
  memory: svg(
    <>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 018 0v3M12 14v2" />
    </>,
  ),
};

const modelName = modelDisplayName;
const IMAGE_DEFAULT_QUESTION = 'What is in this image? Point out anything important.';
const imagesIn = (t: { images?: string[]; imageCount?: number }) => t.images?.length ?? t.imageCount ?? 0;
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

function Actions({ slot, onRegenerate, listenKey }: { slot: SlotState; onRegenerate?: () => void; listenKey?: string }) {
  const copy = useCopy();
  const toast = useToast();
  return (
    <div className="meta">
      <span className="mname">
        <ModelLogo model={slot.model} size={16} />
        {modelName(slot.model)}
      </span>
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
      {listenKey && slot.status === 'done' && (
        <ListenButton id={listenKey} text={slot.text} onUnavailable={() => toast('No on-device voice on this device, so nothing is read aloud.', true)} />
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
    if (t.kind === 'you') kept.push({ kind: 'you', text: t.text, ...(t.doc ? { doc: t.doc } : {}), ...(imagesIn(t) ? { imageCount: imagesIn(t) } : {}) });
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
      ? { id: nextId++, kind: 'you' as const, text: t.text, ...(t.doc ? { doc: t.doc } : {}), ...(t.imageCount ? { imageCount: t.imageCount } : {}) }
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

function toShareDoc(turns: Turn[]): ShareDoc | null {
  const out: ShareDoc['turns'] = [];
  for (const t of turns) {
    if (t.kind === 'you') out.push({ kind: 'you', text: t.text, ...(t.doc ? { doc: { name: t.doc.name, pages: t.doc.pages } } : {}) });
    if (t.kind === 'ai') {
      const slots = t.slots.filter((s) => (s.status === 'done' || s.status === 'stopped') && s.text).map((s) => ({ model: s.model, text: s.text }));
      const token = t.tools?.token?.status === 'done' ? t.tools.token.report : undefined;
      const prices = t.tools?.price?.status === 'done' ? t.tools.price.prices : undefined;
      if (slots.length) out.push({ kind: 'ai', slots, ...(token ? { token } : {}), ...(prices?.length ? { prices } : {}) });
    }
  }
  const first = out.find((t) => t.kind === 'you');
  if (!first || !out.some((t) => t.kind === 'ai')) return null;
  return { v: 1, title: first.text.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Shared chat', createdAt: new Date().toISOString(), turns: out };
}

const DOC_DEFAULT_QUESTION = 'Summarize this document and point out anything risky or unclear.';

export function Chat() {
  const { me, config, lastSignIn, clearLastSignIn, setCredits, refreshMe } = useSession();
  const router = useRouter();
  const ui = useUi();
  const history = useHistory();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState<DocText | null>(null);
  const [pics, setPics] = useState<string[]>([]);
  const [research, setResearch] = useState(false);
  const memory = useMemory();
  const [imageMode, setImageMode] = useState(false);
  const [imgSize, setImgSize] = useState<ImgSize>('square');
  const activeTool = imageMode ? 'Image' : research ? 'Research' : ui.webSearch && config?.webSearch ? 'Web search' : null;
  const [reading, setReading] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const fileInp = useRef<HTMLInputElement>(null);
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

  // Prefill from links like /app?q=… (the public Token Scanner). Never auto-sends. The composer only
  // exists once the session has loaded, so wait for it before filling (and sizing) the box.
  const prefill = useRef<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('q');
    if (!q) return;
    url.searchParams.delete('q');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    prefill.current = q.slice(0, 2000);
    setInput(prefill.current);
  }, []);
  useEffect(() => {
    if (!me || prefill.current === null) return;
    fillComposer(prefill.current);
    prefill.current = null;
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setPics([]);
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

  function historyFor(ts: Turn[]): { role: 'user' | 'assistant'; content: string; images?: string[] }[] {
    const out: { role: 'user' | 'assistant'; content: string; images?: string[] }[] = [];
    for (const t of ts) {
      if (t.kind === 'you')
        out.push({
          role: 'user',
          content: t.doc ? withDocument(t.text, t.doc) : t.imageCount && !t.images ? `${t.text}\n\n(An image was attached here earlier; it was not saved.)` : t.text,
          ...(t.images?.length ? { images: t.images } : {}),
        });
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
    let doc: DocText | undefined;
    let images: string[] | undefined;
    if (regenerate) {
      const lastYou = [...base].reverse().find((t) => t.kind === 'you') as Extract<Turn, { kind: 'you' }> | undefined;
      if (!lastYou) return;
      q = lastYou.text;
      doc = lastYou.doc;
      images = lastYou.images;
      base = base.slice(0, base.indexOf(lastYou) + 1);
      setTurns(base);
    } else {
      q = (retry?.q ?? opts.text ?? input).trim();
      if (!retry && opts.text === undefined && attached) {
        doc = attached;
        if (!q) q = DOC_DEFAULT_QUESTION;
      }
      if (!retry && opts.text === undefined && pics.length) {
        images = pics;
        if (!q) q = IMAGE_DEFAULT_QUESTION;
      }
      if (retry) {
        const lastYou = turnsRef.current.filter((t) => t.kind === 'you').at(-1) as Extract<Turn, { kind: 'you' }> | undefined;
        doc = lastYou?.doc;
        images = lastYou?.images;
      }
    }
    if (!q || busy || reading) return;
    if (!me) return ui.openModal('wallet');
    if (imageMode && !retry && !regenerate && opts.text === undefined && !images?.length && !doc) return generateImage(q);
    const model = retry?.model ?? ui.model;
    const deep = !retry && research && Boolean(config?.research);
    const web = !deep && Boolean(ui.webSearch && config?.webSearch);
    const msgs = [
      ...historyFor(regenerate ? base.slice(0, -1) : base),
      { role: 'user' as const, content: doc ? withDocument(q, doc) : q, ...(images?.length ? { images } : {}) },
    ];
    // Any image in the conversation means the vision model answers, alone.
    const vision = msgs.some((m) => m.images?.length);
    const compare = !retry && ui.compare && !vision && !deep;
    const models = vision ? [VISION_MODEL.id] : compare ? [model, ui.cmpModel] : [model];

    if (!retry && !regenerate) {
      add({ kind: 'you', text: q, ...(doc ? { doc } : {}), ...(images?.length ? { images } : {}) });
      if (doc) setAttached(null);
      if (images?.length) setPics([]);
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
      ...(deep ? { research: { stage: 'planning' as const } } : {}),
    });
    voiceTurn.current = voiceDraft.current && !retry && !regenerate && opts.text === undefined ? aiId : null;
    voiceDraft.current = false;
    stopReading();
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;

    const onEvent = (e: ChatEvent) => {
      if (e.type === 'search') return patchAi(aiId, (t) => ({ ...t, search: e.status, sources: e.sources }));
      if (e.type === 'research')
        return patchAi(aiId, (t) => ({
          ...t,
          research: {
            ...t.research,
            stage: e.stage,
            ...(e.stage === 'searching' ? { queries: e.queries } : {}),
            ...(e.stage === 'writing' ? { sources: e.sources } : {}),
          },
        }));
      if (e.type === 'tool') {
        const state: ToolState =
          e.status === 'done'
            ? e.tool === 'token'
              ? { status: 'done', report: e.report }
              : e.tool === 'audit'
                ? { status: 'done', audit: e.audit }
                : { status: 'done', prices: e.prices }
            : { status: e.status };
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
        {
          model,
          compareWith: compare ? ui.cmpModel : undefined,
          webSearch: web,
          ...(deep ? { research: true } : {}),
          ...(memory.forChat() ? { memory: memory.forChat() } : {}),
          persona: ui.persona !== 'default' ? ui.persona : undefined,
          messages: msgs,
        },
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
      } else if (e?.status === 503 && (e.code === 'research_unavailable' || body?.model === VISION_MODEL.id)) {
        add({ kind: 'fail', title: e.message, body: "You weren't charged." });
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
    setInput(turn.text === DOC_DEFAULT_QUESTION && turn.doc ? '' : turn.text);
    setAttached(turn.doc ?? null);
    setPics(turn.images ?? []);
    setTimeout(() => {
      const el = inp.current;
      if (!el) return;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, 0);
  }

  /** Image mode: the message is a prompt for an image model. Charged a fixed price only when the image arrives. */
  async function generateImage(prompt: string) {
    add({ kind: 'you', text: prompt });
    setInput('');
    if (inp.current) inp.current.style.height = 'auto';
    const id = add({ kind: 'img', status: 'waiting', size: imgSize });
    const patch = (f: (t: Extract<Turn, { kind: 'img' }>) => Extract<Turn, { kind: 'img' }>) =>
      setTurns((ts) => ts.map((t) => (t.id === id && t.kind === 'img' ? f(t) : t)));
    setBusy(true);
    try {
      const r = await post<{ image: string; credits: number; balance: number }>('/images', { prompt, size: imgSize });
      patch((t) => ({ ...t, status: 'done', src: r.image, credits: r.credits }));
      setCredits(r.balance);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      if (e?.status === 402) {
        setTurns((ts) => ts.filter((t) => t.id !== id));
        const body = (e.body as { error?: { needed?: number; balance?: number } } | undefined)?.error;
        add({
          kind: 'fail',
          title: 'Not enough credits.',
          body: `An image costs ${(body?.needed ?? 0).toFixed(2)} credits and you have ${fmt2(body?.balance ?? me!.credits)}. You weren't charged.`,
          action: { label: 'Top up', topup: true },
        });
      } else {
        patch((t) => ({ ...t, status: 'error', error: e?.message ?? `Couldn't reach ${brand.name}. You weren't charged.` }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function attachImage(file: File | Blob) {
    const inConversation = turnsRef.current.reduce((n, t) => n + (t.kind === 'you' ? imagesIn(t) : 0), 0);
    if (inConversation + pics.length >= MAX_CHAT_IMAGES) {
      toast(`Up to ${MAX_CHAT_IMAGES} images per chat. Start a new chat for more.`, true);
      return;
    }
    setReading(true);
    try {
      const url = await readImage(file);
      setPics((p) => [...p, url].slice(0, MAX_CHAT_IMAGES));
      inp.current?.focus();
    } catch (e) {
      toast(e instanceof ImageError ? e.message : "Couldn't read this image.", true);
    } finally {
      setReading(false);
      if (fileInp.current) fileInp.current.value = '';
    }
  }

  async function attachFile(file: File | undefined) {
    if (!file) return;
    if (isImageFile(file)) return attachImage(file);
    setReading(true);
    try {
      const d = await readDocument(file);
      setAttached(d);
      if (d.truncated) toast('Long document: only the first part will be sent.');
      inp.current?.focus();
    } catch (e) {
      toast(e instanceof DocError ? e.message : "Couldn't read this file.", true);
    } finally {
      setReading(false);
      if (fileInp.current) fileInp.current.value = '';
    }
  }

  // Voice input: transcribed on this device, then placed in the composer for the user to check and send.
  const voiceDraft = useRef(false);
  const voiceTurn = useRef<number | null>(null);
  const onVoiceText = useCallback((text: string) => {
    voiceDraft.current = true;
    setInput((prev) => {
      const next = prev.trim() ? `${prev.trimEnd()} ${text}` : text;
      setTimeout(() => {
        inp.current?.focus();
        inp.current?.setSelectionRange(next.length, next.length);
      }, 0);
      return next;
    });
  }, []);
  // The message box grows with its text, however the text got there (typing, voice, prefill).
  useEffect(() => {
    const el = inp.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input, me]);
  const onVoiceError = useCallback((msg: string) => toast(msg, true), [toast]);
  const voice = useVoiceInput(onVoiceText, onVoiceError, resolveVoiceLang(ui.voiceLang));

  // After a voice message, read the answer aloud (Settings: on by default; on-device voices only).
  useEffect(() => {
    const id = voiceTurn.current;
    if (id === null) return;
    const t = turns.find((x) => x.id === id);
    if (!t || t.kind !== 'ai') return;
    const s = t.slots[0];
    if (!s || s.status === 'waiting' || s.status === 'streaming') return;
    voiceTurn.current = null;
    if (s.status === 'done' && ui.voiceRead) void readAloud(`${id}:0`, s.text);
  }, [turns]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopReading(), []);

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
                  {t.doc && <DocChip doc={t.doc} />}
                  {t.images?.length ? (
                    <span className="imgrow">
                      {t.images.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt={`Attached image ${i + 1}`} />
                      ))}
                    </span>
                  ) : t.imageCount ? (
                    <span className="docchip">
                      <ImgIcon />
                      <b>{t.imageCount > 1 ? `${t.imageCount} images` : 'Image'}</b>
                      <small>not saved</small>
                    </span>
                  ) : null}
                  {t.text}
                  {!busy && (
                    <button className="editbtn" onClick={() => edit(t)} aria-label="Edit message">
                      Edit
                    </button>
                  )}
                </div>
              );
            if (t.kind === 'img')
              return (
                <div key={t.id} className={`m ai${gone}`}>
                  <AiIcon />
                  <div className="b">
                    {t.status === 'waiting' ? (
                      <div className={`genimg wait s-${t.size}`}>
                        <span className="shim">Generating your image privately…</span>
                      </div>
                    ) : t.status === 'error' ? (
                      <p style={{ fontSize: 13.5, color: '#FFC2C8' }}>{t.error}</p>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className={`genimg s-${t.size}`} src={t.src} alt="Generated image" />
                        <div className="meta">
                          <span>Image</span>
                          <span>{fmtCost(t.credits ?? 0)} credits</span>
                          <span className="ok">
                            <Icon name="shield" />
                            Not logged
                          </span>
                          <a className="mact" href={t.src} download={`noxsea-image-${t.id}.${t.src?.startsWith('data:image/jpeg') ? 'jpg' : t.src?.startsWith('data:image/webp') ? 'webp' : 'png'}`}>
                            Download
                          </a>
                        </div>
                      </>
                    )}
                  </div>
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
            const rs = t.research && <ResearchSteps r={t.research} finished={t.slots[0]?.status === 'done' || t.slots[0]?.status === 'stopped' || t.slots[0]?.status === 'error'} />;
            const tk = t.tools?.token;
            const pr = t.tools?.price;
            const au = t.tools?.audit;
            const tools = (tk || pr || au) && (
              <>
                {au && au.status !== 'done' && <ToolLine tool="audit" state={au} />}
                {au?.status === 'done' && au.audit && <AuditCard a={au.audit} />}
                {tk && (tk.status !== 'done' || !tk.report) && <ToolLine tool="token" state={tk} />}
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
                            <span className="mname">
                              <ModelLogo model={s.model} size={18} />
                              {modelName(s.model)}
                            </span>
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
                  {rs}
                  {search}
                  {tools}
                  <SlotBody slot={s} big />
                  {(s.status === 'done' || s.status === 'stopped') && <Actions slot={s} onRegenerate={regen} listenKey={`${t.id}:0`} />}
                </div>
              </div>
            );
          })}
          {!turns.some((t) => t.kind === 'you') && !busy && (
            <div className="feats" aria-label="AI tools">
              <div className="feats-hd">
                <span className="nb">New</span>AI tools · as private as your chats
              </div>
              <div className="feats-grid">
                {(
                  [
                    {
                      key: 'vision',
                      title: 'Read a screenshot',
                      sub: 'Charts, tweets, docs',
                      on: Boolean(config?.vision),
                      go: () => fileInp.current?.click(),
                    },
                    {
                      key: 'research',
                      title: 'Deep Research',
                      sub: 'Report with sources',
                      on: Boolean(config?.research),
                      go: () => {
                        setResearch(true);
                        setImageMode(false);
                        toast('Deep Research on: ask your question');
                        inp.current?.focus();
                      },
                    },
                    {
                      key: 'image',
                      title: 'Create an image',
                      sub: config?.imageGen ? `Memes, logos · ${config.imageGen.credits} cr` : 'Memes, banners, logos',
                      on: Boolean(config?.imageGen),
                      go: () => {
                        setImageMode(true);
                        setResearch(false);
                        toast('Image mode: describe the image you want');
                        inp.current?.focus();
                      },
                    },
                    {
                      key: 'audit',
                      title: 'Audit a contract',
                      sub: 'Verified source code',
                      on: Boolean(config?.audit),
                      go: () => {
                        setImageMode(false);
                        fillComposer(AUDIT_PREFIX);
                        toast('Paste a contract address (0x…). Add “on Base” to pick the chain.');
                      },
                    },
                    {
                      key: 'voice',
                      title: 'Talk to it',
                      sub: 'Speak, don’t type',
                      on: voice.available,
                      go: () => void voice.start(),
                    },
                    {
                      key: 'memory',
                      title: 'Private memory',
                      sub: 'Encrypted, only you',
                      on: Boolean(me),
                      go: () => router.push('/app/settings#memory'),
                    },
                  ] as const
                ).map((f) => (
                  <button key={f.key} className={`feat f-${f.key}`} disabled={!f.on} onClick={f.go} title={f.on ? undefined : 'Coming soon'}>
                    <i aria-hidden="true">{FEAT_ICONS[f.key]}</i>
                    <b>
                      {f.title}
                      {!f.on && <em>soon</em>}
                    </b>
                    <span>{f.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <VoiceBar
            state={voice.state}
            level={voice.level}
            lang={resolveVoiceLang(ui.voiceLang)}
            onStop={() => void voice.stop()}
            onCancel={voice.cancel}
          />
          {imageMode && (
            <div className="sizebar" role="radiogroup" aria-label="Image shape">
              {(['square', 'landscape', 'portrait'] as const).map((z) => (
                <button key={z} type="button" role="radio" aria-checked={imgSize === z} className={imgSize === z ? 'on' : undefined} onClick={() => setImgSize(z)}>
                  <i className={`shape s-${z}`} aria-hidden="true" />
                  {z[0]!.toUpperCase() + z.slice(1)}
                </button>
              ))}
              <span className="sp" />
              <span className="sizenote">{config?.imageGen?.credits ?? 0} credits per image · never stored</span>
            </div>
          )}
          {(attached || reading || pics.length > 0) && (
            <div className="attach-row">
              {pics.map((src, i) => (
                <span key={i} className="imgchip">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Image ${i + 1} to send`} />
                  <button onClick={() => setPics((p) => p.filter((_, j) => j !== i))} aria-label={`Remove image ${i + 1}`}>
                    ×
                  </button>
                </span>
              ))}
              {reading ? (
                <span className="docchip"><span className="shim">Reading in your browser…</span></span>
              ) : (
                attached && (
                  <DocChip
                    doc={attached}
                    onRemove={() => {
                      setAttached(null);
                      inp.current?.focus();
                    }}
                  />
                )
              )}
            </div>
          )}
          <input
            ref={fileInp}
            type="file"
            hidden
            accept=".pdf,application/pdf,.txt,.md,.csv,.json,.sol,text/plain,text/markdown,text/csv,image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void attachFile(e.target.files?.[0])}
          />
          <textarea
            ref={inp}
            rows={1}
            placeholder={imageMode ? 'Describe the image you want…' : pics.length ? 'Ask about this image…' : attached ? 'Ask about this document…' : 'Ask anything, privately…'}
            onPaste={(e) => {
              const file = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
              if (file) {
                e.preventDefault();
                void attachImage(file);
              }
            }}
            aria-label="Message"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!e.target.value.trim()) voiceDraft.current = false;
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
              aria-label="Compare two models"
              aria-pressed={ui.compare}
              onClick={() => {
                ui.setCompare(!ui.compare);
                toast(ui.compare ? 'Compare off' : 'Compare on');
              }}
            >
              <Icon name="columns" />
              <span className="cl">Compare</span>
            </button>
            <button className="chip" onClick={() => fileInp.current?.click()} disabled={reading} aria-label="Attach an image, PDF or text file" title="Attach a screenshot, image, PDF or text file. Documents are read in your browser; images go only to the model with your message, never stored.">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
              </svg>
              <span className="cl">Attach</span>
            </button>
            <div className="modewrap">
              <button
                className="chip"
                aria-haspopup="menu"
                aria-expanded={modeOpen}
                aria-pressed={ui.persona !== 'default'}
                aria-label={`Chat mode: ${getPersona(ui.persona)?.name ?? 'Default'}`}
                onClick={() => setModeOpen((o) => !o)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </svg>
                <span className="cl">{ui.persona === 'default' ? 'Mode' : getPersona(ui.persona)?.name}</span>
              </button>
              {modeOpen && (
                <div className="modemenu" role="menu" onMouseLeave={() => setModeOpen(false)}>
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      role="menuitemradio"
                      aria-checked={ui.persona === p.id}
                      className={ui.persona === p.id ? 'on' : undefined}
                      onClick={() => {
                        ui.setPersona(p.id);
                        setModeOpen(false);
                        toast(p.id === 'default' ? 'Default mode' : `${p.name} mode on`);
                        inp.current?.focus();
                      }}
                    >
                      <b>{p.name}</b>
                      <span>{p.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(config?.imageGen || config?.research || config?.audit || config?.tokenCheck || config?.webSearch) && (
              <div className="modewrap">
                <button
                  className="chip"
                  aria-haspopup="menu"
                  aria-expanded={toolsOpen}
                  aria-pressed={activeTool !== null}
                  aria-label={`Tools${activeTool ? `: ${activeTool} on` : ''}`}
                  onClick={() => setToolsOpen((o) => !o)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" />
                    <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
                  </svg>
                  <span className="cl">{activeTool ?? 'Tools'}</span>
                </button>
                {toolsOpen && (
                  <div className="modemenu toolsmenu" role="menu" onMouseLeave={() => setToolsOpen(false)}>
                    {config?.webSearch && (
                      <button
                        role="menuitemcheckbox"
                        aria-checked={ui.webSearch && !research && !imageMode}
                        className={ui.webSearch && !research && !imageMode ? 'on' : undefined}
                        onClick={() => {
                          ui.setWebSearch(!ui.webSearch);
                          setResearch(false);
                          setImageMode(false);
                          setToolsOpen(false);
                          toast(ui.webSearch ? 'Web search off' : 'Web search on · your IP stays hidden');
                        }}
                      >
                        <b>Web search</b>
                        <span>
                          Fresh results, searched from our servers
                          {config.searchCredits ? ` · +${config.searchCredits} cr per search` : ''}
                        </span>
                      </button>
                    )}
                    {config?.research && (
                      <button
                        role="menuitemcheckbox"
                        aria-checked={research}
                        className={research ? 'on' : undefined}
                        onClick={() => {
                          setResearch(!research);
                          setImageMode(false);
                          setToolsOpen(false);
                          toast(research ? 'Deep Research off' : 'Deep Research on: your next question gets a cited report');
                        }}
                      >
                        <b>Deep Research</b>
                        <span>
                          A report with sources
                          {config.searchCredits ? ` · +${config.searchCredits} cr per search (up to 4)` : ''}
                        </span>
                      </button>
                    )}
                    {config?.imageGen && (
                      <button
                        role="menuitemcheckbox"
                        aria-checked={imageMode}
                        className={imageMode ? 'on' : undefined}
                        onClick={() => {
                          setImageMode(!imageMode);
                          setResearch(false);
                          setToolsOpen(false);
                          toast(imageMode ? 'Back to chat' : `Image mode: describe the image you want (${config.imageGen!.credits} credits each)`);
                          inp.current?.focus();
                        }}
                      >
                        <b>Create image</b>
                        <span>{config.imageGen.credits} credits per image, charged only when it arrives</span>
                      </button>
                    )}
                    {config?.audit && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setToolsOpen(false);
                          setImageMode(false);
                          fillComposer(input.startsWith(AUDIT_PREFIX) ? input : AUDIT_PREFIX + input);
                          toast('Paste a contract address (0x…). Add “on Base” to pick the chain.');
                        }}
                      >
                        <b>Audit a contract</b>
                        <span>Reviews the verified source code, function by function</span>
                      </button>
                    )}
                    {config?.tokenCheck && (
                      <button
                        role="menuitem"
                        onClick={() => {
                          setToolsOpen(false);
                          setImageMode(false);
                          fillComposer(input.startsWith(TOKEN_CHECK_PREFIX) ? input : TOKEN_CHECK_PREFIX + input);
                          toast('Paste a token address (0x… or a Solana mint)');
                        }}
                      >
                        <b>Check a token</b>
                        <span>Red flags, holders and liquidity on 9 chains</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <span className="sp" />
            {voice.available && !busy && voice.state.s !== 'recording' && (
              <MicButton onClick={() => void voice.start()} disabled={voice.state.s === 'working'} />
            )}
            {busy ? (
              <button className="send" aria-label="Stop answering" onClick={() => abort.current?.abort()}>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <rect x="7" y="7" width="10" height="10" rx="2" />
                </svg>
              </button>
            ) : (
              <button className="send" aria-label="Send" disabled={(!input.trim() && !attached && !pics.length) || reading} onClick={() => void send()}>
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
          <span className="chint-r">
          {turns.some((t) => t.kind === 'ai' && t.slots.some((x) => x.status === 'done')) && !busy && (
            <button
              onClick={() => {
                const d = toShareDoc(turnsRef.current);
                if (!d) return toast('Nothing to share yet.', true);
                ui.setShareDoc(d);
                ui.openModal('share');
              }}
            >
              Share
            </button>
          )}
          <button
            onClick={() => {
              forget({ erase: true });
              toast('Chat forgotten. Nothing was kept.');
            }}
          >
            Forget this chat
          </button>
          </span>
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

function ResearchSteps({ r, finished }: { r: NonNullable<Extract<Turn, { kind: 'ai' }>['research']>; finished: boolean }) {
  const order = ['planning', 'searching', 'writing'] as const;
  const at = order.indexOf(r.stage);
  const steps = [
    { label: 'Planning the research', detail: null },
    { label: r.queries ? `Searching the web · ${r.queries.length} search${r.queries.length === 1 ? '' : 'es'}` : 'Searching the web', detail: r.queries },
    { label: r.sources !== undefined ? `Reading ${r.sources} sources · your IP stayed hidden` : 'Reading sources', detail: null },
    { label: 'Writing the report', detail: null },
  ];
  // Stage "writing" means sources are read and the report is being written.
  const current = r.stage === 'writing' ? (finished ? 4 : 3) : at;
  return (
    <div className="rsteps" aria-label="Deep Research progress">
      {steps.map((s, i) => (
        <div key={i} className={`rstep${i < current ? ' ok' : i === current ? ' on' : ''}`}>
          <i aria-hidden="true">{i < current ? '✓' : ''}</i>
          <div>
            <span className={i === current ? 'shim' : undefined}>{s.label}</span>
            {s.detail && (
              <ul>
                {s.detail.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImgIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M21 16l-5-5-8 9" />
    </svg>
  );
}

function DocChip({ doc, onRemove }: { doc: Pick<DocText, 'name' | 'pages' | 'truncated'>; onRemove?: () => void }) {
  return (
    <span className="docchip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
      <b>{doc.name}</b>
      <small>
        {doc.pages ? `${doc.pages} page${doc.pages > 1 ? 's' : ''}` : 'text'}
        {doc.truncated ? ' · first part' : ''}
      </small>
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${doc.name}`}>
          ×
        </button>
      )}
    </span>
  );
}
