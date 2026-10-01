import { describe, expect, it } from 'vitest';
import { createPublicClient, custom, encodeAbiParameters, toFunctionSelector } from 'viem';
import {
  ScanInputError,
  chainHint,
  createDexScreener,
  createGoPlus,
  createMultiScanner,
  createSolanaScanner,
  detectAddress,
} from '../src/crypto';
import type { ChainClient } from '../src/chain';
import { TEST_ENV, buildCapturingApp } from './helpers';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const signal = () => new AbortController().signal;

const MINT = 'NoxTkn5Vt8mW2yPq3rTkCx9aBcDeFgHiJkLmNoPqRsT';
const ACCT_A = 'AcctA1111111111111111111111111111111111111';
const ACCT_B = 'AcctB2222222222222222222222222222222222222';
const WHALE = 'Wha1e3333333333333333333333333333333333333';
const POOL = 'Poo1Auth444444444444444444444444444444444';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const NOW = Date.UTC(2026, 9, 1, 12);

/** A Solana JSON-RPC node for one Token-2022 mint with a fee, a permanent delegate and two big holders. */
function solanaFetch(calls: string[]) {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init!.body));
    calls.push(method);
    if (method === 'getAccountInfo') {
      const a = params[0];
      if (a === MINT) {
        return json({
          result: {
            value: {
              owner: TOKEN_2022,
              lamports: 1,
              executable: false,
              data: {
                program: 'spl-token-2022',
                parsed: {
                  type: 'mint',
                  info: {
                    decimals: 6,
                    supply: '1000000000000000',
                    mintAuthority: 'MintAuth11111111111111111111111111111111111',
                    freezeAuthority: null,
                    extensions: [
                      { extension: 'transferFeeConfig', state: { newerTransferFee: { transferFeeBasisPoints: 500 }, transferFeeConfigAuthority: 'FeeAuth1111111111111111111111111111111111' } },
                      { extension: 'permanentDelegate', state: { delegate: 'De1egate11111111111111111111111111111111111' } },
                      { extension: 'tokenMetadata', state: { name: 'Nox Test', symbol: 'NXT', updateAuthority: null } },
                    ],
                  },
                },
              },
            },
          },
        });
      }
      if (a === ACCT_A) return json({ result: { value: { owner: TOKEN_2022, data: { parsed: { type: 'account', info: { mint: MINT, owner: WHALE } } } } } });
      if (a === WHALE) return json({ result: { value: { owner: '11111111111111111111111111111111', lamports: 2_500_000_000, data: ['', 'base64'] } } });
      return json({ result: { value: null } });
    }
    if (method === 'getTokenLargestAccounts') {
      return json({ result: { value: [{ address: ACCT_A, amount: '300000000000000' }, { address: ACCT_B, amount: '150000000000000' }] } });
    }
    if (method === 'getMultipleAccounts' && params[1].encoding === 'jsonParsed') {
      return json({ result: { value: [{ data: { parsed: { info: { owner: WHALE } } } }, { data: { parsed: { info: { owner: POOL } } } }] } });
    }
    if (method === 'getMultipleAccounts') {
      return json({ result: { value: [{ owner: '11111111111111111111111111111111' }, { owner: 'PoolProgram11111111111111111111111111111111' }] } });
    }
    throw new Error(`unexpected ${method}`);
  }) as typeof fetch;
}

const dexFetch = (pairs: Record<string, unknown[]>, urls: string[] = []) =>
  (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const key = Object.keys(pairs).find((k) => url.includes(`/tokens/v1/${k}/`));
    return json(key ? pairs[key] : []);
  }) as typeof fetch;

describe('Token Safety Check on Solana', () => {
  it('reads authorities, Token-2022 extensions, holders and DEX liquidity', async () => {
    const calls: string[] = [];
    const scanner = createMultiScanner({
      home: null,
      homeClient: null,
      homeName: 'Robinhood Chain',
      solana: createSolanaScanner({ rpcUrl: 'https://sol.test', explorerUrl: 'https://solscan.io', fetch: solanaFetch(calls), now: () => NOW }),
      market: createDexScreener({
        fetch: dexFetch({
          solana: [
            { dexId: 'raydium', url: 'https://dexscreener.com/solana/p1', baseToken: { address: MINT, name: 'Nox Test', symbol: 'NXT' }, priceUsd: '0.002', liquidity: { usd: 3000 }, fdv: 2000000, volume: { h24: 1200 }, pairCreatedAt: NOW - 2 * 3_600_000 },
          ],
        }),
      }),
      security: null,
      now: () => NOW,
    });
    const r = await scanner.scan(MINT, signal());
    expect(r).toMatchObject({ chain: 'Solana', chainKey: 'solana', kind: 'token', name: 'Nox Test', symbol: 'NXT', tokenType: 'Token-2022', totalSupply: '1B', top10Pct: 45, priceUsd: 0.002 });
    expect(r.explorerUrl).toBe(`https://solscan.io/token/${MINT}`);
    expect(r.solana).toMatchObject({ program: 'Token-2022', freezeAuthority: null });
    expect(r.topHolders).toEqual([
      { address: WHALE, pct: 30, label: 'wallet' },
      { address: POOL, pct: 15, label: 'contract' },
    ]);
    expect(r.market).toMatchObject({ liquidityUsd: 3000, pairs: 1, dex: 'raydium' });
    const codes = r.flags.map((f) => `${f.level}:${f.code}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        'high:mint', 'ok:freeze', 'medium:transfer_fee', 'medium:fees', 'high:permanent_delegate',
        'high:whale', 'medium:concentration', 'high:liquidity', 'medium:new_pool',
      ]),
    );
    expect(r.flags[0]!.level).toBe('high');
    expect(r.flags.at(-1)!.level).toBe('ok');

    // Cached: a second scan makes no RPC calls.
    const n = calls.length;
    await scanner.scan(MINT, signal());
    expect(calls.length).toBe(n);
  });

  it('follows a token account to its mint, and reports a wallet with its SOL balance', async () => {
    const sol = createSolanaScanner({ rpcUrl: 'https://sol.test', explorerUrl: 'https://solscan.io', fetch: solanaFetch([]) });
    const viaAccount = await sol.scan(ACCT_A, signal());
    expect(viaAccount.address).toBe(MINT);
    expect(viaAccount.flags.some((f) => f.code === 'token_account')).toBe(true);
    const wallet = await sol.scan(WHALE, signal());
    expect(wallet).toMatchObject({ kind: 'wallet', nativeSymbol: 'SOL', wallet: { balance: '2.5' } });
  });
});

describe('Token Safety Check on other EVM chains', () => {
  const TOKEN = '0x9999999999999999999999999999999999999999';
  const sel = (sig: string) => toFunctionSelector(sig).slice(2);
  const code = `0x6080604052${'63' + sel('mint(address,uint256)')}14`;

  /** Chains where TOKEN is deployed answer ERC-20 reads; everywhere else it has no code. */
  const clientFor = (deployed: string[]) => (c: { key: string }) =>
    createPublicClient({
      transport: custom({
        request: async ({ method, params }: { method: string; params: any }) => {
          const here = deployed.includes(c.key);
          if (method === 'eth_chainId') return '0x1';
          if (method === 'eth_getCode') return here ? code : '0x';
          if (method === 'eth_getStorageAt') return `0x${'0'.repeat(64)}`;
          if (method === 'eth_getBalance' || method === 'eth_getTransactionCount') return '0x0';
          if (method === 'eth_call') {
            const s4 = (params[0].data as string).slice(2, 10);
            if (s4 === sel('name()')) return encodeAbiParameters([{ type: 'string' }], ['Honey']);
            if (s4 === sel('symbol()')) return encodeAbiParameters([{ type: 'string' }], ['HNY']);
            if (s4 === sel('decimals()')) return encodeAbiParameters([{ type: 'uint8' }], [18]);
            if (s4 === sel('totalSupply()')) return encodeAbiParameters([{ type: 'uint256' }], [10n ** 27n]);
            throw new Error('execution reverted'); // no owner()
          }
          throw new Error(`unexpected ${method}`);
        },
      }),
    }) as unknown as ChainClient;

  it('auto-detects the chain with the deepest liquidity and adds GoPlus honeypot, tax and holder data', async () => {
    const goplusUrls: string[] = [];
    const scanner = createMultiScanner({
      home: null,
      homeClient: null,
      homeName: 'Robinhood Chain',
      solana: null,
      clientFor: clientFor(['ethereum', 'base']),
      market: createDexScreener({
        fetch: dexFetch({
          base: [{ dexId: 'aerodrome', baseToken: { address: TOKEN, name: 'Honey', symbol: 'HNY' }, priceUsd: '1.5', liquidity: { usd: 120000 }, pairCreatedAt: NOW - 30 * 86_400_000 }],
          ethereum: [{ dexId: 'uniswap', baseToken: { address: TOKEN }, liquidity: { usd: 900 } }],
        }),
      }),
      security: createGoPlus({
        fetch: (async (input: string | URL | Request) => {
          goplusUrls.push(String(input));
          return json({
            code: 1,
            message: 'OK',
            result: {
              [TOKEN]: {
                is_open_source: '1',
                is_honeypot: '1',
                buy_tax: '0',
                sell_tax: '0.25',
                holder_count: '812',
                holders: [
                  { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', percent: '0.42', is_contract: 0 },
                  { address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', percent: '0.18', is_contract: 1, is_locked: 1, tag: 'UniCrypt' },
                ],
              },
            },
          });
        }) as typeof fetch,
      }),
      now: () => NOW,
    });
    const r = await scanner.scan(TOKEN, signal());
    expect(r).toMatchObject({ chain: 'Base', chainKey: 'base', kind: 'token', name: 'Honey', verified: true, holders: 812, top10Pct: 60, priceUsd: 1.5 });
    expect(r.alsoOn).toEqual([{ key: 'ethereum', name: 'Ethereum' }]);
    expect(r.explorerUrl).toBe(`https://basescan.org/address/${TOKEN}`);
    expect(goplusUrls[0]).toContain('/token_security/8453?');
    expect(r.topHolders[1]).toMatchObject({ label: 'contract', name: 'UniCrypt (locked)' });
    const codes = r.flags.map((f) => `${f.level}:${f.code}`);
    expect(codes).toEqual(expect.arrayContaining(['high:honeypot', 'high:sell_tax', 'high:mint', 'high:whale', 'ok:liquidity']));
    expect(codes).not.toContain('info:rpc_only');
    expect(codes.filter((c) => c.endsWith(':mint'))).toHaveLength(1);

    // A chain picked by hand skips detection.
    const eth = await scanner.scan(TOKEN, signal(), 'ethereum');
    expect(eth.chainKey).toBe('ethereum');
    expect(eth.alsoOn).toBeUndefined();
    expect(eth.flags.some((f) => f.code === 'liquidity' && f.level === 'high')).toBe(true);
  });

  it('keeps the RPC note when GoPlus is unreachable, and rejects mismatched input', async () => {
    const scanner = createMultiScanner({
      home: null,
      homeClient: null,
      homeName: 'Robinhood Chain',
      solana: null,
      clientFor: clientFor(['bsc']),
      market: null,
      security: createGoPlus({ fetch: (async () => new Response('<html>', { status: 503, headers: { 'content-type': 'text/html' } })) as typeof fetch }),
    });
    const r = await scanner.scan(TOKEN, signal());
    expect(r.chainKey).toBe('bsc');
    expect(r.flags.some((f) => f.code === 'rpc_only')).toBe(true);
    expect(r.market).toBeUndefined();

    await expect(scanner.scan('hello', signal())).rejects.toMatchObject({ code: 'invalid_address' });
    await expect(scanner.scan(TOKEN, signal(), 'solana')).rejects.toBeInstanceOf(ScanInputError);
    await expect(scanner.scan(MINT, signal(), 'base')).rejects.toMatchObject({ code: 'wrong_chain' });
    await expect(scanner.scan(TOKEN, signal(), 'nochain')).rejects.toMatchObject({ code: 'unknown_chain' });
    expect(scanner.chains.map((c) => c.key)).not.toContain('robinhood');
  });
});

describe('chat address detection', () => {
  it('finds Solana addresses but not ordinary long words, and reads a named chain', () => {
    expect(detectAddress(`is ${MINT} safe?`)).toBe(MINT);
    expect(detectAddress('internationalizationcharacteristics and more')).toBeNull();
    expect(detectAddress('0x9999999999999999999999999999999999999999 on base')).toBe('0x9999999999999999999999999999999999999999');
    expect(chainHint('check this token on Base')).toBe('base');
    expect(chainHint('cek token ini di BSC')).toBe('bsc');
    expect(chainHint('check this token')).toBe('auto');
  });
});

describe('POST /scan with chains', () => {
  it('accepts Solana addresses, passes the chain, and maps input errors to 400', async () => {
    const seen: string[] = [];
    const scanner = {
      scan: async (address: string, _s: AbortSignal, chain?: string) => {
        seen.push(`${chain}:${address}`);
        if (chain === 'base' && !address.startsWith('0x')) throw new ScanInputError('wrong_chain', 'This looks like a Solana address. Pick Solana or Auto.');
        return { address, chain: 'Solana', chainKey: 'solana', flags: [] } as any;
      },
    };
    const { app } = await buildCapturingApp('info', TEST_ENV, { crypto: { scanner, prices: null } });
    try {
      const ok = await app.inject({ method: 'POST', url: '/scan', payload: { address: MINT, chain: 'solana' } });
      expect(ok.statusCode).toBe(200);
      const bad = await app.inject({ method: 'POST', url: '/scan', payload: { address: MINT, chain: 'base' } });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('wrong_chain');
      const odd = await app.inject({ method: 'POST', url: '/scan', payload: { address: MINT, chain: '../x' } });
      expect(odd.statusCode).toBe(200);
      expect(seen).toEqual([`solana:${MINT}`, `base:${MINT}`, `auto:${MINT}`]);
    } finally {
      await app.close();
    }
  });
});
