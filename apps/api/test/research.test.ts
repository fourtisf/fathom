import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { getModel, tokenCostMicro } from '@fathom/config';
import type { ChatChunk, ChatStreamRequest, InferenceProvider } from '../src/inference';
import { createMockProvider } from '../src/inference';
import type { SearchResult, WebSearch } from '../src/search';
import { mergeSources, parseQueries } from '../src/research';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, sseEvents } from './helpers';

const up = await servicesUp();
type Ev = Record<string, any>;

describe('research helpers', () => {
  it('parses planned queries and falls back to the question', () => {
    expect(parseQueries('1. solana fees 2026\n- "solana validator count"\nsolana fees 2026\n\nHere are queries', 'q')).toEqual([
      'solana fees 2026',
      'solana validator count',
    ]);
    expect(parseQueries('', 'What is Solana?')).toEqual(['What is Solana?']);
  });
  it('merges sources round-robin without duplicates', () => {
    const r = (u: string): SearchResult => ({ title: u, url: `https://${u}`, description: '' });
    expect(mergeSources([[r('a.com'), r('b.com')], [r('a.com/'), r('c.com')], [r('d.com')]]).map((x) => x.title)).toEqual(['a.com', 'd.com', 'b.com', 'c.com']);
  });
});

describe.skipIf(!up)('POST /chat research mode', () => {
  let app: FastifyInstance;
  let lines: string[];
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  const queries: string[] = [];
  let failReport = false;
  const search: WebSearch = {
    async search(q, _s, count) {
      queries.push(`${q}|${count}`);
      return [
        { title: `About ${q}`, url: `https://example.org/${encodeURIComponent(q)}`, description: 'snippet' },
        { title: 'Shared', url: 'https://shared.example/x', description: 'same everywhere' },
      ];
    },
  };
  const base = createMockProvider({ delayMs: 1 });
  const provider: InferenceProvider = {
    ...base,
    async *chatStream(req: ChatStreamRequest): AsyncGenerator<ChatChunk> {
      const sys = req.messages.map((m) => (m.role === 'system' ? m.content : '')).join('\n');
      if (sys.includes('You plan web research')) {
        yield { type: 'delta', text: 'secret topic price history\nsecret topic risks\nsecret topic news' };
        yield { type: 'usage', input: 100, output: 20 };
        return;
      }
      if (failReport) throw new Error('boom');
      expect(sys).toContain('Deep Research mode');
      expect(sys).toContain('[4] Shared');
      yield { type: 'delta', text: '## Summary\nA cited report [1].' };
      yield { type: 'usage', input: 900, output: 300 };
    },
  };

  const newUser = async () => {
    const r = await signIn(app, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };

  beforeAll(async () => {
    ({ app, lines } = await buildCapturingApp('info', TEST_ENV, { provider, search }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('plans, searches every query, streams a cited report and charges plan + report once at the search rate', async () => {
    const { cookies, userId } = await newUser();
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
    const res = await app.inject({
      method: 'POST',
      url: '/chat',
      cookies,
      payload: { model: 'deepseek-v4-pro', compareWith: 'qwen3.5-397b', research: true, messages: [{ role: 'user', content: 'Research secret topic' }] },
    });
    expect(res.statusCode).toBe(200);
    const ev = sseEvents(res.body) as Ev[];
    const stages = ev.filter((e) => e.type === 'research');
    expect(stages.map((e) => e.stage)).toEqual(['planning', 'searching', 'writing']);
    expect(stages[1]!.queries).toEqual(['secret topic price history', 'secret topic risks', 'secret topic news']);
    expect(stages[2]!.sources).toBe(4); // 3 distinct + 1 shared
    expect(queries).toEqual(['secret topic price history|5', 'secret topic risks|5', 'secret topic news|5']);
    expect(ev.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toContain('A cited report [1].');
    const done = ev.filter((e) => e.type === 'done');
    expect(done).toHaveLength(1);
    expect(done[0]!.tokens).toEqual({ input: 1000, output: 320 });
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
    expect(before - after).toBe(tokenCostMicro(getModel('deepseek-v4-pro')!, 1000, 320, { webSearch: true }));
    const log = lines.join('\n');
    expect(log).not.toContain('secret topic');
  });

  it('charges nothing when the report fails', async () => {
    const { cookies, userId } = await newUser();
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
    failReport = true;
    try {
      const res = await app.inject({ method: 'POST', url: '/chat', cookies, payload: { model: 'deepseek-v4-pro', research: true, messages: [{ role: 'user', content: 'x topic' }] } });
      const ev = sseEvents(res.body) as Ev[];
      expect(ev.some((e) => e.type === 'error')).toBe(true);
      expect(ev.some((e) => e.type === 'done')).toBe(false);
    } finally {
      failReport = false;
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro).toBe(before);
  });

  it('is unavailable (503, not charged) without web search', async () => {
    const { app: app2 } = await buildCapturingApp('info', TEST_ENV, { provider, search: null });
    try {
      const r = await signIn(app2, ip);
      addresses.push(r.account.address.toLowerCase());
      const res = await app2.inject({ method: 'POST', url: '/chat', cookies: { nx_session: r.session! }, payload: { model: 'deepseek-v4-pro', research: true, messages: [{ role: 'user', content: 'x' }] } });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('research_unavailable');
    } finally {
      await app2.close();
    }
  });
});
