export interface ApiEnv {
  port: number;
  host: string;
  webOrigin: string;
  nodeEnv: 'development' | 'production' | 'test';
  isProd: boolean;
}

type Env = Record<string, string | undefined>;

// Phase 1 needs no chain/DB vars; those are loaded lazily by the features that use them.
export function loadEnv(env: Env = process.env): ApiEnv {
  const port = Number(env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('API_PORT must be a valid port');
  const raw = env.NODE_ENV;
  const nodeEnv = raw === 'production' || raw === 'test' ? raw : 'development';
  return {
    port,
    host: env.API_HOST?.trim() || '127.0.0.1',
    webOrigin: env.WEB_ORIGIN?.trim() || 'http://localhost:3000',
    nodeEnv,
    isProd: nodeEnv === 'production',
  };
}
