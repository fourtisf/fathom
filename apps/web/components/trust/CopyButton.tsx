'use client';

import { useCopy } from '../Toast';

export function CopyButton({ text, label = 'Copy', message = 'Address copied' }: { text: string; label?: string; message?: string }) {
  const copy = useCopy();
  return (
    <button className="copybtn" onClick={() => copy(text, message)}>
      {label}
    </button>
  );
}
