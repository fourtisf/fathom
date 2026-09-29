import Link from 'next/link';
import { brand } from '@fathom/config';
import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="site-foot">
      <div className="wrap">
        <div className="foot">
          <div>
            <Logo />
            <p>{brand.footerBlurb}</p>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li><Link href="/app">Launch app</Link></li>
              <li><Link href="/#why">Why {brand.name}</Link></li>
              <li><Link href="/#pricing">Pricing</Link></li>
              <li><Link href="/app/stake">Staking</Link></li>
            </ul>
          </div>
          <div>
            <h5>Trust</h5>
            <ul>
              <li><Link href="/trust">Attestation</Link></li>
              <li><Link href="/trust#contracts">Contracts and audits</Link></li>
              <li><Link href="/trust#status">System status</Link></li>
              <li><Link href="/docs">API docs</Link></li>
            </ul>
          </div>
          <div>
            <h5>Company</h5>
            <ul>
              <li><Link href="/terms">Terms</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><a href={brand.social.x}>X</a></li>
              <li><a href={brand.social.telegram}>Telegram</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} {brand.company}</span>
          <span>{brand.securityEmail}</span>
        </div>
      </div>
    </footer>
  );
}
