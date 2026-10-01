/**
 * Chains the public Token Scanner can read. The home chain (Robinhood Chain) uses the app's own chain
 * config; the others use public RPCs (override with SCAN_RPC_<KEY>, e.g. SCAN_RPC_ETHEREUM).
 */
export interface ScanChain {
  key: string;
  name: string;
  short: string;
  kind: 'evm' | 'solana';
  chainId?: number;
  rpc: string;
  /** Explorer web base for links. */
  explorer: string;
  /** DexScreener chain id for market data, when DexScreener lists the chain. */
  dexscreener: string | null;
  native: string;
}

export const HOME_SCAN_CHAIN = 'robinhood';

export const SCAN_CHAINS: ScanChain[] = [
  { key: 'robinhood', name: 'Robinhood Chain', short: 'Robinhood', kind: 'evm', chainId: 4663, rpc: '', explorer: '', dexscreener: null, native: 'ETH' },
  { key: 'solana', name: 'Solana', short: 'Solana', kind: 'solana', rpc: 'https://api.mainnet-beta.solana.com', explorer: 'https://solscan.io', dexscreener: 'solana', native: 'SOL' },
  { key: 'ethereum', name: 'Ethereum', short: 'Ethereum', kind: 'evm', chainId: 1, rpc: 'https://ethereum-rpc.publicnode.com', explorer: 'https://etherscan.io', dexscreener: 'ethereum', native: 'ETH' },
  { key: 'base', name: 'Base', short: 'Base', kind: 'evm', chainId: 8453, rpc: 'https://base-rpc.publicnode.com', explorer: 'https://basescan.org', dexscreener: 'base', native: 'ETH' },
  { key: 'bsc', name: 'BNB Chain', short: 'BNB', kind: 'evm', chainId: 56, rpc: 'https://bsc-rpc.publicnode.com', explorer: 'https://bscscan.com', dexscreener: 'bsc', native: 'BNB' },
  { key: 'arbitrum', name: 'Arbitrum', short: 'Arbitrum', kind: 'evm', chainId: 42161, rpc: 'https://arbitrum-one-rpc.publicnode.com', explorer: 'https://arbiscan.io', dexscreener: 'arbitrum', native: 'ETH' },
  { key: 'polygon', name: 'Polygon', short: 'Polygon', kind: 'evm', chainId: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', explorer: 'https://polygonscan.com', dexscreener: 'polygon', native: 'POL' },
  { key: 'optimism', name: 'Optimism', short: 'Optimism', kind: 'evm', chainId: 10, rpc: 'https://optimism-rpc.publicnode.com', explorer: 'https://optimistic.etherscan.io', dexscreener: 'optimism', native: 'ETH' },
  { key: 'avalanche', name: 'Avalanche', short: 'Avalanche', kind: 'evm', chainId: 43114, rpc: 'https://avalanche-c-chain-rpc.publicnode.com', explorer: 'https://snowtrace.io', dexscreener: 'avalanche', native: 'AVAX' },
];

export const getScanChain = (key: string): ScanChain | undefined => SCAN_CHAINS.find((c) => c.key === key);

export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
/** Base58, 32–44 chars: a Solana account (mint or wallet). */
export const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** 'evm', 'solana' or null for anything that isn't an address. */
export function addressKind(a: string): 'evm' | 'solana' | null {
  return EVM_ADDRESS_RE.test(a) ? 'evm' : SOLANA_ADDRESS_RE.test(a) ? 'solana' : null;
}
