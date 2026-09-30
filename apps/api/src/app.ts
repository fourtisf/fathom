import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { Redis } from 'ioredis';
import { PrismaClient } from '@fathom/db';
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

export interface BuildAppOptions {
  env?: ApiEnv;
  logger?: LoggerOptions;
  /** Overrides for tests. Defaults are built from env. */
  provider?: InferenceProvider | null;
  search?: WebSearch | null;
  prisma?: PrismaClient;
  healthIntervalMs?: number;
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
  const search =
    opts.search !== undefined ? opts.search : env.braveSearchApiKey ? createBraveSearch(env.braveSearchApiKey) : null;

  const ctx: AppContext = {
    env,
    redis,
    prisma,
    provider,
    search,
    health: new ModelHealth(provider, redis, app.log),
    activeStreams: new Set(),
  };
  app.decorate('ctx', ctx);

  app.addHook('onReady', async () => {
    await ctx.health.start(opts.healthIntervalMs);
  });
  app.addHook('preClose', async () => {
    // Unfinished answers are aborted and, per the charging rule, not charged.
    for (const ac of ctx.activeStreams) ac.abort(new Error('server shutting down'));
  });
  app.addHook('onClose', async () => {
    ctx.health.stop();
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
  await app.register(modelRoutes, { prefix: '/v1' });

  return app;
}
