import Link from 'next/link';
import { brand } from '@fathom/config';
import { Logo } from './Logo';
import { XIcon } from './XIcon';

// Empty URLs are hidden so nothing points to '#'. Fill them in packages/config/src/brand.ts.
const SOCIAL = [
  { label: 'X', href: brand.social.x },
  { label: 'Telegram', href: brand.social.telegram },
].filter((s) => s.href);

export function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="foot">
          <div>
            <Logo />
            <p>{brand.footerBlurb}</p>
            {brand.social.x && (
              <a className="foot-follow" href={brand.social.x} target="_blank" rel="noopener noreferrer">
                <XIcon size={14} />
                Follow {brand.social.xHandle}
              </a>
            )}
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li><Link href="/app">Launch app</Link></li>
              <li><Link href="/#why">Why {brand.name}</Link></li>
              <li><Link href="/#pricing">Pricing</Link></li>
              <li><Link href="/scan">Token Scanner</Link></li>
              <li><Link href="/docs#token">Token (planned)</Link></li>
            </ul>
          </div>
          <div>
            <h5>Trust</h5>
            <ul>
              <li><Link href="/trust">Where your data goes</Link></li>
              <li><Link href="/trust#contracts">Addresses and security</Link></li>
              <li><Link href="/trust#status">System status</Link></li>
              <li><Link href="/docs">API docs</Link></li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              {SOCIAL.map((s) => (
                <li key={s.label}><a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} {brand.company}</span>
          <a href={`mailto:${brand.securityEmail}`}>{brand.securityEmail}</a>
        </div>
        <div className="foot-mark" aria-hidden="true">{brand.name.toLowerCase()}</div>
      </div>
    </footer>
  );
}
