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
  description: `${brand.name} API: an OpenAI-compatible API for open models and Claude Opus 5.5, with no prompt logging and pay-per-token credits.`,
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
        <h6>In the app</h6>
        <a href="#app-tools">Chat tools</a>
        <a href="#share">Share links</a>
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
          An OpenAI-compatible API for the latest open-weight models, plus Claude Opus 5.5 as a premium closed model. {brand.name} never logs or stores your prompts or completions,
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

        <h2 id="app-tools">Chat tools</h2>
        <p>
          These tools live in the chat at <Link href="/app" style={link}>noxsea.xyz/app</Link>, in the bar under the message
          box (icons on phones). They are part of the app; the API stays a plain OpenAI-compatible model API.
        </p>
        <ul>
          <li>
            <b>Check token.</b> Paste a token address from Robinhood Chain, Solana, Ethereum, Base, BNB Chain, Arbitrum,
            Polygon, Optimism or Avalanche ({brand.name} finds the chain an 0x address is on; add &ldquo;on Base&rdquo; to pick
            one). It reads public on-chain data and shows a risk card: mint and blacklist functions, adjustable taxes, trading
            switches, pause, owner and renounce status, upgradeable proxies and top-holder concentration. On Solana it checks
            mint and freeze authority and Token-2022 extensions such as transfer fees and permanent delegates. Liquidity and
            pool age come from DexScreener, and on EVM chains other than Robinhood Chain, honeypot, tax and holder checks come
            from GoPlus. Lookups leave from our servers, so these services never see your IP. The AI explains each flag. Automatic checks can miss honeypots and liquidity pulls; this is not financial advice. The
            same check is free at <Link href="/scan" style={link}>noxsea.xyz/scan</Link>, with no wallet and no credits (10 scans
            a minute, 150 a day). We don&apos;t keep a record of who scanned what, and a link like <code>/scan?address=0x…</code> opens a scan directly.
          </li>
          <li>
            <b>Voice.</b> Tap the microphone to speak instead of typing. Your speech is turned into text by Whisper running
            inside your browser (a one-time download from {brand.name}; after that it loads from your browser cache),
            so audio never leaves your device. Check the text, then send it. After a spoken question the answer is read aloud
            by your device&apos;s own voice; turn that off under Settings → Voice, or press Listen on any answer.
          </li>
          <li>
            <b>Images.</b> Attach a screenshot, chart or photo (or paste it into the message box) and ask about it. An
            open-weight vision model reads it. The image is resized in your browser and sent with that message only; it
            is never stored, and saved chats keep only a note that an image was there.
          </li>
          <li>
            <b>Research.</b> Turn on Research and ask a big question. {brand.name} plans several web searches, runs them
            from its own servers (your IP stays hidden) and writes a report with every claim cited. It costs more than a
            normal answer and is charged only when the report finishes.
          </li>
          <li>
            <b>Audit.</b> Press Audit (or write &ldquo;audit&rdquo; and a 0x address). The contract&apos;s verified source
            code is fetched from Sourcify, Etherscan or the block explorer, upgradeable proxies are followed to their logic
            contract, and the AI reviews it function by function. This is an automated review, not a professional audit.
          </li>
          <li>
            <b>Image.</b> Switch to Image, pick a shape and describe what you want. An open-weight image model draws it for
            a fixed number of credits, charged only when the image arrives. Prompts and images are not stored; download
            the image to keep it.
          </li>
          <li>
            <b>Memory.</b> Under Settings → Memory, save facts the assistant should know about you. They are encrypted in
            your browser with your wallet key and we keep only ciphertext. While memory is on, the facts are sent with your
            messages (never logged); turn it off or forget any fact at any time.
          </li>
          <li>
            <b>Live prices.</b> Ask a price question (&ldquo;ETH price today?&rdquo;, &ldquo;$PEPE price?&rdquo;) and the answer
            uses live CoinGecko data, shown above the reply. No button needed.
          </li>
          <li>
            <b>Attach.</b> Add a PDF or a text file (.txt, .md, .csv, .json, .sol) up to 20 MB. It is read inside your browser
            and never uploaded; only the extracted text is sent with your question. Scanned PDFs without selectable text
            can&apos;t be read.
          </li>
          <li>
            <b>Mode.</b> Contract auditor, Memecoin researcher, Explain simply, Web3 developer or Crypto writer. The mode
            changes how the assistant answers; pricing stays the same.
          </li>
          <li>
            <b>Compare.</b> Sends one question to two models and shows both answers side by side. Each answer is charged
            separately.
          </li>
        </ul>
        <p>
          On-chain and price lookups are made from our servers, so your IP address isn&apos;t exposed. Only the address or
          coin name is sent, never your message.
        </p>

        <h2 id="share">Share links</h2>
        <p>
          Under a chat, <b>Share</b> creates a link to a read-only copy. Your browser encrypts the chat with a new key and puts
          the key after the <code>#</code> in the link, which browsers never send to servers, so {brand.name} stores only
          ciphertext. Links expire after 1, 7 or 30 days and can be deleted any time in{' '}
          <Link href="/app/settings" style={link}>Settings</Link>. Attached documents are never included.
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
