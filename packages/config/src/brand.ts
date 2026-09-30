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
  apiUrl: `https://api.${domain}`,
  apiBaseUrl: `https://api.${domain}/v1`,
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
    'Private AI on open models. Compare models side by side, set chats to self-destruct, sign in with your wallet and pay per message with USDG, USDC or ETH on Robinhood Chain.',
  socialDescription: 'Open models in sealed hardware. Wallet login, pay per message, zero logs.',
  footerBlurb: 'Private AI on open models, paid in USDG on Robinhood Chain.',
  social: {
    x: '#',
    telegram: '#',
  },
} as const;

export type Brand = typeof brand;
