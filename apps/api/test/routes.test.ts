import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MODELS, brand } from '@fathom/config';
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
      id: 'deepseek-v4-pro',
      object: 'model',
      owned_by: brand.name.toLowerCase(),
      context_length: 1024 * 1024,
      pricing: { input_per_m: 50, output_per_m: 700 },
      status: 'unavailable', // no inference provider configured
    });
  });

  it('GET /config reports missing features as unavailable', async () => {
    const res = await app.inject({ method: 'GET', url: '/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.chain).toBeNull();
    expect(body.inference).toBe(false);
    expect(body.webSearch).toBe(false);
    expect(body.models).toHaveLength(MODELS.length);
    expect(body.models[0]).toEqual({ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', status: 'unavailable' });
  });

  it('protected routes need a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect([401, 503]).toContain(res.statusCode); // 503 when DATABASE_URL is not set
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
