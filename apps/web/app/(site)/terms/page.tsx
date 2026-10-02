import type { Metadata } from 'next';
import { brand, CREDITS_PER_USDG } from '@fathom/config';
import { DraftBanner } from '@/components/site/DraftBanner';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The terms for using ${brand.name}: credits, acceptable use, and the AI service.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="wrap doc" style={{ gridTemplateColumns: '1fr', maxWidth: 760 }}>
      <article className="prose">
        <h1>Terms of Service</h1>
        <DraftBanner />
        <p>These terms are a draft and not legal advice. By using {brand.name} you agree to them.</p>

        <h2>1. The service</h2>
        <p>
          {brand.name} gives you access to AI models (open-weight models and a premium closed model) through a web app and an OpenAI-compatible API. Models are
          run by third-party inference providers that we select. You pay with prepaid credits bought in USDG on Robinhood
          Chain.
        </p>

        <h2>2. Your wallet</h2>
        <p>
          Your wallet is your account. You&apos;re responsible for keeping it and your API keys secure. We can&apos;t recover
          credits, keys or encrypted history if you lose access to your wallet.
        </p>

        <h2>3. Credits and payments</h2>
        <ul>
          <li>Credits are prepaid usage units. {CREDITS_PER_USDG} credits cost 1 USDG at current prices.</li>
          <li>Top-ups are coming soon. When they open, they will be made by sending USDG to our treasury address and credited after the transfer is confirmed. Sending the wrong token, network or address may result in a loss we can&apos;t reverse.</li>
          <li>Credits don&apos;t expire. They are non-refundable once used, can&apos;t be transferred or withdrawn, and have no value outside {brand.name}.</li>
          <li>Requests that fail or can&apos;t be served are not charged.</li>
          <li>We may change prices with notice on this site. Changes don&apos;t affect charges already made.</li>
          <li>Free welcome credits are a one-time offer per eligible wallet and can be changed or withdrawn at any time.</li>
        </ul>

        <h2>4. Acceptable use</h2>
        <p>You agree not to use {brand.name} to:</p>
        <ul>
          <li>create or share illegal content, or break any law that applies to you;</li>
          <li>harm, harass or defraud others;</li>
          <li>attack, overload or reverse-engineer the service, or get around rate limits or payments;</li>
          <li>farm free credits, for example by creating or using many wallets.</li>
        </ul>
        <p>
          We don&apos;t read your prompts. We can suspend or block wallets and API keys involved in abuse of the service,
          such as payment fraud, credit farming or attacks, and remove credits obtained that way.
        </p>

        <h2>5. AI output</h2>
        <p>
          AI answers can be wrong, incomplete or offensive. You are responsible for how you use them. Don&apos;t rely on them
          for medical, legal or financial decisions without professional advice.
        </p>

        <h2>6. The {brand.token.display}</h2>
        <p>
          The {brand.token.display} is a planned utility token and has not launched. If it launches, it is intended for discounts
          and early access inside {brand.name}. It is not an investment and does not entitle holders to revenue, dividends or
          profit.
        </p>

        <h2>7. Availability</h2>
        <p>
          {brand.name} is not available in sanctioned jurisdictions or to sanctioned persons. You may not use it where doing so
          is illegal.
        </p>

        <h2>8. No warranty and liability</h2>
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind. To the extent
          the law allows, {brand.company} is not liable for indirect or consequential losses, or for losses caused by
          blockchains, wallets or third-party providers.
        </p>

        <h2>9. Changes and governing law</h2>
        <p>
          We may update these terms and will post the new version here. Governing law and jurisdiction: [to be set by
          counsel].
        </p>

        <h2>10. Contact</h2>
        <p>
          <a href={`mailto:${brand.securityEmail}`} style={{ color: 'var(--violet2)' }}>{brand.securityEmail}</a>
        </p>
      </article>
    </div>
  );
}
