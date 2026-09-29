import type { CSSProperties } from 'react';

// SVG sprite ported verbatim from the prototype. Render <IconSprite /> once per page.
const SPRITE = `
  <symbol id="mk" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M3.5 10.5c2.8-2.3 5.7-2.3 8.5 0s5.7 2.3 8.5 0"/><path d="M6.5 15.5c1.9-1.5 3.7-1.5 5.5 0s3.6 1.5 5.5 0" opacity=".7"/></symbol>
  <symbol id="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/></symbol>
  <symbol id="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
  <symbol id="shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3l7.5 3v5.5c0 4.8-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.7-7.5-9.5V6z"/><path d="M9 12l2 2 4-4" stroke-linecap="round"/></symbol>
  <symbol id="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></symbol>
  <symbol id="bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M13 2.5L4.5 13.5H12l-1 8 8.5-11H12z"/></symbol>
  <symbol id="down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></symbol>
  <symbol id="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="key" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3"/></symbol>
  <symbol id="wal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12.5h2M3 9h15"/></symbol>
  <symbol id="coin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M14.5 9.5c0-1.2-1.1-2-2.5-2s-2.5.8-2.5 2 1.1 1.8 2.5 2.5 2.5 1.3 2.5 2.5-1.1 2-2.5 2-2.5-.8-2.5-2"/></symbol>
  <symbol id="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5L4.5 10.5 10 8.5z"/></symbol>
  <symbol id="chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></symbol>
  <symbol id="layers" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></symbol>
  <symbol id="gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 002.9-1.2V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9h.1a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></symbol>
  <symbol id="flame" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21c-4 0-7-2.8-7-6.6C5 10 9 8 9 3c3 2 4.5 4 5 7 1-1 1.5-2 1.5-3.5C18 9 19 11.5 19 14.4 19 18.2 16 21 12 21z"/></symbol>
  <symbol id="columns" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/></symbol>
  <symbol id="swap" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></symbol>
  <symbol id="info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></symbol>
  <symbol id="alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></symbol>
  <symbol id="book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/></symbol>
`;

export const ICONS = ['mk', 'lock', 'chk', 'shield', 'globe', 'bolt', 'down', 'arrow', 'plus', 'key', 'wal', 'coin', 'spark', 'chat', 'layers', 'gear', 'flame', 'columns', 'swap', 'info', 'alert', 'book'] as const;
export type IconName = (typeof ICONS)[number];

export function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}

export function Icon({
  name,
  className,
  width,
  height,
  style,
}: {
  name: IconName;
  className?: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <svg className={className} width={width} height={height} style={style} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}
