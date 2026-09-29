'use client';

import { useRef, useState } from 'react';
import { useCopy } from '../Toast';

/** `html` is trusted, static, pre-highlighted markup defined in the landing page. */
type Tab = { id: string; label: string; html: string };

export function CodeTabs({ tabs }: { tabs: Tab[] }) {
  const [cur, setCur] = useState(tabs[0]!.id);
  const pres = useRef<Record<string, HTMLPreElement | null>>({});
  const copy = useCopy();

  return (
    <div className="code rv" style={{ transitionDelay: '.08s' }}>
      <div className="ctop" role="tablist">
        <div className="dots">
          <i />
          <i />
          <i />
        </div>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === cur} aria-controls={`t-${t.id}`} onClick={() => setCur(t.id)}>
            {t.label}
          </button>
        ))}
        <button className="copy" onClick={() => copy(pres.current[cur]?.innerText ?? '', 'Code copied')}>
          Copy
        </button>
      </div>
      {tabs.map((t) => (
        <pre
          key={t.id}
          id={`t-${t.id}`}
          role="tabpanel"
          hidden={t.id !== cur}
          ref={(el) => { pres.current[t.id] = el; }}
          dangerouslySetInnerHTML={{ __html: t.html }}
        />
      ))}
    </div>
  );
}
