import type { FastifyBaseLogger } from 'fastify';
import { getAddress } from 'viem';
import { WELCOME_CREDITS } from '@fathom/config';
import type { AppContext } from './context';
import { MICRO } from './billing';
import { hasOnchainActivity } from './chain';
import { IP_KEY_MAX_TTL_S, ipHash } from './iphash';

/**
 * Welcome credits, with anti-abuse checks:
 *  a) on-chain activity on the configured chain (tx count or native balance > 0),
 *  b) at most WELCOME_PER_IP_DAY grants per client IP per UTC day,
 *  c) at most WELCOME_DAILY_CAP grants per UTC day.
 * IPs only ever appear as an HMAC inside short-lived Redis counter keys; never stored or logged.
 * At most one WELCOME_BONUS per user: checked and inserted under a lock on the user row.
 */

export const WELCOME_MICRO = BigInt(WELCOME_CREDITS) * BigInt(MICRO);

export type WelcomeDenied = 'no_activity' | 'ip_limit' | 'daily_limit' | 'check_failed';
export type WelcomeResult =
  | { granted: true; creditsMicro: bigint; balanceMicro: bigint }
  | { granted: false; reason: WelcomeDenied | 'already_claimed' };

// Counter keys embed an IP hash, so they must expire within 48 hours.
const COUNTER_TTL_S = IP_KEY_MAX_TTL_S;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function counterKeys(ctx: AppContext, ip: string, now: Date) {
  const day = isoDay(now);
  return { ipKey: `welcome:ip:${day}:${await ipHash(ctx, ip, `welcome:${day}`)}`, dayKey: `welcome:day:${day}` };
}

export async function hasWelcome(ctx: AppContext, userId: string): Promise<boolean> {
  const n = await ctx.prisma.transaction.count({ where: { userId, type: 'WELCOME_BONUS' } });
  return n > 0;
}

class Denied extends Error {
  constructor(public readonly reason: WelcomeDenied | 'already_claimed') {
    super(reason);
  }
}

export async function tryGrantWelcome(
  ctx: AppContext,
  user: { id: string; address: string },
  ip: string,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<WelcomeResult> {
  const { prisma, redis, env } = ctx;
  const { perIpDay, dailyCap, requireActivity } = env.welcome;
  try {
    if (await hasWelcome(ctx, user.id)) return { granted: false, reason: 'already_claimed' };

    // Cheap limit checks first so a capped day costs no RPC calls. Re-checked atomically below.
    const { ipKey, dayKey } = await counterKeys(ctx, ip, now);
    const [ipCount, dayCount] = (await redis.mget(ipKey, dayKey)).map((v) => Number(v ?? 0));
    if (ipCount! >= perIpDay) return { granted: false, reason: 'ip_limit' };
    if (dayCount! >= dailyCap) return { granted: false, reason: 'daily_limit' };

    if (requireActivity && ctx.chain) {
      let active: boolean;
      try {
        active = await hasOnchainActivity(ctx.chain, getAddress(user.address));
      } catch (err) {
        log.warn({ err }, 'welcome activity check failed');
        return { granted: false, reason: 'check_failed' };
      }
      if (!active) return { granted: false, reason: 'no_activity' };
    }

    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ creditsMicro: bigint }[]>`
        SELECT "creditsMicro" FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if (!rows[0]) throw new Denied('check_failed');
      const existing = await tx.transaction.count({ where: { userId: user.id, type: 'WELCOME_BONUS' } });
      if (existing > 0) throw new Denied('already_claimed');

      // Reserve both counters; release them if over the limit or if the insert fails.
      const [[, ipN], [, dayN]] = (await redis
        .multi()
        .incr(ipKey)
        .expire(ipKey, COUNTER_TTL_S)
        .incr(dayKey)
        .expire(dayKey, COUNTER_TTL_S)
        .exec()
        .then((r) => [r![0], r![2]])) as [[unknown, number], [unknown, number]];
      const release = () => redis.multi().decr(ipKey).decr(dayKey).exec();
      if (ipN > perIpDay || dayN > dailyCap) {
        await release();
        throw new Denied(ipN > perIpDay ? 'ip_limit' : 'daily_limit');
      }
      try {
        await tx.transaction.create({
          data: { userId: user.id, type: 'WELCOME_BONUS', status: 'CONFIRMED', creditsMicro: WELCOME_MICRO },
        });
        await tx.$executeRaw`
          UPDATE "User" SET "creditsMicro" = "creditsMicro" + ${WELCOME_MICRO} WHERE id = ${user.id}`;
      } catch (err) {
        await release().catch(() => undefined);
        throw err;
      }
      return { granted: true as const, creditsMicro: WELCOME_MICRO, balanceMicro: rows[0].creditsMicro + WELCOME_MICRO };
    });
  } catch (err) {
    if (err instanceof Denied) return { granted: false, reason: err.reason };
    log.error({ err }, 'welcome grant failed');
    return { granted: false, reason: 'check_failed' };
  }
}
