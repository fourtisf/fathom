import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getAddress, verifyMessage, type Hex } from 'viem';
import { generateSiweNonce, parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { WELCOME_CREDITS } from '@fathom/config';
import type { PrismaClient, User } from '@fathom/db';
import { errorBody } from '../errors';
import { fixedWindow } from '../ratelimit';
import { createSession, destroySession } from '../session';
import { MICRO, toCredits } from '../billing';

const NONCE_TTL_S = 5 * 60;
const nonceKey = (n: string) => `siwe:nonce:${n}`;
const WELCOME_MICRO = BigInt(WELCOME_CREDITS) * BigInt(MICRO);

type AuthErrorCode = 'invalid_signature' | 'invalid_nonce' | 'wrong_domain' | 'wrong_chain';

function authError(reply: FastifyReply, code: AuthErrorCode, message: string) {
  return reply.status(401).send(errorBody(401, message, code));
}

/** Finds or creates the user; a new user gets the welcome bonus in the same transaction. */
export async function findOrCreateUser(prisma: PrismaClient, address: string): Promise<{ user: User; created: boolean }> {
  const existing = await prisma.user.findUnique({ where: { address } });
  if (existing) return { user: existing, created: false };
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { address, creditsMicro: WELCOME_MICRO } });
      await tx.transaction.create({
        data: { userId: u.id, type: 'WELCOME_BONUS', status: 'CONFIRMED', creditsMicro: WELCOME_MICRO },
      });
      return u;
    });
    return { user, created: true };
  } catch (err) {
    // A concurrent sign-in created the row first: the unique address makes the bonus once-only.
    if ((err as { code?: string }).code === 'P2002') {
      return { user: await prisma.user.findUniqueOrThrow({ where: { address } }), created: false };
    }
    throw err;
  }
}

// IPs are only used as hashed rate-limit keys and never logged or stored with a wallet.
const ipKey = (ip: string) => createHash('sha256').update(ip).digest('hex').slice(0, 32);

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { redis, env } = app.ctx;

  const limitIp = async (ip: string, reply: FastifyReply): Promise<boolean> => {
    const rl = await fixedWindow(redis, `auth:${ipKey(ip)}`, 60, 60);
    if (rl.ok) return true;
    void reply.header('retry-after', String(rl.retryAfter)).status(429).send(errorBody(429, 'Too many requests', 'rate_limited'));
    return false;
  };

  app.get('/auth/nonce', async (request, reply) => {
    if (!(await limitIp(request.ip, reply))) return reply;
    const nonce = generateSiweNonce();
    await redis.set(nonceKey(nonce), '1', 'EX', NONCE_TTL_S);
    return { nonce };
  });

  app.post('/auth/verify', async (request, reply) => {
    if (!(await limitIp(request.ip, reply))) return reply;
    if (!env.databaseUrl) {
      return reply.status(503).send(errorBody(503, 'Sign-in is not available right now', 'service_unavailable'));
    }
    const body = request.body as { message?: unknown; signature?: unknown } | null;
    const message = body?.message;
    const signature = body?.signature;
    if (
      typeof message !== 'string' ||
      message.length > 4096 ||
      typeof signature !== 'string' ||
      !/^0x[0-9a-fA-F]{2,2000}$/.test(signature)
    ) {
      return reply.status(400).send(errorBody(400, 'Expected { message, signature }'));
    }

    let fields: ReturnType<typeof parseSiweMessage>;
    try {
      fields = parseSiweMessage(message);
    } catch {
      return reply.status(400).send(errorBody(400, 'Malformed sign-in message'));
    }
    if (!fields.address || !fields.nonce || !fields.domain || fields.chainId === undefined || fields.version !== '1') {
      return reply.status(400).send(errorBody(400, 'Malformed sign-in message'));
    }

    if (fields.domain !== env.siweDomain) return authError(reply, 'wrong_domain', 'Message was signed for another site');
    if (env.chain && fields.chainId !== env.chain.id) {
      return authError(reply, 'wrong_chain', 'Message was signed on the wrong network');
    }
    if (!validateSiweMessage({ message: fields, domain: env.siweDomain })) {
      return authError(reply, 'invalid_nonce', 'Sign-in message expired. Please try again.');
    }
    // Consume the nonce atomically so a signed message can be used once.
    if ((await redis.getdel(nonceKey(fields.nonce))) === null) {
      return authError(reply, 'invalid_nonce', 'Sign-in request expired or already used. Please try again.');
    }

    // EOA signatures only (ecrecover). Smart-contract wallets (ERC-1271/6492) are out of scope for now.
    let valid = false;
    try {
      valid = await verifyMessage({ address: fields.address, message, signature: signature as Hex });
    } catch {
      valid = false;
    }
    if (!valid) return authError(reply, 'invalid_signature', 'Signature does not match the wallet');

    const address = fields.address.toLowerCase();
    const { user, created } = await findOrCreateUser(app.ctx.prisma, address);
    await createSession(request, reply, user.id);
    return { address: getAddress(address), credits: toCredits(user.creditsMicro), welcome: created };
  });

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(request, reply);
    return reply.status(204).send();
  });
};
