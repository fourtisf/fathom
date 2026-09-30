import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import type { ChainEnv } from './env';

export type ChainClient = PublicClient;

export const RPC_TIMEOUT_MS = 5_000;

/** Read-only client for the configured chain. Tests inject one backed by a fake transport. */
export function createChainClient(chain: ChainEnv): ChainClient {
  return createPublicClient({ transport: http(chain.rpcUrl, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }) }) as ChainClient;
}

/** Rejects after `ms` so a slow RPC can't hold a request open. */
export function withTimeout<T>(p: Promise<T>, ms = RPC_TIMEOUT_MS): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error('rpc timeout')), ms);
      t.unref();
    }),
  ]).finally(() => clearTimeout(t));
}

/** True when the address has sent a transaction or holds native balance on the configured chain. */
export async function hasOnchainActivity(client: ChainClient, address: Address): Promise<boolean> {
  const [count, balance] = await withTimeout(
    Promise.all([client.getTransactionCount({ address }), client.getBalance({ address })]),
  );
  return count > 0 || balance > 0n;
}
