import type { Metadata } from 'next';
import { brand, shortAddress } from '@fathom/config';
import { Icon } from '@/components/Icon';
import { CopyButton } from '@/components/trust/CopyButton';
import { explorerAddressUrl, getAttestation, getContracts, getStatus } from '@/lib/trust';

export const metadata: Metadata = {
  title: 'Trust center',
  description: `Verify ${brand.name}: live enclave attestation, smart contracts, audits and system status.`,
  alternates: { canonical: '/trust' },
};

// Attestation and status are live data once wired, so never serve a stale build.
export const dynamic = 'force-dynamic';

const STATUS_LABEL = { ok: 'Operational', warn: 'Degraded', down: 'Outage' } as const;

export default async function TrustPage() {
  const [att, status] = await Promise.all([getAttestation(), getStatus()]);
  const contracts = getContracts();
  const pending = 'Not live yet';

  return (
    <div className="wrap">
      <div className="trust-hero">
        <span className="tag">Trust center</span>
        <h1 style={{ marginTop: 18 }}>
          Don&apos;t trust us.
          <br />
          Verify us.
        </h1>
        <p>
          Everything we claim about privacy can be checked here: the live enclave report, our contracts, audit status and
          uptime.
        </p>
      </div>

      <div className="tsec">
        <h2>Live attestation</h2>
        <p>Signed by the GPU vendor for the enclave serving you right now.</p>
        <div className="grid2">
          <div className="glass panel" style={{ marginTop: 0 }}>
            <div className="report" style={{ background: 'none', border: 0, padding: 0 }}>
              <div className="kv"><span>Hardware</span><code>{att?.hardware ?? pending}</code></div>
              <div className="kv"><span>Enclave measurement</span><code>{att?.measurement ?? '—'}</code></div>
              <div className="kv"><span>Model weights hash</span><code>{att?.modelHash ?? '—'}</code></div>
              <div className="kv"><span>Serving code commit</span><code>{att?.servingCommit ?? '—'}</code></div>
              <div className="kv"><span>Report signed</span><code>{att?.signedAt ?? '—'}</code></div>
              {att?.verified ? (
                <div className="verdict"><Icon name="shield" /><span>Verified and sealed</span></div>
              ) : (
                <div className="verdict wait">
                  <Icon name="info" />
                  <span>{att ? 'Verification failed' : 'The attestation report appears here once inference goes live.'}</span>
                </div>
              )}
              <button className="btn btn-light verifyBtn" disabled={!att}>Verify again</button>
            </div>
          </div>
          <div className="glass panel" style={{ marginTop: 0 }}>
            <h3>Check it yourself</h3>
            <p className="sub2">You don&apos;t need to trust this page. Run the open-source verifier against our endpoint.</p>
            <div className="prose">
              <pre><code>npx {brand.verifierPackage} {brand.apiUrl}</code></pre>
            </div>
            <p className="sub2">
              It downloads the attestation, checks the vendor signature, and compares the measurement against the build
              published on GitHub.
            </p>
          </div>
        </div>
      </div>

      <div className="tsec">
        <h2>How your data is protected</h2>
        <p>What happens to one message, step by step.</p>
        <div className="enc-steps">
          <div className="glass"><b>1</b><h4>Sealed in your browser</h4><p>Encrypted with a key derived from your wallet signature.</p></div>
          <div className="glass"><b>2</b><h4>Travels as noise</h4><p>Our servers and the network only see ciphertext.</p></div>
          <div className="glass"><b>3</b><h4>Opened in the enclave</h4><p>Only the attested GPU can decrypt and answer.</p></div>
          <div className="glass"><b>4</b><h4>Wiped after reply</h4><p>Memory is cleared. Saved history stays encrypted to you.</p></div>
        </div>
      </div>

      <div className="tsec" id="contracts">
        <h2>Smart contracts</h2>
        <p>All contracts are verified on the Robinhood Chain explorer.</p>
        <div className="glass panel tw" style={{ marginTop: 0 }}>
          <table className="tbl" style={{ marginTop: 0 }}>
            <thead>
              <tr><th>Contract</th><th>Address</th><th>Purpose</th><th /></tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const href = c.address && explorerAddressUrl(c.address);
                return (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className={c.address ? 'mono' : 'mono muted'}>
                      {c.address ? (
                        href ? <a href={href} target="_blank" rel="noopener noreferrer">{shortAddress(c.address)}</a> : shortAddress(c.address)
                      ) : (
                        'Not deployed yet'
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
      </div>

      <div className="tsec">
        <h2>Audits and bug bounty</h2>
        <p>We publish every report, including findings.</p>
        <div className="grid2">
          <div className="glass panel" style={{ marginTop: 0 }}>
            <span className="st pend">In progress</span>
            <h3 style={{ marginTop: 12 }}>Smart contract audit</h3>
            <p className="sub2">
              Independent review of CreditVault, SwapRouter and StakingTiers. The full report is published here before the
              token launches.
            </p>
          </div>
          <div className="glass panel" style={{ marginTop: 0 }}>
            <span className="st ok">Open</span>
            <h3 style={{ marginTop: 12 }}>Bug bounty, up to $50,000</h3>
            <p className="sub2">
              Found a way to read prompts or move funds? Report it to {brand.securityEmail} and get paid.
            </p>
          </div>
        </div>
      </div>

      <div className="tsec" id="status">
        <h2>System status</h2>
        <p>Last 90 days.</p>
        <div className="glass panel" style={{ marginTop: 0 }}>
          {status.map((s) => {
            const today = s.days[s.days.length - 1];
            return (
              <div className="svc" key={s.name}>
                <div className="h">
                  <span>
                    <span className={`st ${today ? (today === 'ok' ? 'ok' : 'bad') : 'none'}`} style={{ marginRight: 10 }}>
                      {today ? STATUS_LABEL[today] : 'No data yet'}
                    </span>
                    {s.name}
                  </span>
                  <small>{s.uptime ? `${s.uptime} uptime` : 'Monitoring starts at launch'}</small>
                </div>
                <div className="uptime" aria-hidden="true">
                  {s.days.map((d, i) => (
                    <i key={i} className={d === 'warn' ? 'w' : d === 'down' ? 'd' : d === 'ok' ? undefined : 'n'} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

