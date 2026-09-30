import type { Metadata } from 'next';
import { brand } from '@fathom/config';
import { DraftBanner } from '@/components/site/DraftBanner';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `What ${brand.name} stores, what it never stores, and who processes your messages.`,
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  const mail = <a href={`mailto:${brand.securityEmail}`} style={{ color: 'var(--violet2)' }}>{brand.securityEmail}</a>;
  return (
    <div className="wrap doc" style={{ gridTemplateColumns: '1fr', maxWidth: 760 }}>
      <article className="prose">
        <h1>Privacy Policy</h1>
        <DraftBanner />
        <p>
          This policy explains what {brand.name} ({brand.domain}) keeps when you use the app and API, and what it never
          keeps. It is a draft and not legal advice.
        </p>

        <h2>What we store</h2>
        <ul>
          <li>Your wallet address, which is your account.</li>
          <li>Your credit balance.</li>
          <li>Your transactions: welcome credits and top-ups, with their on-chain transaction hashes. Top-ups are public on the blockchain anyway.</li>
          <li>Daily usage totals per model: the number of messages and credits spent. Never their content.</li>
          <li>Your API keys, as a name, a short visible prefix and a one-way hash. The full key is shown once and never stored.</li>
          <li>Your settings, such as whether chat history is on and your default burn timer.</li>
          <li>
            Encrypted chat history, only if you turn history on. Chats are encrypted in your browser with a key derived from
            your wallet signature before they reach us, so we store only ciphertext we can&apos;t read.
          </li>
          <li>
            A random session id, sent to your browser as an httpOnly cookie so you stay signed in. It expires 7 days after
            your last activity or when you disconnect.
          </li>
        </ul>

        <h2>What we never store</h2>
        <ul>
          <li>Your prompts or the AI&apos;s answers in readable form, in logs, databases, error reports or analytics.</li>
          <li>
            IP addresses linked to your wallet. To stop abuse, such as farming free credits, a one-way hash of your IP
            address is kept in short-lived rate-limit counters that expire within 48 hours. Our web server access logs are
            off.
          </li>
          <li>Your email, name, phone number or identity documents. We never ask for them.</li>
        </ul>

        <h2>How your messages are processed</h2>
        <p>
          Your prompt travels over HTTPS to our server, which forwards it over HTTPS to the model provider and relays the
          answer back. It is not end-to-end encrypted to the model: our server handles it in memory while relaying, without
          logging or storing it.
        </p>

        <h2>Who else processes data</h2>
        <ul>
          <li>
            <b>OpenRouter and the upstream model providers</b> receive your prompts to generate answers. We restrict
            routing to providers that don&apos;t collect data and offer zero data retention. They receive requests from our
            server, not from your device.
          </li>
          <li>
            <b>Brave Search</b> receives web search queries when you use web search. Queries are sent from our server, so
            your IP address is never shared.
          </li>
          <li>
            <b>Cloudflare Turnstile</b>, if enabled, checks that sign-ins come from a person. It runs in your browser and
            follows Cloudflare&apos;s own privacy policy.
          </li>
          <li><b>Our hosting provider</b> runs the servers and database that hold the data listed above.</li>
          <li><b>Robinhood Chain</b> is a public blockchain. Anything you do on-chain is visible to everyone.</li>
        </ul>

        <h2>Analytics</h2>
        <p>
          If analytics are enabled, we count page views with a self-hosted, cookie-free tool. There are no tracking pixels,
          no ad networks and no Google Analytics.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Settings → Delete all data removes your encrypted history and API keys immediately. Chats with a burn timer are
          deleted automatically when the timer runs out. On-chain transactions can&apos;t be deleted by anyone.
        </p>

        <h2>Contact</h2>
        <p>Questions or requests about your data: {mail}.</p>
      </article>
    </div>
  );
}
