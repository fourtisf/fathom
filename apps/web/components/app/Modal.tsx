'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useUi, type ModalId } from './Ui';

/** Prototype modal: `.modal` backdrop + `.sheet`. Esc and backdrop click close it; focus moves in and back. */
export function Modal({
  id,
  title,
  children,
  closable = true,
  width,
}: {
  id: Exclude<ModalId, null>;
  title: string;
  children: ReactNode;
  closable?: boolean;
  width?: number;
}) {
  const { modal, closeModal } = useUi();
  const open = modal === id;
  const sheet = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const t = setTimeout(() => sheet.current?.querySelector<HTMLElement>('.x,button,input')?.focus(), 40);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeModal();
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, closeModal]);

  const titleId = `${id}-title`;
  return (
    <div
      className={`modal${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-hidden={!open}
      onClick={(e) => e.target === e.currentTarget && closeModal()}
    >
      <div className="sheet" ref={sheet} style={width ? { width: `min(${width}px,100%)` } : undefined}>
        {closable && (
          <button className="x" aria-label="Close" onClick={closeModal}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        <h3 id={titleId}>{title}</h3>
        {open && children}
      </div>
    </div>
  );
}
