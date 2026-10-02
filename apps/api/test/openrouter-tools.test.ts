import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@fathom/db';
import { getModel, tokenCostMicro } from '@fathom/config';
import { loadEnv } from '../src/env';
import { createOpenRouterSearch, type WebSearch } from '../src/search';
import { createImageGenerator } from '../src/images';
import { createMockProvider } from '../src/inference';
import { TEST_ENV, buildCapturingApp, nextIp, servicesUp, signIn, sseEvents } from './helpers';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+e/HfwAJPAPTZgA7PwAAAABJRU5ErkJggg==';
const OR = { INFERENCE_PROVIDER: 'openrouter', INFERENCE_API_KEY: 'sk-or-test' };

describe('OpenRouter as the search and image backend (one key)', () => {
  it('turns on web search and image generation from the inference key alone', () => {
    const env = loadEnv(OR);
    expect(env.webSearch).toMatchObject({ kind: 'openrouter', model: 'deepseek/deepseek-v4-flash', feeMicro: 2_000_000n, apiKey: 'sk-or-test' });
    expect(env.images).toMatchObject({ kind: 'openrouter', model: 'black-forest-labs/flux.2-klein-4b', baseUrl: 'https://openrouter.ai/api/v1' });
    // The zero-retention routing policy travels with search requests too.
    expect((env.webSearch as { extraBody: any }).extraBody.provider).toMatchObject({ zdr: true, data_collection: 'deny' });
  });

  it('respects explicit choices and off switches', () => {
    expect(loadEnv({ ...OR, BRAVE_SEARCH_API_KEY: 'b' }).webSearch).toEqual({ kind: 'brave', feeMicro: 0n });
    expect(loadEnv({ ...OR, WEB_SEARCH: 'off' }).webSearch).toBeNull();
    expect(loadEnv({ ...OR, SEARCH_CREDITS: '0' }).webSearch!.feeMicro).toBe(0n);
    expect(loadEnv({ ...OR, SEARCH_MODEL: 'x/y' }).webSearch).toMatchObject({ model: 'x/y' });
    expect(loadEnv({ ...OR, IMAGE_PROVIDER: 'off' }).images).toBeNull();
    expect(loadEnv({ ...OR, IMAGE_MODEL: 'black-forest-labs/flux.2-pro' }).images).toMatchObject({ kind: 'openrouter', model: 'black-forest-labs/flux.2-pro' });
    expect(loadEnv({ ...OR, IMAGE_API_URL: 'https://api.together.xyz/v1', IMAGE_MODEL: 'm' }).images).toMatchObject({ kind: 'openai-compatible' });
    // Other providers (or no key) do not get OpenRouter tools.
    expect(loadEnv({ INFERENCE_PROVIDER: 'openrouter' }).webSearch).toBeNull();
    expect(loadEnv({ INFERENCE_PROVIDER: 'mock' }).images).toBeNull();
  });

  it('search sends the web plugin from our server and reads url_citation annotations', async () => {
    let sent: any;
    let url = '';
    const search = createOpenRouterSearch({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'deepseek/deepseek-v4-flash',
      feeMicro: 2_000_000n,
      extraBody: { provider: { zdr: true } },
      fetch: (async (u: string, init: RequestInit) => {
        url = u;
        sent = { ...JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization };
        return Response.json({
          choices: [
            {
              message: {
                content: '- [Alpha](https://a.example/x): Alpha says hi.\n- [Beta](https://b.example/y): Beta page.\n- [Bad](http://insecure.example)',
                annotations: [
                  { type: 'url_citation', url_citation: { url: 'https://a.example/x', title: 'Alpha <b>page</b>', content: 'Alpha excerpt' } },
                  { type: 'url_citation', url_citation: { url: 'https://a.example/x', title: 'dup', content: 'dup' } },
                  { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: 'x' } },
                  { type: 'file', file: {} },
                ],
              },
            },
          ],
        });
      }) as unknown as typeof fetch,
    });
    expect(search.feeMicro).toBe(2_000_000n);
    const r = await search.search('btc price today', new AbortController().signal, 3);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(sent).toMatchObject({
      model: 'deepseek/deepseek-v4-flash',
      stream: false,
      provider: { zdr: true },
      plugins: [{ id: 'web', engine: 'exa', max_results: 3 }],
      auth: 'Bearer k',
    });
    expect(sent.messages.at(-1)).toEqual({ role: 'user', content: 'btc price today' });
    expect(r).toEqual([
      { title: 'Alpha page', url: 'https://a.example/x', description: 'Alpha excerpt' },
      { title: 'Beta', url: 'https://b.example/y', description: 'Beta page.' },
    ]);
  });

  it('search errors carry no query text', async () => {
    const search = createOpenRouterSearch({
      baseUrl: 'https://openrouter.ai/api/v1/',
      apiKey: 'k',
      model: 'm',
      feeMicro: 0n,
      fetch: (async () => new Response('secret query echoed', { status: 402 })) as unknown as typeof fetch,
    });
    const err = await search.search('my secret query', new AbortController().signal).catch((e: Error) => e);
    expect((err as Error).message).toBe('search failed with HTTP 402');
  });

  it('images use OpenRouter /images with an aspect ratio and decode b64_json', async () => {
    let sent: any;
    let url = '';
    const gen = createImageGenerator({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'k',
      model: 'black-forest-labs/flux.2-klein-4b',
      costMicro: 3_000_000n,
      api: 'openrouter',
      headers: { 'X-Title': 'Noxsea' },
      fetch: (async (u: string, init: RequestInit) => {
        url = u;
        sent = { body: JSON.parse(String(init.body)), headers: init.headers };
        return Response.json({ data: [{ b64_json: PNG, media_type: 'image/png' }], usage: { cost: 0.014 } });
      }) as unknown as typeof fetch,
    });
    const img = await gen.generate('a violet whale', 'landscape', new AbortController().signal);
    expect(url).toBe('https://openrouter.ai/api/v1/images');
    expect(sent.body).toEqual({ model: 'black-forest-labs/flux.2-klein-4b', prompt: 'a violet whale', n: 1, aspect_ratio: '16:9' });
    expect(sent.headers).toMatchObject({ authorization: 'Bearer k', 'X-Title': 'Noxsea' });
    expect(img).toEqual({ mime: 'image/png', base64: PNG });
  });
});

const up = await servicesUp();

describe.skipIf(!up)('search fee (Postgres + Redis)', () => {
  let app: FastifyInstance;
  const prisma = new PrismaClient({ datasourceUrl: TEST_ENV.DATABASE_URL });
  const addresses: string[] = [];
  const ip = nextIp();
  const FEE = 2_000_000n;
  let empty = false;
  const search: WebSearch = {
    feeMicro: FEE,
    async search() {
      return empty ? [] : [{ title: 'R', url: 'https://example.org', description: 'd' }];
    },
  };
  const newUser = async () => {
    const r = await signIn(app, ip);
    addresses.push(r.account.address.toLowerCase());
    const user = await prisma.user.findUniqueOrThrow({ where: { address: r.account.address.toLowerCase() } });
    return { cookies: { nx_session: r.session! }, userId: user.id };
  };
  const balance = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).creditsMicro;
  const chat = (cookies: Record<string, string>, payload: object) => app.inject({ method: 'POST', url: '/chat', cookies, payload });
  const msgs = [{ role: 'user', content: 'What happened today?' }];

  beforeAll(async () => {
    ({ app } = await buildCapturingApp('info', TEST_ENV, {
      provider: createMockProvider({ delayMs: 1, failModels: ['deepseek-v4-flash'] }),
      search,
    }));
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { address: { in: addresses } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('config reports the fee', async () => {
    const res = await app.inject({ method: 'GET', url: '/config' });
    expect(res.json()).toMatchObject({ webSearch: true, research: true, searchCredits: 2 });
  });

  it('charges the fee once per searched request, even in compare mode', async () => {
    const { cookies, userId } = await newUser();
    const before = await balance(userId);
    const res = await chat(cookies, { model: 'deepseek-v4-pro', compareWith: 'qwen3.5-397b', webSearch: true, messages: msgs });
    const events = sseEvents(res.body) as Record<string, any>[];
    const done = events.filter((e) => e.type === 'done');
    expect(done).toHaveLength(2);
    const tokens = done.reduce(
      (sum, d) => sum + tokenCostMicro(getModel(d.model)!, d.tokens.input, d.tokens.output, { webSearch: true }),
      0n,
    );
    expect(before - (await balance(userId))).toBe(tokens + FEE);
  });

  it('no fee when the search found nothing, and nothing at all when the model fails', async () => {
    const { cookies, userId } = await newUser();
    empty = true;
    const before = await balance(userId);
    const res = await chat(cookies, { model: 'deepseek-v4-pro', webSearch: true, messages: msgs });
    const d = (sseEvents(res.body) as Record<string, any>[]).find((e) => e.type === 'done')!;
    expect(before - (await balance(userId))).toBe(tokenCostMicro(getModel('deepseek-v4-pro')!, d.tokens.input, d.tokens.output));
    empty = false;
    const mid = await balance(userId);
    await chat(cookies, { model: 'deepseek-v4-flash', webSearch: true, messages: msgs });
    expect(await balance(userId)).toBe(mid);
  });

  it('Deep Research charges the fee per search that returned results', async () => {
    const { cookies, userId } = await newUser();
    const before = await balance(userId);
    const res = await chat(cookies, { model: 'deepseek-v4-pro', research: true, messages: [{ role: 'user', content: 'Research the topic' }] });
    const events = sseEvents(res.body) as Record<string, any>[];
    const queries = events.find((e) => e.type === 'research' && e.stage === 'searching')!.queries.length;
    const d = events.find((e) => e.type === 'done')!;
    const tokens = tokenCostMicro(getModel('deepseek-v4-pro')!, d.tokens.input, d.tokens.output, { webSearch: true });
    expect(before - (await balance(userId))).toBe(tokens + FEE * BigInt(queries));
  });
});
