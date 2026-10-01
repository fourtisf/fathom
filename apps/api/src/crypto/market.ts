import type { MarketInfo, TokenReport } from './blockscout';

/**
 * DEX market data from DexScreener's public API (no key): liquidity, price and pool age for a token.
 * Requests go out from our server, so the user's IP never reaches DexScreener.
 */

const TIMEOUT_MS = 6_000;
type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export interface MarketFeed {
  /** Null: DexScreener lists no pool for this token. Throws when DexScreener can't be reached. */
  market(chainId: string, address: string, signal: AbortSignal): Promise<{ info: MarketInfo; name: string | null; symbol: string | null } | null>;
}

export function createDexScreener(opts: { baseUrl?: string; fetch?: typeof fetch } = {}): MarketFeed {
  const base = (opts.baseUrl ?? 'https://api.dexscreener.com').replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;
  return {
    async market(chainId, address, signal) {
      const res = await doFetch(`${base}/tokens/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`, {
        headers: { accept: 'application/json', 'user-agent': 'Noxsea/1.0 (+https://noxsea.xyz)' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('json')) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`dexscreener HTTP ${res.status}`);
      }
      const body: unknown = await res.json();
      // tokens/v1 answers with an array of pairs; older endpoints wrap them in { pairs }.
      const list = Array.isArray(body) ? body : Array.isArray(obj(body)?.pairs) ? (obj(body)!.pairs as unknown[]) : [];
      const want = address.toLowerCase();
      const pairs = list.map(obj).filter((p): p is Json => !!p);
      if (!pairs.length) return null;
      const isBase = (p: Json) => str(obj(p.baseToken)?.address)?.toLowerCase() === want;
      const liq = (p: Json) => num(obj(p.liquidity)?.usd) ?? 0;
      const ranked = [...pairs].sort((a, b) => liq(b) - liq(a));
      const top = ranked.find(isBase) ?? ranked[0]!;
      const baseSide = isBase(top);
      const token = obj(baseSide ? top.baseToken : top.quoteToken);
      const created = num(top.pairCreatedAt);
      const info: MarketInfo = {
        priceUsd: baseSide ? num(top.priceUsd) : null,
        liquidityUsd: pairs.reduce((n, p) => n + liq(p), 0),
        fdvUsd: baseSide ? num(top.fdv) : null,
        marketCapUsd: baseSide ? num(top.marketCap) : null,
        volume24hUsd: pairs.reduce<number | null>((n, p) => {
          const v = num(obj(p.volume)?.h24);
          return v === null ? n : (n ?? 0) + v;
        }, null),
        pairs: pairs.length,
        dex: str(top.dexId),
        pairUrl: str(top.url),
        pairCreatedAt: created && created > 0 ? created : null,
      };
      return { info, name: str(token?.name), symbol: str(token?.symbol) };
    },
  };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Flags for liquidity and pool age. `now` in ms. */
export function marketFlags(report: TokenReport, now: number): void {
  if (report.kind !== 'token') return;
  const m = report.market;
  if (m === null) {
    report.flags.push({ level: 'medium', code: 'no_pool', text: 'No trading pool found on DexScreener. It may not be tradable yet, or only trades somewhere unusual.' });
    return;
  }
  if (!m) return;
  if (m.liquidityUsd < 5_000) {
    report.flags.push({ level: 'high', code: 'liquidity', text: `Very low liquidity (${usd(m.liquidityUsd)}). Even small sells move the price a lot.` });
  } else if (m.liquidityUsd < 50_000) {
    report.flags.push({ level: 'medium', code: 'liquidity', text: `Low liquidity (${usd(m.liquidityUsd)}). Large sells will move the price a lot.` });
  } else {
    report.flags.push({ level: 'ok', code: 'liquidity', text: `${usd(m.liquidityUsd)} of liquidity across ${m.pairs} pool${m.pairs === 1 ? '' : 's'}.` });
  }
  if (m.pairCreatedAt) {
    const hours = (now - m.pairCreatedAt) / 3_600_000;
    if (hours >= 0 && hours < 24) {
      report.flags.push({ level: 'medium', code: 'new_pool', text: `The main pool was created ${hours < 1 ? 'less than an hour' : `${Math.floor(hours)} hour${hours < 2 ? '' : 's'}`} ago. Brand-new tokens are the riskiest.` });
    } else if (hours >= 24 && hours < 24 * 7) {
      report.flags.push({ level: 'info', code: 'new_pool', text: `The main pool is ${Math.floor(hours / 24)} day${hours < 48 ? '' : 's'} old.` });
    }
  }
}
