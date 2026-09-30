'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { brand, estimateMessageCredits, LOW_BALANCE_CREDITS, MODELS } from '@fathom/config';
import { Icon, type IconName } from '../Icon';
import { LogoMark } from '../LogoMark';
import { AppModals } from './Modals';
import { short, useSession } from './Session';
import { useUi } from './Ui';

const NAV: { href: string; label: string; tab: string; icon: IconName }[] = [
  { href: '/app', label: 'Chat', tab: 'Chat', icon: 'chat' },
  { href: '/app/credits', label: 'Credits', tab: 'Credits', icon: 'coin' },
  { href: '/app/keys', label: 'API keys', tab: 'Keys', icon: 'key' },
  { href: '/app/stake', label: 'Stake', tab: 'Stake', icon: 'layers' },
  { href: '/app/settings', label: 'Settings', tab: 'Settings', icon: 'gear' },
];

export const fmt2 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

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
      <div className={`menu${open ? ' open' : ''}`} role="menu" style={{ top: 44, left: 0 }}>
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
            <b>
              {m.name}
              {status(m.id) !== 'ok' && <em className="tag-deg">{status(m.id) === 'degraded' ? 'Degraded' : 'Unavailable'}</em>}
            </b>
            <small>{m.menuBlurb}</small>
            <em>{estimateMessageCredits(m).toFixed(2)} cr</em>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, config, configError, wrongNetwork, switchNetwork } = useSession();
  const { openModal, newChat } = useUi();
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
          <div className="empty">{me ? 'Chats are not saved' : 'No saved chats yet'}</div>
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
