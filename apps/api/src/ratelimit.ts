import type { Redis } from 'ioredis';

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/** Fixed-window counter: at most `limit` hits per `windowS` seconds per key. */
export async function fixedWindow(redis: Redis, key: string, limit: number, windowS: number): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowS);
  const k = `rl:${key}:${window}`;
  const [[, count]] = (await redis.multi().incr(k).expire(k, windowS + 1).exec()) as [[unknown, number]];
  const retryAfter = Math.max(1, (window + 1) * windowS - now);
  return { ok: count <= limit, retryAfter };
}
