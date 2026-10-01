'use client';

import type { CoinPrice, FlagLevel, TokenReport, ToolState } from '@/lib/crypto-types';
import { useCopy } from '../Toast';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const usd = (n: number) =>
  n >= 1
    ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : `$${Number(n.toPrecision(4)).toString()}`;

const compactUsd = (n: number) => {
  for (const [v, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) if (n >= v) return `$${(n / v).toFixed(2)}${u}`;
  return usd(n);
};

const LEVEL_LABEL: Record<FlagLevel, string> = { high: 'High risk', medium: 'Caution', info: 'Note', ok: 'Good sign' };

/** Overall verdict from the flags. Never "safe": automatic checks can miss honeypots and rugs. */
function verdict(r: TokenReport): { level: 'high' | 'medium' | 'low' | 'na'; text: string } {
  if (r.kind === 'wallet') return { level: 'na', text: 'Wallet' };
  const high = r.flags.filter((f) => f.level === 'high').length;
  const med = r.flags.filter((f) => f.level === 'medium').length;
  if (high) return { level: 'high', text: `${high} red flag${high > 1 ? 's' : ''}` };
  if (med) return { level: 'medium', text: `${med} thing${med > 1 ? 's' : ''} to check` };
  return { level: 'low', text: 'No red flags found' };
}

function Spark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function ToolLine({ tool, state, chain }: { tool: 'token' | 'price'; state: ToolState; chain?: string }) {
  const label =
    tool === 'token'
      ? state.status === 'running'
        ? `Checking on-chain data on ${chain ?? 'Robinhood Chain'}…`
        : state.status === 'done'
          ? 'On-chain check done · your IP stayed hidden'
          : "Couldn't reach the block explorer, answering without it"
      : state.status === 'running'
        ? 'Fetching live prices…'
        : state.status === 'done'
          ? 'Live prices from CoinGecko · your IP stayed hidden'
          : "Couldn't fetch live prices, answering without them";
  return (
    <div className="toolrun">
      <Spark />
      <span className={state.status === 'running' ? 'shim' : undefined}>{label}</span>
    </div>
  );
}

export function TokenCard({ report: r }: { report: TokenReport }) {
  const copy = useCopy();
  const v = verdict(r);
  const title = r.kind === 'wallet' ? 'Wallet' : r.name ? `${r.name}${r.symbol ? ` (${r.symbol})` : ''}` : r.contractName ?? 'Contract';
  const stats: [string, string][] = [];
  if (r.kind === 'wallet' && r.wallet) {
    stats.push(['Balance', `${r.wallet.balance} ETH`]);
    if (r.wallet.txCount !== null) stats.push(['Transactions', r.wallet.txCount.toLocaleString('en-US')]);
  } else {
    if (r.holders !== null) stats.push(['Holders', r.holders.toLocaleString('en-US')]);
    if (r.top10Pct !== null) stats.push(['Top 10 hold', `${r.top10Pct}%`]);
    if (r.totalSupply) stats.push(['Supply', r.totalSupply]);
    if (r.priceUsd !== null) stats.push(['Price', usd(r.priceUsd)]);
    stats.push(['Source', r.verified === null ? 'Unknown' : r.verified ? 'Verified' : 'Not verified']);
    stats.push(['Owner', r.owner ? (r.owner.renounced ? 'Renounced' : short(r.owner.address ?? '')) : 'Not found']);
  }
  return (
    <div className={`tcard v-${v.level}`}>
      <div className="tcard-hd">
        <div>
          <div className="tcard-k">{r.kind === 'wallet' ? 'Address check' : 'Token Safety Check'}</div>
          <div className="tcard-t">{title}</div>
          <div className="tcard-a">
            <span className="mono">{short(r.address)}</span>
            <button className="mact" onClick={() => copy(r.address, 'Address copied')}>Copy</button>
            {r.explorerUrl && (
              <a className="mact" href={r.explorerUrl} target="_blank" rel="noopener noreferrer nofollow">
                Explorer ↗
              </a>
            )}
          </div>
        </div>
        {v.level !== 'na' && <span className={`tbadge b-${v.level}`}>{v.text}</span>}
      </div>
      {stats.length > 0 && (
        <div className="tstats">
          {stats.map(([k, val]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{val}</b>
            </div>
          ))}
        </div>
      )}
      <ul className="tflags">
        {r.flags.map((f) => (
          <li key={f.code} className={`f-${f.level}`}>
            <i aria-hidden="true" />
            <span>
              <em>{LEVEL_LABEL[f.level]}</em> {f.text}
            </span>
          </li>
        ))}
      </ul>
      <div className="tcard-ft">
        {r.source === 'rpc' ? 'Read directly from' : 'Automatic checks of public data on'} {r.chain}. They can miss honeypots, liquidity pulls and other
        tricks. Not financial advice.
      </div>
    </div>
  );
}

export function PriceStrip({ prices }: { prices: CoinPrice[] }) {
  return (
    <div className="pstrip" aria-label="Live prices">
      {prices.map((p) => (
        <div key={p.id} className="pchip">
          <span className="psym">{p.symbol}</span>
          <b>{usd(p.usd)}</b>
          {p.change24h !== null && (
            <span className={p.change24h >= 0 ? 'up' : 'down'}>
              {p.change24h >= 0 ? '▲' : '▼'} {Math.abs(p.change24h).toFixed(2)}%
            </span>
          )}
          {p.marketCapUsd ? <small>MC {compactUsd(p.marketCapUsd)}</small> : null}
        </div>
      ))}
    </div>
  );
}
