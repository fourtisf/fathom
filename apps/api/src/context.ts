import type { Redis } from 'ioredis';
import type { ImageGenerator } from './images';
import type { PrismaClient } from '@fathom/db';
import type { ApiEnv } from './env';
import type { InferenceProvider } from './inference';
import type { ModelHealth } from './inference/health';
import type { WebSearch } from './search';
import type { ChainClient } from './chain';
import type { TopupService } from './topup';
import type { SearchHealth } from './status';
import type { CaptchaVerifier } from './turnstile';
import type { CryptoTools } from './crypto';

export interface AppContext {
  env: ApiEnv;
  redis: Redis;
  prisma: PrismaClient;
  provider: InferenceProvider | null;
  health: ModelHealth;
  search: WebSearch | null;
  searchHealth: SearchHealth;
  /** Read-only client for the configured chain; null when CHAIN_ID/RPC_URL are not set. */
  chain: ChainClient | null;
  /** USDG top-ups; null unless chain, USDG_ADDRESS and TREASURY_ADDRESS are configured. */
  topup: TopupService | null;
  /** Token Safety Check and live prices for the app chat; null when CRYPTO_TOOLS=off. */
  crypto: CryptoTools | null;
  /** Image generation; null unless IMAGE_API_URL/IMAGE_MODEL (or IMAGE_PROVIDER=mock) are set. */
  images: ImageGenerator | null;
  /** Turnstile verifier; null when TURNSTILE_SECRET_KEY is not set. */
  verifyCaptcha: CaptchaVerifier | null;
  /** In-flight chat streams, aborted on shutdown (unfinished answers are never charged). */
  activeStreams: Set<AbortController>;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    userId?: string;
    /** Set by Bearer auth on /v1 routes. */
    apiKeyId?: string;
  }
}
