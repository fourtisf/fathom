import type { Metadata } from 'next';
import Link from 'next/link';
import { WELCOME_CREDITS } from '@fathom/config';
import { LogoMark } from '@/components/LogoMark';

export const metadata: Metadata = { title: 'App', robots: { index: false, follow: false } };

/**
 * Placeholder until Phase 2 (SIWE auth) lands the real app shell. It shows the
 * disconnected gate from the prototype with wallet connect not yet available.
 */
export default function AppPlaceholder() {
  return (
    <div className="gate" style={{ minHeight: '100dvh' }}>
      <div>
        <LogoMark />
        <h2>Connect to start chatting</h2>
        <p>
          Your wallet is your account. Sign one message, no gas, and get {WELCOME_CREDITS} free credits to try every model.
        </p>
        <button className="btn btn-dark btn-lg" disabled>Wallet sign-in is coming soon</button>
        <p style={{ fontSize: 13, marginTop: 14 }}>
          <Link href="/" style={{ color: 'var(--violet2)', textDecoration: 'underline' }}>Back to home</Link>
        </p>
      </div>
    </div>
  );
}
