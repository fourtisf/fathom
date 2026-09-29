'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Page-level effects from the prototype: scroll reveal for `.rv` elements and
 * the pointer-following glow on cards. Re-scans on every route change.
 */
export function Effects() {
  const pathname = usePathname();

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }),
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('.rv:not(.in)').forEach((el) => io.observe(el));

    const glow = (e: PointerEvent) => {
      const c = (e.target as Element | null)?.closest<HTMLElement>('.cell,.step,.pcard.calc');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', glow, { passive: true });

    return () => {
      io.disconnect();
      document.removeEventListener('pointermove', glow);
    };
  }, [pathname]);

  return null;
}
