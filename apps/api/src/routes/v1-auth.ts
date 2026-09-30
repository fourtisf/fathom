import type { FastifyPluginAsync } from 'fastify';
import { generateSiweNonce } from 'viem/siwe';
import { errorBody } from '../errors';
import { AGENT_KEY_NAME, AGENT_KEY_TTL_MS, generateKey } from '../apikeys';
import { checkSiwe, limitIp, sendSiweError, signInUser } from './auth';

/**
 * For agents with their own wallet: exchange a SIWE signature for a 1-hour API key.
 * Same validation, user creation and welcome rules as /auth/verify (no Turnstile: agents
 * can't solve one; the welcome limits still apply). Short-lived keys are not listed on the
 * keys page and don't count toward MAX_API_KEYS.
 */
export const v1AuthRoutes: FastifyPluginAsync = async (app) => {
  const { env, redis, prisma } = app.ctx;

  // Same nonce store as GET /auth/nonce, reachable under the API base URL.
  app.get('/auth/nonce', async (request, reply) => {
    if (!(await limitIp(app, request.ip, reply))) return reply;
    const nonce = generateSiweNonce();
    await redis.set(`siwe:nonce:${nonce}`, '1', 'EX', 5 * 60);
    return { nonce };
  });

  app.post('/auth/siwe', async (request, reply) => {
    if (!(await limitIp(app, request.ip, reply))) return reply;
    if (!env.databaseUrl) {
      return reply.status(503).send(errorBody(503, 'Sign-in is not available right now', 'service_unavailable'));
    }
    const check = await checkSiwe(app, request.body);
    if (!check.ok) return sendSiweError(reply, check);

    const { user, body } = await signInUser(app, check.address, request.ip, request.log);
    const { key, prefix, hash } = generateKey();
    const expiresAt = new Date(Date.now() + AGENT_KEY_TTL_MS);
    await prisma.apiKey.create({ data: { userId: user.id, name: AGENT_KEY_NAME, prefix, hash, expiresAt } });
    return { key, expiresAt: expiresAt.toISOString(), ...body };
  });
};
