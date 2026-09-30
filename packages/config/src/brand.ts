/**
 * Every brand string lives here so the product can be renamed in one place.
 * Renamed from the spec's working name "Fathom" to Noxsea (CLAUDE.md §13.1).
 */
const domain = 'noxsea.xyz';
const name = 'Noxsea';
/**
 * The token ticker stays out of the codebase until launch so it can't leak through the JS bundle.
 * At launch set TOKEN_TICKER (e.g. '$XYZ'); public copy then switches from the generic label to it.
 */
const TOKEN_TICKER = '' as string;

export const brand = {
  name,
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
    announced: TOKEN_TICKER !== '',
    /** Name to show publicly: the ticker once announced, otherwise a generic label. */
    display: TOKEN_TICKER || `${name} token`,
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
