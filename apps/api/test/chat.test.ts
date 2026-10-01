import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { getModel, tokenCostMicro } from '@fathom/config';
import { createMockProvider } from '../src/inference';
import type { WebSearch } from '../src/search';
import { CHAT_RATE_LIMIT } from '../src/routes/chat';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, sseEvents } from './helpers';

const up = await servicesUp();

type Ev = Record<string, any>;

describe.skipIf(!up)('POST /chat (mock provider, Postgres + Redis)', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  let searches = 0;
  const search: WebSearch = {
    async search() {
      searches++;
      return [{ title: 'Result', url: 'https://example.org', description: 'A result' }];
    },
  };

  const newUser = async () => {
    const r = await signIn(app, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };
  const balance = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
  const chat = (cookies: Record<string, string>, payload: object) =>
    app.inject({ method: 'POST', url: '/chat', cookies, payload });
  const msgs = [{ role: 'user', content: 'Hello there, how are you?' }];

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV, {
      provider: createMockProvider({ delayMs: 1, failModels: ['llama-3.3-70b'] }),
      search,
    }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('streams SSE and charges exactly the reported token usage', async () => {
    const { cookies, userId } = await newUser();
    const before = await balance(userId);
    const res = await chat(cookies, { model: 'deepseek-v3.1', messages: msgs });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache, no-transform');
    expect(res.headers['x-accel-buffering']).toBe('no');
    const events = sseEvents(res.body) as Ev[];
    const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(text).toMatch(/^Mock reply from DeepSeek V3\.1: I received \d+ characters\.$/);
    const done = events.find((e) => e.type === 'done')!;
    expect(done).toMatchObject({ slot: 0, model: 'deepseek-v3.1' });
    const cost = tokenCostMicro(getModel('deepseek-v3.1')!, done.tokens.input, done.tokens.output);
    expect(cost).toBeGreaterThan(0n);
    expect(done.credits).toBe(Number(cost) / 1e6);
    const after = await balance(userId);
    expect(before - after).toBe(cost);
    expect(events.at(-1)).toEqual({ type: 'end', balance: Number(after) / 1e6 });

    const usage = await prisma.usageDaily.findMany({ where: { userId } });
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ model: 'deepseek-v3.1', messages: 1, creditsMicro: cost });
  });

  it('compare mode streams two slots and charges both', async () => {
    const { cookies, userId } = await newUser();
    const before = await balance(userId);
    const res = await chat(cookies, { model: 'deepseek-v3.1', compareWith: 'qwen3-235b', messages: msgs });
    const events = sseEvents(res.body) as Ev[];
    const dones = events.filter((e) => e.type === 'done');
    expect(dones.map((d) => d.slot).sort()).toEqual([0, 1]);
    expect(events.some((e) => e.type === 'delta' && e.slot === 1)).toBe(true);
    const total = dones.reduce(
      (n, d) => n + tokenCostMicro(getModel(d.model)!, d.tokens.input, d.tokens.output),
      0n,
    );
    expect(before - (await balance(userId))).toBe(total);
    expect(await prisma.usageDaily.count({ where: { userId } })).toBe(2);
  });

  it('provider failure yields an error event and no charge', async () => {
    const { cookies, userId } = await newUser();
    const before = await balance(userId);
    const res = await chat(cookies, { model: 'llama-3.3-70b', messages: msgs });
    expect(res.statusCode).toBe(200);
    const events = sseEvents(res.body) as Ev[];
    expect(events.find((e) => e.type === 'error')).toMatchObject({ slot: 0, code: 'provider_error' });
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(await balance(userId)).toBe(before);
    expect(await prisma.usageDaily.count({ where: { userId } })).toBe(0);

    // Compare with a failing second model: slot 0 is charged, slot 1 is not.
    const cmp = sseEvents((await chat(cookies, { model: 'gpt-oss-120b', compareWith: 'llama-3.3-70b', messages: msgs })).body) as Ev[];
    expect(cmp.find((e) => e.type === 'error')).toMatchObject({ slot: 1 });
    const done = cmp.find((e) => e.type === 'done')!;
    expect(done.slot).toBe(0);
    expect(before - (await balance(userId))).toBe(tokenCostMicro(getModel('gpt-oss-120b')!, done.tokens.input, done.tokens.output));
  });

  it('402 before streaming when the balance is too low, without charging', async () => {
    const { cookies, userId } = await newUser();
    await prisma.user.update({ where: { id: userId }, data: { creditsMicro: 1000n } });
    const res = await chat(cookies, { model: 'deepseek-v3.1', messages: msgs });
    expect(res.statusCode).toBe(402);
    const err = res.json().error;
    expect(err.code).toBe('insufficient_credits');
    expect(err.balance).toBe(0.001);
    expect(err.needed).toBeGreaterThan(0.001);
    expect(await balance(userId)).toBe(1000n);
    expect(await prisma.usageDaily.count({ where: { userId } })).toBe(0);
  });

  it('web search charges ×1.6 and emits search events', async () => {
    const { cookies, userId } = await newUser();
    const before = await balance(userId);
    const n = searches;
    const events = sseEvents((await chat(cookies, { model: 'qwen3-235b', webSearch: true, messages: msgs })).body) as Ev[];
    expect(searches).toBe(n + 1);
    expect(events[0]).toEqual({ type: 'search', status: 'running' });
    expect(events[1]).toEqual({ type: 'search', status: 'done', sources: 1 });
    const done = events.find((e) => e.type === 'done')!;
    const cost = tokenCostMicro(getModel('qwen3-235b')!, done.tokens.input, done.tokens.output, { webSearch: true });
    expect(before - (await balance(userId))).toBe(cost);
  });

  it('validates the body and rejects unknown models with 503', async () => {
    const { cookies } = await newUser();
    const bad = [
      {},
      { model: 'deepseek-v3.1', messages: [] },
      { model: 'deepseek-v3.1', messages: [{ role: 'assistant', content: 'hi' }] },
      { model: 'deepseek-v3.1', messages: [{ role: 'system', content: 'hi' }] },
      { model: 'deepseek-v3.1', compareWith: 'deepseek-v3.1', messages: msgs },
      { model: 'deepseek-v3.1', persona: 'hacker', messages: msgs },
      { model: 'deepseek-v3.1', persona: 7, messages: msgs },
      { model: 'deepseek-v3.1', messages: [{ role: 'user', content: 'x'.repeat(100_001) }] },
      { model: 'deepseek-v3.1', messages: Array.from({ length: 51 }, () => ({ role: 'user', content: 'x' })) },
    ];
    for (const b of bad) expect((await chat(cookies, b)).statusCode).toBe(400);
    const res = await chat(cookies, { model: 'gpt-5', messages: msgs });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatchObject({ code: 'model_unavailable', model: 'gpt-5' });
    expect((await app.inject({ method: 'POST', url: '/chat', payload: { model: 'deepseek-v3.1', messages: msgs } })).statusCode).toBe(401);
  });

  it('rate limits chat per user', async () => {
    const { cookies } = await newUser();
    const codes: number[] = [];
    for (let i = 0; i <= CHAT_RATE_LIMIT; i++) codes.push((await chat(cookies, {})).statusCode);
    expect(codes.slice(0, CHAT_RATE_LIMIT).every((c) => c === 400)).toBe(true);
    const last = await chat(cookies, {});
    expect(last.statusCode).toBe(429);
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe.skipIf(!up)('POST /chat edge cases', () => {
  it('charges a character estimate when the provider reports no usage, and 503s without a provider', async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
    const { app } = await buildCapturingApp('info', TEST_ENV, {
      provider: createMockProvider({ delayMs: 1, reportUsage: false }),
    });
    const { app: noProvider } = await buildCapturingApp('info', { ...TEST_ENV, INFERENCE_PROVIDER: '' });
    const ip = nextIp();
    const addresses: string[] = [];
    try {
      const r = await signIn(app, ip);
      addresses.push(r.account.address.toLowerCase());
      const cookies = { nx_session: r.session! };
      const events = sseEvents(
        (await app.inject({ method: 'POST', url: '/chat', cookies, payload: { model: 'llama-3.3-70b', messages: [{ role: 'user', content: 'hi' }] } })).body,
      ) as Ev[];
      const done = events.find((e) => e.type === 'done')!;
      expect(done.tokens.input).toBeGreaterThan(0);
      expect(done.credits).toBeGreaterThan(0);

      // Web search requested but not configured: 'unavailable', no multiplier.
      const ws = sseEvents(
        (await app.inject({ method: 'POST', url: '/chat', cookies, payload: { model: 'llama-3.3-70b', webSearch: true, messages: [{ role: 'user', content: 'hi' }] } })).body,
      ) as Ev[];
      expect(ws[0]).toEqual({ type: 'search', status: 'unavailable' });
      const d2 = ws.find((e) => e.type === 'done')!;
      expect(d2.credits * 1e6).toBe(Number(tokenCostMicro(getModel('llama-3.3-70b')!, d2.tokens.input, d2.tokens.output)));

      const r2 = await signIn(noProvider, ip);
      addresses.push(r2.account.address.toLowerCase());
      const res = await noProvider.inject({
        method: 'POST',
        url: '/chat',
        cookies: { nx_session: r2.session! },
        payload: { model: 'deepseek-v3.1', messages: [{ role: 'user', content: 'hi' }] },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('model_unavailable');
    } finally {
      await prisma.user.deleteMany({ where: { address: { in: addresses } } });
      await prisma.$disconnect();
      await app.close();
      await noProvider.close();
    }
  });
});

describe.skipIf(!up)('POST /chat client abort', () => {
  it('aborts the provider and charges nothing when the client disconnects mid-answer', async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
    let aborted = false;
    const mock = createMockProvider({ delayMs: 40, reply: () => 'x'.repeat(240) });
    const { app } = await buildCapturingApp('info', TEST_ENV, {
      provider: {
        ...mock,
        async *chatStream(req) {
          req.signal.addEventListener('abort', () => (aborted = true));
          yield* mock.chatStream(req);
        },
      },
    });
    const ip = nextIp();
    let address = '';
    try {
      const r = await signIn(app, ip);
      address = r.account.address.toLowerCase();
      const user = await prisma.user.findUniqueOrThrow({ where: { address } });
      const url = await app.listen({ port: 0, host: '127.0.0.1' });
      const ac = new AbortController();
      const res = await fetch(`${url}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `nx_session=${r.session}` },
        body: JSON.stringify({ model: 'deepseek-v3.1', messages: [{ role: 'user', content: 'hi' }] }),
        signal: ac.signal,
      });
      const reader = res.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain('"type":"delta"');
      ac.abort();
      await new Promise((r) => setTimeout(r, 300));
      expect(aborted).toBe(true);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).creditsMicro).toBe(25_000_000n);
      expect(await prisma.usageDaily.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      if (address) await prisma.user.deleteMany({ where: { address } });
      await prisma.$disconnect();
      app.server.closeAllConnections(); // undici keeps the aborted socket alive for a few seconds
      await app.close();
    }
  });
});
