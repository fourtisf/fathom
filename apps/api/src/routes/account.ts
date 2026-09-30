import type { FastifyPluginAsync } from 'fastify';
import { getAddress } from 'viem';
import type { Prisma } from '@fathom/db';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { toCredits, utcDay, utcMonthStart } from '../billing';

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
  const { prisma } = app.ctx;
  app.addHook('preHandler', requireAuth);

  app.get('/me', async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.userId! } });
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    return { address: getAddress(user.address), credits: toCredits(user.creditsMicro), settings: readSettings(user.settings) };
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
    await prisma.user.update({
      where: { id: request.userId! },
      data: { settings: settings as unknown as Prisma.InputJsonObject },
    });
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
      prisma.user.update({
        where: { id: userId },
        data: { settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonObject },
      }),
    ]);
    return reply.status(204).send();
  });
};
