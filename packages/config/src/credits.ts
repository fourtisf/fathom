import type { ModelInfo } from './models';

/**
 * Credits are stored as integer micro-credits (1 credit = 1,000,000 micro) so
 * balances never pick up float error. All billing math here is bigint.
 */
export const MICRO_PER_CREDIT = 1_000_000n;
/** 1 USDG buys this many credits. */
export const CREDITS_PER_USDG = 100;
export const WELCOME_CREDITS = 25;
/** Web search multiplier (×1.6), as a fraction to keep the math integer. */
export const WEB_SEARCH_MULTIPLIER = { num: 16n, den: 10n } as const;
export const MAX_API_KEYS = 10;
/** Balance below which the app shows the "running low" banner. */
export const LOW_BALANCE_CREDITS = 5;
/** Top-up presets in USD, as shown in the top-up modal. */
export const TOPUP_AMOUNTS_USD = [5, 20, 50, 100] as const;

export function creditsToMicro(credits: number): bigint {
  // Round to the nearest micro-credit; inputs are human-entered decimals like 0.45.
  return BigInt(Math.round(credits * 1_000_000));
}

export function microToCredits(micro: bigint): number {
  return Number(micro) / 1_000_000;
}

export interface ChargeOptions {
  webSearch?: boolean;
  /** Staking discount in basis points. */
  discountBps?: number;
}

/**
 * Cost of one model response in micro-credits, charged by tokens.
 * Rounds down at each step, so a user is never charged more than the listed price.
 */
export function tokenCostMicro(
  model: Pick<ModelInfo, 'inputPerM' | 'outputPerM'>,
  inputTokens: number,
  outputTokens: number,
  opts: ChargeOptions = {},
): bigint {
  if (!Number.isInteger(inputTokens) || !Number.isInteger(outputTokens) || inputTokens < 0 || outputTokens < 0) {
    throw new RangeError('token counts must be non-negative integers');
  }
  // Prices are credits per 1M tokens, i.e. micro-credits per token. Scale by
  // 1000 first so prices with up to 3 decimals stay exact.
  const milliMicro =
    BigInt(inputTokens) * BigInt(Math.round(model.inputPerM * 1000)) +
    BigInt(outputTokens) * BigInt(Math.round(model.outputPerM * 1000));
  let micro = milliMicro / 1000n;
  if (opts.webSearch) micro = (micro * WEB_SEARCH_MULTIPLIER.num) / WEB_SEARCH_MULTIPLIER.den;
  const bps = BigInt(opts.discountBps ?? 0);
  if (bps < 0n || bps > 10_000n) throw new RangeError('discountBps must be 0..10000');
  return (micro * (10_000n - bps)) / 10_000n;
}

/** UI-only estimate for one message, in credits. */
export function estimateMessageCredits(
  model: Pick<ModelInfo, 'avgMessageCredits'>,
  opts: ChargeOptions = {},
): number {
  const search = opts.webSearch ? 1.6 : 1;
  const discount = 1 - (opts.discountBps ?? 0) / 10_000;
  return model.avgMessageCredits * search * discount;
}
