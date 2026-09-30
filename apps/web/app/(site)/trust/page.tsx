import type { Metadata } from 'next';
import { brand, shortAddress } from '@fathom/config';
import { Icon } from '@/components/Icon';
import { CopyButton } from '@/components/trust/CopyButton';
import { explorerAddressUrl, getAddresses, getInferenceInfo, getStatus } from '@/lib/trust';

export const metadata: Metadata = {
  title: 'Trust center',
  description: `Where your messages go with ${brand.name}: the model provider, what we log (nothing), on-chain addresses, security contact and system status.`,
  alternates: { canonical: '/trust' },
};

// Provider, addresses and status are read at request time, so never serve a stale build.
export const dynamic = 'force-dynamic';

const REPO_URL = 'https://github.com/fourtisf/fathom';
const STATUS_LABEL = { ok: 'Operational', warn: 'Degraded', down: 'Outage' } as const;

export default async function TrustPage() {
  const info = getInferenceInfo();
  const status = await getStatus();
  const addresses = getAddresses();
  const link = { color: 'var(--violet2)' };

  return (
    <div className="wrap">
      <div className="trust-hero">
        <span className="tag">Trust center</span>
        <h1 style={{ marginTop: 18 }}>
          Plain facts,
          <br />
          no fine print.
        </h1>
        <p>
          Where your messages go, what we keep (as little as possible), our on-chain addresses and uptime. If something
          isn&apos;t built yet, this page says so.
        </p>
      </div>

      <div className="tsec">
        <h2>Where your messages go</h2>
        <p>The model provider this server is configured to use right now.</p>
        <div className="grid2">
          <div className="glass panel" style={{ marginTop: 0 }}>
            <div className="report" style={{ background: 'none', border: 0, padding: 0 }}>
              <div className="kv"><span>Provider</span><code>{info.provider}</code></div>
              {info.rows.map(([k, v]) => (
                <div className="kv" key={k}><span>{k}</span><code>{v}</code></div>
              ))}
              <div className={info.connected && info.tee ? 'verdict' : 'verdict wait'}>
                <Icon name={info.connected ? 'shield' : 'info'} />
                <span>{info.summary}</span>
              </div>
            </div>
            {!info.tee && (
              <p className="note">
                Confidential-computing inference with a public attestation report is planned. Until it ships, we don&apos;t
                claim hardware-level privacy.
              </p>
            )}
          </div>
          <div className="glass panel" style={{ marginTop: 0 }}>
            <h3>What we log: nothing</h3>
            <p className="sub2">
              {brand.name} never writes your prompts or answers to logs, databases, error trackers or analytics, and we
              don&apos;t log IP addresses.
            </p>
            <ul className="facts">
              <li><Icon name="chk" />Request bodies are excluded from every logger.</li>
              <li><Icon name="chk" />No readable chat text in the database. Saved history is ciphertext only.</li>
              <li><Icon name="chk" />Web access logs are off for the app and API.</li>
            </ul>
            <p className="sub2" style={{ marginTop: 14 }}>
              This is enforced by an automated test that fails if any logger or table receives message content. The code
              is open source, so you can run it yourself:
            </p>
            <div className="prose">
              <pre><code>{`git clone ${REPO_URL}\npnpm install\npnpm --filter @fathom/api test no-logging`}</code></pre>
            </div>
            <p className="note">
              Test: <code>apps/api/test/no-logging.test.ts</code> in{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">the {brand.name} repository</a>.
            </p>
          </div>
        </div>
      </div>

      <div className="tsec">
        <h2>How your data is protected</h2>
        <p>What happens to one message, step by step.</p>
        <div className="enc-steps">
          <div className="glass">
            <b>1</b>
            <h4>Encrypted in transit</h4>
            <p>Your browser sends it to {brand.name} over HTTPS. The network only sees ciphertext.</p>
          </div>
          <div className="glass">
            <b>2</b>
            <h4>Relayed, never logged</h4>
            <p>Our server checks your credits and forwards it over HTTPS. It is never written to logs or the database.</p>
          </div>
          <div className="glass">
            <b>3</b>
            <h4>{info.step.title}</h4>
            <p>{info.step.text}</p>
          </div>
          <div className="glass">
            <b>4</b>
            <h4>Saved only if you choose</h4>
            <p>With history on, chats are encrypted in your browser with a key from your wallet signature. We store only ciphertext.</p>
          </div>
        </div>
      </div>

      <div className="tsec" id="contracts">
        <h2>On-chain addresses</h2>
        <p>Top-ups are coming soon. They will be plain USDG transfers on Robinhood Chain that anyone can check on the explorer.</p>
        <div className="glass panel tw" style={{ marginTop: 0 }}>
          <table className="tbl" style={{ marginTop: 0 }}>
            <thead>
              <tr><th>Name</th><th>Address</th><th>Purpose</th><th /></tr>
            </thead>
            <tbody>
              {addresses.map((c) => {
                const href = c.address && explorerAddressUrl(c.address);
                return (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className={c.address ? 'mono' : 'mono muted'}>
                      {c.address ? (
                        href ? <a href={href} target="_blank" rel="noopener noreferrer">{shortAddress(c.address)}</a> : shortAddress(c.address)
                      ) : (
                        'Not set'
                      )}
                    </td>
                    <td>{c.purpose}</td>
                    <td>{c.address && <CopyButton text={c.address} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          The {brand.token.ticker} token and staking contracts are not deployed. {brand.token.ticker} is a planned utility
          token with no launch date.
        </p>
      </div>

      <div className="tsec">
        <h2>Security</h2>
        <p>How funds are held and how to report a problem.</p>
        <div className="grid2">
          <div className="glass panel" style={{ marginTop: 0 }}>
            <span className="st ok">No custom contracts</span>
            <h3 style={{ marginTop: 12 }}>Funds and contracts</h3>
            <p className="sub2">
              No custom contract holds funds: when top-ups open, they will go straight to the treasury address above as ordinary
              USDG transfers, credited after the transfer is confirmed. Any future contract (such as {brand.token.ticker} or
              staking) is planned to get an independent audit before launch, with the report published here.
            </p>
          </div>
          <div className="glass panel" style={{ marginTop: 0 }}>
            <span className="st pend">Planned</span>
            <h3 style={{ marginTop: 12 }}>Bug bounty</h3>
            <p className="sub2">
              A paid bug bounty is planned. Until then, if you find a way to read someone&apos;s messages, move funds or get
              credits you didn&apos;t pay for, please report it to{' '}
              <a href={`mailto:${brand.securityEmail}`} style={link}>{brand.securityEmail}</a>.
            </p>
          </div>
        </div>
      </div>

      <div className="tsec" id="status">
        <h2>System status</h2>
        <p>Last 90 days.</p>
        <div className="glass panel" style={{ marginTop: 0 }}>
          {status.map((s) => (
            <div className="svc" key={s.name}>
              <div className="h">
                <span>
                  <span className={`st ${s.today ? (s.today === 'ok' ? 'ok' : 'bad') : 'none'}`} style={{ marginRight: 10 }}>
                    {s.today ? STATUS_LABEL[s.today] : 'No data yet'}
                  </span>
                  {s.name}
                </span>
                <small>{s.uptime ? `${s.uptime} uptime` : 'No data yet'}</small>
              </div>
              <div className="uptime" aria-hidden="true">
                {s.days.map((d, i) => (
                  <i key={i} className={d === 'warn' ? 'w' : d === 'down' ? 'd' : d === 'ok' ? undefined : 'n'} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
