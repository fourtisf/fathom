import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { VISION_MODEL, tokenCostMicro } from '@fathom/config';
import { createMockProvider, createOpenAiCompatibleProvider, IMAGE_TOKENS, type InferenceProvider } from '../src/inference';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, sseEvents } from './helpers';

const up = await servicesUp();
type Ev = Record<string, any>;

// A tiny but valid PNG (1×1) as a data URL, plus a marker string that must never reach the logs.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('vision: images to the provider', () => {
  it('sends images as OpenAI content parts and plain text otherwise', async () => {
    let body: any = null;
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      baseUrl: 'https://p.test/v1',
      apiKey: 'k',
      modelMap: { [VISION_MODEL.id]: 'vendor/vl-model' },
      fetch: (async (_u: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(String(init!.body));
        const sse = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1}}\n\ndata: [DONE]\n\n';
        return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }) as typeof fetch,
    });
    const out: string[] = [];
    for await (const c of provider.chatStream({
      model: VISION_MODEL.id,
      signal: new AbortController().signal,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'What is on this chart?', images: [PNG] },
      ],
    })) if (c.type === 'delta') out.push(c.text);
    expect(out.join('')).toBe('ok');
    expect(body.model).toBe('vendor/vl-model');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'What is on this chart?' }, { type: 'image_url', image_url: { url: PNG } }],
    });
  });
});

describe.skipIf(!up)('POST /chat with images (mock provider)', () => {
  let app: FastifyInstance;
  let lines: string[];
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  let seen: string[] = [];
  const base = createMockProvider({ delayMs: 1 });
  const provider: InferenceProvider = { ...base, chatStream: (req) => { seen.push(req.model); return base.chatStream(req); } };

  const newUser = async (a: FastifyInstance) => {
    const r = await signIn(a, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };

  beforeAll(async () => {
    ({ app, lines } = await buildCapturingApp('info', TEST_ENV, { provider }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('routes image messages to the vision model alone, charges its tokens, and never logs the image', async () => {
    const { cookies, userId } = await newUser(app);
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
    seen = [];
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      cookies,
      payload: { model: 'deepseek-v3.1', compareWith: 'qwen3-235b', messages: [{ role: 'user', content: 'Read this chart', images: [PNG, PNG] }] },
    });
    expect(res.statusCode).toBe(200);
    const events = sseEvents(res.body) as Ev[];
    expect(seen).toEqual([VISION_MODEL.id]);
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toContain('and 2 images');
    const done = events.find((e) => e.type === 'done')!;
    expect(done.model).toBe(VISION_MODEL.id);
    expect(done.tokens.input).toBeGreaterThanOrEqual(2 * IMAGE_TOKENS);
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
    expect(before - after).toBe(tokenCostMicro(VISION_MODEL, done.tokens.input, done.tokens.output));
    expect(lines.join('\n')).not.toContain('iVBORw0KGgo');
    expect(lines.join('\n')).not.toContain('Read this chart');
  });

  it('rejects bad images and too many images', async () => {
    const { cookies } = await newUser(app);
    const post = (messages: unknown) => app.inject({ method: 'POST', url: '/chat', cookies, payload: { model: 'deepseek-v3.1', messages } });
    for (const bad of [
      [{ role: 'user', content: 'x', images: ['https://evil.test/a.png'] }],
      [{ role: 'user', content: 'x', images: ['data:image/svg+xml;base64,PHN2Zz4='] }],
      [{ role: 'user', content: 'x', images: 'nope' }],
      [{ role: 'assistant', content: 'x', images: [PNG] }, { role: 'user', content: 'y' }],
      [{ role: 'user', content: 'x', images: [PNG, PNG, PNG, PNG, PNG] }],
    ]) {
      expect((await post(bad)).statusCode).toBe(400);
    }
  });

  it('answers 503 (not charged) when the provider has no vision model', async () => {
    const noVision: InferenceProvider = { ...base, providerModelId: (m) => (m === VISION_MODEL.id ? null : m) };
    const { app: app2 } = await buildCapturingApp('info', TEST_ENV, { provider: noVision });
    try {
      const { cookies } = await newUser(app2);
      const res = await app2.inject({ method: 'POST', url: '/chat', cookies, payload: { model: 'deepseek-v3.1', messages: [{ role: 'user', content: 'x', images: [PNG] }] } });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('model_unavailable');
    } finally {
      await app2.close();
    }
  });
});
