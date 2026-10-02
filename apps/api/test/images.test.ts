import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { createImageGenerator, createMockImageGenerator, ImageGenError, sniffImage, type ImageGenerator } from '../src/images';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn } from './helpers';

const up = await servicesUp();
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+e/HfwAJPAPTZgA7PwAAAABJRU5ErkJggg==';

describe('image provider adapter', () => {
  it('sends an OpenAI-style request and accepts b64_json or a URL it downloads itself', async () => {
    const calls: { url: string; body?: any }[] = [];
    const f = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/images/generations')) {
        return new Response(JSON.stringify({ data: [calls.length === 1 ? { b64_json: PNG_B64 } : { url: 'https://cdn.test/img.png' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(Buffer.from(PNG_B64, 'base64'), { status: 200 });
    }) as typeof fetch;
    const g = createImageGenerator({ baseUrl: 'https://img.test/v1/', apiKey: 'k', model: 'flux', costMicro: 3_000_000n, sizeStyle: 'wh', fetch: f });
    const a = await g.generate('a cat', 'landscape', new AbortController().signal);
    expect(a).toEqual({ mime: 'image/png', base64: PNG_B64 });
    expect(calls[0]!.url).toBe('https://img.test/v1/images/generations');
    expect(calls[0]!.body).toMatchObject({ model: 'flux', prompt: 'a cat', n: 1, width: 1344, height: 768, response_format: 'b64_json' });
    const b = await g.generate('a dog', 'square', new AbortController().signal);
    expect(b.mime).toBe('image/png');
    expect(calls.at(-1)!.url).toBe('https://cdn.test/img.png');
  });

  it('rejects non-images and maps refusals', async () => {
    const notImage = (async () => new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('<svg/>').toString('base64') }] }), { status: 200 })) as typeof fetch;
    await expect(createImageGenerator({ baseUrl: 'https://x.test', apiKey: null, model: 'm', costMicro: 1n, fetch: notImage }).generate('p', 'square', new AbortController().signal)).rejects.toBeInstanceOf(ImageGenError);
    const refused = (async () => new Response('{"error":"nsfw"}', { status: 400 })) as typeof fetch;
    await expect(createImageGenerator({ baseUrl: 'https://x.test', apiKey: null, model: 'm', costMicro: 1n, fetch: refused }).generate('p', 'square', new AbortController().signal)).rejects.toMatchObject({ code: 'rejected' });
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
  });
});

describe.skipIf(!up)('POST /images', () => {
  let app: FastifyInstance;
  let lines: string[];
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  let fail: 'rejected' | 'provider_error' | null = null;
  const drawn: string[] = [];
  const mock = createMockImageGenerator(3_000_000n);
  const gen: ImageGenerator = {
    ...mock,
    async generate(p, s, sig) {
      drawn.push(p);
      if (fail) throw new ImageGenError(fail, 'x');
      return mock.generate(p, s, sig);
    },
  };
  const newUser = async (a = app) => {
    const r = await signIn(a, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };
  const bal = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).creditsMicro;

  beforeAll(async () => {
    ({ app, lines } = await buildCapturingApp('info', TEST_ENV, { images: gen }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('returns the image as a data URL, charges the fixed price once, and never logs the prompt', async () => {
    const { cookies, userId } = await newUser();
    const before = await bal(userId);
    const res = await app.inject({ method: 'POST', url: '/images', cookies, payload: { prompt: 'a secret violet whale', size: 'portrait' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const j = res.json();
    expect(j.image).toBe(`data:image/png;base64,${PNG_B64.slice(0)}`.replace(PNG_B64, j.image.split(',')[1]));
    expect(j.image.startsWith('data:image/png;base64,')).toBe(true);
    expect(j.credits).toBe(3);
    expect(before - (await bal(userId))).toBe(3_000_000n);
    const usage = await prisma.usageDaily.findMany({ where: { userId } });
    expect(usage.map((u) => u.model)).toContain('image-generation');
    expect(lines.join('\n')).not.toContain('secret violet whale');
    // The image model got the rewritten prompt (the mock text model's reply), not the raw request.
    expect(drawn.at(-1)).toMatch(/^Mock reply from DeepSeek V4 Flash/);
  });

  it('charges nothing on refusals and failures, validates input, and needs a configured provider', async () => {
    const { cookies, userId } = await newUser();
    const before = await bal(userId);
    fail = 'rejected';
    expect((await app.inject({ method: 'POST', url: '/images', cookies, payload: { prompt: 'something' } })).statusCode).toBe(422);
    fail = 'provider_error';
    expect((await app.inject({ method: 'POST', url: '/images', cookies, payload: { prompt: 'something' } })).statusCode).toBe(502);
    fail = null;
    expect(await bal(userId)).toBe(before);
    expect((await app.inject({ method: 'POST', url: '/images', cookies, payload: { prompt: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/images', payload: { prompt: 'a cat' } })).statusCode).toBe(401);
    await prisma.user.update({ where: { id: userId }, data: { creditsMicro: 1_000_000n } });
    const poor = await app.inject({ method: 'POST', url: '/images', cookies, payload: { prompt: 'a cat' } });
    expect(poor.statusCode).toBe(402);
    expect(await bal(userId)).toBe(1_000_000n);

    const { app: app2 } = await buildCapturingApp('info', TEST_ENV, { images: null });
    try {
      const u = await newUser(app2);
      expect((await app2.inject({ method: 'POST', url: '/images', cookies: u.cookies, payload: { prompt: 'a cat' } })).statusCode).toBe(503);
    } finally {
      await app2.close();
    }
  });
});
