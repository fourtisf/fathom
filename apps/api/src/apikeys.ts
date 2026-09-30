import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { brand, DEFAULT_API_RATE_LIMIT } from '@fathom/config';
import { errorBody } from './errors';
import { fixedWindow } from './ratelimit';

/**
 * API keys: `nox_live_` + 64 hex chars (32 random bytes). Only sha256(key) and a display
 * prefix are stored; the full key is returned once. Keys are never logged (the
 * authorization header is redacted by the logger).
 */

export const AGENT_KEY_NAME = 'agent-session';
export const AGENT_KEY_TTL_MS = 60 * 60 * 1000;
const LAST_USED_THROTTLE_MS = 60_000;
const MAX_KEY_LENGTH = 200;

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export function generateKey(): { key: string; prefix: string; hash: string } {
  const random = randomBytes(32).toString('hex');
  const key = `${brand.keyPrefix}${random}`;
  return { key, prefix: `${brand.keyPrefix}${random.slice(0, 6)}`, hash: hashKey(key) };
}

function invalidKey(reply: FastifyReply, message = 'Invalid or revoked API key') {
  return reply.status(401).send({ error: { message, type: 'invalid_request_error', code: 'invalid_api_key' } });
}

/** preHandler for /v1/*: Bearer key → request.userId / request.apiKeyId, plus the per-key rate limit. */
export async function requireApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { env, prisma, redis } = request.server.ctx;
  if (!env.databaseUrl) {
    return void reply.status(503).send(errorBody(503, 'The API is not available right now', 'service_unavailable'));
  }
  const header = request.headers.authorization;
  const m = typeof header === 'string' ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
  const key = m?.[1];
  if (!key || key.length > MAX_KEY_LENGTH || !key.startsWith(brand.keyPrefix)) {
    return void invalidKey(reply, 'Missing or invalid API key. Send it as "Authorization: Bearer <key>".');
  }
  const row = await prisma.apiKey.findUnique({
    where: { hash: hashKey(key) },
    select: { id: true, userId: true, revokedAt: true, expiresAt: true, lastUsedAt: true },
  });
  const now = Date.now();
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= now)) return void invalidKey(reply);

  // Tiered limits (300/min for Diver+) arrive with staking.
  const rl = await fixedWindow(redis, `api:${row.id}`, DEFAULT_API_RATE_LIMIT, 60);
  if (!rl.ok) {
    return void reply
      .header('retry-after', String(rl.retryAfter))
      .status(429)
      .send(errorBody(429, `Rate limit reached (${DEFAULT_API_RATE_LIMIT} requests per minute). Retry after ${rl.retryAfter}s.`, 'rate_limit_exceeded'));
  }

  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } }).catch(() => undefined);
  }
  request.userId = row.userId;
  request.apiKeyId = row.id;
}
