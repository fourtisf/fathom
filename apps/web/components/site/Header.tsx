'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { brand } from '@fathom/config';
import { Logo } from './Logo';
import { XIcon } from './XIcon';

const LINKS = [
  { href: '/#features', label: 'Privacy', nav: 'home' },
  { href: '/#tools', label: 'Tools', nav: 'home' },
  { href: '/#why', label: `Why ${brand.name}`, nav: 'home' },
  { href: '/#pricing', label: 'Pricing', nav: 'home' },
  { href: '/scan', label: 'Scanner', nav: 'scan' },
  { href: '/trust', label: 'Trust', nav: 'trust' },
  { href: '/docs', label: 'Docs', nav: 'docs' },
] as const;

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const current = pathname.split('/')[1] || 'home';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header id="hdr" className={scrolled ? 'scrolled' : undefined}>
      <nav className="wrap" aria-label="Main">
        <Logo />
        <div className={`nav-links${open ? ' open' : ''}`} id="navLinks">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.nav === current && current !== 'home' ? 'cur' : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-right">
          {brand.social.x && (
            <a className="nav-x" href={brand.social.x} target="_blank" rel="noopener noreferrer" aria-label={`${brand.name} on X`} title={brand.social.xHandle}>
              <XIcon size={15} />
            </a>
          )}
          <Link href="/app" className="btn btn-dark btn-sm">
            Launch app
          </Link>
          <button
            className="menu-btn"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="navLinks"
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      </nav>
    </header>
  );
}
