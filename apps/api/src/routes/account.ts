import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getAddress } from 'viem';
import type { Prisma } from '@fathom/db';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { toCredits, utcDay, utcMonthStart } from '../billing';
import { fixedWindow } from '../ratelimit';
import { hasWelcome, tryGrantWelcome } from '../welcome';

export type Burn = 'off' | '1h' | '24h';
export interface Settings {
  saveHistory: boolean;
  defaultBurn: Burn;
  webSearch: boolean;
}

export const DEFAULT_SETTINGS: Settings = { saveHistory: true, defaultBurn: 'off', webSearch: false };
const BURNS: readonly Burn[] = ['off', '1h', '24h'];

/** Normalizes whatever is stored in User.settings to the current shape. */
export function readSettings(raw: unknown): Settings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    saveHistory: typeof s.saveHistory === 'boolean' ? s.saveHistory : DEFAULT_SETTINGS.saveHistory,
    defaultBurn: BURNS.includes(s.defaultBurn as Burn) ? (s.defaultBurn as Burn) : DEFAULT_SETTINGS.defaultBurn,
    webSearch: typeof s.webSearch === 'boolean' ? s.webSearch : DEFAULT_SETTINGS.webSearch,
  };
}

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const accountRoutes: FastifyPluginAsync = async (app) => {
  const { prisma, redis } = app.ctx;
  app.addHook('preHandler', requireAuth);

  /** Per-user limit for endpoints that call the chain RPC. */
  const limitUser = async (key: string, userId: string, limit: number, reply: FastifyReply): Promise<boolean> => {
    const rl = await fixedWindow(redis, `${key}:${userId}`, limit, 60);
    if (rl.ok) return true;
    void reply.header('retry-after', String(rl.retryAfter)).status(429).send(errorBody(429, 'Too many requests. Try again in a moment.', 'rate_limited'));
    return false;
  };

  app.get('/me', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    return {
      address: getAddress(user.address),
      credits: toCredits(user.creditsMicro),
      settings: readSettings(user.settings),
      welcomeClaimed: await hasWelcome(app.ctx, user.id),
    };
  });

  // Re-attempts the welcome grant for a user who never received it (e.g. no on-chain activity at sign-up).
  app.post('/credits/welcome', async (request, reply) => {
    const userId = request.userId!;
    if (!(await limitUser('welcome', userId, 10, reply))) return reply;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, address: true } });
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    const r = await tryGrantWelcome(app.ctx, user, request.ip, request.log);
    if (r.granted) return { credits: toCredits(r.creditsMicro), balance: toCredits(r.balanceMicro) };
    const messages: Record<typeof r.reason, string> = {
      already_claimed: 'Welcome credits were already added to this wallet.',
      no_activity: 'Welcome credits need a wallet with some activity on this network.',
      ip_limit: 'Too many new wallets from this network today. Try again tomorrow.',
      daily_limit: "Today's welcome credits are all claimed. Try again tomorrow.",
      check_failed: "We couldn't check your wallet right now. Try again in a moment.",
    };
    return reply.status(403).send(errorBody(403, messages[r.reason], r.reason));
  });

  app.post('/credits/topup', async (request, reply) => {
    const userId = request.userId!;
    const topup = app.ctx.topup;
    if (!topup?.ready) {
      return reply.status(503).send(errorBody(503, 'Top-ups are not available right now', 'topups_unavailable'));
    }
    const txHash = (request.body as { txHash?: unknown } | null)?.txHash;
    if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return reply.status(400).send(errorBody(400, 'Expected { txHash: 0x… (32 bytes) }'));
    }
    if (!(await limitUser('topup', userId, 30, reply))) return reply;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { address: true } });
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    const r = await topup.claim(userId, user.address, txHash as `0x${string}`);
    switch (r.kind) {
      case 'confirmed':
        return { status: 'confirmed', credits: toCredits(r.creditsMicro), balance: toCredits(r.balanceMicro) };
      case 'pending':
        return reply.status(202).send({
          status: 'pending',
          ...(r.confirmations !== undefined ? { confirmations: r.confirmations, required: r.required } : {}),
        });
      case 'error':
        return reply.status(r.status).send(errorBody(r.status, r.message, r.code));
    }
  });

  app.patch('/settings', async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.status(400).send(errorBody(400, 'Expected a settings object'));
    }
    const patch: Partial<Settings> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (k === 'defaultBurn' && BURNS.includes(v as Burn)) patch.defaultBurn = v as Burn;
      else if ((k === 'webSearch' || k === 'saveHistory') && typeof v === 'boolean') patch[k] = v;
      else return reply.status(400).send(errorBody(400, `Invalid setting: ${k.slice(0, 40)}`));
    }
    const user = await prisma.user.findUnique({ where: { id: request.userId! }, select: { settings: true } });
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    const settings = { ...readSettings(user.settings), ...patch };
    const update = prisma.user.update({
      where: { id: request.userId! },
      data: { settings: settings as unknown as Prisma.InputJsonObject },
    });
    // Turning history off deletes every saved (encrypted) chat in the same transaction.
    if (patch.saveHistory === false) {
      await prisma.$transaction([update, prisma.encryptedChat.deleteMany({ where: { userId: request.userId! } })]);
    } else {
      await update;
    }
    return settings;
  });

  app.get('/credits/summary', async (request, reply) => {
    const userId = request.userId!;
    const now = new Date();
    const today = utcDay(now);
    const from14 = new Date(today.getTime() - 13 * DAY_MS);
    const monthStart = utcMonthStart(now);
    const [user, month, days, models] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { creditsMicro: true } }),
      prisma.usageDaily.aggregate({
        where: { userId, day: { gte: monthStart } },
        _sum: { creditsMicro: true, messages: true },
      }),
      prisma.usageDaily.groupBy({
        by: ['day'],
        where: { userId, day: { gte: from14 } },
        _sum: { creditsMicro: true },
      }),
      prisma.usageDaily.groupBy({
        by: ['model'],
        where: { userId, day: { gte: monthStart } },
        _sum: { creditsMicro: true },
      }),
    ]);
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    const perDay = new Map(days.map((d) => [isoDay(d.day), d._sum.creditsMicro ?? 0n]));
    const usage14 = Array.from({ length: 14 }, (_, i) => {
      const day = isoDay(new Date(from14.getTime() + i * DAY_MS));
      return { day, credits: toCredits(perDay.get(day) ?? 0n) };
    });
    const byModel = models
      .map((m) => ({ model: m.model, micro: m._sum.creditsMicro ?? 0n }))
      .sort((a, b) => (b.micro > a.micro ? 1 : b.micro < a.micro ? -1 : a.model.localeCompare(b.model)))
      .map((m) => ({ model: m.model, credits: toCredits(m.micro) }));
    return {
      balance: toCredits(user.creditsMicro),
      spentMonth: toCredits(month._sum.creditsMicro ?? 0n),
      messagesMonth: month._sum.messages ?? 0,
      usage14,
      byModel,
    };
  });

  app.get('/credits/transactions', async (request) => {
    const txs = await prisma.transaction.findMany({
      where: { userId: request.userId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return txs.map((t) => ({
      id: t.id,
      type: t.type,
      token: t.token,
      amountPaid: t.amountPaid,
      credits: toCredits(t.creditsMicro),
      txHash: t.txHash,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    }));
  });

  // Deletes keys and saved (encrypted) chats and resets settings. The account, balance and
  // transactions stay: on-chain history can't be deleted and credits are the user's money.
  app.delete('/data', async (request, reply) => {
    const userId = request.userId!;
    await prisma.$transaction([
      prisma.apiKey.deleteMany({ where: { userId } }),
      prisma.encryptedChat.deleteMany({ where: { userId } }),
      prisma.sharedChat.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonObject },
      }),
    ]);
    return reply.status(204).send();
  });
};
