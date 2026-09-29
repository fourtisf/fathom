import type { Config } from 'tailwindcss';

/** Tokens mirror the :root variables in app/globals.css (ported from the prototype). */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // The prototype ships its own reset; Tailwind's preflight would change heading and svg defaults.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#060A1C', 2: '#0A0F2B' },
        glass: { DEFAULT: 'rgba(255,255,255,.035)', 2: 'rgba(255,255,255,.06)', 3: 'rgba(255,255,255,.09)' },
        ink: { DEFAULT: '#F1F2FF', 2: '#B7BCDD' },
        mute: '#8187AE',
        faint: '#5A6088',
        line: { DEFAULT: 'rgba(255,255,255,.07)', 2: 'rgba(255,255,255,.12)' },
        violet: { DEFAULT: '#8B7CFF', 2: '#B3A8FF' },
        indigo: '#5B6CFF',
        cyan: '#5CE1E6',
        pink: '#F08BD6',
        mint: '#3DDC97',
        rose: '#FF6B7A',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'Geist Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      backgroundImage: {
        grad: 'linear-gradient(135deg,#8B7CFF 0%,#5B6CFF 45%,#38C8E8 100%)',
      },
      boxShadow: {
        lg: '0 40px 120px -30px rgba(3,5,20,.9),0 0 0 1px rgba(255,255,255,.06)',
      },
      borderRadius: {
        btn: '12px',
        card: '20px',
        sheet: '22px',
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(.2,.7,.1,1)',
      },
    },
  },
  plugins: [],
};

export default config;
