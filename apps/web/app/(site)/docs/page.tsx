import type { Metadata } from 'next';
import Link from 'next/link';
import { brand, DEFAULT_API_RATE_LIMIT, MAX_API_KEYS, MODELS, TIERS, UNSTAKE_COOLDOWN_DAYS } from '@fathom/config';

export const metadata: Metadata = {
  title: 'API docs',
  description: `${brand.name} API: an OpenAI-compatible API for private inference on open models.`,
  alternates: { canonical: '/docs' },
};

const link = { color: 'var(--violet2)' };
const diver = TIERS.find((t) => t.id === 'diver')!;
const tierText = TIERS.map(
  (t, i) =>
    `${t.name} (${t.minStake.toLocaleString('en-US')}${i === 0 ? ` ${brand.token.symbol}` : ''}) ${t.discountBps / 100}%` +
    (t.id === 'diver' ? ' plus early model access' : '') +
    (t.monthlyFreeCredits ? ` plus ${t.monthlyFreeCredits} free credits a month` : ''),
).join(', ');

export default function DocsPage() {
  return (
    <div className="wrap doc">
      <nav className="doc-nav" aria-label="Docs">
        <h6>Getting started</h6>
        <a href="#quickstart">Quickstart</a>
        <a href="#auth">Authentication</a>
        <h6>API</h6>
        <a href="#chat">Chat completions</a>
        <a href="#models-api">Models</a>
        <a href="#errors">Errors</a>
        <a href="#limits">Rate limits</a>
        <h6>Guides</h6>
        <a href="#agents">Agent wallets</a>
        <a href="#token">{brand.token.ticker} staking</a>
      </nav>
      <article className="prose">
        <h1>{brand.name} API</h1>
        <p className="lead">
          An OpenAI-compatible API for private inference. Every request runs inside an attested enclave and nothing is logged.
        </p>

        <h2 id="quickstart">Quickstart</h2>
        <p>
          1. Connect your wallet in the app and top up credits. 2. Create a key under{' '}
          <Link href="/app/keys" style={link}>API keys</Link>. 3. Point any OpenAI client at our base URL.
        </p>
        <pre>
          <code>{`curl ${brand.apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer ${brand.keyPrefix}…" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${MODELS[0]!.id}","messages":[{"role":"user","content":"Hello"}]}'`}</code>
        </pre>

        <h2 id="auth">Authentication</h2>
        <p>
          Send your key in the <code>Authorization: Bearer</code> header. Keys start with <code>{brand.keyPrefix}</code>, are
          shown once, and don&apos;t expire. You can hold up to {MAX_API_KEYS} active keys per wallet and revoke any of them
          instantly.
        </p>

        <h2 id="chat">Chat completions</h2>
        <p>
          <code>POST /v1/chat/completions</code> accepts the same body as OpenAI, including <code>stream</code>,{' '}
          <code>tools</code> and <code>temperature</code>. Two extra fields are available:
        </p>
        <ul>
          <li>
            <code>compare_with</code>: a second model id. The response includes both answers in <code>choices[0]</code> and{' '}
            <code>choices[1]</code>.
          </li>
          <li>
            <code>web_search</code>: <code>true</code> lets the model browse through {brand.name}&apos;s egress, never your IP.
          </li>
        </ul>

        <h2 id="models-api">Models</h2>
        <p>
          <code>GET /v1/models</code> returns available models with live status. Current ids:{' '}
          {MODELS.map((m, i) => (
            <span key={m.id}>
              <code>{m.id}</code>
              {i < MODELS.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>

        <h2 id="errors">Errors</h2>
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Code</th><th>Meaning</th><th>What to do</th></tr>
            </thead>
            <tbody>
              <tr><td className="mono">401</td><td>Invalid or revoked key</td><td>Create a new key in the app</td></tr>
              <tr><td className="mono">402</td><td>Not enough credits</td><td>Top up; the request was not charged</td></tr>
              <tr><td className="mono">429</td><td>Rate limit reached</td><td>Retry after the <code>retry-after</code> header</td></tr>
              <tr><td className="mono">503</td><td>Model temporarily unavailable</td><td>Retry, or switch to another model</td></tr>
            </tbody>
          </table>
        </div>

        <h2 id="limits">Rate limits</h2>
        <p>
          {DEFAULT_API_RATE_LIMIT} requests per minute per key by default, {diver.apiRateLimit} for {diver.name} tier stakers
          and above. Failed requests are never charged.
        </p>

        <h2 id="agents">Agent wallets</h2>
        <p>
          An agent can own a wallet, sign in with SIWE, and buy its own credits by sending USDG to CreditVault. Use{' '}
          <code>POST /v1/auth/siwe</code> to exchange a signature for a short-lived session key.
        </p>

        <h2 id="token">{brand.token.ticker} staking</h2>
        <p>
          {brand.token.ticker} is a utility token. Staking it unlocks discounts on every message: {tierText}. Unstaking has a{' '}
          {UNSTAKE_COOLDOWN_DAYS}-day cooldown. Staking does not pay revenue or yield.
        </p>
      </article>
    </div>
  );
}
