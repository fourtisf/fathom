import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { runBurnCron } from '../src/app';
import { MAX_CHATS } from '../src/routes/chats';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn } from './helpers';

const up = await servicesUp();

const b64 = (n: number) => randomBytes(n).toString('base64');
const newId = () => `c_${randomBytes(8).toString('hex')}`;

describe.skipIf(!up)('encrypted chat history', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();

  const newUser = async () => {
    const r = await signIn(app, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };
  const put = (cookies: Record<string, string>, id: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: `/chats/${id}`, cookies, payload: payload as object });

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('stores and returns opaque ciphertext; upserts by client id; newest first', async () => {
    const { cookies, userId } = await newUser();
    const a = { id: newId(), ciphertext: b64(100), iv: b64(12) };
    const b = { id: newId(), ciphertext: b64(50), iv: b64(12) };
    const burnAt = new Date(Date.now() + 3_600_000).toISOString();
    const r1 = await put(cookies, a.id, { ciphertext: a.ciphertext, iv: a.iv, burnAt: null });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ id: a.id, burnAt: null });
    await put(cookies, b.id, { ciphertext: b.ciphertext, iv: b.iv, burnAt });
    const newer = b64(80);
    await put(cookies, a.id, { ciphertext: newer, iv: a.iv, burnAt: null }); // update: a is newest

    const list = (await app.inject({ method: 'GET', url: '/chats', cookies })).json();
    expect(list.map((c: { id: string }) => c.id)).toEqual([a.id, b.id]);
    expect(list[0]).toEqual({ id: a.id, ciphertext: newer, iv: a.iv, burnAt: null, updatedAt: expect.any(String) });
    expect(list[1].burnAt).toBe(burnAt);
    const row = await prisma.encryptedChat.findUniqueOrThrow({ where: { id: a.id } });
    expect(Buffer.from(row.ciphertext).toString('base64')).toBe(newer);
    expect(row.userId).toBe(userId);

    // Another user can neither overwrite, read nor delete it.
    const other = await newUser();
    expect((await put(other.cookies, a.id, { ciphertext: b64(10), iv: b64(12), burnAt: null })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/chats', cookies: other.cookies })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/chats/${a.id}`, cookies: other.cookies })).statusCode).toBe(204);
    expect(await prisma.encryptedChat.count({ where: { id: a.id } })).toBe(1);

    expect((await app.inject({ method: 'DELETE', url: `/chats/${a.id}`, cookies })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/chats', cookies })).json().map((c: { id: string }) => c.id)).toEqual([b.id]);
    expect((await app.inject({ method: 'DELETE', url: '/chats', cookies })).statusCode).toBe(204);
    expect(await prisma.encryptedChat.count({ where: { userId } })).toBe(0);
    expect((await app.inject({ method: 'GET', url: '/chats' })).statusCode).toBe(401);
  });

  it('validates id, base64, sizes and burnAt', async () => {
    const { cookies } = await newUser();
    const ok = { ciphertext: b64(10), iv: b64(12), burnAt: null };
    for (const [id, body] of [
      ['short', ok],
      ['has space here', ok],
      ['x'.repeat(65), ok],
      [newId(), { ...ok, ciphertext: 'not base64!' }],
      [newId(), { ...ok, ciphertext: '' }],
      [newId(), { ...ok, iv: b64(16) }],
      [newId(), { ...ok, iv: 123 }],
      [newId(), { ...ok, burnAt: 'tomorrow' }],
      [newId(), { ...ok, ciphertext: b64(1024 * 1024 + 3) }],
    ] as const) {
      const res = await put(cookies, encodeURIComponent(id), body);
      expect(res.statusCode, `${id} ${JSON.stringify(body).slice(0, 60)}`).toBe(400);
    }
    expect((await put(cookies, newId(), { ...ok, ciphertext: b64(1024 * 1024) })).statusCode).toBe(200);
    // Bodies over the route limit (~1.5 MB) are refused before parsing.
    expect((await put(cookies, newId(), { ...ok, ciphertext: b64(1_200_000) })).statusCode).toBe(413);
  });

  it('refuses when history is off; turning it off deletes all saved chats', async () => {
    const { cookies, userId } = await newUser();
    await put(cookies, newId(), { ciphertext: b64(10), iv: b64(12), burnAt: null });
    await put(cookies, newId(), { ciphertext: b64(10), iv: b64(12), burnAt: null });
    expect(await prisma.encryptedChat.count({ where: { userId } })).toBe(2);
    const off = await app.inject({ method: 'PATCH', url: '/settings', cookies, payload: { saveHistory: false } });
    expect(off.json().saveHistory).toBe(false);
    expect(await prisma.encryptedChat.count({ where: { userId } })).toBe(0);
    const res = await put(cookies, newId(), { ciphertext: b64(10), iv: b64(12), burnAt: null });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('history_off');
  });

  it(`caps saved chats at ${MAX_CHATS} per user`, async () => {
    const { cookies, userId } = await newUser();
    await prisma.encryptedChat.createMany({
      data: Array.from({ length: MAX_CHATS }, () => ({ id: newId(), userId, ciphertext: Buffer.from([1]), iv: Buffer.alloc(12) })),
    });
    const res = await put(cookies, newId(), { ciphertext: b64(10), iv: b64(12), burnAt: null });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('chat_limit');
    const list = (await app.inject({ method: 'GET', url: '/chats', cookies })).json();
    expect(list).toHaveLength(100);
  });

  it('burn cron deletes chats past burnAt and long-expired agent keys; GET /chats hides burned ones', async () => {
    const { cookies, userId } = await newUser();
    const gone = newId();
    const kept = newId();
    const past = new Date(Date.now() - 1000).toISOString();
    await put(cookies, gone, { ciphertext: b64(10), iv: b64(12), burnAt: past });
    await put(cookies, kept, { ciphertext: b64(10), iv: b64(12), burnAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await app.inject({ method: 'GET', url: '/chats', cookies })).json().map((c: { id: string }) => c.id)).toEqual([kept]);
    await prisma.apiKey.createMany({
      data: [
        { userId, name: 'agent-session', prefix: 'p', hash: `old-${userId}`, expiresAt: new Date(Date.now() - 2 * 86_400_000) },
        { userId, name: 'agent-session', prefix: 'p', hash: `new-${userId}`, expiresAt: new Date(Date.now() - 1000) },
      ],
    });
    const res = await runBurnCron(app.ctx);
    expect(res.chats).toBeGreaterThanOrEqual(1);
    expect(await prisma.encryptedChat.findUnique({ where: { id: gone } })).toBeNull();
    expect(await prisma.encryptedChat.findUnique({ where: { id: kept } })).not.toBeNull();
    expect(await prisma.apiKey.findMany({ where: { userId }, select: { hash: true } })).toEqual([{ hash: `new-${userId}` }]);
  });
});
