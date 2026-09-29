import type { Metadata } from 'next';
import { DraftBanner } from '@/components/site/DraftBanner';

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } };

export default function PrivacyPage() {
  return (
    <div className="wrap doc" style={{ gridTemplateColumns: '1fr', maxWidth: 760 }}>
      <article className="prose">
        <h1>Privacy Policy</h1>
        <DraftBanner />
        <h2>What we store</h2>
        <ul>
          <li>Your wallet address.</li>
          <li>Your credit balance and top-up transactions (these are public on-chain anyway).</li>
          <li>If you turn on chat history: your chats, encrypted with a key only your wallet can derive.</li>
        </ul>
        <h2>What we never store</h2>
        <ul>
          <li>Prompts or replies in readable form.</li>
          <li>IP addresses linked to your wallet.</li>
          <li>Email, name, phone number or identity documents.</li>
        </ul>
        <h2>Analytics</h2>
        <p>We count page views with a self-hosted, cookie-free tool. No tracking pixels, no third-party ad networks.</p>
        <h2>Deleting your data</h2>
        <p>
          Settings → Delete all data removes your encrypted history and API keys immediately. On-chain transactions can&apos;t
          be deleted by anyone.
        </p>
      </article>
    </div>
  );
}
