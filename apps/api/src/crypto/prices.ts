/**
 * Live crypto prices from CoinGecko, fetched by our server (the user's IP never reaches CoinGecko).
 * Only coin ids leave the server, never the user's message. Results are cached in memory, not Redis,
 * so nothing derived from a prompt is written anywhere.
 */

export interface CoinPrice {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
}

export interface PriceFeed {
  /** Resolves coin mentions (ids from KNOWN_COINS or `$TICKER` symbols) to live prices. */
  prices(mentions: CoinMention[], signal: AbortSignal): Promise<CoinPrice[]>;
}

export type CoinMention = { id: string } | { symbol: string };

/** Common coins: name or symbol (lowercase) to CoinGecko id. Covers most price questions without a search call. */
export const KNOWN_COINS: Record<string, string> = {
  btc: 'bitcoin', bitcoin: 'bitcoin',
  eth: 'ethereum', ethereum: 'ethereum', ether: 'ethereum',
  sol: 'solana', solana: 'solana',
  bnb: 'binancecoin',
  xrp: 'ripple', ripple: 'ripple',
  doge: 'dogecoin', dogecoin: 'dogecoin',
  ada: 'cardano', cardano: 'cardano',
  ton: 'the-open-network', toncoin: 'the-open-network',
  trx: 'tron', tron: 'tron',
  avax: 'avalanche-2', avalanche: 'avalanche-2',
  link: 'chainlink', chainlink: 'chainlink',
  dot: 'polkadot', polkadot: 'polkadot',
  pol: 'polygon-ecosystem-token', matic: 'polygon-ecosystem-token', polygon: 'polygon-ecosystem-token',
  shib: 'shiba-inu', 'shiba inu': 'shiba-inu',
  pepe: 'pepe',
  wif: 'dogwifcoin', dogwifhat: 'dogwifcoin',
  bonk: 'bonk',
  arb: 'arbitrum', arbitrum: 'arbitrum',
  op: 'optimism', optimism: 'optimism',
  sui: 'sui',
  apt: 'aptos', aptos: 'aptos',
  ltc: 'litecoin', litecoin: 'litecoin',
  near: 'near',
  uni: 'uniswap', uniswap: 'uniswap',
  hype: 'hyperliquid', hyperliquid: 'hyperliquid',
  usdc: 'usd-coin',
  usdt: 'tether', tether: 'tether',
  trump: 'official-trump',
};

/** Symbols that are also everyday words: matched only when written in capitals (NEAR, TON) or as $TICKER. */
const AMBIGUOUS = new Set(['near', 'ton', 'link', 'dot', 'op', 'uni', 'hype', 'trump', 'pol', 'sui', 'apt', 'arb', 'ether']);

const PRICE_WORDS =
  /\b(price|prices|pricing|worth|value|mcap|market ?cap|marketcap|chart|trading at|ath|pump(?:ing|ed)?|dump(?:ing|ed)?|rally|crash(?:ing|ed)?|how much is|harga|berapa|naik|turun|nilai)\b/i;
const MARKET_WORDS = /\b(crypto market|market today|markets today|pasar crypto|pasar kripto|market update|market overview)\b/i;

/**
 * Finds coins a message asks the price of. Returns [] unless the message reads like a price question,
 * so ordinary chats never trigger an outside request. A market-overview question gets BTC, ETH and SOL.
 */
export function detectPriceQuestion(text: string): CoinMention[] {
  const t = text.slice(0, 2_000);
  const market = MARKET_WORDS.test(t);
  if (!PRICE_WORDS.test(t) && !market) return [];
  const out: CoinMention[] = [];
  const seen = new Set<string>();
  const push = (m: CoinMention) => {
    const k = 'id' in m ? `id:${m.id}` : `sym:${m.symbol}`;
    if (!seen.has(k) && out.length < 4) {
      seen.add(k);
      out.push(m);
    }
  };
  // $TICKER mentions first: the user named them explicitly.
  for (const m of t.matchAll(/\$([a-z][a-z0-9]{1,9})\b/gi)) {
    const sym = m[1]!.toLowerCase();
    push(KNOWN_COINS[sym] ? { id: KNOWN_COINS[sym]! } : { symbol: sym });
  }
  for (const [word, id] of Object.entries(KNOWN_COINS)) {
    // Standalone words only (no "op" in "stop", no "link" inside a URL). Ambiguous ones must be in capitals.
    const pattern = AMBIGUOUS.has(word) ? word.toUpperCase() : word.replace(/ /g, '\\s+');
    const re = new RegExp(`(^|[^A-Za-z0-9$/.])${pattern}([^A-Za-z0-9]|$)`, AMBIGUOUS.has(word) ? '' : 'i');
    if (re.test(t)) push({ id });
  }
  if (out.length === 0 && market) for (const id of ['bitcoin', 'ethereum', 'solana']) push({ id });
  return out;
}

export interface PriceFeedOptions {
  apiKey?: string | null;
  /** 'demo' (free key, api.coingecko.com) or 'pro'. Without a key the public API is used. */
  plan?: 'demo' | 'pro';
  /** Override the API base (a proxy or a test server). */
  baseUrl?: string | null;
  fetch?: typeof fetch;
  now?: () => number;
}

const TIMEOUT_MS = 6_000;
const PRICE_TTL = 60_000;
const SEARCH_TTL = 6 * 3_600_000;

export function createCoinGecko(opts: PriceFeedOptions = {}): PriceFeed {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const pro = opts.plan === 'pro' && !!opts.apiKey;
  const base = (opts.baseUrl ?? (pro ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3')).replace(/\/$/, '');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.apiKey) headers[pro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = opts.apiKey;

  const priceCache = new Map<string, { at: number; v: CoinPrice | null }>();
  const symbolCache = new Map<string, { at: number; v: { id: string; name: string; symbol: string } | null }>();
  const meta = new Map<string, { name: string; symbol: string }>();

  async function get(path: string, signal: AbortSignal): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`coingecko HTTP ${res.status}`);
    }
    return res.json();
  }

  async function resolveSymbol(symbol: string, signal: AbortSignal) {
    const hit = symbolCache.get(symbol);
    if (hit && now() - hit.at < SEARCH_TTL) return hit.v;
    const json = (await get(`/search?query=${encodeURIComponent(symbol)}`, signal)) as {
      coins?: { id?: string; name?: string; symbol?: string; market_cap_rank?: number | null }[];
    };
    // Exact symbol matches only, best market-cap rank first: many scam tokens copy popular tickers.
    const best = (json.coins ?? [])
      .filter((c) => c.id && c.symbol?.toLowerCase() === symbol)
      .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];
    const v = best ? { id: best.id!, name: best.name ?? best.id!, symbol: best.symbol! } : null;
    symbolCache.set(symbol, { at: now(), v });
    return v;
  }

  return {
    async prices(mentions, signal) {
      const ids: string[] = [];
      for (const m of mentions) {
        if ('id' in m) ids.push(m.id);
        else {
          const r = await resolveSymbol(m.symbol, signal).catch(() => null);
          if (r) {
            ids.push(r.id);
            meta.set(r.id, { name: r.name, symbol: r.symbol });
          }
        }
      }
      const unique = [...new Set(ids)];
      const stale = unique.filter((id) => {
        const c = priceCache.get(id);
        return !c || now() - c.at >= PRICE_TTL;
      });
      if (stale.length) {
        const q = `/coins/markets?vs_currency=usd&ids=${stale.map(encodeURIComponent).join(',')}&price_change_percentage=24h`;
        const rows = (await get(q, signal)) as {
          id?: string; symbol?: string; name?: string; current_price?: number | null;
          price_change_percentage_24h?: number | null; market_cap?: number | null; total_volume?: number | null;
        }[];
        const got = new Set<string>();
        for (const r of Array.isArray(rows) ? rows : []) {
          if (!r.id || typeof r.current_price !== 'number') continue;
          got.add(r.id);
          priceCache.set(r.id, {
            at: now(),
            v: {
              id: r.id,
              symbol: (r.symbol ?? meta.get(r.id)?.symbol ?? r.id).toUpperCase(),
              name: r.name ?? meta.get(r.id)?.name ?? r.id,
              usd: r.current_price,
              change24h: typeof r.price_change_percentage_24h === 'number' ? r.price_change_percentage_24h : null,
              marketCapUsd: typeof r.market_cap === 'number' ? r.market_cap : null,
              volume24hUsd: typeof r.total_volume === 'number' ? r.total_volume : null,
            },
          });
        }
        for (const id of stale) if (!got.has(id)) priceCache.set(id, { at: now(), v: null });
        if (priceCache.size > 1_000) priceCache.delete(priceCache.keys().next().value!);
      }
      return unique.map((id) => priceCache.get(id)?.v).filter((p): p is CoinPrice => !!p);
    },
  };
}

const usd = (n: number) =>
  n >= 1 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `$${n.toPrecision(4).replace(/0+$/, '')}`;
const big = (n: number) => {
  for (const [v, u] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M']] as const) if (n >= v) return `$${(n / v).toFixed(2)}${u}`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
};

export function priceSystemMessage(prices: CoinPrice[], at: Date): string {
  const lines = prices.map((p) => {
    const parts = [`${p.name} (${p.symbol}): ${usd(p.usd)}`];
    if (p.change24h !== null) parts.push(`24h ${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}%`);
    if (p.marketCapUsd) parts.push(`market cap ${big(p.marketCapUsd)}`);
    if (p.volume24hUsd) parts.push(`24h volume ${big(p.volume24hUsd)}`);
    return `- ${parts.join(', ')}`;
  });
  return (
    `Live market data from CoinGecko, fetched ${at.toISOString()}:\n${lines.join('\n')}\n\n` +
    'Use these numbers for current prices instead of your training data, and mention they are live as of now. ' +
    'Never predict prices or tell the user to buy or sell.'
  );
}
