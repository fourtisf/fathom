import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { getAddress, parseUnits, type Address } from 'viem';
import { PrismaClient } from '@fathom/db';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn } from './helpers';
import { FakeChain, randomHash } from './fake-chain';

const up = await servicesUp();

const REDIS_URL = (process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15').replace(/\/\d+$/, '') + '/13';
const USDG = getAddress('0x00000000000000000000000000000000000Ab5d6');
const TREASURY = getAddress('0x000000000000000000000000000000000000beef');
const TOPUP_ENV = { ...TEST_ENV, REDIS_URL, USDG_ADDRESS: USDG, TREASURY_ADDRESS: TREASURY, TOPUP_CONFIRMATIONS: '3', TOPUP_MIN_USD: '1' };
const usdg = (n: string) => parseUnits(n, 6);

describe.skipIf(!up)('USDG top-ups', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const apps: FastifyInstance[] = [];
  let app: FastifyInstance;
  let chain: FakeChain;
  const ip = nextIp();

  const makeApp = async (env: Record<string, string> = {}, decimals = 6) => {
    const c = new FakeChain(USDG);
    c.decimals = decimals;
    const { app: a } = await buildCapturingApp('info', { ...TOPUP_ENV, ...env }, { chainClient: c.client() });
    await a.ready();
    apps.push(a);
    return { app: a, chain: c };
  };
  const newUser = async (a = app) => {
    const r = await signIn(a, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { address: r.account.address as Address, cookies: { nx_session: r.session! }, userId: user.id };
  };
  const claim = (cookies: Record<string, string>, txHash: string, a = app) =>
    a.inject({ method: 'POST', url: '/credits/topup', cookies, payload: { txHash } });

  beforeAll(async () => {
    ({ app, chain } = await makeApp());
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    for (const a of apps) await a.close();
  });

  it('GET /config exposes the top-up settings once decimals are read', async () => {
    const body = (await app.inject({ method: 'GET', url: '/config' })).json();
    expect(body.topup).toEqual({
      token: { symbol: 'USDG', address: USDG, decimals: 6 },
      treasury: TREASURY,
      minUsd: 1,
      confirmations: 3,
      creditsPerUsd: 100,
    });
  });

  it('credits a confirmed transfer exactly once (idempotent, concurrent-safe)', async () => {
    const u = await newUser();
    const hash = chain.addTransferTx({ from: u.address, transfers: [{ to: TREASURY, value: usdg('5.5') }], block: chain.head - 5n });
    const res = await Promise.all(Array.from({ length: 4 }, () => claim(u.cookies, hash)));
    for (const r of res) {
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ status: 'confirmed', credits: 550 });
    }
    const again = await claim(u.cookies, hash.toUpperCase().replace('0X', '0x'));
    expect(again.json()).toEqual({ status: 'confirmed', credits: 550, balance: 575 });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.userId }, include: { txs: { where: { type: 'TOPUP' } } } });
    expect(user.creditsMicro).toBe(575_000_000n);
    expect(user.txs).toHaveLength(1);
    expect(user.txs[0]).toMatchObject({ status: 'CONFIRMED', token: 'USDG', amountPaid: '5.5', creditsMicro: 550_000_000n, txHash: hash.toLowerCase() });

    const list = (await app.inject({ method: 'GET', url: '/credits/transactions', cookies: u.cookies })).json();
    expect(list[0]).toMatchObject({ type: 'TOPUP', token: 'USDG', amountPaid: '5.5', credits: 550, status: 'CONFIRMED' });
  });

  it('pending until mined and confirmed', async () => {
    const u = await newUser();
    const hash = randomHash();
    const p1 = await claim(u.cookies, hash);
    expect(p1.statusCode).toBe(202);
    expect(p1.json()).toEqual({ status: 'pending' });
    expect(await prisma.transaction.findUnique({ where: { txHash: hash.toLowerCase() } })).toMatchObject({ status: 'PENDING', userId: u.userId, type: 'TOPUP' });

    chain.addTransferTx({ hash, from: u.address, transfers: [{ to: TREASURY, value: usdg('2') }], block: chain.head });
    const p2 = await claim(u.cookies, hash);
    expect(p2.statusCode).toBe(202);
    expect(p2.json()).toEqual({ status: 'pending', confirmations: 1, required: 3 });
    expect(await prisma.transaction.findUnique({ where: { txHash: hash.toLowerCase() } })).toMatchObject({ status: 'PENDING', amountPaid: '2' });

    chain.head += 2n;
    const p3 = await claim(u.cookies, hash);
    expect(p3.statusCode).toBe(200);
    expect(p3.json()).toEqual({ status: 'confirmed', credits: 200, balance: 225 });
  });

  it('reverted → FAILED row, no credits', async () => {
    const u = await newUser();
    const hash = chain.addTransferTx({ from: u.address, transfers: [], status: 'reverted', block: chain.head - 10n });
    const res = await claim(u.cookies, hash);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('tx_failed');
    expect(await prisma.transaction.findUnique({ where: { txHash: hash.toLowerCase() } })).toMatchObject({ status: 'FAILED', creditsMicro: 0n });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).creditsMicro).toBe(25_000_000n);
  });

  it('rejects transfers not from the user, not to the treasury, or of another token', async () => {
    const u = await newUser();
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const cases = [
      chain.addTransferTx({ from: other, transfers: [{ to: TREASURY, value: usdg('5') }], block: chain.head - 5n }),
      chain.addTransferTx({ from: u.address, transfers: [{ to: other, value: usdg('5') }], block: chain.head - 5n }),
      chain.addTransferTx({ from: u.address, transfers: [{ to: TREASURY, value: usdg('5'), token: other }], block: chain.head - 5n }),
    ];
    for (const hash of cases) {
      const res = await claim(u.cookies, hash);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('not_sender');
      expect(await prisma.transaction.findUnique({ where: { txHash: hash.toLowerCase() } })).toBeNull();
    }
    const small = chain.addTransferTx({ from: u.address, transfers: [{ to: TREASURY, value: usdg('0.99') }], block: chain.head - 5n });
    const res = await claim(u.cookies, small);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('below_minimum');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).creditsMicro).toBe(25_000_000n);
  });

  it('409 when another user already claimed it; a front-running PENDING claim is taken over by the sender', async () => {
    const a = await newUser();
    const b = await newUser();
    const hash = chain.addTransferTx({ from: a.address, transfers: [{ to: TREASURY, value: usdg('3') }], block: chain.head - 5n });
    expect((await claim(a.cookies, hash)).statusCode).toBe(200);
    const stolen = await claim(b.cookies, hash);
    expect(stolen.statusCode).toBe(409);
    expect(stolen.json().error.code).toBe('tx_claimed');

    const h2 = randomHash();
    expect((await claim(b.cookies, h2)).statusCode).toBe(202); // B files it before it is mined
    chain.addTransferTx({ hash: h2, from: a.address, transfers: [{ to: TREASURY, value: usdg('1') }], block: chain.head - 5n });
    expect((await claim(b.cookies, h2)).json().error.code).toBe('not_sender');
    expect((await claim(b.cookies, h2)).statusCode).toBe(403);
    const h3 = randomHash();
    await claim(b.cookies, h3);
    chain.addTransferTx({ hash: h3, from: a.address, transfers: [{ to: TREASURY, value: usdg('1') }], block: chain.head - 5n });
    const ok = await claim(a.cookies, h3);
    expect(ok.statusCode).toBe(200);
    expect(await prisma.transaction.findUnique({ where: { txHash: h3.toLowerCase() } })).toMatchObject({ userId: a.userId, status: 'CONFIRMED' });
  });

  it('computes credits exactly for 18-decimal tokens', async () => {
    const { app: a18, chain: c18 } = await makeApp({}, 18);
    const u = await newUser(a18);
    const hash = c18.addTransferTx({ from: u.address, transfers: [{ to: TREASURY, value: parseUnits('1.234567891234567891', 18) }], block: c18.head - 5n });
    const res = await claim(u.cookies, hash, a18);
    expect(res.json()).toMatchObject({ status: 'confirmed', credits: 123.456789 });
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { txHash: hash.toLowerCase() } });
    expect(tx.creditsMicro).toBe(123_456_789n); // floor(1.234567891234567891 × 100 × 1e6)
    expect(tx.amountPaid).toBe('1.234567891234567891');
  });

  it('validates input and 503s when top-ups are not configured', async () => {
    const u = await newUser();
    const bad = await app.inject({ method: 'POST', url: '/credits/topup', cookies: u.cookies, payload: { txHash: '0x1234' } });
    expect(bad.statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/credits/topup', payload: { txHash: randomHash() } })).statusCode).toBe(401);
    const { app: plain } = await buildCapturingApp('info', TEST_ENV);
    apps.push(plain);
    const r = await signIn(plain, ip);
    addresses.push(r.account.address.toLowerCase());
    const res = await plain.inject({ method: 'POST', url: '/credits/topup', cookies: { nx_session: r.session! }, payload: { txHash: randomHash() } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('topups_unavailable');
    expect((await plain.inject({ method: 'GET', url: '/config' })).json().topup).toBeNull();
  });

  it('RPC failure on the receipt is 503 chain_unavailable; a failed decimals read disables top-ups until it recovers', async () => {
    const u = await newUser();
    chain.failing.add('eth_getTransactionReceipt');
    const res = await claim(u.cookies, randomHash());
    chain.failing.delete('eth_getTransactionReceipt');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('chain_unavailable');

    const c = new FakeChain(USDG);
    c.failing.add('eth_call');
    const { app: a } = await buildCapturingApp('info', TOPUP_ENV, { chainClient: c.client() });
    apps.push(a);
    await a.ready();
    expect((await a.inject({ method: 'GET', url: '/config' })).json().topup).toBeNull();
    c.failing.delete('eth_call');
    await a.ctx.topup!.tick();
    expect((await a.inject({ method: 'GET', url: '/config' })).json().topup).toMatchObject({ token: { decimals: 6 } });
  });

  it('indexer credits confirmed transfers from known users once, and rechecks old PENDING rows', async () => {
    const { app: a, chain: c } = await makeApp({ TOPUP_START_BLOCK: '9000' });
    await a.ctx.redis.del('indexer:lastBlock');
    const u = await newUser(a);
    const stranger = privateKeyToAccount(generatePrivateKey()).address;
    const h1 = c.addTransferTx({ from: u.address, transfers: [{ to: TREASURY, value: usdg('1') }, { to: TREASURY, value: usdg('2') }], block: 9500n });
    c.addTransferTx({ from: stranger, transfers: [{ to: TREASURY, value: usdg('9') }], block: 9600n });
    const hTip = c.addTransferTx({ from: u.address, transfers: [{ to: TREASURY, value: usdg('4') }], block: c.head });

    await a.ctx.topup!.tick();
    expect(await a.ctx.redis.get('indexer:lastBlock')).toBe(String(c.head - 2n));
    expect(await prisma.transaction.findUnique({ where: { txHash: h1.toLowerCase() } })).toMatchObject({ userId: u.userId, status: 'CONFIRMED', creditsMicro: 300_000_000n, amountPaid: '3' });
    expect(await prisma.transaction.findUnique({ where: { txHash: hTip.toLowerCase() } })).toBeNull();
    expect(a.ctx.topup!.lastTickAt).toBeGreaterThan(Date.now() - 5000);

    await a.ctx.redis.del('indexer:lastBlock'); // rescanning the same range must not double-credit
    await a.ctx.topup!.tick();
    c.head += 2n;
    await a.ctx.topup!.tick();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(user.creditsMicro).toBe(25_000_000n + 300_000_000n + 400_000_000n);

    // An old PENDING claim whose tx is now confirmed gets credited by the recheck.
    const h3 = randomHash();
    expect((await claim(u.cookies, h3, a)).statusCode).toBe(202);
    await prisma.transaction.update({ where: { txHash: h3.toLowerCase() }, data: { createdAt: new Date(Date.now() - 60_000) } });
    c.addTransferTx({ hash: h3, from: u.address, transfers: [{ to: TREASURY, value: usdg('1') }], block: 100n });
    await a.ctx.topup!.tick();
    expect(await prisma.transaction.findUnique({ where: { txHash: h3.toLowerCase() } })).toMatchObject({ status: 'CONFIRMED', creditsMicro: 100_000_000n });
  });
});
