import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { brand } from '@fathom/config';
import { createMockProvider } from '../src/inference';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, sseEvents } from './helpers';

// CLAUDE.md §0 rules 1 and 3: no prompt/completion text, no IPs, no keys in any log line.
const MARKER = 'SECRET-PROMPT-7f3a9c';
const IP = '203.0.113.7';
const KEY = 'nox_live_secret';
const headers = { 'x-forwarded-for': IP, authorization: `Bearer ${KEY}`, cookie: `session=${KEY}` };
const chatBody = { model: 'deepseek-v3.1', messages: [{ role: 'user', content: MARKER }], prompt: MARKER };

let app: FastifyInstance;
let lines: string[];

beforeAll(async () => {
  ({ app, lines } = await buildCapturingApp('trace'));
  // Test-only routes that fail while holding user content.
  app.post('/test/throw', async (req) => {
    throw new Error(`boom: ${JSON.stringify(req.body)}`);
  });
  app.post('/test/bad-request', async (req) => {
    throw app.httpErrors.badRequest(`bad: ${JSON.stringify(req.body)}`);
  });
  app.post('/test/log-it', async (req) => {
    // Even a careless ad hoc log of the body/headers must be redacted.
    req.log.info({ body: req.body, headers: req.headers, ip: req.ip, messages: chatBody.messages }, 'careless');
    return { ok: true };
  });
});
afterAll(() => app.close());

describe('no logging of content, IPs or keys', () => {
  it('never writes the marker, IP or key to any log line', async () => {
    const reqs = [
      { url: '/v1/chat/completions', payload: chatBody },
      { url: `/v1/chat/completions?q=${MARKER}`, payload: chatBody },
      { url: '/test/throw', payload: chatBody },
      { url: '/test/bad-request', payload: chatBody },
      { url: '/test/log-it', payload: chatBody },
      // Malformed JSON: Node's parse error message quotes the raw body.
      { url: '/test/throw', payload: `{"messages": "${MARKER}` },
    ];
    for (const r of reqs) {
      const res = await app.inject({
        method: 'POST',
        url: r.url,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload),
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      // 5xx responses must not echo internals either.
      if (res.statusCode >= 500) expect(res.body).not.toContain(MARKER);
    }

    expect(lines.length).toBeGreaterThan(reqs.length); // not vacuous
    const all = lines.join('\n');
    expect(all).toContain('request completed');
    expect(all).toContain('request failed');
    for (const secret of [MARKER, IP, KEY]) expect(all).not.toContain(secret);
  });
});

const up = await servicesUp();

// The same rules for the real sign-in and chat paths, and nothing readable stored in DB or Redis.
describe.skipIf(!up)('no content in logs, DB or Redis for /auth/verify and /chat', () => {
  const COMPLETION = 'SECRET-COMPLETION-4b1e';
  let chatApp: FastifyInstance;
  let chatLines: string[];
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];

  beforeAll(async () => {
    ({ app: chatApp, lines: chatLines } = await buildCapturingApp('trace', TEST_ENV, {
      provider: createMockProvider({
        delayMs: 1,
        failModels: ['llama-3.3-70b'],
        reply: (model) => `${COMPLETION} from ${model}`,
      }),
      // A search backend whose error message quotes the query.
      search: {
        async search(query) {
          throw new Error(`search failed for ${query}`);
        },
      },
    }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await chatApp.close();
  });

  it('never writes the prompt, completion, IP, cookie or signature to logs or storage', async () => {
    const ip = nextIp();
    // Sign-in message carrying the marker in its statement.
    const r = await signIn(chatApp, ip, { statement: `Sign in ${MARKER}` });
    addresses.push(r.account.address.toLowerCase());
    expect(r.res.statusCode).toBe(200);
    const session = r.session!;
    const hdrs = { 'x-forwarded-for': IP, 'content-type': 'application/json' };

    // Failed sign-ins holding the marker.
    for (const payload of [
      { message: r.message, signature: r.signature }, // replay
      { message: `${MARKER}\n${r.message}`, signature: r.signature },
      { message: MARKER, signature: `0x${'ab'.repeat(65)}` },
    ]) {
      const res = await chatApp.inject({ method: 'POST', url: '/auth/verify', remoteAddress: ip, headers: hdrs, payload });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.body).not.toContain(MARKER);
    }

    const post = (payload: unknown) =>
      chatApp.inject({
        method: 'POST',
        url: `/chat?q=${MARKER}`,
        headers: hdrs,
        cookies: { nx_session: session },
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      });
    const messages = [{ role: 'user', content: MARKER }];
    const ok = await post({ model: 'deepseek-v3.1', compareWith: 'llama-3.3-70b', webSearch: true, messages });
    const events = sseEvents(ok.body);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(true); // llama failed: error path logged
    const streamed = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
    expect(streamed).toContain(COMPLETION); // the completion did stream to the client
    expect(events).toContainEqual({ type: 'search', status: 'unavailable' }); // search failed: error path logged
    for (const bad of [
      { model: 'deepseek-v3.1', messages: [{ role: 'assistant', content: MARKER }] },
      { model: MARKER, messages },
      `{"model":"deepseek-v3.1","messages":"${MARKER}`,
    ]) {
      const res = await post(bad);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    }

    const all = chatLines.join('\n');
    expect(all).toContain('chat provider failed'); // not vacuous
    expect(all).toContain('web search failed');
    for (const secret of [MARKER, COMPLETION, IP, session, r.signature]) expect(all).not.toContain(secret);

    // Nothing readable in any table or Redis value.
    for (const table of ['User', 'Transaction', 'UsageDaily', 'ApiKey', 'EncryptedChat']) {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table}" t WHERE t::text LIKE $1 OR t::text LIKE $2`,
        `%${MARKER}%`,
        `%${COMPLETION}%`,
      );
      expect(rows[0]!.n).toBe(0n);
    }
    const redis = chatApp.ctx.redis;
    for (const key of await redis.keys('*')) {
      expect(key).not.toContain(MARKER);
      if ((await redis.type(key)) === 'string') {
        const v = (await redis.get(key)) ?? '';
        expect(v).not.toContain(MARKER);
        expect(v).not.toContain(COMPLETION);
      }
    }
  });
});

// Same rules for the public API, API keys and encrypted history.
describe.skipIf(!up)('no content in logs, DB or Redis for /v1/chat/completions, /keys and PUT /chats/:id', () => {
  const COMPLETION = 'SECRET-COMPLETION-9d2c';
  let apiApp: FastifyInstance;
  let apiLines: string[];
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];

  beforeAll(async () => {
    ({ app: apiApp, lines: apiLines } = await buildCapturingApp('trace', TEST_ENV, {
      provider: createMockProvider({ delayMs: 1, failModels: ['llama-3.3-70b'], reply: (m) => `${COMPLETION} from ${m}` }),
      search: {
        async search(query) {
          throw new Error(`search failed for ${query}`);
        },
      },
    }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await apiApp.close();
  });

  it('never writes prompts, completions, keys, ciphertext or IPs to logs or storage', async () => {
    const ip = nextIp();
    const r = await signIn(apiApp, ip);
    addresses.push(r.account.address.toLowerCase());
    const cookies = { nx_session: r.session! };
    const created = await apiApp.inject({ method: 'POST', url: '/keys', cookies, payload: { name: MARKER } });
    const key = created.json().key as string;
    expect(key).toBeTruthy();
    const hdrs = { authorization: `Bearer ${key}`, 'x-forwarded-for': IP, 'content-type': 'application/json' };
    const post = (payload: unknown) =>
      apiApp.inject({
        method: 'POST',
        url: `/v1/chat/completions?q=${MARKER}`,
        headers: hdrs,
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      });
    const messages = [{ role: 'system', content: MARKER }, { role: 'user', content: MARKER }];
    const ok = await post({ model: 'deepseek-v3.1', compare_with: 'llama-3.3-70b', web_search: true, messages });
    expect(ok.statusCode).toBe(200);
    expect(JSON.stringify(ok.json())).toContain(COMPLETION);
    const streamed = await post({ model: 'deepseek-v3.1', messages, stream: true, stream_options: { include_usage: true } });
    const streamedText = streamed.body
      .split('\n\n')
      .filter((b) => b.startsWith('data: {'))
      .map((b) => (JSON.parse(b.slice(6)) as { choices: { delta?: { content?: string } }[] }).choices[0]?.delta?.content ?? '')
      .join('');
    expect(streamedText).toContain(COMPLETION);
    expect((await post({ model: 'llama-3.3-70b', messages, stream: true })).body).toContain('provider_error');
    expect((await post({ model: 'llama-3.3-70b', messages })).statusCode).toBe(502);
    for (const bad of [
      { model: 'deepseek-v3.1', messages: [{ role: 'tool', content: MARKER }] },
      { model: MARKER, messages },
      `{"model":"deepseek-v3.1","messages":"${MARKER}`,
    ]) {
      expect((await post(bad)).statusCode).toBeGreaterThanOrEqual(400);
    }
    // Invalid key carrying the marker.
    await apiApp.inject({ method: 'POST', url: '/v1/chat/completions', headers: { ...hdrs, authorization: `Bearer nox_live_${MARKER}` }, payload: { model: 'x' } });

    // Encrypted history: the ciphertext (here the marker itself, base64) never reaches logs.
    const ciphertext = Buffer.from(`${MARKER}${COMPLETION}`).toString('base64');
    const put = await apiApp.inject({
      method: 'PUT',
      url: '/chats/chat_marker_01',
      cookies,
      headers: { 'x-forwarded-for': IP },
      payload: { ciphertext, iv: Buffer.alloc(12).toString('base64'), burnAt: null },
    });
    expect(put.statusCode).toBe(200);
    await apiApp.inject({ method: 'PUT', url: '/chats/chat_marker_02', cookies, payload: { ciphertext: `${MARKER}!`, iv: 'x' } });
    await apiApp.inject({ method: 'PUT', url: '/chats/chat_marker_03', cookies, headers: { 'content-type': 'application/json' }, payload: `{"ciphertext":"${ciphertext}` });
    const list = await apiApp.inject({ method: 'GET', url: '/chats', cookies });
    expect(list.json()[0].ciphertext).toBe(ciphertext);

    const all = apiLines.join('\n');
    expect(all).toContain('chat provider failed'); // not vacuous
    expect(all).toContain('request completed');
    for (const secret of [MARKER, COMPLETION, IP, key, key.slice(brand.keyPrefix.length), ciphertext, r.session!]) {
      expect(all).not.toContain(secret);
    }

    // Nothing readable in any table (the saved chat is bytea, never text) or Redis value.
    for (const table of ['User', 'Transaction', 'UsageDaily', 'EncryptedChat']) {
      const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table}" t WHERE t::text LIKE $1 OR t::text LIKE $2 OR t::text LIKE $3`,
        `%${MARKER}%`,
        `%${COMPLETION}%`,
        `%${key}%`,
      );
      expect(rows[0]!.n).toBe(0n);
    }
    // The key name is user-chosen metadata (here the marker); the key itself is never stored.
    const keyRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "ApiKey" t WHERE t::text LIKE $1`, `%${key}%`);
    expect(keyRows[0]!.n).toBe(0n);
    const redis = apiApp.ctx.redis;
    for (const k of await redis.keys('*')) {
      for (const secret of [MARKER, IP, key]) expect(k).not.toContain(secret);
      if ((await redis.type(k)) === 'string') {
        const v = (await redis.get(k)) ?? '';
        for (const secret of [MARKER, COMPLETION, IP, key]) expect(v).not.toContain(secret);
      }
    }
  });
});
