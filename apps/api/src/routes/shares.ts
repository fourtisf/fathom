import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { fixedWindow } from '../ratelimit';
import { ipHash } from '../iphash';

/**
 * Shared chats. The browser encrypts the chat with a fresh random key and puts that key in the
 * link's #fragment, which browsers never send to servers. We store and serve only ciphertext.
 * Anyone with the full link can read the chat until it expires or the owner deletes it.
 */

export const MAX_SHARES = 100;
const MAX_CIPHERTEXT_BYTES = 1024 * 1024;
const IV_BYTES = 12;
const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const SHARE_TTL_DAYS = { '1d': 1, '7d': 7, '30d': 30 } as const;
const CREATE_LIMIT = 20; // per user per minute
const READ_LIMIT = 60; // per IP per minute

function decodeB64(v: unknown, maxBytes: number): Buffer | null {
  if (typeof v !== 'string' || v.length > Math.ceil(maxBytes / 3) * 4 || !B64_RE.test(v)) return null;
  return Buffer.from(v, 'base64');
}

export async function purgeExpiredShares(prisma: { sharedChat: { deleteMany: (a: object) => Promise<{ count: number }> } }, now = new Date()) {
  const { count } = await prisma.sharedChat.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}

export const shareRoutes: FastifyPluginAsync = async (app) => {
  const { prisma, redis } = app.ctx;

  // Public read: the ciphertext is useless without the key in the link's fragment.
  app.get<{ Params: { id: string } }>('/shares/:id', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const rl = await fixedWindow(redis, `share-read:${await ipHash(app.ctx, request.ip, 'share')}`, READ_LIMIT, 60);
    if (!rl.ok) {
      return reply.header('retry-after', String(rl.retryAfter)).status(429).send(errorBody(429, 'Too many requests. Try again in a moment.', 'rate_limited'));
    }
    const { id } = request.params;
    if (!ID_RE.test(id)) return reply.status(404).send(errorBody(404, 'This link is invalid or has expired'));
    const row = await prisma.sharedChat.findUnique({ where: { id } });
    if (!row || row.expiresAt <= new Date()) return reply.status(404).send(errorBody(404, 'This link is invalid or has expired'));
    return {
      ciphertext: Buffer.from(row.ciphertext).toString('base64'),
      iv: Buffer.from(row.iv).toString('base64'),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  });

  app.register(async (owned) => {
    owned.addHook('preHandler', requireAuth);

    owned.get('/shares', async (request) => {
      const rows = await prisma.sharedChat.findMany({
        where: { userId: request.userId!, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, createdAt: true, expiresAt: true },
      });
      return rows.map((r) => ({ id: r.id, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString() }));
    });

    owned.post('/shares', { bodyLimit: 1_500_000 }, async (request, reply) => {
      const userId = request.userId!;
      const rl = await fixedWindow(redis, `share-create:${userId}`, CREATE_LIMIT, 60);
      if (!rl.ok) {
        return reply.header('retry-after', String(rl.retryAfter)).status(429).send(errorBody(429, 'Too many links. Try again in a moment.', 'rate_limited'));
      }
      const b = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
      const ciphertext = decodeB64(b.ciphertext, MAX_CIPHERTEXT_BYTES);
      if (!ciphertext || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
        return reply.status(400).send(errorBody(400, 'ciphertext must be base64, at most 1 MB decoded'));
      }
      const iv = decodeB64(b.iv, IV_BYTES);
      if (!iv || iv.length !== IV_BYTES) return reply.status(400).send(errorBody(400, 'iv must be 12 bytes, base64'));
      const ttl = typeof b.ttl === 'string' && b.ttl in SHARE_TTL_DAYS ? (b.ttl as keyof typeof SHARE_TTL_DAYS) : null;
      if (!ttl) return reply.status(400).send(errorBody(400, 'ttl must be 1d, 7d or 30d'));

      const active = await prisma.sharedChat.count({ where: { userId, expiresAt: { gt: new Date() } } });
      if (active >= MAX_SHARES) {
        return reply.status(409).send(errorBody(409, `You can have at most ${MAX_SHARES} active links. Delete some in Settings.`, 'limit'));
      }
      const id = randomBytes(16).toString('base64url'); // 22 chars
      const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS[ttl] * 86_400_000);
      await prisma.sharedChat.create({ data: { id, userId, ciphertext, iv, expiresAt } });
      return reply.status(201).send({ id, expiresAt: expiresAt.toISOString() });
    });

    owned.delete<{ Params: { id: string } }>('/shares/:id', async (request, reply) => {
      const { id } = request.params;
      if (!ID_RE.test(id)) return reply.status(404).send(errorBody(404, 'Link not found'));
      const { count } = await prisma.sharedChat.deleteMany({ where: { id, userId: request.userId! } });
      if (!count) return reply.status(404).send(errorBody(404, 'Link not found'));
      return reply.status(204).send();
    });

    owned.delete('/shares', async (request, reply) => {
      await prisma.sharedChat.deleteMany({ where: { userId: request.userId! } });
      return reply.status(204).send();
    });
  });
};
