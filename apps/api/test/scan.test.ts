import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { CryptoTools, TokenReport } from '../src/crypto';
import { SCAN_RATE_PER_MIN } from '../src/routes/scan';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp } from './helpers';

const up = await servicesUp();
const ADDR = '0x1111111111111111111111111111111111111111';

describe.skipIf(!up)('public token scanner (POST /scan)', () => {
  let app: FastifyInstance;
  let off: FastifyInstance;
  let lines: string[] = [];
  const scanned: string[] = [];
  const report = { address: ADDR, kind: 'token', symbol: 'MOON', flags: [{ level: 'high', code: 'mint', text: 'mint' }] } as unknown as TokenReport;
  const crypto: CryptoTools = {
    scanner: {
      async scan(a) {
        scanned.push(a);
        if (a.endsWith('dead')) throw new Error('explorer HTTP 503');
        return report;
      },
    },
    prices: null,
  };

  beforeAll(async () => {
    ({ app, lines } = await buildCapturingApp('info', TEST_ENV, { crypto }));
    ({ app: off } = await buildCapturingApp('info', TEST_ENV, { crypto: null }));
  });
  afterAll(async () => {
    await app.close();
    await off.close();
  });

  const scan = (a: FastifyInstance, address: unknown, ip = nextIp()) =>
    a.inject({ method: 'POST', url: '/scan', payload: { address }, remoteAddress: ip });

  it('scans without a wallet or session, and never puts the address in the logs', async () => {
    const res = await scan(app, ADDR);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json().report).toMatchObject({ address: ADDR, symbol: 'MOON' });
    expect(scanned).toContain(ADDR);
    expect(lines.join('\n')).not.toContain(ADDR);
  });

  it('rejects bad input and reports failures without charging anything', async () => {
    for (const bad of ['', '0x123', 'hello', 42, `${ADDR}00`]) expect((await scan(app, bad)).statusCode).toBe(400);
    expect((await scan(app, '0x000000000000000000000000000000000000dead')).statusCode).toBe(502);
    expect((await scan(off, ADDR)).statusCode).toBe(503);
  });

  it('rate limits per network', async () => {
    const ip = nextIp();
    for (let i = 0; i < SCAN_RATE_PER_MIN; i++) expect((await scan(app, ADDR, ip)).statusCode).toBe(200);
    const res = await scan(app, ADDR, ip);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
