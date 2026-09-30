import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { getAddress, verifyMessage, type Hex } from 'viem';
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import type { PrismaClient, User } from '@fathom/db';
import { errorBody } from '../errors';
import { fixedWindow } from '../ratelimit';
import { createSession, destroySession } from '../session';
import { toCredits } from '../billing';
import { tryGrantWelcome, type WelcomeDenied } from '../welcome';
import { ipHash } from '../iphash';

const NONCE_TTL_S = 5 * 60;
const nonceKey = (n: string) => `siwe:nonce:${n}`;

type AuthErrorCode = 'invalid_signature' | 'invalid_nonce' | 'wrong_domain' | 'wrong_chain';

/** Finds or creates the user (with 0 credits; the welcome bonus is granted separately). */
export async function findOrCreateUser(prisma: PrismaClient, address: string): Promise<{ user: User; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { address } });
  if (existing) return { user: existing, created: false };
  try {
    return { user: await prisma.user.create({ data: { address } }), created: true };
  } catch (err) {
    // A concurrent sign-in created the row first.
    if ((err as { code?: string }).code === 'P2002') {
      return { user: await prisma.user.findUniqueOrThrow({ where: { address } }), created: false };
    }
    throw err;
  }
}

// IPs are only used as salted-hash rate-limit keys (61s TTL) and never logged or stored with a wallet.
export async function limitIp(app: FastifyInstance, ip: string, reply: FastifyReply): Promise<boolean> {
  const rl = await fixedWindow(app.ctx.redis, `auth:${await ipHash(app.ctx, ip, 'auth')}`, 60, 60);
  if (rl.ok) return true;
  void reply.header('retry-after', String(rl.retryAfter)).status(429).send(errorBody(429, 'Too many requests', 'rate_limited'));
  return false;
}

export type SiweCheck =
  | { ok: true; address: string }
  | { ok: false; status: 400 | 401; code?: AuthErrorCode; message: string };

/** Validates a SIWE message + signature: domain, chain, expiry, single-use nonce, EOA signature. */
export async function checkSiwe(app: FastifyInstance, body: unknown): Promise<SiweCheck> {
  const { env, redis } = app.ctx;
  const b = (body && typeof body === 'object' ? body : {}) as { message?: unknown; signature?: unknown };
  const { message, signature } = b;
  if (
    typeof message !== 'string' ||
    message.length > 4096 ||
    typeof signature !== 'string' ||
    !/^0x[0-9a-fA-F]{2,2000}$/.test(signature)
  ) {
    return { ok: false, status: 400, message: 'Expected { message, signature }' };
  }

  let fields: ReturnType<typeof parseSiweMessage>;
  try {
    fields = parseSiweMessage(message);
  } catch {
    return { ok: false, status: 400, message: 'Malformed sign-in message' };
  }
  if (!fields.address || !fields.nonce || !fields.domain || fields.chainId === undefined || fields.version !== '1') {
    return { ok: false, status: 400, message: 'Malformed sign-in message' };
  }

  const fail = (code: AuthErrorCode, msg: string): SiweCheck => ({ ok: false, status: 401, code, message: msg });
  if (fields.domain !== env.siweDomain) return fail('wrong_domain', 'Message was signed for another site');
  if (env.chain && fields.chainId !== env.chain.id) return fail('wrong_chain', 'Message was signed on the wrong network');
  if (!validateSiweMessage({ message: fields, domain: env.siweDomain })) {
    return fail('invalid_nonce', 'Sign-in message expired. Please try again.');
  }
  // Consume the nonce atomically so a signed message can be used once.
  if ((await redis.getdel(nonceKey(fields.nonce))) === null) {
    return fail('invalid_nonce', 'Sign-in request expired or already used. Please try again.');
  }

  // EOA signatures only (ecrecover). Smart-contract wallets (ERC-1271/6492) are out of scope for now.
  let valid = false;
  try {
    valid = await verifyMessage({ address: fields.address, message, signature: signature as Hex });
  } catch {
    valid = false;
  }
  if (!valid) return fail('invalid_signature', 'Signature does not match the wallet');
  return { ok: true, address: fields.address.toLowerCase() };
}

export function sendSiweError(reply: FastifyReply, check: Extract<SiweCheck, { ok: false }>) {
  return reply.status(check.status).send(errorBody(check.status, check.message, check.code));
}

/**
 * Creates the user if new and, for a new user, tries the welcome grant (anti-abuse rules in welcome.ts).
 * Shared by /auth/verify and /v1/auth/siwe.
 */
export async function signInUser(app: FastifyInstance, address: string, ip: string, log: FastifyInstance['log']) {
  const { user, created } = await findOrCreateUser(app.ctx.prisma, address);
  let balanceMicro = user.creditsMicro;
  let welcome = false;
  let welcomeDenied: WelcomeDenied | undefined;
  if (created) {
    const r = await tryGrantWelcome(app.ctx, user, ip, log);
    if (r.granted) {
      welcome = true;
      balanceMicro = r.balanceMicro;
    } else if (r.reason !== 'already_claimed') {
      welcomeDenied = r.reason;
    }
  }
  return {
    user,
    body: {
      address: getAddress(address),
      credits: toCredits(balanceMicro),
      welcome,
      ...(welcomeDenied ? { welcomeDenied } : {}),
    },
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { redis, env } = app.ctx;

  app.get('/auth/nonce', async (request, reply) => {
    if (!(await limitIp(app, request.ip, reply))) return reply;
    const nonce = generateSiweNonce();
    await redis.set(nonceKey(nonce), '1', 'EX', NONCE_TTL_S);
    return { nonce };
  });

  app.post('/auth/verify', async (request, reply) => {
    if (!(await limitIp(app, request.ip, reply))) return reply;
    if (!env.databaseUrl) {
      return reply.status(503).send(errorBody(503, 'Sign-in is not available right now', 'service_unavailable'));
    }

    // Optional Cloudflare Turnstile, checked before the nonce is consumed.
    const verifyCaptcha = app.ctx.verifyCaptcha;
    if (verifyCaptcha) {
      const token = (request.body as { turnstileToken?: unknown } | null)?.turnstileToken;
      if (typeof token !== 'string' || !token || token.length > 2048 || !(await verifyCaptcha(token))) {
        return reply.status(400).send(errorBody(400, 'Human verification failed. Please try again.', 'captcha_failed'));
      }
    }

    const check = await checkSiwe(app, request.body);
    if (!check.ok) return sendSiweError(reply, check);

    const { user, body } = await signInUser(app, check.address, request.ip, request.log);
    await createSession(request, reply, user.id);
    return body;
  });

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(request, reply);
    return reply.status(204).send();
  });
};
