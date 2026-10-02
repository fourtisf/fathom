import type { FastifyPluginAsync } from 'fastify';
import { errorBody } from '../errors';
import { requireAuth } from '../session';

/**
 * Private memory: one encrypted blob per user (facts the user wants the AI to know). It is encrypted
 * in the browser with the wallet-derived key; the server stores and returns ciphertext it cannot read.
 * The decrypted facts travel only inside a chat request (POST /chat `memory`), never logged or stored.
 */
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const IV_BYTES = 12;
const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const decodeB64 = (v: unknown, maxBytes: number): Buffer | null =>
  typeof v === 'string' && v.length <= Math.ceil(maxBytes / 3) * 4 && B64_RE.test(v) ? Buffer.from(v, 'base64') : null;

export const memoryRoutes: FastifyPluginAsync = async (app) => {
  const { prisma } = app.ctx;
  app.addHook('preHandler', requireAuth);
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.get('/memory', async (request, reply) => {
    const m = await prisma.encryptedMemory.findUnique({ where: { userId: request.userId! } });
    if (!m) return reply.status(404).send(errorBody(404, 'No memory saved yet.', 'not_found'));
    return { ciphertext: Buffer.from(m.ciphertext).toString('base64'), iv: Buffer.from(m.iv).toString('base64'), updatedAt: m.updatedAt.toISOString() };
  });

  app.put('/memory', { bodyLimit: 128 * 1024 }, async (request, reply) => {
    const b = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
    const ciphertext = decodeB64(b.ciphertext, MAX_CIPHERTEXT_BYTES);
    if (!ciphertext || ciphertext.length === 0 || ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      return reply.status(400).send(errorBody(400, 'ciphertext must be base64, at most 64 KB decoded'));
    }
    const iv = decodeB64(b.iv, IV_BYTES);
    if (!iv || iv.length !== IV_BYTES) return reply.status(400).send(errorBody(400, 'iv must be 12 bytes, base64'));
    const userId = request.userId!;
    const m = await prisma.encryptedMemory.upsert({
      where: { userId },
      create: { userId, ciphertext, iv },
      update: { ciphertext, iv },
    });
    return { updatedAt: m.updatedAt.toISOString() };
  });

  app.delete('/memory', async (request, reply) => {
    await prisma.encryptedMemory.deleteMany({ where: { userId: request.userId! } });
    return reply.status(204).send();
  });
};
