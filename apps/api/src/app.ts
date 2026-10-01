import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { Redis } from 'ioredis';
import { PrismaClient, purgeBurnedChats } from '@fathom/db';
import { loadEnv, type ApiEnv } from './env';
import { fastifyLoggingOptions, type LoggerOptions } from './logger';
import { registerErrorHandlers } from './errors';
import { createProvider, type InferenceProvider } from './inference';
import { ModelHealth } from './inference/health';
import { createBraveSearch, type WebSearch } from './search';
import type { AppContext } from './context';
import { healthRoutes } from './routes/health';
import { modelRoutes } from './routes/models';
import { configRoutes } from './routes/config';
import { authRoutes } from './routes/auth';
import { accountRoutes } from './routes/account';
import { chatRoutes } from './routes/chat';
import { keyRoutes } from './routes/keys';
import { chatHistoryRoutes } from './routes/chats';
import { statusRoutes } from './routes/status';
import { v1ChatRoutes } from './routes/v1-chat';
import { v1AuthRoutes } from './routes/v1-auth';
import { createChainClient, type ChainClient } from './chain';
import { TopupService } from './topup';
import { SearchHealth, runStatusProbe } from './status';
import { createTurnstileVerifier, type CaptchaVerifier } from './turnstile';
import { createCoinGecko, createTokenScanner, type CryptoTools } from './crypto';

export interface BuildAppOptions {
  env?: ApiEnv;
  logger?: LoggerOptions;
  /** Overrides for tests. Defaults are built from env. */
  provider?: InferenceProvider | null;
  search?: WebSearch | null;
  prisma?: PrismaClient;
  healthIntervalMs?: number;
  /** Chain client override (tests pass one backed by a fake transport). Null disables chain calls. */
  chainClient?: ChainClient | null;
  verifyCaptcha?: CaptchaVerifier | null;
  /** Crypto tools override for tests. Null disables them. */
  crypto?: CryptoTools | null;
  /**
   * Timers: burn cron (60s), status probe (60s), top-up indexer (15s).
   * Default: on, except under NODE_ENV=test (tests run the jobs explicitly).
   */
  backgroundJobs?: boolean;
}

const MINUTE_MS = 60_000;
/** Expired agent-session keys are deleted this long after expiry. */
const EXPIRED_KEY_GRACE_MS = 24 * 3_600_000;

/** One pass of the minute cron: burn chats past burnAt, drop long-expired agent keys. */
export async function runBurnCron(ctx: AppContext, now: Date = new Date()): Promise<{ chats: number; keys: number }> {
  const chats = await purgeBurnedChats(ctx.prisma, now);
  const { count: keys } = await ctx.prisma.apiKey.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - EXPIRED_KEY_GRACE_MS) } },
  });
  return { chats, keys };
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = opts.env ?? loadEnv();
  const app = Fastify({
    ...fastifyLoggingOptions({ level: env.isProd ? 'info' : 'debug', ...opts.logger }),
    // Nginx on the same host is the only proxy. request.ip is used for rate limiting only, never logged.
    trustProxy: 'loopback',
  });

  for (const w of env.warnings) app.log.warn(w);

  const redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  let redisDown = false;
  redis.on('error', (err) => {
    if (redisDown) return;
    redisDown = true;
    app.log.error({ err }, 'redis connection error');
  });
  redis.on('ready', () => {
    redisDown = false;
  });
  redis.connect().catch(() => undefined); // retries in the background; commands fail fast meanwhile

  const ownsPrisma = !opts.prisma;
  const prisma =
    opts.prisma ?? (env.databaseUrl ? new PrismaClient({ datasourceUrl: env.databaseUrl }) : new PrismaClient());
  const provider = opts.provider !== undefined ? opts.provider : createProvider(env.inference);
  const rawSearch =
    opts.search !== undefined ? opts.search : env.braveSearchApiKey ? createBraveSearch(env.braveSearchApiKey) : null;
  const searchHealth = new SearchHealth();
  const search: WebSearch | null = rawSearch && {
    async search(query, signal) {
      try {
        const r = await rawSearch.search(query, signal);
        searchHealth.ok();
        return r;
      } catch (err) {
        if (!signal.aborted) searchHealth.fail();
        throw err;
      }
    },
  };
  const chain =
    opts.chainClient !== undefined ? opts.chainClient : env.chain ? createChainClient(env.chain) : null;
  const topup = env.topup && chain ? new TopupService(env.topup, chain, prisma, redis, app.log) : null;
  const verifyCaptcha =
    opts.verifyCaptcha !== undefined
      ? opts.verifyCaptcha
      : env.turnstile.secretKey
        ? createTurnstileVerifier(env.turnstile.secretKey)
        : null;
  if (env.turnstile.secretKey && !env.turnstile.siteKey) {
    app.log.warn('TURNSTILE_SECRET_KEY is set without TURNSTILE_SITE_KEY; the web app cannot render the challenge');
  }

  const crypto: CryptoTools | null =
    opts.crypto !== undefined
      ? opts.crypto
      : env.crypto.enabled
        ? {
            scanner: env.crypto.explorerApi
              ? createTokenScanner({
                  apiBase: env.crypto.explorerApi,
                  explorerUrl: env.chain?.explorerUrl ?? null,
                  chainName: env.chain?.name ?? 'Robinhood Chain',
                  chain,
                })
              : null,
            prices: createCoinGecko({ apiKey: env.crypto.coingeckoKey, plan: env.crypto.coingeckoPlan }),
          }
        : null;

  const ctx: AppContext = {
    env,
    redis,
    prisma,
    provider,
    search,
    searchHealth,
    chain,
    topup,
    verifyCaptcha: env.turnstile.secretKey ? verifyCaptcha : null,
    crypto,
    health: new ModelHealth(provider, redis, app.log),
    activeStreams: new Set(),
  };
  app.decorate('ctx', ctx);

  const jobs = opts.backgroundJobs ?? env.nodeEnv !== 'test';
  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, fn: () => Promise<unknown>) => {
    const t = setInterval(() => void fn().catch(() => undefined), ms);
    t.unref();
    timers.push(t);
  };

  app.addHook('onReady', async () => {
    await ctx.health.start(opts.healthIntervalMs);
    if (topup) await topup.loadDecimals();
    if (!jobs) return;
    if (env.databaseUrl) {
      every(MINUTE_MS, async () => {
        try {
          const { chats, keys } = await runBurnCron(ctx);
          if (chats || keys) app.log.info({ chats, keys }, 'burn cron');
        } catch (err) {
          app.log.warn({ err }, 'burn cron failed');
        }
      });
    }
    every(MINUTE_MS, () => runStatusProbe(ctx, app.log));
    void runStatusProbe(ctx, app.log);
    if (topup && env.databaseUrl) topup.start();
  });
  app.addHook('preClose', async () => {
    // Unfinished answers are aborted and, per the charging rule, not charged.
    for (const ac of ctx.activeStreams) ac.abort(new Error('server shutting down'));
  });
  app.addHook('onClose', async () => {
    ctx.health.stop();
    for (const t of timers) clearInterval(t);
    topup?.stop();
    redis.disconnect();
    if (ownsPrisma) await prisma.$disconnect();
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.webOrigin, credentials: true });
  await app.register(cookie);
  await app.register(sensible);
  registerErrorHandlers(app);

  await app.register(healthRoutes);
  await app.register(configRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(chatRoutes);
  await app.register(keyRoutes);
  await app.register(chatHistoryRoutes);
  await app.register(statusRoutes);
  await app.register(modelRoutes, { prefix: '/v1' });
  await app.register(v1ChatRoutes, { prefix: '/v1' });
  await app.register(v1AuthRoutes, { prefix: '/v1' });

  return app;
}
