import { createHmac, randomBytes } from 'node:crypto';
import type { AppContext } from './context';

/**
 * The one way an IP address may appear anywhere: as an HMAC-SHA256 with a server salt,
 * inside a Redis key that expires within 48 hours (rate limits, welcome counters).
 * Raw IPs are never stored or logged. The salt is WELCOME_SALT or, if unset, a random
 * value created once in Redis (so all API processes share it).
 */

const SALT_KEY = 'ip:salt';
/** Upper bound for the TTL of any Redis key derived from an IP. */
export const IP_KEY_MAX_TTL_S = 48 * 3600;

const cache = new WeakMap<object, string>();

async function salt(ctx: AppContext): Promise<string> {
  if (ctx.env.welcome.salt) return ctx.env.welcome.salt;
  const hit = cache.get(ctx.redis);
  if (hit) return hit;
  await ctx.redis.set(SALT_KEY, randomBytes(32).toString('hex'), 'NX');
  const s = (await ctx.redis.get(SALT_KEY))!;
  cache.set(ctx.redis, s);
  return s;
}

/** Salted hash of an IP for use in a Redis key. `scope` separates uses (e.g. "auth", a UTC day). */
export async function ipHash(ctx: AppContext, ip: string, scope: string): Promise<string> {
  return createHmac('sha256', await salt(ctx)).update(`${scope}|${ip}`).digest('hex').slice(0, 40);
}
