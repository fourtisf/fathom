'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { brand, MODELS } from '@fathom/config';
import { decryptShare } from '@/lib/share-crypto';
import type { ShareDoc } from '@/lib/share-doc';
import { Markdown } from '../app/Markdown';
import { PriceStrip, TokenCard } from '../app/CryptoCards';
import { Icon } from '../Icon';

type State =
  | { s: 'loading' }
  | { s: 'nokey' }
  | { s: 'gone' }
  | { s: 'bad' }
  | { s: 'ok'; doc: ShareDoc; expiresAt: string };

const modelName = (id: string) => MODELS.find((m) => m.id === id)?.name ?? id;

/** Fetches the ciphertext and decrypts it with the key from the URL fragment, all in this browser. */
export function SharedChat({ id }: { id: string }) {
  const [st, setSt] = useState<State>({ s: 'loading' });

  useEffect(() => {
    const key = window.location.hash.slice(1);
    if (!key) return setSt({ s: 'nokey' });
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/shares/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!res.ok) return alive && setSt({ s: res.status === 404 ? 'gone' : 'bad' });
        const body = (await res.json()) as { ciphertext: string; iv: string; expiresAt: string };
        const doc = await decryptShare<ShareDoc>(body.ciphertext, body.iv, key);
        if (doc?.v !== 1 || !Array.isArray(doc.turns)) throw new Error('bad_doc');
        if (alive) setSt({ s: 'ok', doc, expiresAt: body.expiresAt });
      } catch {
        if (alive) setSt({ s: 'bad' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const cta = (
    <div className="share-cta glass">
      <div>
        <b>Private AI that forgets you.</b>
        <span>Zero prompt logs, open models, wallet sign-in.</span>
      </div>
      <Link className="btn btn-dark" href="/app">
        Start your own chat
      </Link>
    </div>
  );

  if (st.s !== 'ok') {
    const msg =
      st.s === 'loading'
        ? 'Decrypting in your browser…'
        : st.s === 'nokey'
          ? 'This link is missing its key. Ask for the full link, including everything after #.'
          : st.s === 'gone'
            ? 'This link has expired or was deleted.'
            : "This chat couldn't be opened. The link may be incomplete.";
    return (
      <main className="share-page">
        <div className="share-empty">
          <Icon name="lock" />
          <p className={st.s === 'loading' ? 'shim' : undefined}>{msg}</p>
        </div>
        {st.s !== 'loading' && cta}
      </main>
    );
  }

  const { doc, expiresAt } = st;
  return (
    <main className="share-page">
      <header className="share-hd">
        <span className="tag">Shared chat</span>
        <h1>{doc.title}</h1>
        <p>
          <Icon name="lock" />
          End-to-end encrypted link · expires{' '}
          {new Date(expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </header>
      <div className="thread-in share-thread">
        {doc.turns.map((t, i) =>
          t.kind === 'you' ? (
            <div key={i} className="m you" style={{ whiteSpace: 'pre-wrap' }}>
              {t.doc && <span className="docchip"><b>{t.doc.name}</b><small>not included</small></span>}
              {t.text}
            </div>
          ) : (
            <div key={i} className="m ai">
              <div className="ic"><Icon name="mk" /></div>
              <div className="b">
                {t.token && <TokenCard report={t.token} />}
                {t.prices && t.prices.length > 0 && <PriceStrip prices={t.prices} />}
                {t.slots.length === 2 ? (
                  <div className="cmp">
                    {t.slots.map((s, j) => (
                      <div key={j}>
                        <h5>{modelName(s.model)}</h5>
                        <div style={{ fontSize: 14 }}><Markdown text={s.text} /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <Markdown text={t.slots[0]?.text ?? ''} />
                    <div className="meta"><span>{modelName(t.slots[0]?.model ?? '')}</span></div>
                  </>
                )}
              </div>
            </div>
          ),
        )}
      </div>
      {cta}
      <p className="share-note">
        Shared from {brand.name}. The key to this chat is in the link, so only people with the link can read it.
      </p>
    </main>
  );
}
