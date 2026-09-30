import type { FastifyPluginAsync } from 'fastify';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { readSettings } from './account';

/**
 * Saved chat history. Chats are encrypted in the browser (key derived from the wallet
 * signature); the server stores and returns opaque ciphertext it cannot read. Bodies are
 * never logged.
 */

export const MAX_CHATS = 500;
const LIST_LIMIT = 100;
const MAX_CIPHERTEXT_BYTES = 1024 * 1024;
const IV_BYTES = 12;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeB64(v: unknown, maxBytes: number): Buffer | null {
  if (typeof v !== 'string' || v.length > Math.ceil(maxBytes / 3) * 4 || !B64_RE.test(v)) return null;
  return Buffer.from(v, 'base64');
}

export const chatHistoryRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app.ctx;
  app.addHook('preHandler', requireAuth);

  app.get('/chats', async (request) => {
    const rows = await prisma.encryptedChat.findMany({
      where: { userId: request.userId!, OR: [{ burnAt: null }, { burnAt: { gt: new Date() } }] },
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map((c) => ({
      id: c.id,
      ciphertext: Buffer.from(c.ciphertext).toString('base64'),
      iv: Buffer.from(c.iv).toString('base64'),
      burnAt: c.burnAt?.toISOString() ?? null,
      updatedAt: c.updatedAt.toISOString(),
    }));
  });

  app.put<{ Params: { id: string } }>('/chats/:id', { bodyLimit: 1_500_000 }, async (request, reply) => {
    const userId = request.userId!;
    const { id } = request.params;
    if (!ID_RE.test(id)) return reply.status(400).send(errorBody(400, 'Chat id must be 8-64 characters of A-Z a-z 0-9 _ -'));
    const b = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
    const ciphertext = decodeB64(b.ciphertext, MAX_CIPHERTEXT_BYTES);
    if (!ciphertext || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      return reply.status(400).send(errorBody(400, 'ciphertext must be base64, at most 1 MB decoded'));
    }
    const iv = decodeB64(b.iv, IV_BYTES);
    if (!iv || iv.length !== IV_BYTES) return reply.status(400).send(errorBody(400, 'iv must be 12 bytes, base64'));
    let burnAt: Date | null = null;
    if (b.burnAt !== null && b.burnAt !== undefined) {
      burnAt = typeof b.burnAt === 'string' && b.burnAt.length <= 40 ? new Date(b.burnAt) : null;
      if (!burnAt || Number.isNaN(burnAt.getTime())) {
        return reply.status(400).send(errorBody(400, 'burnAt must be an ISO date or null'));
      }
    }

    // Lock the user row: serializes the count check and races with PATCH /settings (history off).
    const result = await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<{ settings: unknown }[]>`
        SELECT settings FROM "User" WHERE id = ${userId} FOR UPDATE`;
      if (!users[0]) return 'not_found' as const;
      if (!readSettings(users[0].settings).saveHistory) return 'history_off' as const;
      const existing = await tx.encryptedChat.findUnique({ where: { id }, select: { userId: true } });
      if (existing && existing.userId !== userId) return 'not_found' as const;
      if (existing) {
        await tx.encryptedChat.update({ where: { id }, data: { ciphertext, iv, burnAt } });
      } else {
        const n = await tx.encryptedChat.count({ where: { userId } });
        if (n >= MAX_CHATS) return 'limit' as const;
        await tx.encryptedChat.create({ data: { id, userId, ciphertext, iv, burnAt } });
      }
      return tx.encryptedChat.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
    });
    if (result === 'not_found') return reply.status(404).send(errorBody(404, 'Chat not found'));
    if (result === 'history_off') {
      return reply.status(403).send(errorBody(403, 'Chat history is turned off in Settings', 'history_off'));
    }
    if (result === 'limit') {
      return reply
        .status(409)
        .send(errorBody(409, `You can save at most ${MAX_CHATS} chats. Delete some first.`, 'chat_limit'));
    }
    return { id, burnAt: burnAt?.toISOString() ?? null, updatedAt: result.updatedAt.toISOString() };
  });

  app.delete<{ Params: { id: string } }>('/chats/:id', async (request, reply) => {
    await prisma.encryptedChat.deleteMany({ where: { id: request.params.id.slice(0, 64), userId: request.userId! } });
    return reply.status(204).send();
  });

  app.delete('/chats', async (request, reply) => {
    await prisma.encryptedChat.deleteMany({ where: { userId: request.userId! } });
    return reply.status(204).send();
  });
};
