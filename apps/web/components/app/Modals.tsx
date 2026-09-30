'use client';

import { useState } from 'react';
import { useConnect, useConnection, useConnectors, type Connector } from 'wagmi';
import { brand, WELCOME_CREDITS } from '@fathom/config';
import { ApiError, api } from '@/lib/api';
import { useToast } from '../Toast';
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

export function WalletModal() {
  const rows = useWalletRows();
  const { mutateAsync: connect } = useConnect();
  const connection = useConnection();
  const { signIn } = useSession();
  const { closeModal, openModal } = useUi();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function choose(row: WalletRow) {
    if (busy) return;
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
      await signIn(address);
      closeModal();
      toast('Wallet connected');
    } catch (e) {
      if (isUserRejection(e)) {
        setErr(
          step === 'sign'
            ? "You rejected the signature request in your wallet. Nothing was shared. Try again when you're ready."
            : 'You cancelled the connection in your wallet. Try again when you\'re ready.',
        );
      } else if (e instanceof ApiError) {
        setErr(`Sign-in failed: ${e.message}. Please try again.`);
      } else {
        setErr('The wallet could not connect. Check that it is unlocked and try again.');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal id="wallet" title="Connect a wallet">
      <p>You&apos;ll sign one message to prove it&apos;s yours. No gas, no transaction.</p>
      <div className={`merr${err ? ' show' : ''}`} role="alert">{err}</div>
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

/** Payments arrive in Phase 4; until then the modal says so plainly instead of simulating a purchase. */
export function TopUpModal() {
  const { openModal } = useUi();
  return (
    <Modal id="topup" title="Top up credits">
      <p>On Robinhood Chain. Credits arrive in seconds.</p>
      <div className="mwarn show">
        Top-ups open soon, once the payment contract is live and audited. Every new wallet already gets {WELCOME_CREDITS} free
        credits to try every model.
      </div>
      <button className="btn btn-dark" onClick={() => openModal('start')}>
        How to get USDG
      </button>
    </Modal>
  );
}

export function DeleteDataModal() {
  const { closeModal } = useUi();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await api('/data', { method: 'DELETE' });
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
    </>
  );
}
