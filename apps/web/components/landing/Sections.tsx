import Link from 'next/link';
import { ContractAddress } from '../site/ContractAddress';
import {
  brand,
  CREDITS_PER_USDG,
  MODELS,
  TIERS,
  UNSTAKE_COOLDOWN_DAYS,
  WELCOME_CREDITS,
  getModel,
  contextLabel,
} from '@fathom/config';
import { Icon } from '../Icon';
import { Cipher } from './Cipher';
import { CodeTabs } from './CodeTabs';
import { Faq } from './Faq';
import { PricingCalc } from './PricingCalc';
import { ModelLogo } from '../ModelLogo';

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
  // Compares typical default settings, not every product: claims about others stay generic.
  const rows: [string, string, string, string][] = [
    ['Sign up without email', 'Yes, wallet only', 'Usually not', 'Varies'],
    ['Prompts never logged', 'Yes, never logged or stored', 'Often stored', 'Usually'],
    ['Compare two models at once', 'Yes', 'Rarely', 'Rarely'],
    ['Auto-delete chats', '1h or 24h', 'Usually manual', 'Varies'],
    ['Pay per message', 'From about $0.001', 'Monthly plan', 'Varies'],
    ['Pay with crypto, no card', 'Yes, USDG', 'Usually card', 'Varies'],
  ];
  const cls = (v: string) => (v.startsWith('Yes') ? 'yes' : v === 'Varies' || v === 'Usually' ? undefined : 'no');
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
            <p>Set any chat to burn after 1 hour or 24 hours. If you save history, even the encrypted copy is deleted automatically.</p>
            <div className="demo-strip"><span><Icon name="flame" width={13} height={13} style={{ color: 'var(--pink)' }} />Burns in 23h 59m</span></div>
          </div>
          <div className="cell rv" style={delay(0.12)}>
            <div className="big-ic"><Icon name="swap" /></div>
            <h3>Pay per message in USDG</h3>
            <p>Top-ups with USDG on Robinhood Chain are coming soon. No subscription, no card. Start today with free credits.</p>
            <div className="demo-strip"><span>USDG · soon</span><span>USDC · later</span><span>ETH · later</span></div>
          </div>
        </div>
        <div className="cmp-table glass rv tw">
          <table>
            <thead>
              <tr><th /><th className="us">{brand.name}</th><th>Typical AI apps</th><th>Other private AI</th></tr>
            </thead>
            <tbody>
              {rows.map(([label, us, typical, other]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="us yes">{us}</td>
                  <td className={cls(typical)}>{typical}</td>
                  <td className={cls(other)}>{other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cmp-note rv">
          Compares typical default settings of popular AI chat apps and privacy-focused AI services. Individual products and
          plans vary.
        </p>
      </div>
    </section>
  );
}

const TOOLS: { title: string; text: string; icon: string; tag?: string; link?: [string, string] }[] = [
  {
    title: 'Token Safety Check',
    text: 'Paste a token address from Robinhood Chain, Solana, Ethereum, Base, BNB Chain and more. Get the red flags in seconds: mint and freeze powers, honeypots, taxes, liquidity and top-holder concentration.',
    icon: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z M9 12l2 2 4-4',
    tag: 'New',
    link: ['/scan', 'Scan a token free, no wallet →'],
  },
  {
    title: 'Talk to it, privately',
    text: "Speak instead of typing. Whisper runs inside your browser to turn your voice into text, so audio never leaves your device, and answers can be read aloud by your device's own voice.",
    icon: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3',
    tag: 'New',
  },
  {
    title: 'Reads your screenshots',
    text: 'Paste a chart, a tweet or a document photo and ask about it. An open-weight vision model reads it; the image is sent with that message only and never stored.',
    icon: 'M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z M8.5 11a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z M21 16l-5-5-9 9',
    tag: 'New',
  },
  {
    title: 'Deep Research',
    text: 'Ask a big question and get a report: several web searches run from our servers, and every claim is cited to its source.',
    icon: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M20 20l-4.2-4.2 M8.5 11h5 M11 8.5v5',
    tag: 'New',
  },
  {
    title: 'Contract audits',
    text: 'Paste a contract address and the verified source code is fetched and reviewed function by function: owner powers, hidden fees, upgrade risks.',
    icon: 'M8 6l-6 6 6 6 M16 6l6 6-6 6',
    tag: 'New',
  },
  {
    title: 'Create images',
    text: 'Describe a meme, banner or logo and an open-weight image model draws it. A fixed price per image, charged only when it arrives.',
    icon: 'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
    tag: 'New',
  },
  {
    title: 'Private memory',
    text: 'Tell it what to remember about you. Memory is encrypted in your browser with your wallet key, so we only ever hold ciphertext.',
    icon: 'M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3z M9 22h6',
    tag: 'New',
  },
  {
    title: 'Live prices',
    text: 'Ask about BTC, ETH, SOL or any $TICKER and the answer uses live CoinGecko data instead of old training data.',
    icon: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  },
  {
    title: 'Read PDFs privately',
    text: 'Attach a whitepaper or audit. It\'s read inside your browser and never uploaded; only the text goes into your message.',
    icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  },
  {
    title: 'Encrypted share links',
    text: 'Share a chat with a link that carries its own key. We store only ciphertext, and links expire in 1 to 30 days.',
    icon: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1 M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  },
  {
    title: 'Expert modes',
    text: 'Switch to Contract auditor, Memecoin researcher, Web3 developer, Crypto writer or Explain simply in one click.',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  },
];

export function Tools() {
  return (
    <section id="tools">
      <div className="wrap">
        <SectionHead
          tag="Built for crypto"
          title="Tools for the onchain world"
          sub="Everything runs through the same private pipeline: no prompt logs, and outside lookups leave from our servers so your IP stays hidden."
        />
        <div className="tools-grid">
          {TOOLS.map((t) => (
            <div key={t.title} className="cell glass tool-card rv">
              <div className="tool-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {t.icon.split(' M').map((d, i) => (
                    <path key={i} d={i ? `M${d}` : d} />
                  ))}
                </svg>
              </div>
              <h3>
                {t.title}
                {t.tag && <em className="tool-tag">{t.tag}</em>}
              </h3>
              <p>{t.text}</p>
              {t.link && (
                <Link className="tool-link" href={t.link[0]}>
                  {t.link[1]}
                </Link>
              )}
            </div>
          ))}
          <div className="cell tool-card tool-cta rv">
            <h3>Try them now</h3>
            <p>Sign in with your wallet. No email, no card.</p>
            <Link className="btn btn-dark" href="/app">
              Launch app
            </Link>
          </div>
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
          sub={`${brand.name} keeps only what it needs to run your account. Your prompts and answers aren't logged or stored, and the code is open source so you can check.`}
        />
        <div className="bento">
          <div className="cell c-enclave rv">
            <h3>What happens to a message</h3>
            <p>It travels encrypted, is answered by an open model through zero-data-retention providers, and isn&apos;t kept by us.</p>
            <div className="enc">
              <div className="enc-art" aria-hidden="true">
                <svg viewBox="0 0 260 260" fill="none">
                  <circle className="ring" cx="130" cy="130" r="118" stroke="#8B7CFF" strokeOpacity=".5" strokeDasharray="3 7" />
                  <circle className="ring r2" cx="130" cy="130" r="92" stroke="#5CE1E6" strokeOpacity=".6" strokeDasharray="40 14" strokeWidth="1.5" />
                  <circle cx="130" cy="130" r="66" fill="#0D1238" stroke="rgba(139,124,255,.35)" />
                  <rect x="100" y="100" width="60" height="60" rx="14" fill="url(#g1)" />
                  {/* Padlock: the message is encrypted in transit and never kept. */}
                  <path d="M120 127v-7a10 10 0 0 1 20 0v7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
                  <rect x="114" y="127" width="32" height="22" rx="5" stroke="#fff" strokeWidth="3.5" />
                  <g fill="#5CE1E6">
                    <circle cx="130" cy="12" r="3.5" />
                    <circle cx="222" cy="130" r="3" fillOpacity=".7" />
                    <circle cx="44" cy="164" r="2.5" fillOpacity=".5" />
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
              {/* How one message is handled today; /trust shows the live provider setting. */}
              <div className="report">
                <div className="kv"><span>In transit</span><code>HTTPS (TLS)</code></div>
                <div className="kv"><span>{brand.name} logs</span><code>None</code></div>
                <div className="kv"><span>Model routing</span><code>Zero data retention</code></div>
                <div className="kv"><span>Saved history</span><code>Encrypted in browser</code></div>
                <div className="verdict"><Icon name="shield" /><span>Nothing readable stored</span></div>
                <Link className="btn btn-light" href="/trust">See the details</Link>
              </div>
            </div>
          </div>
          <div className="cell c-logs rv">
            <h3>Nothing is logged</h3>
            <p>No prompts, no replies, no IP addresses in our logs.</p>
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
            <h3>Encrypted in transit and in history</h3>
            <p>Messages travel over HTTPS, so the network only sees noise. Saved history is encrypted in your browser first.</p>
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
                <div className="row"><span>Sent from</span><code>{brand.name} server</code></div>
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
            <p>Sign one message to prove it&apos;s yours. It costs no gas. New wallets with on-chain activity get {WELCOME_CREDITS} free credits.</p>
            <div className="mini"><Icon name="wal" />Robinhood, MetaMask, Rabby<b>1 click</b></div>
          </div>
          <div className="step rv" style={delay(0.08)}>
            <div className="n">2</div>
            <h3>Top up with USDG · soon</h3>
            <p>Top-ups with USDG on Robinhood Chain are coming soon. Until then, new wallets start with free credits.</p>
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
          sub="The newest open-weight models of 2026, not one company's black box. Prices in credits per million tokens."
        />
        <div className="models rv">
          <div className="mh"><span>Model</span><span>Best for</span><span>Context</span><span>Input</span><span>Output</span></div>
          {MODELS.map((m) => (
            <div className="mr" key={m.id}>
              <div className="mn">
                <ModelLogo model={m.id} size={40} />
                <div>
                  <b>
                    {m.name}
                    {m.badge && m.badge !== 'Default' && <i className={`mm-badge b-${m.badge.toLowerCase()}`}>{m.badge}</i>}
                  </b>
                  <small>{m.tableBlurb}</small>
                </div>
              </div>
              <div className="chips">{m.bestFor.map((b) => <span key={b}>{b}</span>)}</div>
              <div className="num"><span className="lbl">Context</span>{contextLabel(m.contextK)}</div>
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
            <p>USDG top-ups are coming soon. Spend only on what you send, charged by the tokens used.</p>
            <ul className="plist">
              <li><Icon name="chk" />Credits never expire</li>
              <li><Icon name="chk" />Same balance for app and API</li>
              <li><Icon name="chk" />{WELCOME_CREDITS} free credits for new wallets*</li>
              <li><Icon name="chk" />Failed requests are never charged</li>
            </ul>
            <Link className="btn btn-lg" href="/app">Start free</Link>
            <p className="pfine">* Wallets with some on-chain activity, once per address, subject to daily limits.</p>
          </div>
          <PricingCalc />
        </div>
      </div>
    </section>
  );
}

const model = getModel('deepseek-v4-pro')!.id;
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
              <div><h4>Agents that pay for themselves</h4><p>Give an agent a wallet and USDG. It signs in with its own signature and tops up by sending USDG.</p></div>
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
            <span className="tag">Token · planned</span>
            <h2 style={{ marginTop: 16 }}>A utility token for paying less</h2>
            <p>
              The {brand.token.display} is a planned utility token. It has not launched and there is no date. The plan: stake it to
              unlock up to {maxDiscount}% off every message, early access to new models and free monthly credits. No revenue,
              no yield. Details may change before launch.
            </p>
            <ContractAddress full className="ca-token" />
            <div className="ctas">
              <Link className="btn btn-dark" href="/docs#token">Read the plan</Link>
              <Link className="btn btn-light" href="/app/stake">Planned tiers</Link>
            </div>
          </div>
          <div className="stats">
            {TIERS.map((t) => (
              <div key={t.id}><span>{t.name} tier (planned)</span><b>{t.discountBps / 100}% off</b></div>
            ))}
            <div><span>Unstake cooldown (planned)</span><b>{UNSTAKE_COOLDOWN_DAYS} days</b></div>
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
                  {brand.name}&apos;s code never writes prompts or answers to logs, databases or analytics, and an automated
                  test in our open-source repository fails if it ever does. Models are reached through OpenRouter, restricted
                  to providers that don&apos;t store or train on your data. That part is the providers&apos; policy, not a
                  hardware proof: confidential-computing attestation is planned. Details are on the{' '}
                  <Link href="/trust" style={link}>Trust page</Link>.
                </>
              ),
            },
            {
              q: 'Are my prompts end-to-end encrypted?',
              a: `Not to the model, yet. Your prompt is encrypted in transit (HTTPS) to ${brand.name}, which forwards it over HTTPS to the model provider without logging or storing it. Saved chat history is different: it's encrypted in your browser with a key from your wallet signature, so we only store ciphertext.`,
            },
            {
              q: "I don't have USDG. Can I still pay?",
              a: "Top-ups are coming soon, starting with USDG on Robinhood Chain; USDC and ETH come later. Until then, new wallets with on-chain activity get free credits to try every model.",
            },
            {
              q: `Is the ${brand.token.display} an investment?`,
              a: `No. The ${brand.token.display} is a planned utility token and hasn't launched. If it launches, it is meant for discounts and early access inside ${brand.name}. It won't entitle holders to revenue, dividends or profits.`,
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
          <p>New wallets with on-chain activity can get {WELCOME_CREDITS} free credits. No card, no email, no prompt logs.</p>
          <Link className="btn btn-dark btn-lg" href="/app">Launch the app</Link>
        </div>
      </div>
    </section>
  );
}
