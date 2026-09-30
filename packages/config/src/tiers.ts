/**
 * Token staking tiers. The token is a utility token: tiers grant discounts and access,
 * never revenue share, yield or rewards.
 */
export type TierId = 'explorer' | 'diver' | 'abyss';

export interface Tier {
  id: TierId;
  name: string;
  /** Whole tokens that must be staked. */
  minStake: number;
  /** Discount applied to every charge, in basis points (1000 = 10%). */
  discountBps: number;
  earlyAccess: boolean;
  /** API requests per minute per key. */
  apiRateLimit: number;
  monthlyFreeCredits: number;
  perks: readonly string[];
}

export const DEFAULT_API_RATE_LIMIT = 60;
export const UNSTAKE_COOLDOWN_DAYS = 7;

export const TIERS: readonly Tier[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    minStake: 1_000,
    discountBps: 1_000,
    earlyAccess: false,
    apiRateLimit: DEFAULT_API_RATE_LIMIT,
    monthlyFreeCredits: 0,
    perks: ['10% off every message', 'Priority support'],
  },
  {
    id: 'diver',
    name: 'Diver',
    minStake: 10_000,
    discountBps: 2_000,
    earlyAccess: true,
    apiRateLimit: 300,
    monthlyFreeCredits: 0,
    perks: ['20% off every message', 'Early access to new models', '300 req/min API limit'],
  },
  {
    id: 'abyss',
    name: 'Abyss',
    minStake: 50_000,
    discountBps: 3_000,
    earlyAccess: true,
    apiRateLimit: 300,
    monthlyFreeCredits: 500,
    perks: ['30% off every message', 'Early access to new models', '500 free credits every month'],
  },
] as const;

/** Highest tier reached by a staked amount (whole tokens), or null. */
export function tierForStake(staked: number): Tier | null {
  let found: Tier | null = null;
  for (const t of TIERS) if (staked >= t.minStake) found = t;
  return found;
}

export function nextTier(staked: number): Tier | null {
  return TIERS.find((t) => staked < t.minStake) ?? null;
}
