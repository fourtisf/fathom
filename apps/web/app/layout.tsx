import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { brand } from '@fathom/config';
import { IconSprite } from '@/components/Icon';
import { ToastProvider } from '@/components/Toast';
import './globals.css';
import './styles/premium.css';

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: brand.title, template: `%s · ${brand.name}` },
  description: brand.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: brand.name,
    title: brand.title,
    description: brand.socialDescription,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    ...(brand.social.xHandle ? { site: brand.social.xHandle, creator: brand.social.xHandle } : {}),
    title: brand.title,
    description: brand.socialDescription,
  },
};

export const viewport: Viewport = {
  themeColor: '#060A1C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: brand.name,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'Private AI on open models with wallet login and pay-per-message pricing.',
  offers: { '@type': 'Offer', price: '1', priceCurrency: 'USD', description: '100 credits' },
  sameAs: [brand.social.x, brand.social.telegram].filter(Boolean),
};

// Runs before paint: enables JS-only entrance animations, then starts them on the next frames.
const bootScript = `document.documentElement.classList.remove('no-js');document.body.classList.add('pre');requestAnimationFrame(function(){requestAnimationFrame(function(){document.body.classList.remove('pre')})});`;

const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
const plausibleSrc = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`no-js ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <IconSprite />
        <ToastProvider>{children}</ToastProvider>
        {/* Self-hosted, cookie-free Plausible, only when both vars are set at build time. No other trackers. */}
        {plausibleDomain && plausibleSrc && <script defer data-domain={plausibleDomain} src={plausibleSrc} />}
      </body>
    </html>
  );
}
