/**
 * Robinhood Chain settings. Every value comes from the environment: verify the
 * chain ID and the official USDG address against Robinhood's docs before
 * setting them. Nothing here is hardcoded from the prototype.
 */
export type Address = `0x${string}`;

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  usdgAddress: Address;
}

export interface ContractAddresses {
  creditVault: Address | null;
  swapRouter: Address | null;
  fthm: Address | null;
  staking: Address | null;
}

type Env = Record<string, string | undefined>;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function required(env: Env, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`Missing required env var ${key}`);
  return v;
}

function address(env: Env, key: string): Address | null {
  const v = env[key]?.trim();
  if (!v) return null;
  if (!ADDRESS_RE.test(v)) throw new Error(`${key} is not a valid 0x address`);
  return v as Address;
}

function url(env: Env, key: string): string {
  const v = required(env, key);
  try {
    return new URL(v).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${key} is not a valid URL`);
  }
}

/** Throws if any required chain setting is missing or malformed. */
export function loadChainConfig(env: Env = process.env): ChainConfig {
  const chainId = Number(required(env, 'CHAIN_ID'));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('CHAIN_ID must be a positive integer');
  const usdgAddress = address(env, 'USDG_ADDRESS');
  if (!usdgAddress) throw new Error('Missing required env var USDG_ADDRESS');
  return {
    chainId,
    name: env.CHAIN_NAME?.trim() || 'Robinhood Chain',
    rpcUrl: url(env, 'RPC_URL'),
    explorerUrl: url(env, 'EXPLORER_URL'),
    usdgAddress,
  };
}

/** Deployed contract addresses; null until a contract is deployed. */
export function loadContractAddresses(env: Env = process.env): ContractAddresses {
  return {
    creditVault: address(env, 'CREDIT_VAULT_ADDRESS'),
    swapRouter: address(env, 'SWAP_ROUTER_ADDRESS'),
    fthm: address(env, 'FTHM_ADDRESS'),
    staking: address(env, 'STAKING_ADDRESS'),
  };
}

/**
 * The token's contract address (CA) once it is deployed, else null ("coming soon" in the UI).
 * Never throws: a malformed value is treated as unset so a typo can't publish a wrong CA.
 */
export function tokenAddress(env: Env = process.env): Address | null {
  for (const key of ['TOKEN_ADDRESS', 'FTHM_ADDRESS']) {
    const v = env[key]?.trim();
    if (v && ADDRESS_RE.test(v)) return v as Address;
  }
  return null;
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
