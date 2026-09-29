import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { loadEnv, type ApiEnv } from './env';
import { fastifyLoggingOptions, type LoggerOptions } from './logger';
import { registerErrorHandlers } from './errors';
import { healthRoutes } from './routes/health';
import { modelRoutes } from './routes/models';

export interface BuildAppOptions {
  env?: ApiEnv;
  logger?: LoggerOptions;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = opts.env ?? loadEnv();
  const app = Fastify({
    ...fastifyLoggingOptions({ level: env.isProd ? 'info' : 'debug', ...opts.logger }),
    // Nginx on the same host is the only proxy. request.ip is used for rate limiting only, never logged.
    trustProxy: 'loopback',
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.webOrigin, credentials: true });
  await app.register(sensible);
  registerErrorHandlers(app);

  await app.register(healthRoutes);
  await app.register(modelRoutes, { prefix: '/v1' });

  return app;
}
