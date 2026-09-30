/**
 * Every brand string lives here so the product can be renamed in one place.
 * Renamed from the spec's working name "Fathom" to Noxsea (CLAUDE.md §13.1).
 */
const domain = 'noxsea.xyz';

export const brand = {
  name: 'Noxsea',
  company: 'Noxsea Labs',
  domain,
  siteUrl: `https://${domain}`,
  /** The API is served same-origin through the web app's /api proxy (no api. subdomain). */
  apiUrl: `https://${domain}/api`,
  apiBaseUrl: `https://${domain}/api/v1`,
  egressHost: `egress.${domain}`,
  securityEmail: `security@${domain}`,
  /** Prefix for API keys. The full key is shown once and only its sha256 is stored. */
  keyPrefix: 'nox_live_',
  token: {
    symbol: 'NOX',
    ticker: '$NOX',
  },
  verifierPackage: '@noxsea/verify',
  servingRepo: 'noxsea-infer',
  exportFileName: 'noxsea-export.json',
  title: 'Noxsea · Private AI that forgets you',
  description:
    'Private AI on open models. Compare models side by side, set chats to self-destruct, sign in with your wallet and pay per message with USDG on Robinhood Chain. Prompts are never logged.',
  socialDescription: 'Open models, zero prompt logs. Wallet login, pay per message in USDG.',
  footerBlurb: 'Private AI on open models, paid in USDG on Robinhood Chain.',
  /** Public profile URLs. Leave empty to hide the link in the footer. */
  social: {
    x: '' as string,
    telegram: '' as string,
  },
} as const;

export type Brand = typeof brand;
