import { getAddress, isAddress, type Address } from 'viem';
import { MODELS, SCAN_CHAINS, type ModelId } from '@fathom/config';
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
  extraBody: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface WelcomeEnv {
  /** Require on-chain activity (tx count or native balance) before granting welcome credits. */
  requireActivity: boolean;
  /** Max welcome grants per client IP per UTC day. */
  perIpDay: number;
  /** Max welcome grants per UTC day in total. */
  dailyCap: number;
  /** Secret for hashing IPs in rate-limit keys; null = a random value kept in Redis. */
  salt: string | null;
}

export interface TurnstileEnv {
  siteKey: string | null;
  /** When set, /auth/verify requires a Turnstile token. */
  secretKey: string | null;
}

/** USDG top-ups by direct transfer to the treasury. Null unless chain, USDG and treasury are all valid. */
export interface TopupEnv {
  usdg: Address;
  treasury: Address;
  confirmations: number;
  /** Minimum top-up in USD (= USDG). */
  minUsd: number;
  /** First block the indexer scans when it has no saved position. */
  startBlock: bigint | null;
}

/** Token Safety Check (block explorer) and live prices (CoinGecko). */
export interface CryptoEnv {
  enabled: boolean;
  /** Blockscout API v2 base; defaults to EXPLORER_URL + /api/v2. Without it (or when it's blocked) the check reads the chain over RPC. */
  explorerApi: string | null;
  explorerApiKey: string | null;
  coingeckoKey: string | null;
  coingeckoPlan: 'demo' | 'pro';
  /** Override for the CoinGecko API base (proxy or test server). */
  coingeckoUrl: string | null;
  /** Scan other chains (Solana, Ethereum, Base…) besides the home chain. SCAN_MULTICHAIN=off turns it off. */
  multichain: boolean;
  /** RPC overrides by scanner chain key, from SCAN_RPC_<KEY> (SOLANA_RPC_URL also works for Solana). */
  scanRpc: Record<string, string | undefined>;
  /** Overrides for the DexScreener and GoPlus API bases (proxy or test server). */
  dexscreenerUrl: string | null;
  goplusUrl: string | null;
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
  crypto: CryptoEnv;
  welcome: WelcomeEnv;
  turnstile: TurnstileEnv;
  topup: TopupEnv | null;
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

function loadCrypto(env: Env, chain: ChainEnv | null, warnings: string[]): CryptoEnv {
  const enabled = (opt(env, 'CRYPTO_TOOLS') ?? 'on').toLowerCase() !== 'off';
  const explicit = optUrl(env, 'EXPLORER_API_URL', warnings);
  const explorerApi = explicit ?? (chain?.explorerUrl ? `${chain.explorerUrl.replace(/\/$/, '')}/api/v2` : null);
  const plan = opt(env, 'COINGECKO_PLAN')?.toLowerCase() === 'pro' ? 'pro' : 'demo';
  return {
    enabled,
    explorerApi,
    explorerApiKey: opt(env, 'EXPLORER_API_KEY'),
    coingeckoKey: opt(env, 'COINGECKO_API_KEY'),
    coingeckoPlan: plan,
    coingeckoUrl: optUrl(env, 'COINGECKO_API_URL', warnings),
    multichain: (opt(env, 'SCAN_MULTICHAIN') ?? 'on').toLowerCase() !== 'off',
    scanRpc: Object.fromEntries(
      SCAN_CHAINS.map((c) => [
        c.key,
        optUrl(env, `SCAN_RPC_${c.key.toUpperCase()}`, warnings) ?? (c.key === 'solana' ? optUrl(env, 'SOLANA_RPC_URL', warnings) : null) ?? undefined,
      ]),
    ),
    dexscreenerUrl: optUrl(env, 'DEXSCREENER_API_URL', warnings),
    goplusUrl: optUrl(env, 'GOPLUS_API_URL', warnings),
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
  let extraBody: Record<string, unknown> = p.extraBody ?? {};
  const rawExtra = opt(env, 'INFERENCE_EXTRA_BODY');
  if (rawExtra) {
    try {
      const parsed: unknown = JSON.parse(rawExtra);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      extraBody = parsed as Record<string, unknown>;
    } catch {
      warnings.push('INFERENCE_EXTRA_BODY is not a JSON object; using the preset default');
    }
  }
  return {
    preset,
    kind: p.kind,
    baseUrl,
    apiKey: opt(env, 'INFERENCE_API_KEY'),
    modelMap,
    extraBody,
    headers: p.headers ?? {},
  };
}

function optInt(env: Env, key: string, def: number, min: number, warnings: string[]): number {
  const v = opt(env, key);
  if (v === null) return def;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min) {
    warnings.push(`${key} must be an integer >= ${min}; using ${def}`);
    return def;
  }
  return n;
}

function optAddress(env: Env, key: string, warnings: string[]): Address | null {
  const v = opt(env, key);
  if (!v) return null;
  if (!isAddress(v, { strict: false })) {
    warnings.push(`${key} is not a valid 0x address; ignored`);
    return null;
  }
  return getAddress(v);
}

function loadWelcome(env: Env, warnings: string[]): WelcomeEnv {
  return {
    requireActivity: opt(env, 'WELCOME_REQUIRE_ACTIVITY') !== 'false',
    perIpDay: optInt(env, 'WELCOME_PER_IP_DAY', 3, 0, warnings),
    dailyCap: optInt(env, 'WELCOME_DAILY_CAP', 300, 0, warnings),
    salt: opt(env, 'WELCOME_SALT'),
  };
}

function loadTopup(env: Env, chain: ChainEnv | null, warnings: string[]): TopupEnv | null {
  const usdg = optAddress(env, 'USDG_ADDRESS', warnings);
  const treasury = optAddress(env, 'TREASURY_ADDRESS', warnings);
  if (!chain || !usdg || !treasury) return null;
  const confirmations = optInt(
    env,
    'TOPUP_CONFIRMATIONS',
    optInt(env, 'INDEXER_CONFIRMATIONS', 3, 1, warnings),
    1,
    warnings,
  );
  let minUsd = 1;
  const rawMin = opt(env, 'TOPUP_MIN_USD');
  if (rawMin !== null) {
    const n = Number(rawMin);
    if (Number.isFinite(n) && n > 0 && /^\d+(\.\d{1,6})?$/.test(rawMin)) minUsd = n;
    else warnings.push('TOPUP_MIN_USD must be a positive number with at most 6 decimals; using 1');
  }
  let startBlock: bigint | null = null;
  const rawStart = opt(env, 'TOPUP_START_BLOCK');
  if (rawStart !== null) {
    if (/^\d+$/.test(rawStart)) startBlock = BigInt(rawStart);
    else warnings.push('TOPUP_START_BLOCK must be a block number; ignored');
  }
  return { usdg, treasury, confirmations, minUsd, startBlock };
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

  const chain = loadChain(env, warnings);
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
    chain,
    inference: loadInference(env, warnings),
    braveSearchApiKey: opt(env, 'BRAVE_SEARCH_API_KEY'),
    crypto: loadCrypto(env, chain, warnings),
    welcome: loadWelcome(env, warnings),
    turnstile: { siteKey: opt(env, 'TURNSTILE_SITE_KEY'), secretKey: opt(env, 'TURNSTILE_SECRET_KEY') },
    topup: loadTopup(env, chain, warnings),
    warnings,
  };
}
