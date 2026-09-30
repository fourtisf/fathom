import { MODELS, type ModelId } from '@fathom/config';
import { INFERENCE_PRESETS, type ProviderKind } from './inference/presets';

export interface ChainEnv {
  id: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string | null;
}

export interface InferenceEnv {
  /** Preset name from INFERENCE_PROVIDER. */
  preset: string;
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  /** Our model id → provider model id. Unmapped models are unavailable. */
  modelMap: Partial<Record<ModelId, string>>;
}

export interface ApiEnv {
  port: number;
  host: string;
  webOrigin: string;
  nodeEnv: 'development' | 'production' | 'test';
  isProd: boolean;
  databaseUrl: string | null;
  redisUrl: string;
  /** SIWE domain (RFC 3986 authority) the signed message must name. */
  siweDomain: string;
  cookieSecure: boolean;
  /** Null when CHAIN_ID or RPC_URL is missing. */
  chain: ChainEnv | null;
  /** Null when no inference provider is configured: chat reports every model unavailable. */
  inference: InferenceEnv | null;
  braveSearchApiKey: string | null;
  /** Non-fatal config problems, logged once at startup. Never contains secret values. */
  warnings: string[];
}

type Env = Record<string, string | undefined>;

function opt(env: Env, key: string): string | null {
  const v = env[key]?.trim();
  return v ? v : null;
}

function optUrl(env: Env, key: string, warnings: string[]): string | null {
  const v = opt(env, key);
  if (!v) return null;
  try {
    return new URL(v).toString().replace(/\/$/, '');
  } catch {
    warnings.push(`${key} is not a valid URL; ignored`);
    return null;
  }
}

function loadChain(env: Env, warnings: string[]): ChainEnv | null {
  const rawId = opt(env, 'CHAIN_ID');
  const rpcUrl = optUrl(env, 'RPC_URL', warnings);
  if (!rawId || !rpcUrl) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    warnings.push('CHAIN_ID must be a positive integer; chain disabled');
    return null;
  }
  return {
    id,
    name: opt(env, 'CHAIN_NAME') ?? 'Robinhood Chain',
    rpcUrl,
    explorerUrl: optUrl(env, 'EXPLORER_URL', warnings),
  };
}

function loadInference(env: Env, warnings: string[]): InferenceEnv | null {
  const preset = opt(env, 'INFERENCE_PROVIDER');
  if (!preset) return null;
  const p = INFERENCE_PRESETS[preset];
  if (!p) {
    warnings.push(`INFERENCE_PROVIDER "${preset}" is not a known preset; inference disabled`);
    return null;
  }
  const baseUrl = optUrl(env, 'INFERENCE_BASE_URL', warnings) ?? p.baseUrl ?? null;
  if (p.kind === 'openai-compatible' && !baseUrl) {
    warnings.push('INFERENCE_BASE_URL is required for this provider; inference disabled');
    return null;
  }
  const modelMap: Partial<Record<ModelId, string>> = p.identityMap
    ? Object.fromEntries(MODELS.map((m) => [m.id, m.id]))
    : {};
  Object.assign(modelMap, p.modelMap ?? {});
  const ids = new Set<string>(MODELS.map((m) => m.id));
  const rawMap = opt(env, 'INFERENCE_MODEL_MAP');
  if (rawMap) {
    try {
      const parsed: unknown = JSON.parse(rawMap);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      for (const [k, v] of Object.entries(parsed)) {
        if (!ids.has(k)) warnings.push(`INFERENCE_MODEL_MAP key "${k}" is not a model id; ignored`);
        else if (typeof v !== 'string' || !v.trim()) warnings.push(`INFERENCE_MODEL_MAP["${k}"] must be a string`);
        else modelMap[k as ModelId] = v.trim();
      }
    } catch {
      warnings.push('INFERENCE_MODEL_MAP is not a JSON object; using defaults');
    }
  }
  return { preset, kind: p.kind, baseUrl, apiKey: opt(env, 'INFERENCE_API_KEY'), modelMap };
}

// Every feature var is optional: the server boots without it and the feature reports unavailable.
export function loadEnv(env: Env = process.env): ApiEnv {
  const warnings: string[] = [];
  const port = Number(env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('API_PORT must be a valid port');
  const raw = env.NODE_ENV;
  const nodeEnv = raw === 'production' || raw === 'test' ? raw : 'development';
  const isProd = nodeEnv === 'production';
  const webOrigin = env.WEB_ORIGIN?.trim() || 'http://localhost:3000';

  let siweDomain = opt(env, 'SIWE_DOMAIN');
  if (!siweDomain) {
    try {
      siweDomain = new URL(webOrigin).host;
    } catch {
      siweDomain = 'localhost:3000';
    }
    if (isProd) warnings.push(`SIWE_DOMAIN not set; using ${siweDomain} from WEB_ORIGIN`);
  }

  const cookieSecureRaw = opt(env, 'COOKIE_SECURE');
  const cookieSecure = cookieSecureRaw === null ? isProd : cookieSecureRaw === 'true' || cookieSecureRaw === '1';

  const databaseUrl = opt(env, 'DATABASE_URL');
  if (!databaseUrl) warnings.push('DATABASE_URL not set; sign-in, credits and chat are unavailable');

  return {
    port,
    host: env.API_HOST?.trim() || '127.0.0.1',
    webOrigin,
    nodeEnv,
    isProd,
    databaseUrl,
    redisUrl: opt(env, 'REDIS_URL') ?? 'redis://127.0.0.1:6379',
    siweDomain,
    cookieSecure,
    chain: loadChain(env, warnings),
    inference: loadInference(env, warnings),
    braveSearchApiKey: opt(env, 'BRAVE_SEARCH_API_KEY'),
    warnings,
  };
}
