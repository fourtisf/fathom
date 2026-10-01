import { createPublicClient, http, type Address } from 'viem';
import { HOME_SCAN_CHAIN, SCAN_CHAINS, addressKind, type ScanChain } from '@fathom/config';
import { withTimeout, type ChainClient } from '../chain';
import { createTokenScanner, holderFlags, sortFlags, unverifiedFlag, type TokenReport, type TokenScanner } from './blockscout';
import { applyGoPlus, type SecurityFeed } from './goplus';
import { marketFlags, type MarketFeed } from './market';

/**
 * The Token Safety Check across chains: Robinhood Chain (the app's own explorer + RPC), Solana, and the
 * big EVM chains over public RPCs, plus DEX market data and, for EVM chains without our explorer, GoPlus.
 * "auto" finds the chain an 0x address is deployed on.
 */

export class ScanInputError extends Error {
  constructor(
    public code: 'invalid_address' | 'unknown_chain' | 'wrong_chain',
    message: string,
  ) {
    super(message);
  }
}

export interface MultiScanner {
  /** Chains this deployment can scan, in display order. */
  chains: { key: string; name: string; kind: 'evm' | 'solana' }[];
  /** `chain` is a SCAN_CHAINS key or 'auto' (default). Throws ScanInputError for bad input. */
  scan(address: string, signal: AbortSignal, chain?: string): Promise<TokenReport>;
}

export interface MultiScannerOptions {
  /** Scanner and client for the app's own chain (Robinhood Chain). */
  home: TokenScanner | null;
  homeClient: ChainClient | null;
  homeName: string;
  solana: { scan(address: string, signal: AbortSignal): Promise<TokenReport> } | null;
  market: MarketFeed | null;
  security: SecurityFeed | null;
  /** RPC URL overrides by chain key. */
  rpc?: Record<string, string | undefined>;
  /** Tests inject clients; production builds viem clients for the public RPCs. */
  clientFor?: (c: ScanChain) => ChainClient;
  /** Only the home chain (SCAN_MULTICHAIN=off). */
  onlyHome?: boolean;
  now?: () => number;
}

const CACHE_MS = 5 * 60_000;

export function createMultiScanner(opts: MultiScannerOptions): MultiScanner {
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; report: TokenReport }>();
  const clients = new Map<string, ChainClient>();
  const scanners = new Map<string, TokenScanner>();

  const enabled = SCAN_CHAINS.filter((c) =>
    c.key === HOME_SCAN_CHAIN ? !!opts.home : opts.onlyHome ? false : c.kind === 'solana' ? !!opts.solana : true,
  );
  const evm = enabled.filter((c) => c.kind === 'evm');

  function clientOf(c: ScanChain): ChainClient | null {
    if (c.key === HOME_SCAN_CHAIN) return opts.homeClient;
    let client = clients.get(c.key);
    if (!client) {
      client = opts.clientFor
        ? opts.clientFor(c)
        : (createPublicClient({ transport: http(opts.rpc?.[c.key] || c.rpc, { timeout: 6_000, retryCount: 1 }) }) as ChainClient);
      clients.set(c.key, client);
    }
    return client;
  }

  function scannerOf(c: ScanChain): TokenScanner {
    if (c.key === HOME_SCAN_CHAIN) return opts.home!;
    let s = scanners.get(c.key);
    if (!s) {
      s = createTokenScanner({
        apiBase: null,
        explorerUrl: c.explorer,
        chainName: c.name,
        chainKey: c.key,
        nativeSymbol: c.native,
        chain: clientOf(c),
        rpcNote: `Holder concentration and source verification weren't available for this token. Check them on ${c.explorer.replace(/^https?:\/\//, '')}.`,
        now,
      });
      scanners.set(c.key, s);
    }
    return s;
  }

  /** Chains (in display order) where an 0x address has contract code. */
  async function deployedOn(address: Address): Promise<ScanChain[]> {
    const found = await Promise.all(
      evm.map(async (c) => {
        const client = clientOf(c);
        if (!client) return null;
        const code = await withTimeout(client.getCode({ address }), 6_000).catch(() => null);
        return code && code !== '0x' ? c : null;
      }),
    );
    return found.filter((c): c is ScanChain => !!c);
  }

  type Market = Awaited<ReturnType<MarketFeed['market']>>;
  async function marketOf(c: ScanChain, address: string, signal: AbortSignal): Promise<Market | undefined> {
    if (!opts.market || !c.dexscreener) return undefined;
    return opts.market.market(c.dexscreener, address, signal).catch(() => undefined);
  }

  async function scan(address: string, signal: AbortSignal, chainKey = 'auto'): Promise<TokenReport> {
    const kind = addressKind(address);
    if (!kind) throw new ScanInputError('invalid_address', 'Paste a token address: 0x… for EVM chains, or a Solana mint address.');
    if (chainKey !== 'auto' && !enabled.some((c) => c.key === chainKey)) {
      throw new ScanInputError('unknown_chain', "That chain isn't supported by the scanner.");
    }
    if (kind === 'solana' && chainKey !== 'auto' && chainKey !== 'solana') {
      throw new ScanInputError('wrong_chain', 'This looks like a Solana address. Pick Solana or Auto.');
    }
    if (kind === 'evm' && chainKey === 'solana') {
      throw new ScanInputError('wrong_chain', "Solana addresses don't start with 0x. Pick an EVM chain or Auto.");
    }
    if (kind === 'solana' && !opts.solana) throw new ScanInputError('unknown_chain', 'Solana scanning is not available right now.');

    const cacheKey = `${chainKey}:${kind === 'evm' ? address.toLowerCase() : address}`;
    const hit = cache.get(cacheKey);
    if (hit && now() - hit.at < CACHE_MS) return hit.report;

    let chain: ScanChain;
    let alsoOn: ScanChain[] = [];
    let market: Market | undefined;
    let marketDone = false;
    if (kind === 'solana') {
      chain = SCAN_CHAINS.find((c) => c.key === 'solana')!;
    } else if (chainKey !== 'auto') {
      chain = enabled.find((c) => c.key === chainKey)!;
    } else {
      const found = await deployedOn(address as Address);
      if (found.length > 1) {
        // Same address on several chains: pick the one with the deepest DEX liquidity, else the home chain.
        const markets = await Promise.all(found.map((c) => marketOf(c, address, signal)));
        let best = -1;
        found.forEach((c, i) => {
          const liq = markets[i]?.info.liquidityUsd ?? -1;
          if (liq > (best >= 0 ? (markets[best]?.info.liquidityUsd ?? -1) : -1)) best = i;
        });
        const pick = best >= 0 && (markets[best]?.info.liquidityUsd ?? 0) > 0 ? best : Math.max(0, found.findIndex((c) => c.key === HOME_SCAN_CHAIN));
        chain = found[pick]!;
        market = markets[pick];
        marketDone = true;
      } else {
        chain = found[0] ?? evm.find((c) => c.key === HOME_SCAN_CHAIN) ?? evm[0]!;
      }
      alsoOn = found.filter((c) => c.key !== chain.key);
    }

    let report: TokenReport;
    if (chain.kind === 'solana') {
      report = await opts.solana!.scan(address, signal);
    } else {
      // Clone: the per-chain scanners cache their reports and we add to them below.
      report = structuredClone(await scannerOf(chain).scan(address as Address, signal));
      report.chainKey = chain.key;
      if (chain.key !== HOME_SCAN_CHAIN && report.kind === 'token' && opts.security && chain.chainId) {
        const g = await opts.security.token(chain.chainId, address, signal).catch(() => null);
        if (g) {
          const gotHolders = applyGoPlus(report, g);
          if (gotHolders) report.flags = report.flags.filter((f) => f.code !== 'rpc_only');
          if (report.verified === false) unverifiedFlag(report);
          holderFlags(report);
        }
      }
    }

    if (report.kind === 'token') {
      if (!marketDone) market = await marketOf(chain, report.address, signal);
      if (market !== undefined) {
        report.market = market?.info ?? null;
        if (market) {
          report.name ??= market.name;
          report.symbol ??= market.symbol;
          report.priceUsd ??= market.info.priceUsd;
          report.marketCapUsd ??= market.info.marketCapUsd ?? market.info.fdvUsd;
        }
        marketFlags(report, now());
      }
      if (!report.name && chain.kind === 'solana') report.contractName = 'Solana token';
    }
    if (alsoOn.length) report.alsoOn = alsoOn.map((c) => ({ key: c.key, name: c.name }));
    sortFlags(report);

    cache.set(cacheKey, { at: now(), report });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return report;
  }

  return {
    chains: enabled.map((c) => ({ key: c.key, name: c.key === HOME_SCAN_CHAIN ? opts.homeName : c.name, kind: c.kind })),
    scan,
  };
}

const SOLANA_IN_TEXT = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;

/** A Solana-looking address in free text: base58 with digits and both cases, so ordinary words never match. */
export function detectSolanaAddress(text: string): string | null {
  for (const m of text.matchAll(SOLANA_IN_TEXT)) {
    const a = m[0];
    if (/\d/.test(a) && /[a-z]/.test(a) && /[A-Z]/.test(a)) return a;
  }
  return null;
}

const CHAIN_WORDS: [RegExp, string][] = [
  [/\bsolana\b/i, 'solana'],
  [/\b(on|di|chain)\s+(ethereum|eth|mainnet)\b/i, 'ethereum'],
  [/\b(on|di)\s+base\b|\bbase chain\b/i, 'base'],
  [/\b(bsc|bnb chain|binance smart chain)\b/i, 'bsc'],
  [/\barbitrum\b/i, 'arbitrum'],
  [/\bpolygon\b/i, 'polygon'],
  [/\boptimism\b/i, 'optimism'],
  [/\b(avalanche|avax)\b/i, 'avalanche'],
  [/\brobinhood\b/i, 'robinhood'],
];

/** The chain a chat message names ("check this on Base"), or 'auto'. */
export function chainHint(text: string): string {
  for (const [re, key] of CHAIN_WORDS) if (re.test(text)) return key;
  return 'auto';
}
