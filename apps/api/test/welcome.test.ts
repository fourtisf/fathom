import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PrismaClient } from '@fathom/db';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn } from './helpers';
import { FakeChain } from './fake-chain';
import { createTurnstileVerifier } from '../src/turnstile';

const up = await servicesUp();

// Own Redis DB: this file controls the global daily counter, which other files would bump.
const REDIS_URL = (process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15').replace(/\/\d+$/, '') + '/14';
const USDG = '0x00000000000000000000000000000000000000a1' as const;

describe.skipIf(!up)('welcome credits anti-abuse', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const apps: FastifyInstance[] = [];

  const makeApp = async (env: Record<string, string>, opts: Parameters<typeof buildCapturingApp>[2] = {}) => {
    const chain = new FakeChain(USDG);
    const { app, lines } = await buildCapturingApp('info', { ...TEST_ENV, REDIS_URL, ...env }, { chainClient: chain.client(), ...opts });
    apps.push(app);
    return { app, chain, lines };
  };
  const login = async (app: FastifyInstance, ip: string) => {
    const account = privateKeyToAccount(generatePrivateKey());
    addresses.push(account.address.toLowerCase());
    const r = await signIn(app, ip, { account });
    return { account, r, cookies: { nx_session: r.session ?? '' } };
  };

  beforeEach(async () => {
    const { app } = await makeApp({});
    const keys = await app.ctx.redis.keys('welcome:*');
    if (keys.length) await app.ctx.redis.del(...keys);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    for (const a of apps) await a.close();
  });

  it('requires on-chain activity; POST /credits/welcome re-attempts once active', async () => {
    const { app, chain } = await makeApp({ WELCOME_REQUIRE_ACTIVITY: 'true' });
    const ip = nextIp();
    const { account, r, cookies } = await login(app, ip);
    expect(r.res.json()).toEqual({ address: account.address, credits: 0, welcome: false, welcomeDenied: 'no_activity' });
    expect(chain.calls).toEqual(expect.arrayContaining(['eth_getTransactionCount', 'eth_getBalance']));
    expect((await app.inject({ method: 'GET', url: '/me', cookies })).json()).toMatchObject({ credits: 0, welcomeClaimed: false });

    const retry = await app.inject({ method: 'POST', url: '/credits/welcome', cookies, remoteAddress: ip });
    expect(retry.statusCode).toBe(403);
    expect(retry.json().error).toMatchObject({ code: 'no_activity', type: 'permission_error' });

    chain.txCounts.set(account.address.toLowerCase(), 1);
    const ok = await app.inject({ method: 'POST', url: '/credits/welcome', cookies, remoteAddress: ip });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ credits: 25, balance: 25 });
    const again = await app.inject({ method: 'POST', url: '/credits/welcome', cookies, remoteAddress: ip });
    expect(again.statusCode).toBe(403);
    expect(again.json().error.code).toBe('already_claimed');
    expect((await app.inject({ method: 'GET', url: '/me', cookies })).json()).toMatchObject({ credits: 25, welcomeClaimed: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { address: account.address.toLowerCase() }, include: { txs: true } });
    expect(user.txs).toHaveLength(1);
    expect(user.txs[0]).toMatchObject({ type: 'WELCOME_BONUS', status: 'CONFIRMED', creditsMicro: 25_000_000n });
  });

  it('native balance counts as activity; an RPC error is check_failed', async () => {
    const { app, chain } = await makeApp({ WELCOME_REQUIRE_ACTIVITY: 'true' });
    const ip = nextIp();
    const account = privateKeyToAccount(generatePrivateKey());
    addresses.push(account.address.toLowerCase());
    chain.balances.set(account.address.toLowerCase(), 1n);
    const r = await signIn(app, ip, { account });
    expect(r.res.json()).toMatchObject({ credits: 25, welcome: true });
    expect(r.res.json().welcomeDenied).toBeUndefined();

    chain.failing.add('eth_getBalance');
    const { r: r2 } = await login(app, ip);
    expect(r2!.res.json()).toMatchObject({ credits: 0, welcome: false, welcomeDenied: 'check_failed' });
  });

  it('limits grants per IP per day without storing the IP', async () => {
    const { app } = await makeApp({ WELCOME_PER_IP_DAY: '2' });
    const ip = '203.0.113.77';
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await login(app, ip)).r.res.json());
    expect(results.map((b) => b.welcome)).toEqual([true, true, false]);
    expect(results[2]).toMatchObject({ credits: 0, welcomeDenied: 'ip_limit' });

    const keys = [...(await app.ctx.redis.keys('welcome:*')), ...(await app.ctx.redis.keys('rl:auth:*'))];
    expect(keys.some((k) => k.startsWith('rl:auth:'))).toBe(true);
    // Every IP-derived key is a salted hash that expires within 48 hours.
    for (const k of keys.filter((k) => k.startsWith('welcome:ip:') || k.startsWith('rl:auth:'))) {
      const ttl = await app.ctx.redis.ttl(k);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(48 * 3600);
    }
    expect(keys.some((k) => k.startsWith('welcome:ip:'))).toBe(true);
    for (const k of keys) {
      expect(k).not.toContain(ip);
      expect((await app.ctx.redis.type(k)) === 'string' ? await app.ctx.redis.get(k) : '').not.toContain(ip);
    }

    // A denied wallet can claim later from another network.
    const denied = await login(app, ip);
    expect(denied.r.res.json().welcomeDenied).toBe('ip_limit');
    const third = await app.inject({ method: 'POST', url: '/credits/welcome', cookies: denied.cookies, remoteAddress: '203.0.113.78' });
    expect(third.statusCode).toBe(200);
  });

  it('enforces the global daily cap', async () => {
    const { app } = await makeApp({ WELCOME_DAILY_CAP: '2' });
    const got = [];
    for (let i = 0; i < 3; i++) got.push((await login(app, nextIp())).r.res.json());
    expect(got.map((b) => b.welcome)).toEqual([true, true, false]);
    expect(got[2].welcomeDenied).toBe('daily_limit');
    const res = await app.inject({ method: 'POST', url: '/credits/welcome', cookies: { nx_session: '' } });
    expect(res.statusCode).toBe(401);
  });

  it('grants at most once under concurrent claims and counts it once', async () => {
    const { app, chain } = await makeApp({ WELCOME_REQUIRE_ACTIVITY: 'true' });
    const ip = nextIp();
    const { account, cookies } = await login(app, ip);
    chain.txCounts.set(account.address.toLowerCase(), 3);
    const res = await Promise.all(
      Array.from({ length: 6 }, () => app.inject({ method: 'POST', url: '/credits/welcome', cookies, remoteAddress: ip })),
    );
    expect(res.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(res.filter((r) => r.statusCode === 403).every((r) => r.json().error.code === 'already_claimed')).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { address: account.address.toLowerCase() }, include: { txs: true } });
    expect(user.creditsMicro).toBe(25_000_000n);
    expect(user.txs).toHaveLength(1);
    const day = new Date().toISOString().slice(0, 10);
    expect(await app.ctx.redis.get(`welcome:day:${day}`)).toBe('1');
  });

  it('Turnstile: required when the secret is set; site key in /config', async () => {
    const tokens: string[] = [];
    const { app } = await makeApp(
      { TURNSTILE_SECRET_KEY: 'sec', TURNSTILE_SITE_KEY: 'site-123' },
      { verifyCaptcha: async (t) => (tokens.push(t), t === 'good') },
    );
    expect((await app.inject({ method: 'GET', url: '/config' })).json().turnstileSiteKey).toBe('site-123');
    const ip = nextIp();
    const { signedMessage } = await import('./helpers');
    for (const turnstileToken of [undefined, 'bad']) {
      const s = await signedMessage(app, ip);
      const res = await app.inject({ method: 'POST', url: '/auth/verify', remoteAddress: ip, payload: { message: s.message, signature: s.signature, turnstileToken } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('captcha_failed');
      // The nonce was not consumed by a failed captcha.
      expect(await app.ctx.redis.get(`siwe:nonce:${s.nonce}`)).toBe('1');
    }
    const s = await signedMessage(app, ip);
    addresses.push(s.account.address.toLowerCase());
    const ok = await app.inject({ method: 'POST', url: '/auth/verify', remoteAddress: ip, payload: { message: s.message, signature: s.signature, turnstileToken: 'good' } });
    expect(ok.statusCode).toBe(200);
    expect(tokens).toEqual(['bad', 'good']);

    // Without the secret, no token is needed and no site key is advertised.
    const { app: plain } = await makeApp({ TURNSTILE_SITE_KEY: 'site-123' });
    expect((await plain.inject({ method: 'GET', url: '/config' })).json().turnstileSiteKey).toBeNull();
  });
});

describe('createTurnstileVerifier', () => {
  it('posts secret and response (never remoteip) and reads success', async () => {
    const bodies: string[] = [];
    const fake = (result: unknown, status = 200) =>
      (async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body));
        return new Response(JSON.stringify(result), { status });
      }) as typeof fetch;
    expect(await createTurnstileVerifier('s3cret', fake({ success: true }))('tok')).toBe(true);
    const params = new URLSearchParams(bodies[0]);
    expect(params.get('secret')).toBe('s3cret');
    expect(params.get('response')).toBe('tok');
    expect(params.has('remoteip')).toBe(false);
    expect(await createTurnstileVerifier('s', fake({ success: false }))('tok')).toBe(false);
    expect(await createTurnstileVerifier('s', fake({ success: true }, 500))('tok')).toBe(false);
    const throwing = (async () => {
      throw new Error('down');
    }) as typeof fetch;
    expect(await createTurnstileVerifier('s', throwing)('tok')).toBe(false);
  });
});
