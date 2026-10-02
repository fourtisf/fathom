'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { brand, contextLabel, estimateMessageCredits, LOW_BALANCE_CREDITS, MODELS } from '@fathom/config';
import { Icon, type IconName } from '../Icon';
import { LogoMark } from '../LogoMark';
import { useCopy, useToast } from '../Toast';
import { useHistory } from './History';
import { AppModals } from './Modals';
import { short, useSession } from './Session';
import { useUi, type Burn } from './Ui';
import { ModelLogo } from '../ModelLogo';

const NAV: { href: string; label: string; tab: string; icon: IconName }[] = [
  { href: '/app', label: 'Chat', tab: 'Chat', icon: 'chat' },
  { href: '/app/credits', label: 'Credits', tab: 'Credits', icon: 'coin' },
  { href: '/app/keys', label: 'API keys', tab: 'Keys', icon: 'key' },
  { href: '/app/stake', label: 'Stake', tab: 'Stake', icon: 'layers' },
  { href: '/app/settings', label: 'Settings', tab: 'Settings', icon: 'gear' },
];

export const fmt2 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** Per-message costs are often fractions of a cent; keep them readable instead of rounding to 0.00. */
export const fmtCost = (n: number) => (n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2));

function ModelMenu() {
  const { config } = useSession();
  const { model, cmpModel, compare, setModel } = useUi();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const status = (id: string) => config?.models.find((m) => m.id === id)?.status ?? 'unavailable';
  const name = (id: string) => MODELS.find((m) => m.id === id)?.name ?? id;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="model-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ModelLogo model={model} size={22} className="mb-logo" />
        <span>
          {name(model)}
          {compare && (
            <>
              {' '}
              <span style={{ color: 'var(--mute)', fontWeight: 400 }}>vs</span> {name(cmpModel)}
            </>
          )}
        </span>
        <Icon name="down" />
      </button>
      <div className={`menu modelmenu${open ? ' open' : ''}`} role="menu" style={{ top: 44, left: 0 }}>
        <div className="mm-hd">Latest open models · zero logs</div>
        {MODELS.map((m) => (
          <button
            key={m.id}
            role="menuitemradio"
            aria-checked={m.id === model}
            onClick={() => {
              setModel(m.id);
              setOpen(false);
            }}
          >
            <ModelLogo model={m.id} size={34} />
            <span className="mm-t">
              <b>
                {m.name}
                {m.badge && <i className={`mm-badge b-${m.badge.toLowerCase()}`}>{m.badge}</i>}
                {status(m.id) !== 'ok' && <em className="tag-deg">{status(m.id) === 'degraded' ? 'Degraded' : 'Unavailable'}</em>}
              </b>
              <small>{m.menuBlurb}</small>
              <small className="mm-meta">
                {contextLabel(m.contextK)} context · open weights
              </small>
            </span>
            <em>{estimateMessageCredits(m).toFixed(2)} cr</em>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, config, configError, wrongNetwork, switchNetwork, switchError } = useSession();
  const copy = useCopy();
  const ui = useUi();
  const { openModal, newChat } = ui;
  const history = useHistory();
  const router = useRouter();
  const toast = useToast();
  const page = NAV.find((n) => n.href === pathname) ?? NAV[0]!;
  const isChat = page.href === '/app';

  return (
    <div className="shell">
      <aside className="snav">
        <Link href="/" className="logo">
          <LogoMark />
          {brand.name}
        </Link>
        <Link href="/app" className="newchat" onClick={newChat}>
          <Icon name="plus" width={15} height={15} />
          New chat<kbd>⌘K</kbd>
        </Link>
        {NAV.map((n) => (
          <Link key={n.href} className={`nitem${n.href === pathname ? ' cur' : ''}`} href={n.href}>
            <Icon name={n.icon} />
            {n.label}
          </Link>
        ))}
        <h6>Chats</h6>
        <div className="hist">
          {!me ? (
            <div className="empty">No saved chats yet</div>
          ) : !history.enabled ? (
            <div className="empty">History is off</div>
          ) : !history.unlocked ? (
            <button
              className="empty unlock"
              onClick={() =>
                history
                  .unlock()
                  .then(() => toast('Encrypted history unlocked'))
                  .catch((e: unknown) =>
                    toast(e instanceof Error && e.message === 'wallet_not_connected' ? 'Reconnect your wallet to unlock history.' : 'History stays locked.', true),
                  )
              }
            >
              <Icon name="lock" />
              Unlock saved chats
            </button>
          ) : history.items.length === 0 ? (
            <div className="empty">No saved chats yet</div>
          ) : (
            history.items.slice(0, 30).map((c) => (
              <a
                key={c.id}
                href="/app"
                className={c.id === ui.activeChatId ? 'on' : undefined}
                title={c.burnAt ? `Burns ${new Date(c.burnAt).toLocaleString()}` : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  if (c.locked) return toast("This chat was saved with a different key and can't be opened here.", true);
                  if (pathname !== '/app') router.push('/app');
                  ui.openChat(c.id);
                }}
              >
                <Icon name={c.burnAt ? 'flame' : 'lock'} />
                <span>{c.title}</span>
              </a>
            ))
          )}
        </div>
        <div className="wallet-card">
          <div className="r">
            <span>Balance</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>{me ? short(me.address) : 'Not connected'}</span>
          </div>
          <b>
            {fmt2(me?.credits ?? 0)} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mute)' }}>credits</span>
          </b>
          <div className="bar">
            <i style={{ width: `${Math.min(100, (me?.credits ?? 0) / 20)}%` }} />
          </div>
          <button className="btn btn-light" onClick={() => openModal(me ? 'topup' : 'wallet')}>
            Top up
          </button>
        </div>
      </aside>

      <div className="smain">
        <div className="atop">
          <h1>{page.label}</h1>
          {isChat && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <ModelMenu />
              {me && history.enabled && (
                <label className="burnpill">
                  <Icon name="flame" />
                  <span className="l">Burn</span>
                  <select aria-label="Auto-delete this chat" value={ui.burn} onChange={(e) => ui.setBurn(e.target.value as Burn)}>
                    <option value="off">Off</option>
                    <option value="1h">1 hour</option>
                    <option value="24h">24 hours</option>
                  </select>
                </label>
              )}
            </div>
          )}
          {me && config?.chain && (
            <button className={`netpill${wrongNetwork ? ' bad' : ''}`} onClick={() => wrongNetwork && switchNetwork()}>
              <i />
              <span>{wrongNetwork ? 'Wrong network' : config.chain.name}</span>
            </button>
          )}
          {me ? (
            <div className="acct" style={{ display: 'flex' }}>
              <button className="bal" onClick={() => openModal('topup')}>
                <i />
                <span>{fmt2(me.credits)}</span>
                <em>credits</em>
              </button>
              <span className="addr">
                <span className="av" />
                <span className="ad">{short(me.address)}</span>
              </span>
            </div>
          ) : (
            <button className="btn btn-dark btn-sm" onClick={() => openModal('wallet')}>
              Connect wallet
            </button>
          )}
        </div>
        {configError && (
          <div className="banner warn">
            <Icon name="alert" />
            <span>Can&apos;t reach the {brand.name} service right now. Please try again in a moment.</span>
          </div>
        )}
        {wrongNetwork && config?.chain && (
          <div className="banner warn">
            <Icon name="alert" />
            <span>
              Your wallet is on another network. {brand.name} runs on <b>{config.chain.name}</b>, so top-ups and staking are
              paused.
            </span>
            <button className="btn btn-light" onClick={switchNetwork}>
              Switch network
            </button>
          </div>
        )}
        {wrongNetwork && config?.chain && switchError && (
          <div className="banner info netmanual">
            <Icon name="info" />
            <div>
              <span>
                Your wallet said: <em>{switchError}</em>. Add the network manually in your wallet (Settings → Networks → Add
                network):
              </span>
              <dl>
                {[
                  ['Network name', config.chain.name],
                  ['RPC URL', config.chain.rpcUrl],
                  ['Chain ID', String(config.chain.id)],
                  ['Currency symbol', 'ETH'],
                  ...(config.chain.explorerUrl ? [['Block explorer', config.chain.explorerUrl]] : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <code>{v}</code>
                      <button className="copybtn" onClick={() => copy(v!, `${k} copied`)}>Copy</button>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
        {me && !wrongNetwork && me.credits < LOW_BALANCE_CREDITS && (
          <div className="banner info">
            <Icon name="info" />
            <span>You&apos;re running low on credits.</span>
            <button className="btn btn-light" onClick={() => openModal('topup')}>
              Top up
            </button>
          </div>
        )}
        <div className="acontent">{children}</div>
      </div>

      <nav className="tabbar" aria-label="App">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={n.href === pathname ? 'cur' : undefined}>
            <Icon name={n.icon} />
            {n.tab}
          </Link>
        ))}
      </nav>
      <AppModals />
    </div>
  );
}
