import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createPublicClient, custom, encodeAbiParameters, toFunctionSelector } from 'viem';
import { PrismaClient } from '@fathom/db';
import { createMockProvider, type InferenceProvider } from '../src/inference';
import {
  createCoinGecko,
  createTokenScanner,
  detectAddress,
  detectPriceQuestion,
  type CryptoTools,
} from '../src/crypto';
import { bytecodeRuleCodes, formatAmount } from '../src/crypto/blockscout';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, sseEvents } from './helpers';

type Ev = Record<string, any>;
const TOKEN = '0x1111111111111111111111111111111111111111';
const WALLET = '0x2222222222222222222222222222222222222222';
const WHALE = '0x3333333333333333333333333333333333333333';
const POOL = '0x4444444444444444444444444444444444444444';

/** A fetch that answers from a path → JSON map and records every URL it was asked for. */
function fakeFetch(routes: Record<string, unknown>) {
  const urls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const path = Object.keys(routes).find((p) => url.endsWith(p) || url.includes(`${p}?`));
    if (!path) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { f, urls };
}

/** viem client whose eth_call for owner() returns `owner`. */
const ownerChain = (owner: string) =>
  createPublicClient({
    transport: custom({
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_call') return `0x${owner.slice(2).padStart(64, '0')}`;
        if (method === 'eth_chainId') return '0x1237';
        throw new Error(`unexpected ${method}`);
      },
    }),
  });

const SUPPLY = '1000000000000000000000000000'; // 1B with 18 decimals
const tokenRoutes = (abi: unknown[]) => ({
  [`/addresses/${TOKEN}`]: { hash: TOKEN, is_contract: true, is_verified: true, name: 'MoonToken', token: { name: 'Moon', symbol: 'MOON', type: 'ERC-20' }, implementations: [] },
  [`/tokens/${TOKEN}`]: { address_hash: TOKEN, name: 'Moon', symbol: 'MOON', type: 'ERC-20', decimals: '18', total_supply: SUPPLY, holders_count: '1234', exchange_rate: '0.0012', circulating_market_cap: null },
  [`/tokens/${TOKEN}/holders`]: {
    items: [
      { address: { hash: WHALE, is_contract: false }, value: '300000000000000000000000000' }, // 30%
      { address: { hash: POOL, is_contract: true, name: 'Pool' }, value: '200000000000000000000000000' }, // 20%
      { address: { hash: '0x000000000000000000000000000000000000dEaD', is_contract: false }, value: '400000000000000000000000000' }, // burn 40%
      { address: { hash: WALLET, is_contract: false }, value: '50000000000000000000000000' }, // 5%
    ],
  },
  [`/smart-contracts/${TOKEN}`]: { is_verified: true, name: 'MoonToken', abi },
});
const fn = (name: string, stateMutability = 'nonpayable') => ({ type: 'function', name, stateMutability, inputs: [], outputs: [] });

describe('crypto detection', () => {
  it('finds a 0x address', () => {
    expect(detectAddress(`is ${TOKEN} safe?`)).toBe(TOKEN);
    expect(detectAddress('no address here 0x1234')).toBeNull();
  });

  it('only treats price questions as price questions', () => {
    expect(detectPriceQuestion('What is the price of bitcoin and ETH?')).toEqual([{ id: 'bitcoin' }, { id: 'ethereum' }]);
    expect(detectPriceQuestion('berapa harga sol hari ini')).toEqual([{ id: 'solana' }]);
    expect(detectPriceQuestion('$PEPE and $WAGMI price?')).toEqual([{ id: 'pepe' }, { symbol: 'wagmi' }]);
    expect(detectPriceQuestion('How does the crypto market look today?')).toEqual([{ id: 'bitcoin' }, { id: 'ethereum' }, { id: 'solana' }]);
    // Not a price question: no outside request.
    expect(detectPriceQuestion('Explain how bitcoin mining works')).toEqual([]);
    // Everyday words are not coins unless written in capitals.
    expect(detectPriceQuestion('Is the price near the top? I have a ton of questions')).toEqual([]);
    expect(detectPriceQuestion('NEAR price today')).toEqual([{ id: 'near' }]);
    expect(detectPriceQuestion('the price to stop loss')).toEqual([]);
  });

  it('formats raw amounts', () => {
    expect(formatAmount(SUPPLY, 18)).toBe('1B');
    expect(formatAmount('1500000', 6)).toBe('1.5');
    expect(formatAmount('2500000000000000000000', 18)).toBe('2.5K');
    expect(formatAmount('100000000', 0)).toBe('100M');
    expect(formatAmount('999800000000000', 6)).toBe('1B');
    expect(formatAmount('120000', 0)).toBe('120K');
  });
});

describe('Token Safety Check (Blockscout)', () => {
  it('flags mint, blacklist, fees, concentration and a whale; reads the owner over RPC', async () => {
    const { f, urls } = fakeFetch(tokenRoutes([fn('transfer'), fn('mint'), fn('addToBlacklist'), fn('setSellFee'), fn('balanceOf', 'view')]));
    const owner = '0x5555555555555555555555555555555555555555';
    const scanner = createTokenScanner({ apiBase: 'https://ex.test/api/v2/', explorerUrl: 'https://ex.test', chainName: 'Robinhood Chain', chain: ownerChain(owner) as any, fetch: f });
    const r = await scanner.scan(TOKEN, new AbortController().signal);

    expect(r).toMatchObject({ kind: 'token', name: 'Moon', symbol: 'MOON', holders: 1234, verified: true, totalSupply: '1B', priceUsd: 0.0012, proxy: false });
    expect(r.explorerUrl).toBe(`https://ex.test/address/${TOKEN}`);
    expect(r.owner).toEqual({ address: owner, renounced: false });
    // Burn address excluded from concentration: 30 + 20 + 5.
    expect(r.top10Pct).toBe(55);
    expect(r.topHolders.find((h) => h.label === 'burn')).toBeTruthy();
    const codes = r.flags.map((x) => `${x.level}:${x.code}`);
    expect(codes).toEqual(expect.arrayContaining(['high:mint', 'high:blacklist', 'medium:fees', 'medium:concentration', 'high:whale', 'info:owned', 'info:contract_holders']));
    expect(r.flags[0]!.level).toBe('high'); // sorted by severity
    // Only public explorer paths were requested; no query strings with user text.
    expect(urls.every((u) => u.startsWith('https://ex.test/api/v2/'))).toBe(true);

    // Cached: a second scan makes no new requests.
    const n = urls.length;
    await scanner.scan(TOKEN, new AbortController().signal);
    expect(urls.length).toBe(n);
  });

  it('downgrades owner-only risks when ownership is renounced, and flags unverified source', async () => {
    const routes = tokenRoutes([fn('mint')]);
    (routes[`/addresses/${TOKEN}`] as any).is_verified = false;
    (routes[`/smart-contracts/${TOKEN}`] as any).is_verified = false;
    const { f } = fakeFetch(routes);
    const scanner = createTokenScanner({ apiBase: 'https://ex.test/api/v2', explorerUrl: null, chainName: 'Robinhood Chain', chain: ownerChain('0x000000000000000000000000000000000000dEaD') as any, fetch: f });
    const r = await scanner.scan(TOKEN, new AbortController().signal);
    expect(r.owner?.renounced).toBe(true);
    const codes = r.flags.map((x) => `${x.level}:${x.code}`);
    expect(codes).toEqual(expect.arrayContaining(['high:unverified', 'info:mint', 'ok:renounced']));
  });

  it('reports a plain wallet', async () => {
    const { f } = fakeFetch({
      [`/addresses/${WALLET}`]: { hash: WALLET, is_contract: false, coin_balance: '1500000000000000000', token: null },
      [`/addresses/${WALLET}/counters`]: { transactions_count: '42' },
    });
    const scanner = createTokenScanner({ apiBase: 'https://ex.test/api/v2', explorerUrl: null, chainName: 'Robinhood Chain', chain: null, fetch: f });
    const r = await scanner.scan(WALLET, new AbortController().signal);
    expect(r.kind).toBe('wallet');
    expect(r.wallet).toEqual({ balance: '1.5', txCount: 42 });
  });
});

describe('Token Safety Check (RPC fallback)', () => {
  const sel = (sig: string) => toFunctionSelector(sig).slice(2);
  const IMPL = '0x7777777777777777777777777777777777777777';
  // Proxy bytecode has nothing; the implementation has mint + setSellTax + transfer.
  const implCode = `0x6080604052${'63' + sel('mint(address,uint256)')}14${'63' + sel('setSellTax(uint256)')}14${'63' + sel('transfer(address,uint256)')}14`;
  const proxyCode = '0x6080604052363d3d37';

  /** A chain that answers ERC-20 reads, owner(), the EIP-1967 slot and getCode for a proxied token. */
  const rpcChain = (calls: string[]) =>
    createPublicClient({
      transport: custom({
        request: async ({ method, params }: { method: string; params: any }) => {
          calls.push(method);
          if (method === 'eth_chainId') return '0x1237';
          if (method === 'eth_getCode') return params[0].toLowerCase() === IMPL ? implCode : params[0].toLowerCase() === TOKEN ? proxyCode : '0x';
          if (method === 'eth_getStorageAt') return `0x${IMPL.slice(2).padStart(64, '0')}`;
          if (method === 'eth_getBalance') return '0x0';
          if (method === 'eth_getTransactionCount') return '0x3';
          if (method === 'eth_call') {
            const data: string = params[0].data;
            const s4 = data.slice(2, 10);
            if (s4 === sel('name()')) return encodeAbiParameters([{ type: 'string' }], ['Rug Coin']);
            if (s4 === sel('symbol()')) return encodeAbiParameters([{ type: 'string' }], ['RUG']);
            if (s4 === sel('decimals()')) return encodeAbiParameters([{ type: 'uint8' }], [18]);
            if (s4 === sel('totalSupply()')) return encodeAbiParameters([{ type: 'uint256' }], [10n ** 27n]);
            if (s4 === sel('owner()')) return encodeAbiParameters([{ type: 'address' }], [WALLET]);
          }
          throw new Error(`unexpected ${method}`);
        },
      }),
    });

  it('detects privileged functions from bytecode selectors', () => {
    expect([...bytecodeRuleCodes(implCode)].sort()).toEqual(['fees', 'mint']);
    expect(bytecodeRuleCodes('0x6080')).toEqual(new Set());
  });

  it('falls back to RPC when the explorer answers with a Cloudflare page, then skips the explorer for a while', async () => {
    const urls: string[] = [];
    const cloudflare = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response('<!DOCTYPE html><title>Just a moment...</title>', { status: 403, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
    const calls: string[] = [];
    const scanner = createTokenScanner({ apiBase: 'https://ex.test/api/v2', explorerUrl: 'https://ex.test', chainName: 'Robinhood Chain', chain: rpcChain(calls) as any, fetch: cloudflare });
    const r = await scanner.scan(TOKEN, new AbortController().signal);
    expect(r).toMatchObject({ source: 'rpc', kind: 'token', name: 'Rug Coin', symbol: 'RUG', totalSupply: '1B', proxy: true, verified: null, top10Pct: null });
    expect(r.owner).toEqual({ address: WALLET, renounced: false });
    const codes = r.flags.map((x) => `${x.level}:${x.code}`);
    expect(codes).toEqual(expect.arrayContaining(['high:mint', 'medium:fees', 'medium:proxy', 'info:owned', 'info:rpc_only']));
    expect(r.flags[0]!.level).toBe('high');

    // Another address right after: the explorer is skipped (no new fetch), RPC answers.
    const n = urls.length;
    const w = await scanner.scan(WHALE, new AbortController().signal);
    expect(urls.length).toBe(n);
    expect(w).toMatchObject({ source: 'rpc', kind: 'wallet', wallet: { balance: '0', txCount: 3 } });
  });

  it('works with no explorer configured at all', async () => {
    const scanner = createTokenScanner({ apiBase: null, explorerUrl: null, chainName: 'Robinhood Chain', chain: rpcChain([]) as any });
    const r = await scanner.scan(TOKEN, new AbortController().signal);
    expect(r.source).toBe('rpc');
    expect(r.symbol).toBe('RUG');
  });
});

describe('Live prices (CoinGecko)', () => {
  it('resolves tickers by exact symbol and best rank, then caches prices', async () => {
    const { f, urls } = fakeFetch({
      '/search': { coins: [{ id: 'wagmi-fake', symbol: 'WAGMI', market_cap_rank: 900 }, { id: 'wagmi-real', name: 'Wagmi', symbol: 'wagmi', market_cap_rank: 120 }, { id: 'notit', symbol: 'WAG' }] },
      '/coins/markets': [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 64000.5, price_change_percentage_24h: -1.234, market_cap: 1.26e12, total_volume: 3.1e10 },
        { id: 'wagmi-real', symbol: 'wagmi', name: 'Wagmi', current_price: 0.0042, price_change_percentage_24h: null, market_cap: null, total_volume: null },
      ],
    });
    const feed = createCoinGecko({ apiKey: 'k', fetch: f });
    const p = await feed.prices([{ id: 'bitcoin' }, { symbol: 'wagmi' }], new AbortController().signal);
    expect(p.map((x) => x.id)).toEqual(['bitcoin', 'wagmi-real']);
    expect(p[0]).toMatchObject({ symbol: 'BTC', usd: 64000.5, change24h: -1.234 });
    expect(urls.some((u) => u.includes('ids=bitcoin,wagmi-real'))).toBe(true);
    const n = urls.length;
    await feed.prices([{ id: 'bitcoin' }], new AbortController().signal);
    expect(urls.length).toBe(n);
  });
});

const up = await servicesUp();

describe.skipIf(!up)('chat with crypto tools', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const seen: { role: string; content: string }[][] = [];
  const mock = createMockProvider({ delayMs: 1 });
  const provider: InferenceProvider = {
    name: mock.name,
    providerModelId: mock.providerModelId.bind(mock),
    models: mock.models.bind(mock),
    attestation: mock.attestation.bind(mock),
    chatStream: (args) => {
      seen.push(args.messages as { role: string; content: string }[]);
      return mock.chatStream(args);
    },
  };
  const { f } = fakeFetch({
    ...tokenRoutes([fn('mint')]),
    '/coins/markets': [{ id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3100, price_change_percentage_24h: 2.5, market_cap: 3.7e11, total_volume: 1.2e10 }],
  });
  const crypto: CryptoTools = {
    scanner: createTokenScanner({ apiBase: 'https://ex.test/api/v2', explorerUrl: 'https://ex.test', chainName: 'Robinhood Chain', chain: null, fetch: f }),
    prices: createCoinGecko({ fetch: f }),
  };

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV, { provider, crypto }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  const chat = async (content: string) => {
    const r = await signIn(app, nextIp());
    addresses.push(r.account.address.toLowerCase());
    const res = await app.inject({ method: 'POST', url: '/chat', cookies: { nx_session: r.session! }, payload: { model: 'deepseek-v4-pro', messages: [{ role: 'user', content }] } });
    expect(res.statusCode).toBe(200);
    return sseEvents(res.body) as Ev[];
  };

  it('runs the token check for a pasted address and gives the model the report', async () => {
    const events = await chat(`Check this token ${TOKEN}`);
    const tool = events.filter((e) => e.type === 'tool');
    expect(tool.map((e) => e.status)).toEqual(['running', 'done']);
    expect(tool[1]!.report).toMatchObject({ symbol: 'MOON', address: TOKEN });
    const sys = seen.at(-1)!.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    expect(sys).toContain(`On-chain data for ${TOKEN}`);
    expect(sys).toContain('not financial advice');
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('adds live prices for a price question, and nothing for ordinary chat', async () => {
    const events = await chat('What is the ETH price right now?');
    const tool = events.filter((e) => e.type === 'tool');
    expect(tool.at(-1)).toMatchObject({ tool: 'price', status: 'done' });
    expect(seen.at(-1)!.some((m) => m.role === 'system' && m.content.includes('Ethereum (ETH): $3,100'))).toBe(true);

    const plain = await chat('Write a haiku about the sea');
    expect(plain.some((e) => e.type === 'tool')).toBe(false);
  });
});
