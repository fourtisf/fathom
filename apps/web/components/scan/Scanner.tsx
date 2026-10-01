'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { brand } from '@fathom/config';
import { ApiError, post } from '@/lib/api';
import type { TokenReport } from '@/lib/crypto-types';
import { TokenCard } from '../app/CryptoCards';
import { useCopy } from '../Toast';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CHECKS = [
  ['Mint function', 'Can new tokens be created and dumped on holders?'],
  ['Blacklist or freeze', 'Can a wallet be blocked from selling?'],
  ['Adjustable taxes', 'Can buy and sell fees be raised after launch?'],
  ['Trading switch and pause', 'Can a privileged account stop trading?'],
  ['Owner', 'Is there an active owner, or has ownership been renounced?'],
  ['Upgradeable proxy', 'Can the contract code be replaced later?'],
  ['Holder concentration', 'How much supply sits in the top 10 wallets?'],
] as const;

type State = { s: 'idle' } | { s: 'loading'; address: string } | { s: 'done'; report: TokenReport } | { s: 'error'; message: string };

/** Public Token Scanner: no wallet, no credits. The address goes in a POST body, never a log line. */
export function Scanner() {
  const [input, setInput] = useState('');
  const [st, setSt] = useState<State>({ s: 'idle' });
  const copy = useCopy();
  const inp = useRef<HTMLInputElement>(null);

  const scan = useCallback(async (raw: string) => {
    const address = raw.trim();
    if (!ADDRESS_RE.test(address)) {
      setSt({ s: 'error', message: 'Paste a contract address: 0x followed by 40 hex characters.' });
      return;
    }
    setSt({ s: 'loading', address });
    window.history.replaceState(null, '', `/scan?address=${address}`);
    try {
      const { report } = await post<{ report: TokenReport }>('/scan', { address });
      setSt({ s: 'done', report });
    } catch (e) {
      setSt({ s: 'error', message: e instanceof ApiError ? e.message : `Couldn't reach ${brand.name}. Try again.` });
    }
  }, []);

  // Shared links: /scan?address=0x… scans on open.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('address');
    if (a) {
      setInput(a);
      void scan(a);
    } else inp.current?.focus();
  }, [scan]);

  const report = st.s === 'done' ? st.report : null;
  const askHref = report
    ? `/app?q=${encodeURIComponent(`Check this token for red flags: ${report.address}. Explain each flag and what I should check before buying.`)}`
    : '/app';

  return (
    <main className="scan-page">
      <section className="scan-hero">
        <div className="wrap">
          <span className="tag">Free · No wallet needed</span>
          <h1>
            Token <span className="grad">Scanner</span>
          </h1>
          <p className="lede">Paste a contract address on Robinhood Chain and see the red flags in seconds.</p>
          <form
            className="scan-form"
            onSubmit={(e) => {
              e.preventDefault();
              void scan(input);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <input
              ref={inp}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… contract address"
              aria-label="Contract address"
              spellCheck={false}
              autoComplete="off"
            />
            <button className="btn btn-dark" type="submit" disabled={st.s === 'loading'}>
              {st.s === 'loading' ? 'Scanning…' : 'Scan'}
            </button>
          </form>
          <p className="scan-note">Public on-chain data only · your IP stays hidden · not financial advice</p>
        </div>
      </section>

      <section className="scan-result">
        <div className="wrap">
          {st.s === 'loading' && (
            <div className="scan-loading glass">
              <span className="shim">Reading the contract on Robinhood Chain…</span>
            </div>
          )}
          {st.s === 'error' && <div className="scan-error">{st.message}</div>}
          {report && (
            <>
              <TokenCard report={report} />
              <div className="scan-actions">
                <Link className="btn btn-dark" href={askHref}>
                  Ask {brand.name} AI about this token
                </Link>
                <button className="btn btn-light" onClick={() => copy(`${window.location.origin}/scan?address=${report.address}`, 'Link copied')}>
                  Copy link to this scan
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="scan-info">
        <div className="wrap">
          <div className="scan-grid">
            <div className="glass scan-box">
              <h2>What we check</h2>
              <ul>
                {CHECKS.map(([t, d]) => (
                  <li key={t}>
                    <b>{t}</b>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass scan-box">
              <h2>Good to know</h2>
              <p>
                The scanner reads the contract and its holders from Robinhood Chain&apos;s public data. When the block explorer
                doesn&apos;t respond, it reads the chain directly; holder data then needs the explorer.
              </p>
              <p>
                Automatic checks can miss honeypots, liquidity pulls and other tricks. A clean scan is not a guarantee, and nothing
                here tells you to buy or sell.
              </p>
              <p>
                Lookups are made from our servers, so the explorer never sees your IP. We don&apos;t keep a record of who scanned what.
              </p>
              <Link href="/app" className="scan-link">
                Want a full analysis? Chat with {brand.name} AI →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
