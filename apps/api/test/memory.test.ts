import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { createMockProvider, type InferenceProvider, type ChatStreamRequest } from '../src/inference';
import { buildSystemPrompt } from '../src/prompt';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn } from './helpers';

const up = await servicesUp();

describe('memory in the system prompt', () => {
  it('lists saved facts as bullets, and nothing without memory', () => {
    const p = buildSystemPrompt({ preset: null, webSearch: false, memory: 'I trade on Solana\n- Keep answers short' });
    expect(p).toContain('private memory');
    expect(p).toContain('- I trade on Solana');
    expect(p).toContain('- Keep answers short');
    expect(buildSystemPrompt({ preset: null, webSearch: false })).not.toContain('saved these facts');
  });
});

describe.skipIf(!up)('/memory (encrypted blob) and chat memory', () => {
  let app: FastifyInstance;
  let lines: string[];
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  let lastSystem = '';
  const base = createMockProvider({ delayMs: 1 });
  const provider: InferenceProvider = {
    ...base,
    chatStream(req: ChatStreamRequest) {
      lastSystem = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      return base.chatStream(req);
    },
  };
  const ct = Buffer.from('opaque memory ciphertext').toString('base64');
  const iv = Buffer.alloc(12, 3).toString('base64');
  const newUser = async () => {
    const r = await signIn(app, ip);
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

  it('stores and returns only ciphertext, replaces it, deletes it, and is removed with all data', async () => {
    const { cookies, userId } = await newUser();
    expect((await app.inject({ method: 'GET', url: '/memory', cookies })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/memory', cookies, payload: { ciphertext: ct, iv } })).statusCode).toBe(200);
    const got = await app.inject({ method: 'GET', url: '/memory', cookies });
    expect(got.json()).toMatchObject({ ciphertext: ct, iv });
    expect(got.headers['cache-control']).toBe('no-store');
    for (const bad of [{ ciphertext: 'not base64!', iv }, { ciphertext: ct, iv: Buffer.alloc(8).toString('base64') }, { ciphertext: '', iv }]) {
      expect((await app.inject({ method: 'PUT', url: '/memory', cookies, payload: bad })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'GET', url: '/memory' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/memory', cookies })).statusCode).toBe(204);
    expect(await prisma.encryptedMemory.findUnique({ where: { userId } })).toBeNull();
    await app.inject({ method: 'PUT', url: '/memory', cookies, payload: { ciphertext: ct, iv } });
    expect((await app.inject({ method: 'DELETE', url: '/data', cookies })).statusCode).toBeLessThan(300);
    expect(await prisma.encryptedMemory.findUnique({ where: { userId } })).toBeNull();
  });

  it('gives the model the memory sent with a chat, without logging or storing it', async () => {
    const { cookies } = await newUser();
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      cookies,
      payload: { model: 'deepseek-v4-pro', memory: 'My name is Zephyrine\nI hold mostly SOL', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(lastSystem).toContain('- My name is Zephyrine');
    expect(lines.join('\n')).not.toContain('Zephyrine');
    const tooLong = await app.inject({ method: 'POST', url: '/chat', cookies, payload: { model: 'deepseek-v4-pro', memory: 'x'.repeat(4001), messages: [{ role: 'user', content: 'hi' }] } });
    expect(tooLong.statusCode).toBe(400);
  });
});
