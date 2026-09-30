import type { Metadata } from 'next';
import Link from 'next/link';
import {
  brand,
  CREDITS_PER_USDG,
  DEFAULT_API_RATE_LIMIT,
  MAX_API_KEYS,
  MODELS,
  TIERS,
  UNSTAKE_COOLDOWN_DAYS,
} from '@fathom/config';

export const metadata: Metadata = {
  title: 'API docs',
  description: `${brand.name} API: an OpenAI-compatible API for open models, with no prompt logging and pay-per-token credits.`,
  alternates: { canonical: '/docs' },
};

const link = { color: 'var(--violet2)' };
const base = brand.apiBaseUrl;
const model = MODELS[0]!.id;
const other = MODELS[1]!.id;
const key = `${brand.keyPrefix}…`;
const maxDiscount = Math.max(...TIERS.map((t) => t.discountBps)) / 100;
// Read at build time (deploy.sh exports the repo .env before building); the API default is 1.
const minTopup = process.env.TOPUP_MIN_USD?.trim() || '1';

const CURL = `curl ${base}/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Hello"}]}'`;

const PY = `from openai import OpenAI

client = OpenAI(base_url="${base}", api_key="${key}")

reply = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Keep this between us."}],
)
print(reply.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Write a haiku about the sea."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`;

const JS = `import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${base}", apiKey: process.env.NOXSEA_API_KEY });

const reply = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Keep this between us." }],
});
console.log(reply.choices[0].message.content);

// Streaming
const stream = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Write a haiku about the sea." }],
  stream: true,
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");`;

const STREAM_CURL = `curl -N ${base}/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${model}","stream":true,"messages":[{"role":"user","content":"Hello"}]}'`;

const EXTRAS = `client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "What changed in the news today?"}],
    extra_body={"compare_with": "${other}", "web_search": True},
)`;

const SIWE = `# 1. Get a nonce, build an EIP-4361 (SIWE) message for ${brand.domain}, sign it with the agent's wallet
curl ${brand.siteUrl}/api/auth/nonce

# 2. Exchange the message and signature for a 1-hour key
curl ${base}/auth/siwe \\
  -H "Content-Type: application/json" \\
  -d '{"message":"<siwe message>","signature":"0x…"}'`;

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
        <a href="#topups">Top-ups</a>
        <a href="#privacy">Privacy</a>
        <a href="#token">Token (planned)</a>
      </nav>
      <article className="prose">
        <h1>{brand.name} API</h1>
        <p className="lead">
          An OpenAI-compatible API for open-weight models. {brand.name} never logs or stores your prompts or completions,
          and you pay per token from the same credit balance as the app.
        </p>

        <h2 id="quickstart">Quickstart</h2>
        <p>
          1. Connect your wallet in the <Link href="/app" style={link}>app</Link> (new wallets with on-chain activity get free credits; top-ups are coming soon). 2. Create a key under{' '}
          <Link href="/app/keys" style={link}>API keys</Link>. 3. Point any OpenAI client at the base URL:
        </p>
        <pre><code>{base}</code></pre>
        <pre><code>{CURL}</code></pre>
        <h3>Python</h3>
        <pre><code>{PY}</code></pre>
        <h3>Node.js</h3>
        <pre><code>{JS}</code></pre>

        <h2 id="auth">Authentication</h2>
        <p>
          Send your key in the <code>Authorization: Bearer</code> header. Keys start with <code>{brand.keyPrefix}</code> and
          are shown once when you create them; we store only a hash, so a lost key can&apos;t be recovered, only replaced.
          Keys created in the app don&apos;t expire. You can hold up to {MAX_API_KEYS} active keys per wallet and revoke any
          of them instantly.
        </p>

        <h2 id="chat">Chat completions</h2>
        <p>
          <code>POST /v1/chat/completions</code> accepts the same body as OpenAI, including <code>messages</code>,{' '}
          <code>stream</code>, <code>tools</code> and <code>temperature</code>, and returns the same response shape with a{' '}
          <code>usage</code> block. With <code>stream: true</code> the reply arrives as server-sent events ending in{' '}
          <code>data: [DONE]</code>:
        </p>
        <pre><code>{STREAM_CURL}</code></pre>
        <p>Two extra fields are available (pass them via <code>extra_body</code> in the OpenAI SDKs):</p>
        <ul>
          <li>
            <code>compare_with</code>: a second model id. The response includes both answers in <code>choices[0]</code> and{' '}
            <code>choices[1]</code>. Each model is charged separately.
          </li>
          <li>
            <code>web_search</code>: <code>true</code> lets the model search the web. Searches are sent from our server, so
            your IP is never shared with the search engine. It costs ×1.6.
          </li>
        </ul>
        <pre><code>{EXTRAS}</code></pre>
        <p>
          Billing is by the tokens actually used, at the per-million-token prices on the{' '}
          <Link href="/#models" style={link}>models table</Link>. {CREDITS_PER_USDG} credits = 1 USDG. Failed requests are
          never charged.
        </p>

        <h2 id="models-api">Models</h2>
        <p>
          <code>GET /v1/models</code> lists the models with context length, prices and live status. Current ids:{' '}
          {MODELS.map((m, i) => (
            <span key={m.id}>
              <code>{m.id}</code>
              {i < MODELS.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>

        <h2 id="errors">Errors</h2>
        <p>Requests that end in an error are never charged.</p>
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Code</th><th>Meaning</th><th>What to do</th></tr>
            </thead>
            <tbody>
              <tr><td className="mono">400</td><td>Invalid request body or unknown model</td><td>Check the fields and model id</td></tr>
              <tr><td className="mono">401</td><td>Missing, invalid or revoked key</td><td>Create a new key in the app</td></tr>
              <tr><td className="mono">402</td><td>Not enough credits</td><td>The request was not charged. Top-ups are coming soon</td></tr>
              <tr><td className="mono">429</td><td>Rate limit reached</td><td>Wait for the <code>retry-after</code> header (seconds)</td></tr>
              <tr><td className="mono">503</td><td>Model or web search temporarily unavailable</td><td>Retry, or switch to another model</td></tr>
            </tbody>
          </table>
        </div>

        <h2 id="limits">Rate limits</h2>
        <p>
          {DEFAULT_API_RATE_LIMIT} requests per minute per key. Over the limit you get a 429 with a{' '}
          <code>retry-after</code> header. Failed and rate-limited requests are never charged.
        </p>

        <h2 id="agents">Agent wallets</h2>
        <p>
          An agent with its own wallet doesn&apos;t need a key from the app. It signs a Sign-In with Ethereum (EIP-4361)
          message and exchanges it at <code>POST /v1/auth/siwe</code> for a key that works for 1 hour. It pays from its own
          credit balance and tops up the same way you do (see below).
        </p>
        <pre><code>{SIWE}</code></pre>
        <p>
          New wallets with some on-chain activity can get the one-time welcome credits (subject to daily limits); a wallet with no history starts at zero.
        </p>

        <h2 id="topups">Top-ups (coming soon)</h2>
        <p>Top-ups aren&apos;t open yet. This is how they will work:</p>
        <ul>
          <li>Send USDG on Robinhood Chain to the treasury address shown in the app&apos;s top-up screen and on the{' '}
            <Link href="/trust#contracts" style={link}>Trust page</Link>.</li>
          <li>Send from the wallet you sign in with. Credits go to the sending address.</li>
          <li>Credits are added automatically after a few block confirmations. 1 USDG = {CREDITS_PER_USDG} credits.</li>
          <li>The minimum top-up is {minTopup} USDG; smaller transfers aren&apos;t credited. Only USDG is credited for now;
            USDC and ETH are planned.</li>
        </ul>

        <h2 id="privacy">Privacy</h2>
        <p>
          {brand.name} relays requests to the model provider over HTTPS and never writes prompts or completions to logs or
          its database. Models are currently served through OpenRouter, restricted to upstream providers that don&apos;t
          collect data and offer zero data retention. Requests are not end-to-end encrypted to the model, and there is no
          hardware attestation yet; that is planned. See the <Link href="/trust" style={link}>Trust page</Link> for the live
          setting.
        </p>

        <h2 id="token">Token (planned)</h2>
        <p>
          The {brand.token.display} is a planned utility token. It has not launched and has no launch date. The current plan is
          that staking it unlocks discounts of up to {maxDiscount}% on messages and early access to new models, with a{' '}
          {UNSTAKE_COOLDOWN_DAYS}-day unstake cooldown. It will not pay revenue, dividends or yield. Details may change
          before launch, and nothing about it affects the API today.
        </p>
      </article>
    </div>
  );
}
