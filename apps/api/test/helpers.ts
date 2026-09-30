import { Redis } from 'ioredis';
import { PrismaClient } from '@fathom/db';
import { createSiweMessage } from 'viem/siwe';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { FastifyInstance } from 'fastify';
import { createPublicClient, custom } from 'viem';
import { buildApp, type BuildAppOptions } from '../src/app';
import { loadEnv } from '../src/env';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://fathom:fathom@localhost:5432/fathom',
  // A separate Redis DB so test counters and sessions never mix with a dev server's.
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15',
  SIWE_DOMAIN: 'localhost:3000',
  CHAIN_ID: '46630',
  CHAIN_NAME: 'Robinhood Chain Testnet',
  RPC_URL: 'https://rpc.example.org/rpc',
  EXPLORER_URL: 'https://explorer.example.org',
  INFERENCE_PROVIDER: 'mock',
  // Welcome anti-abuse off by default in tests; welcome.test.ts turns each rule on.
  WELCOME_REQUIRE_ACTIVITY: 'false',
  WELCOME_PER_IP_DAY: '1000000',
  WELCOME_DAILY_CAP: '1000000000',
};

/** A chain client whose every RPC call fails: tests must never reach a real network. */
export const offlineChain = createPublicClient({
  transport: custom({ request: async () => { throw new Error('network disabled in tests'); } }, { retryCount: 0 }),
});

/** Builds the app with every log line captured in memory. */
export async function buildCapturingApp(
  level = 'info',
  env: Record<string, string> = { NODE_ENV: 'test' },
  opts: Omit<BuildAppOptions, 'env' | 'logger'> = {},
) {
  const lines: string[] = [];
  const app = await buildApp({
    env: loadEnv(env),
    logger: { level, stream: { write: (msg: string) => void lines.push(msg) } },
    chainClient: offlineChain,
    ...opts,
  });
  return { app, lines };
}

/** True when the local Postgres and Redis used by the integration tests are reachable. */
export async function servicesUp(): Promise<boolean> {
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const redis = new Redis(TEST_ENV.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1500 });
  redis.on('error', () => undefined);
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.connect().then(() => redis.ping())]);
    return true;
  } catch {
    console.warn('\n[api tests] Postgres or Redis not reachable: skipping integration tests. ' +
      'Start them with `service postgresql start` and `redis-server --daemonize yes`.\n');
    return false;
  } finally {
    redis.disconnect();
    await prisma.$disconnect();
  }
}

let ipCounter = Math.floor(Math.random() * 200);
/** A unique client address per test file so per-IP auth limits don't collide across files. */
export const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;

export interface SignInOptions {
  domain?: string;
  chainId?: number;
  expirationTime?: Date;
  statement?: string;
  nonce?: string;
  account?: PrivateKeyAccount;
  signer?: PrivateKeyAccount;
}

export async function signedMessage(app: FastifyInstance, remoteAddress: string, o: SignInOptions = {}) {
  const account = o.account ?? privateKeyToAccount(generatePrivateKey());
  let nonce = o.nonce;
  if (!nonce) {
    const res = await app.inject({ method: 'GET', url: '/auth/nonce', remoteAddress });
    nonce = res.json().nonce as string;
  }
  const message = createSiweMessage({
    address: account.address,
    chainId: o.chainId ?? 46630,
    domain: o.domain ?? 'localhost:3000',
    nonce,
    uri: 'http://localhost:3000',
    version: '1',
    statement: o.statement ?? 'Sign in to Noxsea.',
    expirationTime: o.expirationTime,
  });
  const signature = await (o.signer ?? account).signMessage({ message });
  return { account, message, signature, nonce };
}

export async function signIn(app: FastifyInstance, remoteAddress: string, o: SignInOptions = {}) {
  const s = await signedMessage(app, remoteAddress, o);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/verify',
    remoteAddress,
    payload: { message: s.message, signature: s.signature },
  });
  const cookie = res.cookies.find((c) => c.name === 'nx_session');
  return { ...s, res, session: cookie?.value };
}

/** Parses an SSE body into its JSON events. */
export function sseEvents(body: string): Record<string, unknown>[] {
  return body
    .split('\n\n')
    .map((block) => block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n'))
    .filter(Boolean)
    .map((d) => JSON.parse(d) as Record<string, unknown>);
}
