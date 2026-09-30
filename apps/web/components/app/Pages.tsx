'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { brand, CREDITS_PER_USDG, MAX_API_KEYS, MODELS, TIERS, UNSTAKE_COOLDOWN_DAYS, WELCOME_CREDITS } from '@fathom/config';
import { api, ApiError, post, type ApiKeyRow, type CreditsSummary, type Settings, type TxRow } from '@/lib/api';
import { useToast } from '../Toast';
import { fmt2, fmtCost } from './Shell';
import { useSession } from './Session';
import { useHistory } from './History';
import { useUi, type Burn } from './Ui';

const modelName = (id: string) => MODELS.find((m) => m.id === id)?.name ?? id;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

function NeedWallet({ title, sub }: { title: string; sub: string }) {
  const { openModal } = useUi();
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
      </div>
      <div className="glass panel" style={{ marginTop: 0 }}>
        <div className="empty-state">
          <b>Connect your wallet</b>
          Your wallet is your account.{' '}
          <button onClick={() => openModal('wallet')} style={{ color: 'var(--violet2)', textDecoration: 'underline' }}>
            Connect now
          </button>
        </div>
      </div>
    </div>
  );
}

const TX_LABEL: Record<TxRow['type'], string> = {
  WELCOME_BONUS: 'Welcome bonus',
  TOPUP: 'Top-up',
  STAKE: 'Stake',
  UNSTAKE: 'Unstake',
};

export function CreditsPage() {
  const { me, config } = useSession();
  const { openModal } = useUi();
  const summary = useQuery({
    queryKey: ['credits', 'summary', me?.credits],
    queryFn: () => api<CreditsSummary>('/credits/summary'),
    enabled: !!me,
  });
  const txs = useQuery({ queryKey: ['credits', 'tx'], queryFn: () => api<TxRow[]>('/credits/transactions'), enabled: !!me });
  if (!me) return <NeedWallet title="Credits" sub="Your balance, spending and top-ups." />;

  const s = summary.data;
  const max = Math.max(...(s?.usage14.map((u) => u.credits) ?? [0])) || 1;
  const total = s?.byModel.reduce((a, b) => a + b.credits, 0) ?? 0;
  const explorer = config?.chain?.explorerUrl;

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Credits</h2>
          <p>Your balance, spending and top-ups.</p>
        </div>
        <button className="btn btn-dark" onClick={() => openModal('topup')}>
          Top up
        </button>
      </div>
      <div className="grid4">
        <div className="kpi glass"><span>Balance</span><b>{fmt2(me.credits)}</b><small>≈ ${(me.credits / CREDITS_PER_USDG).toFixed(2)}</small></div>
        <div className="kpi glass"><span>Spent this month</span><b>{fmt2(s?.spentMonth ?? 0)}</b><small>credits</small></div>
        <div className="kpi glass"><span>Messages</span><b>{s?.messagesMonth ?? 0}</b><small>this month</small></div>
        <div className="kpi glass"><span>Your discount</span><b>0%</b><small>Staking is planned</small></div>
      </div>
      <div className="grid2">
        <div className="glass panel">
          <h3>Daily usage</h3>
          <p className="sub2">Credits spent, last 14 days</p>
          <div className="bars">
            {(s?.usage14 ?? Array.from({ length: 14 }, (_, i) => ({ day: String(i), credits: 0 }))).map((u, i, a) => (
              <div
                key={u.day}
                style={{ height: `${Math.max(3, (u.credits / max) * 100)}%` }}
                data-v={`${i === a.length - 1 ? 'Today' : `${a.length - 1 - i}d ago`}: ${fmtCost(u.credits)} cr`}
              />
            ))}
          </div>
          <div className="bars-x"><span>14 days ago</span><span>Today</span></div>
        </div>
        <div className="glass panel">
          <h3>By model</h3>
          <p className="sub2">Where your credits go</p>
          <div style={{ marginTop: 14 }}>
            {total ? (
              s!.byModel.map((m) => (
                <div className="mrow2" key={m.model}>
                  <span>{modelName(m.model)}</span>
                  <div className="track"><i style={{ width: `${(m.credits / total) * 100}%` }} /></div>
                  <b>{fmtCost(m.credits)}</b>
                </div>
              ))
            ) : (
              <div className="empty-state"><b>No usage yet</b>Send a message and your spending shows up here.</div>
            )}
          </div>
        </div>
      </div>
      <div className="glass panel tw">
        <h3>Transactions</h3>
        <p className="sub2">Every top-up is an on-chain transaction you can inspect.</p>
        {txs.data?.length ? (
          <table className="tbl">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Paid</th><th>Credits</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {txs.data.map((t) => {
                const d = new Date(t.createdAt);
                return (
                  <tr key={t.id}>
                    <td>{d.toLocaleDateString([], { month: 'short', day: 'numeric' })} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{TX_LABEL[t.type]}</td>
                    <td className="mono">{t.amountPaid ? `${t.amountPaid} ${t.token ?? ''}` : '—'}</td>
                    <td className="mono">{t.credits ? `+${fmt(t.credits)}` : '0'}</td>
                    <td>
                      <span className={`st ${t.status === 'CONFIRMED' ? 'ok' : t.status === 'FAILED' ? 'bad' : 'pend'}`}>
                        {t.status === 'CONFIRMED' ? 'Confirmed' : t.status === 'FAILED' ? 'Failed · reverted' : 'Pending'}
                      </span>
                    </td>
                    <td>
                      {t.txHash && explorer && (
                        <a className="ext" href={`${explorer}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" title={t.txHash}>
                          {t.txHash.slice(0, 8)}…
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state"><b>No transactions yet</b>Connect a wallet to get {WELCOME_CREDITS} free credits.</div>
        )}
      </div>
    </div>
  );
}

export function KeysPage() {
  const { me } = useSession();
  const { openModal, setNewKey } = useUi();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [hint, setHint] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ['keys'], queryFn: () => api<ApiKeyRow[]>('/keys'), enabled: !!me });

  async function create() {
    if (!me) return openModal('wallet');
    const n = name.trim();
    if (!n) return setHint({ text: "Give the key a name so you know where it's used.", err: true });
    setBusy(true);
    setHint(null);
    try {
      const k = await post<ApiKeyRow & { key: string }>('/keys', { name: n });
      setName('');
      setNewKey(k.key);
      openModal('newkey');
      await qc.invalidateQueries({ queryKey: ['keys'] });
    } catch (e) {
      setHint({
        text: e instanceof ApiError && e.code === 'key_limit' ? `You have ${MAX_API_KEYS} active keys. Revoke one to create another.` : 'Could not create the key. Try again.',
        err: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (sure !== id) {
      setSure(id);
      setTimeout(() => setSure((x) => (x === id ? null : x)), 3000);
      return;
    }
    try {
      await api(`/keys/${id}`, { method: 'DELETE' });
      toast('Key revoked. Apps using it stop working immediately.');
      await qc.invalidateQueries({ queryKey: ['keys'] });
    } catch {
      toast('Could not revoke the key. Try again.', true);
    }
    setSure(null);
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>API keys</h2>
          <p>
            Use the same credits from your own apps and agents. <Link href="/docs" style={{ color: 'var(--violet2)' }}>Read the docs</Link>
          </p>
        </div>
      </div>
      <div className="glass panel" style={{ marginTop: 0 }}>
        <h3>Create a key</h3>
        <p className="sub2">Keys are shown once and never expire. Up to {MAX_API_KEYS} per wallet.</p>
        <div className="row-f" style={{ marginTop: 14 }}>
          <input
            className="inp"
            placeholder="Key name, e.g. trading-bot"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            aria-label="Key name"
          />
          <button className="btn btn-dark" onClick={() => void create()} disabled={busy}>
            {busy ? 'Creating…' : 'Create key'}
          </button>
        </div>
        {hint && <p className={`hint${hint.err ? ' err' : ''}`}>{hint.text}</p>}
      </div>
      <div className="glass panel tw">
        <h3>Active keys</h3>
        {!me ? (
          <div className="empty-state"><b>Connect your wallet</b>Keys belong to your wallet.</div>
        ) : keys.data?.length ? (
          <table className="tbl">
            <thead>
              <tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th /></tr>
            </thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="mono">{k.prefix}…</td>
                  <td>{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-danger" onClick={() => void revoke(k.id)}>
                      {sure === k.id ? 'Confirm revoke' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state"><b>No keys yet</b>Create one above to use {brand.name} from your code.</div>
        )}
      </div>
    </div>
  );
}

export function StakePage() {
  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Staking</h2>
          <p>Planned: stake the {brand.token.display} for discounts on every message. It is a utility token and staking pays no yield.</p>
        </div>
      </div>
      <div className="glass panel" style={{ marginTop: 0 }}>
        <div className="empty-state">
          <b>Staking isn&apos;t open yet</b>
          The {brand.token.display} hasn&apos;t launched. Unstaking will have a {UNSTAKE_COOLDOWN_DAYS}-day cooldown. These are the planned tiers:
        </div>
      </div>
      <div className="tiers">
        {TIERS.map((t) => (
          <div className="tier glass" key={t.id}>
            <div className="tn">{t.name}</div>
            <div className="need">{fmt(t.minStake)} tokens staked</div>
            <div className="off">{t.discountBps / 100}% off</div>
            <ul>{t.perks.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { me, config, signOut, refreshMe } = useSession();
  const { openModal, setWebSearch, setBurn } = useUi();
  const history = useHistory();
  const toast = useToast();
  if (!me) return <NeedWallet title="Settings" sub="Control what's kept, and for how long." />;

  async function patch(p: Partial<Settings>) {
    try {
      await api('/settings', { method: 'PATCH', body: JSON.stringify(p) });
      refreshMe();
    } catch {
      toast('Could not save the setting. Try again.', true);
    }
  }

  async function exportData() {
    try {
      const [summary, transactions] = await Promise.all([
        api<CreditsSummary>('/credits/summary'),
        api<TxRow[]>('/credits/transactions'),
      ]);
      const data = { wallet: me!.address, exported: new Date().toISOString(), settings: me!.settings, credits: me!.credits, usage: summary, transactions };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = brand.exportFileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Export downloaded');
    } catch {
      toast('Export failed. Try again.', true);
    }
  }

  return (
    <div className="page">
      <div className="page-h">
        <div>
          <h2>Settings</h2>
          <p>Control what&apos;s kept, and for how long.</p>
        </div>
      </div>
      <div className="glass panel" style={{ marginTop: 0 }}>
        <h3>Privacy</h3>
        <div className="setrow">
          <div>
            <h4>Save chat history</h4>
            <p>Chats are encrypted in this browser with a key only your wallet can derive; we store only ciphertext. Turn off to keep nothing at all.</p>
          </div>
          <button
            className="tog"
            role="switch"
            aria-checked={me.settings.saveHistory}
            aria-label="Save chat history"
            onClick={async () => {
              const on = !me.settings.saveHistory;
              await patch({ saveHistory: on });
              if (!on) await history.lock();
              toast(on ? 'History on, encrypted to your wallet' : 'History off. Saved chats were deleted.');
            }}
          />
        </div>
        <div className="setrow">
          <div>
            <h4>Default auto-delete</h4>
            <p>New chats burn automatically after this time. Burned chats are deleted from our servers too.</p>
          </div>
          <select
            className="sel"
            value={me.settings.defaultBurn}
            onChange={async (e) => {
              const v = e.target.value as Burn;
              await patch({ defaultBurn: v });
              setBurn(v);
              toast(v === 'off' ? 'New chats: kept until you delete them' : `New chats: burn after ${v === '1h' ? '1 hour' : '24 hours'}`);
            }}
            aria-label="Default auto-delete"
          >
            <option value="off">Never</option>
            <option value="1h">After 1 hour</option>
            <option value="24h">After 24 hours</option>
          </select>
        </div>
        {config?.webSearch && (
          <div className="setrow">
            <div>
              <h4>Web search by default</h4>
              <p>Searches leave from {brand.name}&apos;s servers, never your IP.</p>
            </div>
            <button
              className="tog"
              role="switch"
              aria-checked={me.settings.webSearch}
              aria-label="Web search by default"
              onClick={() => {
                setWebSearch(!me.settings.webSearch);
                void patch({ webSearch: !me.settings.webSearch });
              }}
            />
          </div>
        )}
      </div>
      <div className="glass panel">
        <h3>Your data</h3>
        <div className="setrow">
          <div><h4>Export</h4><p>Download your settings, usage and transaction list as JSON.</p></div>
          <button className="btn btn-light" onClick={exportData}>Export</button>
        </div>
        <div className="setrow">
          <div><h4>Delete all data</h4><p>Removes encrypted history, API keys and settings immediately. On-chain transactions stay on-chain.</p></div>
          <button className="btn btn-danger" onClick={() => openModal('delete')}>Delete all</button>
        </div>
        <div className="setrow">
          <div><h4>Disconnect wallet</h4><p>Signs you out on this device.</p></div>
          <button
            className="btn btn-light"
            onClick={async () => {
              await history.lock();
              await signOut();
              toast('Disconnected');
            }}
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
