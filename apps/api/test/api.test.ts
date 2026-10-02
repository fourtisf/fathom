import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { brand, getModel, MAX_API_KEYS, tokenCostMicro, DEFAULT_API_RATE_LIMIT } from '@fathom/config';
import { createMockProvider, type ChatStreamRequest } from '../src/inference';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, signedMessage, sseEvents } from './helpers';

const up = await servicesUp();

type J = Record<string, any>;

/** Parses OpenAI SSE frames: JSON objects plus the literal [DONE]. */
function frames(body: string): (J | '[DONE]')[] {
  return body
    .split('\n\n')
    .map((b) => b.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n'))
    .filter(Boolean)
    .map((d) => (d === '[DONE]' ? '[DONE]' : (JSON.parse(d) as J)));
}

describe.skipIf(!up)('API keys and /v1 (Postgres + Redis)', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  const seen: ChatStreamRequest[] = [];
  const mock = createMockProvider({ delayMs: 1, failModels: ['deepseek-v4-flash'] });

  const newUser = async () => {
    const r = await signIn(app, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };
  const createKey = async (cookies: Record<string, string>, name = 'test') => {
    const res = await app.inject({ method: 'POST', url: '/keys', cookies, payload: { name } });
    return res;
  };
  const keyUser = async () => {
    const u = await newUser();
    const key = (await createKey(u.cookies)).json().key as string;
    return { ...u, key, headers: { authorization: `Bearer ${key}` } };
  };
  const balance = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
  const complete = (headers: Record<string, string | undefined>, payload: unknown) =>
    app.inject({ method: 'POST', url: '/v1/chat/completions', headers, payload: payload as object });
  const msgs = [{ role: 'user', content: 'Hello there, how are you?' }];

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV, {
      provider: {
        ...mock,
        chatStream(req) {
          seen.push(req);
          return mock.chatStream(req);
        },
      },
      search: { async search() { return [{ title: 'R', url: 'https://example.org', description: 'd' }]; } },
    }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('creates (shown once), lists and revokes keys; stores only the hash', async () => {
    const { cookies, userId } = await newUser();
    for (const name of ['', '   ', 'x'.repeat(41), 5]) {
      expect((await app.inject({ method: 'POST', url: '/keys', cookies, payload: { name } })).statusCode).toBe(400);
    }
    const res = await createKey(cookies, '  My agent ');
    expect(res.statusCode).toBe(201);
    const k = res.json();
    expect(k.key).toMatch(new RegExp(`^${brand.keyPrefix}[0-9a-f]{64}$`));
    expect(k.prefix).toBe(k.key.slice(0, brand.keyPrefix.length + 6));
    expect(k).toMatchObject({ name: 'My agent' });
    expect(typeof k.id).toBe('string');
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id: k.id } });
    expect(row.hash).toBe(createHash('sha256').update(k.key).digest('hex'));
    const leaked = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "ApiKey" t WHERE t::text LIKE $1`, `%${k.key}%`);
    expect(leaked[0]!.n).toBe(0n);

    const list = (await app.inject({ method: 'GET', url: '/keys', cookies })).json();
    expect(list).toEqual([{ id: k.id, name: 'My agent', prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: null }]);

    const other = await newUser();
    expect((await app.inject({ method: 'DELETE', url: `/keys/${k.id}`, cookies: other.cookies })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/keys/${k.id}`, cookies })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/keys/${k.id}`, cookies })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/keys', cookies })).json()).toEqual([]);
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: k.id } })).revokedAt).not.toBeNull();

    // Revoked key is rejected.
    const r401 = await complete({ authorization: `Bearer ${k.key}` }, { model: 'deepseek-v4-pro', messages: msgs });
    expect(r401.statusCode).toBe(401);
    expect(r401.json()).toEqual({ error: { message: expect.any(String), type: 'invalid_request_error', code: 'invalid_api_key' } });
    expect(await prisma.apiKey.count({ where: { userId } })).toBe(1);
  });

  it(`allows at most ${MAX_API_KEYS} active keys`, async () => {
    const { cookies } = await newUser();
    const res = await Promise.all(Array.from({ length: MAX_API_KEYS + 2 }, (_, i) => createKey(cookies, `k${i}`)));
    expect(res.filter((r) => r.statusCode === 201)).toHaveLength(MAX_API_KEYS);
    const rejected = res.filter((r) => r.statusCode === 409);
    expect(rejected).toHaveLength(2);
    expect(rejected[0]!.json().error.code).toBe('key_limit');
    const first = res.find((r) => r.statusCode === 201)!.json();
    await app.inject({ method: 'DELETE', url: `/keys/${first.id}`, cookies });
    expect((await createKey(cookies)).statusCode).toBe(201);
  });

  it('rejects missing, malformed, unknown and expired keys', async () => {
    const u = await keyUser();
    for (const headers of [{} as Record<string, string>, { authorization: 'Basic abc' }, { authorization: `Bearer ${brand.keyPrefix}nope` }, { authorization: 'Bearer sk-123' }]) {
      const res = await complete(headers, { model: 'deepseek-v4-pro', messages: msgs });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('invalid_api_key');
    }
    await prisma.apiKey.updateMany({ where: { userId: u.userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await complete(u.headers, { model: 'deepseek-v4-pro', messages: msgs })).statusCode).toBe(401);
  });

  it('non-streaming completion: OpenAI shape, exact token charge, lastUsedAt', async () => {
    const u = await keyUser();
    const before = await balance(u.userId);
    const res = await complete(u.headers, {
      model: 'deepseek-v4-pro',
      messages: [{ role: 'developer', content: 'Be brief.' }, { role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      temperature: 0.3,
      max_tokens: 200,
      stream_options: null,
      user: 'someone',
      metadata: { a: 1 },
      logit_bias: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ object: 'chat.completion', model: 'deepseek-v4-pro', choices: [{ index: 0, finish_reason: 'stop' }] });
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(typeof body.created).toBe('number');
    expect(body.choices).toHaveLength(1);
    expect(body.choices[0].message).toMatchObject({ role: 'assistant', content: expect.stringMatching(/^Mock reply from DeepSeek V4 Pro/) });
    const cost = tokenCostMicro(getModel('deepseek-v4-pro')!, body.usage.prompt_tokens, body.usage.completion_tokens);
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
    expect(body.usage.credits).toBe(Number(cost) / 1e6);
    expect(before - (await balance(u.userId))).toBe(cost);
    expect(body.balance).toBe(Number(before - cost) / 1e6);
    // No product system prompt on the API; developer → system; params passed through.
    const req = seen.at(-1)!;
    expect(req.messages).toEqual([{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hello' }]);
    expect(req.params).toEqual({ temperature: 0.3, max_tokens: 200 });
    const key = await prisma.apiKey.findFirstOrThrow({ where: { userId: u.userId } });
    expect(key.lastUsedAt).not.toBeNull();
    const usage = await prisma.usageDaily.findMany({ where: { userId: u.userId } });
    expect(usage).toEqual([expect.objectContaining({ model: 'deepseek-v4-pro', messages: 1, creditsMicro: cost })]);
  });

  it('compare_with returns two choices and charges both; web_search charges ×1.6', async () => {
    const u = await keyUser();
    const before = await balance(u.userId);
    const body = (await complete(u.headers, { model: 'deepseek-v4-pro', compare_with: 'qwen3.5-397b', web_search: true, messages: msgs })).json();
    expect(body.choices.map((c: J) => [c.index, c.model, c.finish_reason])).toEqual([
      [0, 'deepseek-v4-pro', 'stop'],
      [1, 'qwen3.5-397b', 'stop'],
    ]);
    expect(body.choices[1].message.content).toMatch(/^Mock reply from Qwen3.5 397B/);
    expect(body.web_search).toEqual({ status: 'done', sources: 1 });
    const charged = before - (await balance(u.userId));
    expect(charged).toBe(BigInt(Math.round(body.usage.credits * 1e6)));
    expect(await prisma.usageDaily.count({ where: { userId: u.userId } })).toBe(2);
    // Search results reach the model as a system message.
    expect(seen.at(-1)!.messages[0]!.role).toBe('system');
  });

  it('streams chat.completion.chunk frames ending in [DONE], with usage when asked', async () => {
    const u = await keyUser();
    const before = await balance(u.userId);
    const res = await complete(u.headers, { model: 'kimi-k3', messages: msgs, stream: true, stream_options: { include_usage: true } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    const f = frames(res.body);
    expect(f.at(-1)).toBe('[DONE]');
    const chunks = f.slice(0, -1) as J[];
    expect(chunks.every((c) => c.object === 'chat.completion.chunk' && c.id === chunks[0]!.id)).toBe(true);
    expect(chunks[0]!.choices[0].delta).toMatchObject({ role: 'assistant' });
    const text = chunks.flatMap((c) => c.choices).map((c: J) => c.delta?.content ?? '').join('');
    expect(text).toMatch(/^Mock reply from Kimi K3/);
    const finish = chunks.find((c) => c.choices[0]?.finish_reason)!;
    expect(finish.choices[0]).toMatchObject({ index: 0, delta: {}, finish_reason: 'stop' });
    const usageChunk = chunks.at(-1)!;
    expect(usageChunk.choices).toEqual([]);
    const cost = tokenCostMicro(getModel('kimi-k3')!, usageChunk.usage.prompt_tokens, usageChunk.usage.completion_tokens);
    expect(before - (await balance(u.userId))).toBe(cost);

    // Without include_usage there is no usage chunk.
    const plain = frames((await complete(u.headers, { model: 'kimi-k3', messages: msgs, stream: true })).body);
    expect((plain.slice(0, -1) as J[]).every((c) => !c.usage)).toBe(true);
  });

  it('streams compare mode with choice indexes 0 and 1', async () => {
    const u = await keyUser();
    const f = frames((await complete(u.headers, { model: 'deepseek-v4-pro', compare_with: 'deepseek-v4-flash', messages: msgs, stream: true })).body);
    const chunks = f.filter((c): c is J => c !== '[DONE]');
    expect(chunks.some((c) => c.choices[0].index === 0 && c.choices[0].delta.content)).toBe(true);
    // llama fails in the mock: slot 1 ends with finish_reason 'error', slot 0 is fine.
    const errorChunk = chunks.find((c) => c.choices[0].index === 1)!;
    expect(errorChunk.choices[0]).toMatchObject({ finish_reason: 'error', error: { code: 'provider_error' } });
    expect(chunks.find((c) => c.choices[0].index === 0 && c.choices[0].finish_reason)!.choices[0].finish_reason).toBe('stop');
    expect(f.at(-1)).toBe('[DONE]');
  });

  it('failures are never charged: stream error frame, 502/503 without streaming', async () => {
    const u = await keyUser();
    const before = await balance(u.userId);
    const f = frames((await complete(u.headers, { model: 'deepseek-v4-flash', messages: msgs, stream: true })).body);
    expect(f[0]).toEqual({ error: { message: expect.any(String), type: 'api_error', code: 'provider_error' } });
    const res = await complete(u.headers, { model: 'deepseek-v4-flash', messages: msgs });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('provider_error');
    expect(await balance(u.userId)).toBe(before);
    expect(await prisma.usageDaily.count({ where: { userId: u.userId } })).toBe(0);

    await prisma.user.update({ where: { id: u.userId }, data: { creditsMicro: 10n } });
    const poor = await complete(u.headers, { model: 'deepseek-v4-pro', messages: msgs });
    expect(poor.statusCode).toBe(402);
    expect(poor.json().error).toMatchObject({ code: 'insufficient_credits', type: 'insufficient_credits' });
    expect(await balance(u.userId)).toBe(10n);
  });

  it('validates the body: 400 invalid, 404 unknown model', async () => {
    const u = await keyUser();
    const bad = [
      {},
      { model: 'deepseek-v4-pro' },
      { model: 'deepseek-v4-pro', messages: [] },
      { model: 'deepseek-v4-pro', messages: [{ role: 'system', content: 'only system' }] },
      { model: 'deepseek-v4-pro', messages: [{ role: 'tool', content: 'x', tool_call_id: '1' }, ...msgs] },
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }] },
      { model: 'deepseek-v4-pro', messages: [{ role: 'assistant', content: null, tool_calls: [{}] }, ...msgs] },
      { model: 'deepseek-v4-pro', messages: msgs, n: 2 },
      { model: 'deepseek-v4-pro', messages: msgs, temperature: 3 },
      { model: 'deepseek-v4-pro', messages: msgs, max_tokens: 0 },
      { model: 'deepseek-v4-pro', messages: msgs, stream: 'yes' },
      { model: 'deepseek-v4-pro', messages: msgs, compare_with: 'deepseek-v4-pro' },
      { model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'x'.repeat(500_001) }] },
    ];
    for (const b of bad) {
      const res = await complete(u.headers, b);
      expect(res.statusCode, JSON.stringify(b).slice(0, 80)).toBe(400);
      expect(res.json().error.type).toBe('invalid_request_error');
    }
    const unknown = await complete(u.headers, { model: 'gpt-5', messages: msgs });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('model_not_found');
    expect((await complete(u.headers, { model: 'deepseek-v4-pro', compare_with: 'nope', messages: msgs })).statusCode).toBe(404);
  });

  it(`rate limits each key to ${DEFAULT_API_RATE_LIMIT} requests per minute`, async () => {
    const u = await keyUser();
    const codes = [];
    for (let i = 0; i < DEFAULT_API_RATE_LIMIT; i++) codes.push((await complete(u.headers, {})).statusCode);
    expect(codes.every((c) => c === 400)).toBe(true);
    const limited = await complete(u.headers, {});
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.json().error.type).toBe('rate_limit_error');
  });

  it('POST /v1/auth/siwe returns a 1-hour key that is not listed or counted', async () => {
    const nonce = (await app.inject({ method: 'GET', url: '/v1/auth/nonce', remoteAddress: ip })).json().nonce;
    const s = await signedMessage(app, ip, { nonce });
    addresses.push(s.account.address.toLowerCase());
    const res = await app.inject({ method: 'POST', url: '/v1/auth/siwe', remoteAddress: ip, payload: { message: s.message, signature: s.signature } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.key).toMatch(new RegExp(`^${brand.keyPrefix}[0-9a-f]{64}$`));
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000);
    expect(body).toMatchObject({ address: s.account.address, credits: 25, welcome: true });

    const ok = await complete({ authorization: `Bearer ${body.key}` }, { model: 'deepseek-v4-flash', compare_with: 'qwen3.5-397b', messages: msgs });
    expect(ok.statusCode).toBe(200);

    // Replayed signature fails (nonce consumed).
    const replay = await app.inject({ method: 'POST', url: '/v1/auth/siwe', remoteAddress: ip, payload: { message: s.message, signature: s.signature } });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('invalid_nonce');

    // Sign in to the app with the same wallet: the agent key is not listed and doesn't count.
    const r = await signIn(app, ip, { account: s.account });
    const cookies = { nx_session: r.session! };
    expect((await app.inject({ method: 'GET', url: '/keys', cookies })).json()).toEqual([]);
    for (let i = 0; i < MAX_API_KEYS; i++) expect((await createKey(cookies, `k${i}`)).statusCode).toBe(201);
  });

  it('/chat and /v1 share the same pipeline and prices', async () => {
    const u = await keyUser();
    const v1 = (await complete(u.headers, { model: 'qwen3.5-397b', messages: msgs })).json();
    const app1 = sseEvents((await app.inject({ method: 'POST', url: '/chat', cookies: u.cookies, payload: { model: 'qwen3.5-397b', messages: msgs } })).body);
    const done = app1.find((e) => e.type === 'done') as J;
    const perToken = (credits: number, t: { input: number; output: number }) =>
      credits === Number(tokenCostMicro(getModel('qwen3.5-397b')!, t.input, t.output)) / 1e6;
    expect(perToken(v1.usage.credits, { input: v1.usage.prompt_tokens, output: v1.usage.completion_tokens })).toBe(true);
    expect(perToken(done.credits, done.tokens)).toBe(true);
  });
});
