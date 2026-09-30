import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { getAddress } from 'viem';
import { createMockProvider } from '../src/inference';
import { formatUptime, probeServices, readStatus, recordStatus, runStatusProbe, STATUS_DAYS } from '../src/status';
import { TEST_ENV, buildCapturingApp, servicesUp } from './helpers';
import { FakeChain } from './fake-chain';

const up = await servicesUp();
const REDIS_URL = (process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15').replace(/\/\d+$/, '') + '/12';
const ENV = { ...TEST_ENV, REDIS_URL };
const DAY = 86_400_000;

describe('formatUptime', () => {
  it('floors to two decimals and is null without data', () => {
    expect(formatUptime(0, 0)).toBeNull();
    expect(formatUptime(10, 10)).toBe('100%');
    expect(formatUptime(19_999, 20_000)).toBe('99.99%');
    expect(formatUptime(1999, 2000)).toBe('99.95%');
  });
});

describe.skipIf(!up)('status probes and GET /status', () => {
  const apps: FastifyInstance[] = [];
  const make = async (env: Record<string, string> = {}, opts: Parameters<typeof buildCapturingApp>[2] = {}) => {
    const { app } = await buildCapturingApp('info', { ...ENV, ...env }, opts);
    await app.ready();
    apps.push(app);
    return app;
  };

  beforeAll(async () => {
    const app = await make();
    const keys = await app.ctx.redis.keys('status:*');
    if (keys.length) await app.ctx.redis.del(...keys);
  });
  afterAll(async () => {
    for (const a of apps) await a.close();
  });

  it('keeps the worst status per day, 90 days oldest→today, uptime over days with data', async () => {
    const app = await make({}, { provider: createMockProvider({ delayMs: 1 }) });
    const now = new Date();
    const yesterday = new Date(now.getTime() - DAY);
    await recordStatus(app.ctx, { API: 'ok', Database: 'ok' }, now);
    await recordStatus(app.ctx, { API: 'warn', Database: 'ok' }, now);
    await recordStatus(app.ctx, { API: 'ok', Database: 'ok' }, now);
    await recordStatus(app.ctx, { API: 'down', Database: 'ok' }, yesterday);
    const services = await readStatus(app.ctx, now);
    expect(services.map((s) => s.name)).toEqual(['API', 'Database', 'AI models']);
    const api = services[0]!;
    expect(api.days).toHaveLength(STATUS_DAYS);
    expect(api.today).toBe('warn');
    expect(api.days.at(-1)).toBe('warn');
    expect(api.days.at(-2)).toBe('down');
    expect(api.days.slice(0, -2).every((d) => d === null)).toBe(true);
    expect(api.uptime).toBe('75%'); // 3 of 4 samples up (warn counts as up)
    expect(services[1]!.uptime).toBe('100%');
    expect(services[2]).toMatchObject({ today: null, uptime: null });
    const ttl = await app.ctx.redis.ttl(`status:api:${now.toISOString().slice(0, 10)}`);
    expect(ttl).toBeGreaterThan(99 * 86_400);
    expect(ttl).toBeLessThanOrEqual(100 * 86_400);

    const res = await app.inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().services[0]).toEqual({ name: 'API', days: api.days, uptime: '75%', today: 'warn' });
  });

  it('probes database, models, top-ups and web search', async () => {
    const ok = await make({}, { provider: createMockProvider({ delayMs: 1 }) });
    expect(await probeServices(ok.ctx)).toEqual({ API: 'ok', Database: 'ok', 'AI models': 'ok' });

    const partial = await make({}, { provider: createMockProvider({ unavailableModels: ['qwen3-235b'] }) });
    expect((await probeServices(partial.ctx))['AI models']).toBe('warn');

    const none = await make({ INFERENCE_PROVIDER: '' });
    expect((await probeServices(none.ctx))['AI models']).toBe('down');

    let fail = true;
    const chain = new FakeChain(getAddress('0x00000000000000000000000000000000000Ab5d6'));
    const full = await make(
      { USDG_ADDRESS: chain.usdg, TREASURY_ADDRESS: '0x000000000000000000000000000000000000beef' },
      {
        chainClient: chain.client(),
        search: {
          async search() {
            if (fail) throw new Error('search down');
            return [];
          },
        },
      },
    );
    let p = await probeServices(full.ctx);
    expect(p['Top-ups']).toBe('warn'); // indexer has not ticked
    expect(p['Web search']).toBe('ok'); // no searches yet
    await full.ctx.topup!.tick();
    const signal = new AbortController().signal;
    await full.ctx.search!.search('q', signal).catch(() => undefined);
    p = await probeServices(full.ctx);
    expect(p['Top-ups']).toBe('ok');
    expect(p['Web search']).toBe('warn');
    for (let i = 0; i < 2; i++) await full.ctx.search!.search('q', signal).catch(() => undefined);
    expect((await probeServices(full.ctx))['Web search']).toBe('down');
    fail = false;
    await full.ctx.search!.search('q', signal);
    expect((await probeServices(full.ctx))['Web search']).toBe('ok');

    await runStatusProbe(full.ctx, full.log);
    const names = (await readStatus(full.ctx)).map((s) => s.name);
    expect(names).toEqual(['API', 'Database', 'AI models', 'Top-ups', 'Web search']);
  });
});
