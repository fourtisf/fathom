import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PrismaClient } from '@fathom/db';
import { WELCOME_CREDITS } from '@fathom/config';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, signedMessage } from './helpers';

const up = await servicesUp();

describe.skipIf(!up)('SIWE auth (Postgres + Redis)', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  const track = (a: string) => addresses.push(a.toLowerCase());

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /config exposes chain and model status', async () => {
    const body = (await app.inject({ method: 'GET', url: '/config' })).json();
    expect(body.chain).toEqual({
      id: 46630,
      name: 'Robinhood Chain Testnet',
      rpcUrl: 'https://rpc.example.org/rpc',
      explorerUrl: 'https://explorer.example.org',
    });
    expect(body.inference).toBe(true);
    expect(body.models.every((m: { status: string }) => m.status === 'ok')).toBe(true);
  });

  it('issues nonces stored in Redis with a 5 minute TTL', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/nonce', remoteAddress: ip });
    expect(res.statusCode).toBe(200);
    const { nonce } = res.json();
    expect(nonce).toMatch(/^[a-zA-Z0-9]{8,}$/);
    const ttl = await app.ctx.redis.ttl(`siwe:nonce:${nonce}`);
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('signs in, creates the user with welcome credits and sets the session cookie', async () => {
    const r = await signIn(app, ip);
    track(r.account.address);
    expect(r.res.statusCode).toBe(200);
    expect(r.res.json()).toEqual({ address: r.account.address, credits: WELCOME_CREDITS, welcome: true });
    const cookie = r.res.cookies.find((c) => c.name === 'nx_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.path).toBe('/');
    expect(cookie.maxAge).toBe(7 * 24 * 3600);

    const user = await prisma.user.findUniqueOrThrow({
      where: { address: r.account.address.toLowerCase() },
      include: { txs: true },
    });
    expect(user.creditsMicro).toBe(BigInt(WELCOME_CREDITS) * 1_000_000n);
    expect(user.txs).toHaveLength(1);
    expect(user.txs[0]).toMatchObject({ type: 'WELCOME_BONUS', status: 'CONFIRMED', creditsMicro: 25_000_000n });

    // Nonce was consumed: replaying the same message + signature fails.
    const replay = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      remoteAddress: ip,
      payload: { message: r.message, signature: r.signature },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('invalid_nonce');

    // /me works with the cookie, 401 without.
    const me = await app.inject({ method: 'GET', url: '/me', cookies: { nx_session: r.session! } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      address: r.account.address,
      credits: 25,
      settings: { saveHistory: true, defaultBurn: 'off', webSearch: false },
    });
    const anon = await app.inject({ method: 'GET', url: '/me' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error.code).toBe('unauthenticated');
    const bogus = await app.inject({ method: 'GET', url: '/me', cookies: { nx_session: 'nope' } });
    expect(bogus.statusCode).toBe(401);
  });

  it('second sign-in grants no extra credits; concurrent first sign-ins grant once', async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    track(account.address);
    const [a, b] = await Promise.all([signIn(app, ip, { account }), signIn(app, ip, { account })]);
    expect([a.res.statusCode, b.res.statusCode]).toEqual([200, 200]);
    expect([a.res.json().welcome, b.res.json().welcome].sort()).toEqual([false, true]);
    const again = await signIn(app, ip, { account });
    expect(again.res.json()).toMatchObject({ credits: 25, welcome: false });
    const user = await prisma.user.findUniqueOrThrow({
      where: { address: account.address.toLowerCase() },
      include: { txs: true },
    });
    expect(user.creditsMicro).toBe(25_000_000n);
    expect(user.txs).toHaveLength(1);
  });

  it('rejects wrong domain, wrong chain, expiry, unknown nonce and bad signatures', async () => {
    const verify = async (s: { message: string; signature: string }) => {
      const res = await app.inject({ method: 'POST', url: '/auth/verify', remoteAddress: ip, payload: s });
      return { status: res.statusCode, code: res.json().error?.code, cookie: res.cookies.length };
    };
    expect(await verify(await signedMessage(app, ip, { domain: 'evil.example' }))).toMatchObject({
      status: 401,
      code: 'wrong_domain',
      cookie: 0,
    });
    expect(await verify(await signedMessage(app, ip, { chainId: 1 }))).toMatchObject({ status: 401, code: 'wrong_chain' });
    expect(await verify(await signedMessage(app, ip, { expirationTime: new Date(Date.now() - 1000) }))).toMatchObject({
      status: 401,
      code: 'invalid_nonce',
    });
    expect(await verify(await signedMessage(app, ip, { nonce: 'neverissued123' }))).toMatchObject({
      status: 401,
      code: 'invalid_nonce',
    });
    const other = privateKeyToAccount(generatePrivateKey());
    expect(await verify(await signedMessage(app, ip, { signer: other }))).toMatchObject({
      status: 401,
      code: 'invalid_signature',
    });
    expect((await app.inject({ method: 'POST', url: '/auth/verify', remoteAddress: ip, payload: { message: 1 } })).statusCode).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify', remoteAddress: ip, payload: { message: 'hi', signature: '0x12' } }))
        .statusCode,
    ).toBe(400);
  });

  it('logout deletes the session', async () => {
    const r = await signIn(app, ip);
    track(r.account.address);
    const out = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { nx_session: r.session! } });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.find((c) => c.name === 'nx_session')?.value).toBe('');
    const me = await app.inject({ method: 'GET', url: '/me', cookies: { nx_session: r.session! } });
    expect(me.statusCode).toBe(401);
  });

  it('settings: validates, merges and resets on DELETE /data', async () => {
    const r = await signIn(app, ip);
    track(r.account.address);
    const cookies = { nx_session: r.session! };
    const bad = await app.inject({ method: 'PATCH', url: '/settings', cookies, payload: { defaultBurn: '2h' } });
    expect(bad.statusCode).toBe(400);
    const extra = await app.inject({ method: 'PATCH', url: '/settings', cookies, payload: { admin: true } });
    expect(extra.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PATCH', url: '/settings', cookies, payload: { defaultBurn: '24h', webSearch: true } });
    expect(ok.json()).toEqual({ saveHistory: true, defaultBurn: '24h', webSearch: true });
    const ok2 = await app.inject({ method: 'PATCH', url: '/settings', cookies, payload: { saveHistory: false } });
    expect(ok2.json()).toEqual({ saveHistory: false, defaultBurn: '24h', webSearch: true });

    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    await prisma.apiKey.create({ data: { userId: user.id, name: 'k', prefix: 'nox_live_ab', hash: `h-${user.id}` } });
    await prisma.encryptedChat.create({ data: { userId: user.id, ciphertext: Buffer.from([1]), iv: Buffer.from([2]) } });
    const del = await app.inject({ method: 'DELETE', url: '/data', cookies });
    expect(del.statusCode).toBe(204);
    expect(await prisma.apiKey.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.encryptedChat.count({ where: { userId: user.id } })).toBe(0);
    const me = (await app.inject({ method: 'GET', url: '/me', cookies })).json();
    expect(me).toMatchObject({ credits: 25, settings: { saveHistory: true, defaultBurn: 'off', webSearch: false } });
    expect(await prisma.transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('credits summary and transactions', async () => {
    const r = await signIn(app, ip);
    track(r.account.address);
    const cookies = { nx_session: r.session! };
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    const today = new Date(new Date().toISOString().slice(0, 10));
    await prisma.usageDaily.createMany({
      data: [
        { userId: user.id, day: today, model: 'qwen3-235b', messages: 2, creditsMicro: 1_500_000n },
        { userId: user.id, day: today, model: 'llama-3.3-70b', messages: 1, creditsMicro: 250_000n },
      ],
    });
    const s = (await app.inject({ method: 'GET', url: '/credits/summary', cookies })).json();
    expect(s.balance).toBe(25);
    expect(s.usage14).toHaveLength(14);
    expect(s.usage14[13]).toEqual({ day: today.toISOString().slice(0, 10), credits: 1.75 });
    expect(s.usage14[0].credits).toBe(0);
    expect(s.byModel).toEqual([
      { model: 'qwen3-235b', credits: 1.5 },
      { model: 'llama-3.3-70b', credits: 0.25 },
    ]);
    expect(s.messagesMonth).toBe(3);
    expect(s.spentMonth).toBe(1.75);

    const txs = (await app.inject({ method: 'GET', url: '/credits/transactions', cookies })).json();
    expect(txs).toEqual([
      expect.objectContaining({ type: 'WELCOME_BONUS', credits: 25, status: 'CONFIRMED', txHash: null, token: null }),
    ]);
    expect(typeof txs[0].createdAt).toBe('string');
  });
});
