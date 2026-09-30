import type { PrismaClient } from '@fathom/db';

export const MICRO = 1_000_000;

/** Micro-credits (bigint) → credits (number), for JSON responses only. */
export const toCredits = (micro: bigint): number => Number(micro) / MICRO;

export function utcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function utcMonthStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Charges a successful model response. One Postgres transaction: lock the user row,
 * decrement by the cost (or down to 0 if a parallel request already drained the
 * balance; never negative), and add the aggregate to UsageDaily. The row lock also
 * serializes concurrent UsageDaily upserts for the same user. Returns micro-credits charged.
 */
export async function chargeUsage(
  prisma: PrismaClient,
  userId: string,
  model: string,
  costMicro: bigint,
  now: Date = new Date(),
): Promise<bigint> {
  const day = utcDay(now);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ creditsMicro: bigint }[]>`
      SELECT "creditsMicro" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const balance = rows[0]?.creditsMicro ?? 0n;
    const charged = costMicro <= balance ? costMicro : balance > 0n ? balance : 0n;
    if (charged > 0n) {
      await tx.$executeRaw`
        UPDATE "User" SET "creditsMicro" = "creditsMicro" - ${charged} WHERE id = ${userId}`;
    }
    await tx.usageDaily.upsert({
      where: { userId_day_model: { userId, day, model } },
      create: { userId, day, model, messages: 1, creditsMicro: charged },
      update: { messages: { increment: 1 }, creditsMicro: { increment: charged } },
    });
    return charged;
  });
}
