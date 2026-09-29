import type { Metadata } from 'next';
import { brand } from '@fathom/config';
import { DraftBanner } from '@/components/site/DraftBanner';

export const metadata: Metadata = { title: 'Terms of Service', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return (
    <div className="wrap doc" style={{ gridTemplateColumns: '1fr', maxWidth: 760 }}>
      <article className="prose">
        <h1>Terms of Service</h1>
        <DraftBanner />
        <h2>1. The service</h2>
        <p>
          {brand.name} provides access to open-weight AI models through a web app and API. You pay with credits bought in
          USDG or supported tokens on Robinhood Chain.
        </p>
        <h2>2. Your wallet</h2>
        <p>Your wallet is your account. You&apos;re responsible for its security. We can&apos;t recover credits or data if you lose access to it.</p>
        <h2>3. Credits</h2>
        <p>Credits are prepaid usage units. They don&apos;t expire, aren&apos;t refundable once used, and have no value outside {brand.name}.</p>
        <h2>4. Acceptable use</h2>
        <p>
          Don&apos;t use {brand.name} to break the law, harm others, or attack the service. We can&apos;t read your prompts,
          but we can suspend wallets involved in abuse of the service itself, such as payment fraud or attacks.
        </p>
        <h2>5. {brand.token.ticker}</h2>
        <p>
          {brand.token.ticker} is a utility token for discounts and early access inside {brand.name}. It is not an investment
          and does not entitle holders to revenue or profit.
        </p>
        <h2>6. No warranty</h2>
        <p>AI answers can be wrong. Don&apos;t rely on them for medical, legal or financial decisions without professional advice.</p>
      </article>
    </div>
  );
}
