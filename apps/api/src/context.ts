import type { Redis } from 'ioredis';
import type { PrismaClient } from '@fathom/db';
import type { ApiEnv } from './env';
import type { InferenceProvider } from './inference';
import type { ModelHealth } from './inference/health';
import type { WebSearch } from './search';

export interface AppContext {
  env: ApiEnv;
  redis: Redis;
  prisma: PrismaClient;
  provider: InferenceProvider | null;
  health: ModelHealth;
  search: WebSearch | null;
  /** In-flight chat streams, aborted on shutdown (unfinished answers are never charged). */
  activeStreams: Set<AbortController>;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    userId?: string;
  }
}
