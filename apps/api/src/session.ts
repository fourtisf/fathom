import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { errorBody } from './errors';

export const SESSION_COOKIE = 'nx_session';
export const SESSION_TTL_S = 7 * 24 * 60 * 60;

// Redis keys hold a hash of the session id, so a Redis dump can't be replayed as cookies.
const sessionKey = (id: string) => `sess:${createHash('sha256').update(id).digest('hex')}`;

export async function createSession(request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
  const { redis, env } = request.server.ctx;
  const id = randomBytes(32).toString('base64url');
  await redis.set(sessionKey(id), userId, 'EX', SESSION_TTL_S);
  reply.setCookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    maxAge: SESSION_TTL_S,
  });
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const id = request.cookies[SESSION_COOKIE];
  if (id) await request.server.ctx.redis.del(sessionKey(id));
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: request.server.ctx.env.cookieSecure });
}

/** preHandler: resolves the session cookie to request.userId (sliding 7-day expiry) or replies 401. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { env, redis } = request.server.ctx;
  if (!env.databaseUrl) {
    return void reply.status(503).send(errorBody(503, 'Accounts are not available right now', 'service_unavailable'));
  }
  const id = request.cookies[SESSION_COOKIE];
  const userId = id && id.length <= 128 ? await redis.getex(sessionKey(id), 'EX', SESSION_TTL_S) : null;
  if (!userId) return void reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
  request.userId = userId;
}
