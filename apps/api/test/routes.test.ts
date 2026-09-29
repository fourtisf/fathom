import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MODELS } from '@fathom/config';
import { buildCapturingApp } from './helpers';

let app: FastifyInstance;
beforeAll(async () => {
  ({ app } = await buildCapturingApp());
});
afterAll(() => app.close());

describe('routes', () => {
  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('GET /v1/models returns an OpenAI-style list', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/models' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('list');
    expect(body.data.map((m: { id: string }) => m.id)).toEqual(MODELS.map((m) => m.id));
    expect(body.data[0]).toEqual({
      id: 'deepseek-v3.1',
      object: 'model',
      owned_by: 'fathom',
      context_length: 128 * 1024,
      pricing: { input_per_m: 40, output_per_m: 120 },
      status: 'unknown',
    });
  });

  it('unknown routes use the JSON error shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { message: 'Unknown route GET /nope', type: 'not_found_error', code: 'not_found_error' },
    });
  });

  it('sets CORS for the web origin with credentials', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:3000' } });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
