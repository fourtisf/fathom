/** Mirrors apps/api/src/crypto: public on-chain data and live prices sent with chat tool events. */

export type FlagLevel = 'high' | 'medium' | 'info' | 'ok';

export interface TokenReport {
  address: string;
  chain: string;
  explorerUrl: string | null;
  kind: 'token' | 'contract' | 'wallet';
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  totalSupply: string | null;
  holders: number | null;
  verified: boolean | null;
  contractName: string | null;
  proxy: boolean;
  owner: { address: string | null; renounced: boolean } | null;
  top10Pct: number | null;
  topHolders: { address: string; pct: number; label: 'burn' | 'contract' | 'wallet'; name?: string | null }[];
  priceUsd: number | null;
  marketCapUsd: number | null;
  /** 'rpc' when the explorer was unreachable and the chain was read directly. */
  source?: 'explorer' | 'rpc';
  wallet?: { balance: string; txCount: number | null };
  flags: { level: FlagLevel; code: string; text: string }[];
  fetchedAt: string;
}

export interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
}

export type ToolState =
  | { status: 'running' | 'unavailable' }
  | { status: 'done'; report?: TokenReport; prices?: CoinPrice[] };
