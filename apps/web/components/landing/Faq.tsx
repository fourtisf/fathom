'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '../Icon';

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="faq rv">
      {items.map((it, i) => (
        <div className="q" key={it.q} data-open={open === i ? '' : undefined}>
          <button aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>
            {it.q}
            <span className="pm">
              <Icon name="plus" />
            </span>
          </button>
          <div className="a" id={`faq-${i}`}>
            <div>
              <p>{it.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
