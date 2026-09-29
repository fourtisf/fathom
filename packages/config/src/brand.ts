/**
 * Every brand string lives here so the product can be renamed in one place.
 * "Fathom" is a working name (see CLAUDE.md §13).
 */
const domain = 'fathom.ai';

export const brand = {
  name: 'Fathom',
  company: 'Fathom Labs',
  domain,
  siteUrl: `https://${domain}`,
  apiUrl: `https://api.${domain}`,
  apiBaseUrl: `https://api.${domain}/v1`,
  egressHost: `egress.${domain}`,
  securityEmail: `security@${domain}`,
  /** Prefix for API keys. The full key is shown once and only its sha256 is stored. */
  keyPrefix: 'fth_live_',
  token: {
    symbol: 'FTHM',
    ticker: '$FTHM',
  },
  verifierPackage: '@fathom/verify',
  servingRepo: 'fathom-infer',
  exportFileName: 'fathom-export.json',
  title: 'Fathom · Private AI that forgets you',
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
