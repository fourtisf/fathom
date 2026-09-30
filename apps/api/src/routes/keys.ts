import type { FastifyPluginAsync } from 'fastify';
import { MAX_API_KEYS } from '@fathom/config';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { generateKey } from '../apikeys';

/** API key management for the app (cookie auth). Agent-session keys are not listed or counted. */
export const keyRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app.ctx;
  app.addHook('preHandler', requireAuth);

  const activeWhere = (userId: string) => ({ userId, revokedAt: null, expiresAt: null });

  app.get('/keys', async (request) => {
    const keys = await prisma.apiKey.findMany({
      where: activeWhere(request.userId!),
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
    });
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    }));
  });

  app.post('/keys', async (request, reply) => {
    const userId = request.userId!;
    const raw = (request.body as { name?: unknown } | null)?.name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name.length < 1 || name.length > 40) {
      return reply.status(400).send(errorBody(400, 'Key name must be 1 to 40 characters'));
    }
    const { key, prefix, hash } = generateKey();
    // Lock the user row so concurrent creates can't exceed the limit.
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const n = await tx.apiKey.count({ where: activeWhere(userId) });
      if (n >= MAX_API_KEYS) return null;
      return tx.apiKey.create({ data: { userId, name, prefix, hash } });
    });
    if (!created) {
      return reply
        .status(409)
        .send(errorBody(409, `You can have at most ${MAX_API_KEYS} active keys. Revoke one first.`, 'key_limit'));
    }
    return reply.status(201).send({
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      createdAt: created.createdAt.toISOString(),
      key,
    });
  });

  app.delete<{ Params: { id: string } }>('/keys/:id', async (request, reply) => {
    const { count } = await prisma.apiKey.updateMany({
      where: { id: request.params.id.slice(0, 64), ...activeWhere(request.userId!) },
      data: { revokedAt: new Date() },
    });
    if (count === 0) return reply.status(404).send(errorBody(404, 'Key not found'));
    return reply.status(204).send();
  });
};
