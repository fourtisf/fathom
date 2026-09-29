import Link from 'next/link';
import { getModel, WELCOME_CREDITS } from '@fathom/config';
import { Icon } from '../Icon';

const ds = getModel('deepseek-v3.1')!;
const qw = getModel('qwen3-235b')!;

/** Hero plus the static app preview. The preview is an illustration, not live data. */
export function Hero() {
  return (
    <div className="hero">
      <div className="aurora" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="grid-lines" aria-hidden="true" />
      <div className="beam" aria-hidden="true" />
      <div className="stars" aria-hidden="true" />
      <div className="wrap">
        <Link href="/trust" className="pill up">
          <b>New</b>Live on Robinhood Chain · verify our enclave<Icon name="arrow" />
        </Link>
        <h1 className="up" style={{ transitionDelay: '.08s' }}>
          The AI that <span className="grad">forgets you</span> on purpose
        </h1>
        <p className="lede up" style={{ transitionDelay: '.16s' }}>
          Compare the best open models side by side, inside sealed hardware. Sign in with your wallet, pay per message
          with any token, and set chats to self-destruct.
        </p>
        <div className="ctas up" style={{ transitionDelay: '.24s' }}>
          <Link className="btn btn-dark btn-lg" href="/app">Start free, {WELCOME_CREDITS} credits</Link>
          <Link className="btn btn-light btn-lg" href="/trust">Verify the privacy</Link>
        </div>
        <div className="ticks up" style={{ transitionDelay: '.3s' }}>
          <span><Icon name="chk" />No email, no KYC</span>
          <span><Icon name="chk" />Zero prompt logs</span>
          <span><Icon name="chk" />Pay with USDG, USDC or ETH</span>
        </div>
      </div>

      <div className="stage up" style={{ transitionDelay: '.4s' }}>
        <Link href="/app" className="preview-link" aria-label="Open the app">
          <span>Try it live<Icon name="arrow" /></span>
        </Link>
        <div className="frame" aria-hidden="true">
          <div className="app">
            <aside className="side">
              <div className="side-head"><div className="dots"><i /><i /><i /></div></div>
              <div className="newchat"><Icon name="plus" width={15} height={15} />New chat<kbd>⌘K</kbd></div>
              <h6>Today</h6>
              <div className="hist">
                <a className="on"><Icon name="lock" /><span>Where my data goes</span></a>
                <a><Icon name="lock" /><span>Salary negotiation</span></a>
                <a><Icon name="lock" /><span>Audit my token contract</span></a>
              </div>
              <div className="wallet-card">
                <div className="r">
                  <span>Balance</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>0x7a3F…c91E</span>
                </div>
                <b>1,284 <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--mute)' }}>credits</span></b>
                <div className="bar"><i style={{ width: '64%' }} /></div>
              </div>
            </aside>
            <div className="main">
              <div className="topbar">
                <div className="model-btn">
                  {ds.name} <span style={{ color: 'var(--mute)', fontWeight: 400 }}>vs</span> {qw.name}
                </div>
                <div className="sealed"><span className="d" /><span className="t">Sealed enclave verified</span></div>
              </div>
              <div className="thread" style={{ overflow: 'hidden' }}>
                <div className="thread-in">
                  <div className="m you">Is my salary offer of 18k fair for a senior designer in Jakarta?</div>
                  <div className="cmp">
                    <div>
                      <h5>{ds.name}<small>{ds.avgMessageCredits.toFixed(2)} cr</small></h5>
                      <p style={{ fontSize: 14, color: 'var(--ink2)' }}>
                        For senior product designers in Jakarta, offers usually land in a wider band depending on company
                        stage. Ask for the full package: equity, bonus and remote days…
                      </p>
                    </div>
                    <div>
                      <h5>{qw.name}<small>{qw.avgMessageCredits.toFixed(2)} cr</small></h5>
                      <p style={{ fontSize: 14, color: 'var(--ink2)' }}>
                        It&apos;s reasonable but not top of market. Before you counter, find out whether the number is gross
                        or net, and what the review cycle looks like…
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="composer-wrap">
                <div className="composer">
                  <textarea rows={1} placeholder="Ask anything, privately…" tabIndex={-1} disabled />
                  <div className="cbar">
                    <span className="chip" aria-pressed="true"><Icon name="columns" />Compare</span>
                    <span className="chip"><Icon name="flame" />Burn in 24h</span>
                    <span className="sp" />
                    <span className="send">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Logos() {
  return (
    <div className="logos">
      <div className="wrap">
        <p>Built on infrastructure you can verify</p>
        <ul>
          <li>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l9 16H3z" opacity=".85" /></svg>
            Robinhood Chain
          </li>
          <li><Icon name="coin" />USDG</li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="5" y="5" width="14" height="14" rx="3" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
            NVIDIA Confidential
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
            </svg>
            OpenAI API format
          </li>
        </ul>
      </div>
    </div>
  );
}
