import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildCapturingApp } from './helpers';

// CLAUDE.md §0 rules 1 and 3: no prompt/completion text, no IPs, no keys in any log line.
const MARKER = 'SECRET-PROMPT-7f3a9c';
const IP = '203.0.113.7';
const KEY = 'fth_live_secret';
const headers = { 'x-forwarded-for': IP, authorization: `Bearer ${KEY}`, cookie: `session=${KEY}` };
const chatBody = { model: 'deepseek-v3.1', messages: [{ role: 'user', content: MARKER }], prompt: MARKER };

let app: FastifyInstance;
let lines: string[];

beforeAll(async () => {
  ({ app, lines } = await buildCapturingApp('trace'));
  // Test-only routes that fail while holding user content.
  app.post('/test/throw', async (req) => {
    throw new Error(`boom: ${JSON.stringify(req.body)}`);
  });
  app.post('/test/bad-request', async (req) => {
    throw app.httpErrors.badRequest(`bad: ${JSON.stringify(req.body)}`);
  });
  app.post('/test/log-it', async (req) => {
    // Even a careless ad hoc log of the body/headers must be redacted.
    req.log.info({ body: req.body, headers: req.headers, ip: req.ip, messages: chatBody.messages }, 'careless');
    return { ok: true };
  });
});
afterAll(() => app.close());

describe('no logging of content, IPs or keys', () => {
  it('never writes the marker, IP or key to any log line', async () => {
    const reqs = [
      { url: '/v1/chat/completions', payload: chatBody },
      { url: `/v1/chat/completions?q=${MARKER}`, payload: chatBody },
      { url: '/test/throw', payload: chatBody },
      { url: '/test/bad-request', payload: chatBody },
      { url: '/test/log-it', payload: chatBody },
      // Malformed JSON: Node's parse error message quotes the raw body.
      { url: '/test/throw', payload: `{"messages": "${MARKER}` },
    ];
    for (const r of reqs) {
      const res = await app.inject({
        method: 'POST',
        url: r.url,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload),
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(200);
      // 5xx responses must not echo internals either.
      if (res.statusCode >= 500) expect(res.body).not.toContain(MARKER);
    }

    expect(lines.length).toBeGreaterThan(reqs.length); // not vacuous
    const all = lines.join('\n');
    expect(all).toContain('request completed');
    expect(all).toContain('request failed');
    for (const secret of [MARKER, IP, KEY]) expect(all).not.toContain(secret);
  });
});
