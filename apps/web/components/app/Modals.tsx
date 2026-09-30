'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { erc20Abi, formatUnits, parseUnits } from 'viem';
import { useReadContract, useWriteContract } from 'wagmi';
import { useConnect, useConnection, useConnectors, type Connector } from 'wagmi';
import { brand, TOPUP_AMOUNTS_USD, WELCOME_CREDITS } from '@fathom/config';
import { ApiError, api, post } from '@/lib/api';
import { useCopy, useToast } from '../Toast';
import { useHistory } from './History';
import { Modal } from './Modal';
import { hasWalletConnect } from './Providers';
import { isUserRejection, useSession } from './Session';
import { useUi } from './Ui';

interface WalletRow {
  key: string;
  name: string;
  letter: string;
  color: string;
  icon?: string;
  note?: string;
  rec?: boolean;
  connector?: Connector;
  installUrl?: string;
}

const KNOWN = [
  { key: 'robinhood', name: 'Robinhood Wallet', letter: 'R', color: '#1E2408', match: /robinhood/i, rec: true },
  { key: 'metamask', name: 'MetaMask', letter: 'M', color: '#F6851B', match: /metamask/i, installUrl: 'https://metamask.io/download/' },
  { key: 'rabby', name: 'Rabby', letter: 'R', color: '#7084FF', match: /rabby/i, installUrl: 'https://rabby.io/' },
];

function useWalletRows(): WalletRow[] {
  const connectors = useConnectors();
  const wc = connectors.find((c) => c.id === 'walletConnect');
  const discovered = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected');
  const generic = connectors.find((c) => c.id === 'injected');
  const used = new Set<string>();

  const rows: WalletRow[] = KNOWN.map((k) => {
    const found = discovered.find((c) => k.match.test(c.name));
    if (found) used.add(found.uid);
    if (k.key === 'robinhood' && !found) {
      // Robinhood Wallet is a mobile app: connect over WalletConnect, or open the site in its browser.
      return wc
        ? { ...k, connector: wc, note: 'Scan with app' }
        : { ...k, note: 'Open in the app' };
    }
    return found ? { ...k, connector: found, icon: found.icon } : { ...k, note: 'Install' };
  });

  for (const c of discovered) {
    if (used.has(c.uid)) continue;
    rows.push({ key: c.uid, name: c.name, letter: c.name[0] ?? 'W', color: '#2A2F5A', icon: c.icon, connector: c });
  }
  if (!discovered.length && generic && typeof window !== 'undefined' && (window as { ethereum?: unknown }).ethereum) {
    rows.push({ key: 'injected', name: 'Browser wallet', letter: 'W', color: '#2A2F5A', connector: generic });
  }
  if (wc) rows.push({ key: 'wc', name: 'WalletConnect', letter: 'W', color: '#3B99FC', note: 'Mobile', connector: wc });
  return rows;
}

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: { sitekey: string; callback(t: string): void; 'expired-callback'(): void; theme?: string }): string;
      reset(id?: string): void;
      remove(id: string): void;
    };
  }
}

/** Cloudflare Turnstile (only when the server configures a site key). Privacy-friendly, no tracking cookies. */
function Turnstile({ siteKey, onToken, resetSignal }: { siteKey: string; onToken(t: string | null): void; resetSignal: number }) {
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !el.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(el.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(null),
      });
    };
    if (window.turnstile) render();
    else {
      const id = 'cf-turnstile';
      let tag = document.getElementById(id) as HTMLScriptElement | null;
      if (!tag) {
        tag = document.createElement('script');
        tag.id = id;
        tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        tag.async = true;
        document.head.appendChild(tag);
      }
      tag.addEventListener('load', render);
    }
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (resetSignal && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      onToken(null);
    }
  }, [resetSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} style={{ minHeight: 65, margin: '4px 0 12px', display: 'flex', justifyContent: 'center' }} />;
}

export function WalletModal() {
  const rows = useWalletRows();
  const { config } = useSession();
  const siteKey = config?.turnstileSiteKey ?? null;
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const { mutateAsync: connect } = useConnect();
  const connection = useConnection();
  const { signIn } = useSession();
  const { closeModal, openModal } = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function choose(row: WalletRow) {
    if (busy) return;
    if (siteKey && !captcha) {
      setErr('Please complete the quick check below first.');
      return;
    }
    if (!row.connector) {
      if (row.installUrl) window.open(row.installUrl, '_blank', 'noopener');
      else setErr(`Open ${brand.domain} in the Robinhood Wallet app's browser, or use another wallet.`);
      return;
    }
    setErr('');
    setBusy(row.key);
    let step: 'connect' | 'sign' = 'connect';
    try {
      let address = connection.connector?.uid === row.connector.uid ? connection.address : undefined;
      if (!address) {
        const res = await connect({ connector: row.connector });
        address = res.accounts[0];
      }
      if (!address) throw new Error('No account returned by the wallet');
      step = 'sign';
      await signIn(address, captcha ?? undefined);
      closeModal();
      toast('Wallet connected');
    } catch (e) {
      if (isUserRejection(e)) {
        setErr(
          step === 'sign'
            ? "You rejected the signature request in your wallet. Nothing was shared. Try again when you're ready."
            : 'You cancelled the connection in your wallet. Try again when you\'re ready.',
        );
      } else if (e instanceof ApiError && e.code === 'captcha_failed') {
        setErr('The anti-bot check failed or expired. Complete it again, then retry.');
      } else if (e instanceof ApiError) {
        setErr(`Sign-in failed: ${e.message}. Please try again.`);
      } else {
        setErr('The wallet could not connect. Check that it is unlocked and try again.');
      }
    } finally {
      setBusy(null);
      // Turnstile tokens are single-use.
      if (siteKey) setCaptchaReset((n) => n + 1);
    }
  }

  return (
    <Modal id="wallet" title="Connect a wallet">
      <p>You&apos;ll sign one message to prove it&apos;s yours. No gas, no transaction.</p>
      <div className={`merr${err ? ' show' : ''}`} role="alert">{err}</div>
      {siteKey && <Turnstile siteKey={siteKey} onToken={setCaptcha} resetSignal={captchaReset} />}
      {rows.map((r) => (
        <button key={r.key} className={`wopt${busy === r.key ? ' busy' : ''}`} onClick={() => choose(r)} disabled={!!busy && busy !== r.key}>
          {r.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.icon} alt="" width={34} height={34} style={{ borderRadius: 10 }} />
          ) : (
            <i style={{ background: r.color, color: r.key === 'robinhood' ? '#CCFF00' : '#fff' }}>{r.letter}</i>
          )}
          {r.name}
          <small className={busy !== r.key && r.rec ? 'rec' : undefined}>
            {busy === r.key ? 'Check your wallet…' : r.rec && r.connector ? 'Recommended' : r.note ?? ''}
          </small>
        </button>
      ))}
      {!hasWalletConnect && rows.every((r) => !r.connector) && (
        <p className="terms">No browser wallet found. Install MetaMask or Rabby, or open this site in your wallet app.</p>
      )}
      <p className="terms">
        No wallet yet?{' '}
        <button onClick={() => openModal('start')} style={{ color: 'var(--violet2)', textDecoration: 'underline' }}>
          Get started in 3 minutes
        </button>
      </p>
    </Modal>
  );
}

export function GettingStartedModal() {
  const { closeModal } = useUi();
  return (
    <Modal id="start" title="Getting started" width={480}>
      <p>Pick the path that fits you. All three take a few minutes.</p>
      <div className="path">
        <span className="n">1</span>
        <div>
          <h4>New to crypto: Robinhood Wallet</h4>
          <p>Download Robinhood Wallet, buy USDG with your card or bank, then connect it here.</p>
          <small>Easiest · about 5 minutes</small>
        </div>
      </div>
      <div className="path">
        <span className="n">2</span>
        <div>
          <h4>Already have a wallet: pay with USDC or ETH</h4>
          <p>Connect MetaMask or Rabby and choose USDC or ETH at top-up. We swap it to USDG for you.</p>
          <small>Fastest · 1 transaction</small>
        </div>
      </div>
      <div className="path">
        <span className="n">3</span>
        <div>
          <h4>Funds on Ethereum: bridge first</h4>
          <p>Use the official Robinhood Chain bridge to move USDG or ETH over, then top up.</p>
          <small>About 10 minutes</small>
        </div>
      </div>
      <button className="btn btn-dark" onClick={closeModal} style={{ width: '100%', marginTop: 10, height: 48 }}>
        Got it
      </button>
    </Modal>
  );
}

const fmtUsd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** USDG top-up: a plain ERC-20 transfer to the treasury, credited by the API after confirmations. */
export function TopUpModal() {
  const { config, me, wrongNetwork, switchNetwork, setCredits } = useSession();
  const { openModal, closeModal, markOnboard, modal } = useUi();
  const connection = useConnection();
  const toast = useToast();
  const qc = useQueryClient();
  const topup = config?.topup ?? null;
  const amounts = TOPUP_AMOUNTS_USD.filter((a) => !topup || a >= topup.minUsd);
  const [amount, setAmount] = useState<number>(amounts.includes(20) ? 20 : amounts[0] ?? 20);
  const [step, setStep] = useState<'idle' | 'wallet' | 'confirming' | 'done'>('idle');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const { mutateAsync: writeContract } = useWriteContract();
  const walletOk = !!me && connection.status === 'connected' && connection.address?.toLowerCase() === me.address.toLowerCase();
  const balance = useReadContract({
    address: topup?.token.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connection.address ? [connection.address] : undefined,
    chainId: config?.chain?.id,
    query: { enabled: !!topup && walletOk && !wrongNetwork && modal === 'topup' },
  });

  useEffect(() => {
    if (modal === 'topup') {
      setStep('idle');
      setErr('');
      setNote('');
    }
  }, [modal]);

  if (!topup) {
    return (
      <Modal id="topup" title="Top up credits">
        <p>On Robinhood Chain. Credits arrive in seconds.</p>
        <div className="mwarn show">
          Top-ups aren&apos;t open yet. Every new wallet with activity on Robinhood Chain gets {WELCOME_CREDITS} free credits to try every model.
        </div>
        <button className="btn btn-dark" onClick={() => openModal('start')}>
          How to get USDG
        </button>
      </Modal>
    );
  }

  const decimals = topup.token.decimals;
  const need = parseUnits(String(amount), decimals);
  const have = balance.data as bigint | undefined;
  const short = have !== undefined && have < need;
  const credits = amount * topup.creditsPerUsd;
  const busy = step === 'wallet' || step === 'confirming';

  async function poll(txHash: `0x${string}`) {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await post<{ status: 'confirmed' | 'pending'; credits?: number; balance?: number; confirmations?: number; required?: number }>(
          '/credits/topup',
          { txHash },
        );
        if (r.status === 'confirmed') return r;
        setNote(r.required ? `Waiting for confirmations (${r.confirmations ?? 0}/${r.required})…` : 'Waiting for the network…');
      } catch (e) {
        if (e instanceof ApiError && e.code === 'tx_failed') throw e;
        if (e instanceof ApiError && e.status < 500) throw e;
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
    return null;
  }

  async function buy() {
    setErr('');
    setNote('');
    setStep('wallet');
    let hash: `0x${string}`;
    try {
      hash = await writeContract({
        address: topup!.token.address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [topup!.treasury, need],
        chainId: config?.chain?.id,
      });
    } catch (e) {
      setStep('idle');
      setErr(isUserRejection(e) ? 'You cancelled the transfer in your wallet. Nothing was sent.' : 'Your wallet could not send the transfer. Check your balance and gas (ETH), then try again.');
      return;
    }
    setStep('confirming');
    try {
      const r = await poll(hash);
      if (!r) {
        setStep('idle');
        setNote('');
        setErr('Still confirming. Your credits will appear automatically once the network confirms the transfer; you can close this window.');
        return;
      }
      setStep('done');
      if (typeof r.balance === 'number') setCredits(r.balance);
      markOnboard('top');
      void qc.invalidateQueries({ queryKey: ['credits'] });
      void balance.refetch();
      toast(`${Math.floor(r.credits ?? credits).toLocaleString('en-US')} credits added`);
      setTimeout(closeModal, 900);
    } catch (e) {
      setStep('idle');
      setErr(
        e instanceof ApiError && e.code === 'tx_failed'
          ? 'The transaction failed on-chain and was reverted. No funds left your wallet. You can safely try again.'
          : 'We could not verify this transfer. If USDG left your wallet, it will be credited automatically; contact support if it isn\'t within 10 minutes.',
      );
    }
  }

  return (
    <Modal id="topup" title="Top up credits">
      <p>
        Send USDG on {config?.chain?.name ?? 'Robinhood Chain'}. Credits arrive after {topup.confirmations} confirmation
        {topup.confirmations === 1 ? '' : 's'}.
      </p>
      <div className="paytabs" role="radiogroup">
        <button role="radio" aria-checked="true">USDG</button>
        <button role="radio" aria-checked="false" disabled title="Coming soon">USDC · soon</button>
        <button role="radio" aria-checked="false" disabled title="Coming soon">ETH · soon</button>
      </div>
      <div className="amts" role="radiogroup">
        {amounts.map((a) => (
          <button key={a} role="radio" aria-checked={a === amount} onClick={() => setAmount(a)} disabled={busy}>
            <b>${a}</b>
            <small>{(a * topup.creditsPerUsd).toLocaleString('en-US')} cr</small>
          </button>
        ))}
      </div>
      <div className="sum">
        <div><span>You pay</span><b>{fmtUsd(amount)} USDG</b></div>
        <div><span>You get</span><b>{credits.toLocaleString('en-US')} credits</b></div>
        <div><span>In your wallet</span><b>{have === undefined ? '—' : `${fmtUsd(Number(formatUnits(have, decimals)))} USDG`}</b></div>
      </div>
      {!walletOk ? (
        <div className="mwarn show">Your wallet isn&apos;t connected in this tab. Reconnect it to top up.</div>
      ) : wrongNetwork ? (
        <div className="mwarn show">
          Your wallet is on the wrong network. <button onClick={() => void switchNetwork()}>Switch to {config?.chain?.name}</button> to continue.
        </div>
      ) : short ? (
        <div className="mwarn show">
          Not enough USDG in your wallet. Pick a smaller amount, or <button onClick={() => openModal('start')}>see how to add funds</button>.
        </div>
      ) : null}
      <div className={`merr${err ? ' show' : ''}`} style={{ margin: '14px 0 0' }} role="alert">{err}</div>
      <div className="prog">
        <div className={step === 'confirming' || step === 'done' ? 'done' : undefined}><i /><span>Send</span></div>
        <div className={step === 'done' ? 'done' : undefined}><i /><span>Confirm</span></div>
        <div className={step === 'done' ? 'done' : undefined}><i /><span>Done</span></div>
      </div>
      {note && <p className="hint" style={{ textAlign: 'center' }}>{note}</p>}
      <button className="btn btn-dark" onClick={() => void buy()} disabled={busy || !walletOk || wrongNetwork || short}>
        {step === 'wallet' ? 'Confirm in your wallet…' : step === 'confirming' ? 'Confirming on-chain…' : step === 'done' ? 'Credits added' : `Buy ${credits.toLocaleString('en-US')} credits`}
      </button>
      <p className="terms">
        Sent directly to the {brand.name} treasury{' '}
        <span style={{ fontFamily: 'var(--mono)' }}>{topup.treasury.slice(0, 6)}…{topup.treasury.slice(-4)}</span>. Credits are prepaid and
        non-refundable once used.
      </p>
    </Modal>
  );
}

export function NewKeyModal() {
  const { newKey, setNewKey, closeModal } = useUi();
  const copy = useCopy();
  return (
    <Modal id="newkey" title="Save your key now" closable={false}>
      <p>This is the only time you&apos;ll see it. Store it somewhere safe.</p>
      <div className="keybox">
        <span>{newKey}</span>
        <button onClick={() => newKey && copy(newKey, 'Key copied')}>Copy</button>
      </div>
      <div className="mwarn show">Anyone with this key can spend your credits. Never paste it into a website or share it.</div>
      <button
        className="btn btn-dark"
        style={{ width: '100%', marginTop: 16, height: 48 }}
        onClick={() => {
          setNewKey(null);
          closeModal();
        }}
      >
        I&apos;ve saved it
      </button>
    </Modal>
  );
}

export function DeleteDataModal() {
  const { closeModal } = useUi();
  const history = useHistory();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await api('/data', { method: 'DELETE' });
      await history.refresh().catch(() => {});
      closeModal();
      toast('All your data was deleted');
    } catch {
      toast('Could not delete your data. Try again.', true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal id="delete" title="Delete all data?">
      <p>This removes your encrypted chat history, API keys and settings. It can&apos;t be undone.</p>
      <label htmlFor="delInp" style={{ fontSize: 13.5, color: 'var(--ink2)' }}>
        Type <b style={{ color: '#fff' }}>DELETE</b> to confirm
      </label>
      <input className="inp" id="delInp" style={{ width: '100%', marginTop: 8 }} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-danger" style={{ width: '100%', marginTop: 14, height: 48 }} disabled={text !== 'DELETE' || busy} onClick={del}>
        Delete everything
      </button>
    </Modal>
  );
}

export function AppModals() {
  return (
    <>
      <WalletModal />
      <GettingStartedModal />
      <TopUpModal />
      <DeleteDataModal />
      <NewKeyModal />
    </>
  );
}
