'use client';

import { useEffect, useState } from 'react';

const G = 'abcdef0123456789+/=ABCDEFGHJKLMNPQRSTUVWXYZ';
const noise = (n: number) => Array.from({ length: n }, () => G[(Math.random() * G.length) | 0]).join('');

/** "The network sees" box: fresh ciphertext-looking noise every 120ms. */
export function Cipher() {
  const [text, setText] = useState('');

  useEffect(() => {
    setText(noise(88));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setText(noise(88));
    }, 120);
    return () => clearInterval(id);
  }, []);

  return <p aria-label="Encrypted noise">{text}</p>;
}
