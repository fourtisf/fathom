import Link from 'next/link';
import {
  brand,
  CREDITS_PER_USDG,
  MODELS,
  TIERS,
  UNSTAKE_COOLDOWN_DAYS,
  WELCOME_CREDITS,
  getModel,
} from '@fathom/config';
import { Icon } from '../Icon';
import { Cipher } from './Cipher';
import { CodeTabs } from './CodeTabs';
import { Faq } from './Faq';
import { PricingCalc } from './PricingCalc';

const maxDiscount = Math.max(...TIERS.map((t) => t.discountBps)) / 100;
const delay = (s: number) => ({ transitionDelay: `${s}s` });

function SectionHead({ tag, title, sub }: { tag: string; title: string; sub?: string }) {
  return (
    <div className="shead rv">
      <span className="tag">{tag}</span>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

export function Why() {
  const rows: [string, string, string, string, string?][] = [
    ['Sign up without email', 'Yes, wallet only', 'No', 'Yes'],
    ['Prompts never logged', 'Yes, enclave attested', 'Stored, may train', 'Yes'],
    ['Compare two models at once', 'Yes', 'No', 'No'],
    ['Auto-delete chats', '1h or 24h', 'Manual only', 'Manual only'],
    ['Pay per message', 'From $0.001', '$20/month', 'Yes'],
    ['Pay with any token', 'USDG, USDC, ETH', 'Card only', 'One stablecoin', 'neutral'],
  ];
  const cls = (v: string) => (v.startsWith('Yes') ? 'yes' : 'no');
  return (
    <section id="why">
      <div className="wrap">
        <SectionHead
          tag={`Why ${brand.name}`}
          title="More than private. Actually better to use."
          sub="Privacy is the baseline. These are the reasons people stay."
        />
        <div className="why">
          <div className="cell rv">
            <div className="big-ic"><Icon name="columns" /></div>
            <h3>Ask two models at once</h3>
            <p>Compare mode sends one question to two models and shows the answers side by side. Pick the better one, pay for both at a fraction of a cent.</p>
            <div className="demo-strip"><span>DeepSeek</span><span>vs</span><span>Qwen3</span></div>
          </div>
          <div className="cell rv" style={delay(0.06)}>
            <div className="big-ic"><Icon name="flame" /></div>
            <h3>Chats that self-destruct</h3>
            <p>Set any chat to burn after 1 hour or 24 hours. Even your encrypted copy is wiped, automatically.</p>
            <div className="demo-strip"><span><Icon name="flame" width={13} height={13} style={{ color: 'var(--pink)' }} />Burns in 23h 59m</span></div>
          </div>
          <div className="cell rv" style={delay(0.12)}>
            <div className="big-ic"><Icon name="swap" /></div>
            <h3>Pay with what you hold</h3>
            <p>Top up with USDG, USDC or ETH. We route the swap for you, so you don&apos;t need to hunt for a specific stablecoin first.</p>
            <div className="demo-strip"><span>USDG</span><span>USDC</span><span>ETH</span></div>
          </div>
        </div>
        <div className="cmp-table glass rv tw">
          <table>
            <thead>
              <tr><th /><th className="us">{brand.name}</th><th>Typical AI apps</th><th>Other private AI</th></tr>
            </thead>
            <tbody>
              {rows.map(([label, us, typical, other, otherStyle]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="us yes">{us}</td>
                  <td className="no">{typical}</td>
                  <td className={otherStyle === 'neutral' ? undefined : cls(other)}>{other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function Privacy() {
  const chain = process.env.CHAIN_ID ? `Chain ID: ${process.env.CHAIN_ID}` : 'Chain: Robinhood Chain';
  return (
    <section id="features">
      <div className="wrap">
        <SectionHead
          tag="Privacy"
          title="Private by design, not by promise"
          sub={`Most AI apps promise not to read your chats. ${brand.name} is built so it can't, and you can check.`}
        />
        <div className="bento">
          <div className="cell c-enclave rv">
            <h3>Every model runs in a sealed enclave</h3>
            <p>Inference happens on confidential GPUs with encrypted memory. The proof is public, every session.</p>
            <div className="enc">
              <div className="enc-art" aria-hidden="true">
                <svg viewBox="0 0 260 260" fill="none">
                  <circle className="ring" cx="130" cy="130" r="118" stroke="#8B7CFF" strokeOpacity=".5" strokeDasharray="3 7" />
                  <circle className="ring r2" cx="130" cy="130" r="92" stroke="#5CE1E6" strokeOpacity=".6" strokeDasharray="40 14" strokeWidth="1.5" />
                  <circle cx="130" cy="130" r="66" fill="#0D1238" stroke="rgba(139,124,255,.35)" />
                  <rect x="100" y="100" width="60" height="60" rx="14" fill="url(#g1)" />
                  <path d="M118 131l8 8 17-17" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <g stroke="#8B7CFF" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round">
                    <path d="M112 94v-8M130 94v-8M148 94v-8M112 166v8M130 166v8M148 166v8M94 112h-8M94 130h-8M94 148h-8M166 112h8M166 130h8M166 148h8" />
                  </g>
                  <defs>
                    <linearGradient id="g1" x1="100" y1="100" x2="160" y2="160">
                      <stop stopColor="#8B7CFF" />
                      <stop offset=".5" stopColor="#5B6CFF" />
                      <stop offset="1" stopColor="#38C8E8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              {/* Illustrative sample report; the live one is on /trust. */}
              <div className="report">
                <div className="kv"><span>Hardware</span><code>NVIDIA H100</code></div>
                <div className="kv"><span>Measurement</span><code>a91f…4c0e</code></div>
                <div className="kv"><span>Model hash</span><code>3be7…d218</code></div>
                <div className="kv"><span>Signed</span><code>per session</code></div>
                <div className="verdict"><Icon name="shield" /><span>Verified and sealed</span></div>
                <Link className="btn btn-light" href="/trust">Open full report</Link>
              </div>
            </div>
          </div>
          <div className="cell c-logs rv">
            <h3>Nothing is logged</h3>
            <p>No prompts, no replies, no IP history.</p>
            <div className="viz">
              <div className="logview">
                <div className="lh"><span>prompt_log</span><span>0 rows</span></div>
                <div className="ln">01<s /></div>
                <div className="ln">02<s style={{ maxWidth: '70%' }} /></div>
                <div className="ln">03<s style={{ maxWidth: '85%' }} /></div>
                <div className="empty">Nothing stored. Ever.</div>
              </div>
            </div>
          </div>
          <div className="cell c-wallet rv">
            <h3>Your wallet is your account</h3>
            <p>One signature. No email, no password.</p>
            <div className="viz">
              <div className="siwe">
                <div className="who">
                  <span className="av" />
                  <div>Sign in to {brand.name}<small>0x7a3F…c91E</small></div>
                </div>
                <pre>{`${chain}\nNonce: 8b2e41f0`}</pre>
                <div className="b2"><span>Cancel</span><span>Sign</span></div>
              </div>
            </div>
          </div>
          <div className="cell c-cipher rv">
            <h3>Encrypted before it leaves your screen</h3>
            <p>The network, the cloud and our servers only ever see noise.</p>
            <div className="viz">
              <div className="flow">
                <div className="box"><small>You type</small><p>Help me write a resignation letter that keeps things friendly</p></div>
                <Icon name="arrow" />
                <div className="box enc2"><small>The network sees</small><Cipher /></div>
              </div>
            </div>
          </div>
          <div className="cell c-tools rv">
            <h3>Web search that doesn&apos;t reveal you</h3>
            <p>When the model browses, requests leave from {brand.name}, never from your address.</p>
            <div className="viz">
              <div className="req">
                <div className="row"><span>Query</span><code>best private health clinics</code></div>
                <div className="row"><span>Sent from</span><code>{brand.egressHost}</code></div>
                <div className="row"><span>Your IP</span><span className="hid"><Icon name="chk" />Never shared</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function How() {
  const cheapest = Math.min(...MODELS.map((m) => m.avgMessageCredits));
  const priciest = Math.max(...MODELS.map((m) => m.avgMessageCredits));
  return (
    <section id="how">
      <div className="wrap">
        <SectionHead tag="How it works" title="Up and running in a minute" sub="No sign-up form, no subscription, no card on file." />
        <div className="steps">
          <div className="step rv">
            <div className="n">1</div>
            <h3>Connect your wallet</h3>
            <p>Sign one message to prove it&apos;s yours. It costs no gas. You get {WELCOME_CREDITS} free credits.</p>
            <div className="mini"><Icon name="wal" />Robinhood, MetaMask, Rabby<b>1 click</b></div>
          </div>
          <div className="step rv" style={delay(0.08)}>
            <div className="n">2</div>
            <h3>Top up with any token</h3>
            <p>Pay in USDG, USDC or ETH. New to crypto? We walk you through getting USDG.</p>
            <div className="mini"><Icon name="coin" />1 USDG<b>{CREDITS_PER_USDG} credits</b></div>
          </div>
          <div className="step rv" style={delay(0.16)}>
            <div className="n">3</div>
            <h3>Ask, compare, burn</h3>
            <p>Pay a fraction of a credit per message. Compare models or set chats to self-destruct.</p>
            <div className="mini"><Icon name="spark" />Typical message<b>{cheapest.toFixed(1)}–{priciest.toFixed(1)} cr</b></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Models() {
  return (
    <section id="models">
      <div className="wrap">
        <SectionHead
          tag="Models"
          title="The best open models, in one place"
          sub="All open source, so anyone can audit what's answering you. Prices in credits per million tokens."
        />
        <div className="models rv">
          <div className="mh"><span>Model</span><span>Best for</span><span>Context</span><span>Input</span><span>Output</span></div>
          {MODELS.map((m) => (
            <div className="mr" key={m.id}>
              <div className="mn">
                <span className="mlogo" style={{ background: m.logo.color }}>{m.logo.letter}</span>
                <div><b>{m.name}</b><small>{m.tableBlurb}</small></div>
              </div>
              <div className="chips">{m.bestFor.map((b) => <span key={b}>{b}</span>)}</div>
              <div className="num"><span className="lbl">Context</span>{m.contextK}K</div>
              <div className="num"><span className="lbl">Input</span>{m.inputPerM}</div>
              <div className="num"><span className="lbl">Output</span>{m.outputPerM}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing">
      <div className="wrap">
        <SectionHead tag="Pricing" title="Pay for messages, not months" sub="No subscription. Most people spend a few dollars a month." />
        <div className="price">
          <div className="pcard dark rv">
            <div className="lab">Pay as you go</div>
            <div className="big"><b>$1</b><span>= {CREDITS_PER_USDG} credits</span></div>
            <p>Top up with USDG, USDC or ETH. Spend only on what you send.</p>
            <ul className="plist">
              <li><Icon name="chk" />Credits never expire</li>
              <li><Icon name="chk" />Same balance for app and API</li>
              <li><Icon name="chk" />{WELCOME_CREDITS} free credits when you join</li>
              <li><Icon name="chk" />Up to {maxDiscount}% off with {brand.token.ticker} staking</li>
            </ul>
            <Link className="btn btn-lg" href="/app">Start free</Link>
          </div>
          <PricingCalc />
        </div>
      </div>
    </section>
  );
}

const model = getModel('deepseek-v3.1')!.id;
const k = (s: string) => `<span class="k">${s}</span>`;
const f = (s: string) => `<span class="f">${s}</span>`;
const str = (s: string) => `<span class="s">${s}</span>`;
const c = (s: string) => `<span class="c">${s}</span>`;
const keyHint = `${brand.keyPrefix}…`;

const PY = `${k('from')} openai ${k('import')} OpenAI

client = ${f('OpenAI')}(
    base_url=${str(`"${brand.apiBaseUrl}"`)},  ${c('# 1. new URL')}
    api_key=${str(`"${keyHint}"`)},                 ${c('# 2. your key')}
)

reply = client.chat.completions.${f('create')}(
    model=${str(`"${model}"`)},
    messages=[{${str('"role"')}: ${str('"user"')}, ${str('"content"')}: ${str('"Keep this between us."')}}],
)
${f('print')}(reply.choices[0].message.content)`;

const JS = `${k('import')} OpenAI ${k('from')} ${str('"openai"')};

${k('const')} client = ${k('new')} ${f('OpenAI')}({
  baseURL: ${str(`"${brand.apiBaseUrl}"`)}, ${c('// 1. new URL')}
  apiKey: ${str(`"${keyHint}"`)},                ${c('// 2. your key')}
});

${k('const')} reply = ${k('await')} client.chat.completions.${f('create')}({
  model: ${str(`"${model}"`)},
  messages: [{ role: ${str('"user"')}, content: ${str('"Keep this between us."')} }],
});`;

const SH = `curl ${brand.apiBaseUrl}/chat/completions \\
  -H ${str(`"Authorization: Bearer ${keyHint}"`)} \\
  -H ${str('"Content-Type: application/json"')} \\
  -d ${str(`'{"model":"${model}",
       "messages":[{"role":"user","content":"Keep this between us."}]}'`)}`;

export function Api() {
  return (
    <section id="api">
      <div className="wrap api">
        <div className="rv">
          <div className="shead">
            <span className="tag">API</span>
            <h2>Switch to private in two lines</h2>
            <p>{brand.name} uses the OpenAI format. Change the URL and key, keep the rest.</p>
          </div>
          <div className="api-list">
            <div>
              <span className="ic"><Icon name="wal" /></span>
              <div><h4>One balance for everything</h4><p>API calls use the same wallet credits as the app.</p></div>
            </div>
            <div>
              <span className="ic"><Icon name="bolt" /></span>
              <div><h4>Agents that pay for themselves</h4><p>Give an agent a wallet and USDG. It signs in and buys credits on its own.</p></div>
            </div>
            <div>
              <span className="ic"><Icon name="book" /></span>
              <div>
                <h4>Full documentation</h4>
                <p><Link href="/docs" style={{ color: 'var(--violet2)' }}>Read the docs</Link> for errors, limits and agent wallets.</p>
              </div>
            </div>
          </div>
        </div>
        <CodeTabs
          tabs={[
            { id: 'py', label: 'Python', html: PY },
            { id: 'js', label: 'Node.js', html: JS },
            { id: 'sh', label: 'cURL', html: SH },
          ]}
        />
      </div>
    </section>
  );
}

export function Token() {
  return (
    <section id="token">
      <div className="wrap">
        <div className="token glass rv">
          <div>
            <span className="tag">{brand.token.ticker} token</span>
            <h2 style={{ marginTop: 16 }}>Stake to pay less and get more</h2>
            <p>
              {brand.token.ticker} is a utility token. Stake it to unlock up to {maxDiscount}% off every message, early access to
              new models, and free monthly credits.
            </p>
            <div className="ctas">
              <Link className="btn btn-dark" href="/app/stake">See staking tiers</Link>
              <Link className="btn btn-light" href="/docs#token">How it works</Link>
            </div>
          </div>
          <div className="stats">
            {TIERS.map((t) => (
              <div key={t.id}><span>{t.name} tier</span><b>{t.discountBps / 100}% off</b></div>
            ))}
            <div><span>Unstake cooldown</span><b>{UNSTAKE_COOLDOWN_DAYS} days</b></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqAndCta() {
  const link = { color: 'var(--violet2)' };
  return (
    <section id="faq">
      <div className="wrap">
        <SectionHead tag="FAQ" title="Common questions" />
        <Faq
          items={[
            {
              q: 'Do I need an email or ID?',
              a: "No. Your wallet signature is the only sign-in. There's no email, phone number or identity check anywhere.",
            },
            {
              q: 'How can I be sure nothing is logged?',
              a: (
                <>
                  Every session runs in a hardware enclave that publishes a signed attestation report. You can verify it
                  yourself on the <Link href="/trust" style={link}>Trust page</Link>, together with our contract addresses
                  and audit status.
                </>
              ),
            },
            {
              q: "I don't have USDG. Can I still pay?",
              a: "Yes. Top up with USDC or ETH and we route the swap for you. If you're new to crypto, the app has a short guide to getting USDG through Robinhood Wallet.",
            },
            {
              q: `Is ${brand.token.ticker} an investment?`,
              a: `No. ${brand.token.ticker} is a utility token that gives stakers discounts and early access inside ${brand.name}. It doesn't entitle holders to revenue, dividends or profits.`,
            },
            {
              q: 'What if I lose my wallet?',
              a: 'Your credits and saved chats belong to that wallet. Without it, nobody can recover them, including us. Keep your recovery phrase safe.',
            },
          ]}
        />
        <div className="cta rv">
          <div className="aurora" aria-hidden="true"><i /><i /><i /><i /></div>
          <h2>Ask the question you&apos;d never type anywhere else</h2>
          <p>Connect a wallet and get {WELCOME_CREDITS} free credits. No card, no email, no trace.</p>
          <Link className="btn btn-dark btn-lg" href="/app">Launch the app</Link>
        </div>
      </div>
    </section>
  );
}
