import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { runBurnCron } from '../src/app';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn } from './helpers';

const up = await servicesUp();

describe.skipIf(!up)('shared chat links (/shares)', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ct = Buffer.from('opaque ciphertext the server cannot read').toString('base64');
  const iv = Buffer.alloc(12, 7).toString('base64');

  const newUser = async () => {
    const r = await signIn(app, nextIp());
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };
  const create = (cookies: Record<string, string>, payload: object) =>
    app.inject({ method: 'POST', url: '/shares', cookies, payload });

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('stores ciphertext, serves it publicly by id, and lets only the owner delete it', async () => {
    const { cookies } = await newUser();
    const res = await create(cookies, { ciphertext: ct, iv, ttl: '7d' });
    expect(res.statusCode).toBe(201);
    const { id, expiresAt } = res.json();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    // Public read, no cookies.
    const read = await app.inject({ method: 'GET', url: `/shares/${id}` });
    expect(read.statusCode).toBe(200);
    expect(read.headers['cache-control']).toBe('no-store');
    expect(read.json()).toMatchObject({ ciphertext: ct, iv });

    // Listed for the owner.
    const list = await app.inject({ method: 'GET', url: '/shares', cookies });
    expect(list.json().map((s: { id: string }) => s.id)).toContain(id);

    // Someone else can't delete it.
    const other = await newUser();
    expect((await app.inject({ method: 'DELETE', url: `/shares/${id}`, cookies: other.cookies })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/shares/${id}`, cookies })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/shares/${id}` })).statusCode).toBe(404);
  });

  it('validates input and requires sign-in to create', async () => {
    const { cookies } = await newUser();
    for (const bad of [
      { ciphertext: ct, iv, ttl: '90d' },
      { ciphertext: 'not base64!', iv, ttl: '1d' },
      { ciphertext: ct, iv: Buffer.alloc(8).toString('base64'), ttl: '1d' },
      { ciphertext: '', iv, ttl: '1d' },
    ]) {
      expect((await create(cookies, bad)).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: '/shares', payload: { ciphertext: ct, iv, ttl: '1d' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/shares/short' })).statusCode).toBe(404);
  });

  it('hides expired links, purges them in the cron, and deletes them with all data', async () => {
    const { cookies, userId } = await newUser();
    const { id } = (await create(cookies, { ciphertext: ct, iv, ttl: '1d' })).json();
    const kept = (await create(cookies, { ciphertext: ct, iv, ttl: '30d' })).json().id;
    await prisma.sharedChat.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await app.inject({ method: 'GET', url: `/shares/${id}` })).statusCode).toBe(404);
    const res = await runBurnCron(app.ctx);
    expect(res.shares).toBeGreaterThanOrEqual(1);
    expect(await prisma.sharedChat.findUnique({ where: { id } })).toBeNull();

    expect((await app.inject({ method: 'DELETE', url: '/data', cookies })).statusCode).toBeLessThan(300);
    expect(await prisma.sharedChat.findUnique({ where: { id: kept } })).toBeNull();
    expect(await prisma.sharedChat.count({ where: { userId } })).toBe(0);
  });
});
