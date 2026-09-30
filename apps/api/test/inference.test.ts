import { describe, expect, it } from 'vitest';
import { createOpenAiCompatibleProvider, ProviderError, type ChatChunk } from '../src/inference';
import { ModelHealth } from '../src/inference/health';
import { readSseData } from '../src/inference/sse';
import { loadEnv } from '../src/env';

const silentLog = { warn() {}, error() {}, info() {}, debug() {} } as never;

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(it: AsyncIterable<ChatChunk>) {
  const out: ChatChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

const signal = new AbortController().signal;
const msgs = [{ role: 'user' as const, content: 'hi' }];

describe('readSseData', () => {
  it('handles split chunks, CRLF and multi-line data', async () => {
    const res = sseResponse(['data: {"a"', ':1}\r\n\r\n', ': comment\n', 'data: x\ndata: y\n\n', 'data: [DONE]\n\n']);
    const out: string[] = [];
    for await (const d of readSseData(res.body!)) out.push(d);
    expect(out).toEqual(['{"a":1}', 'x\ny', '[DONE]']);
  });
});

describe('openai-compatible provider', () => {
  it('maps model ids, streams deltas and reports usage', async () => {
    let sent: any;
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      baseUrl: 'https://p.example/v1/',
      apiKey: 'k',
      modelMap: { 'llama-3.3-70b': 'llama3-3-70b' },
      fetch: (async (url: string, init: RequestInit) => {
        sent = { url, headers: init.headers, body: JSON.parse(init.body as string) };
        return sseResponse([
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":2}}\n\n',
          'data: [DONE]\n\n',
        ]);
      }) as typeof fetch,
    });
    const out = await collect(provider.chatStream({ model: 'llama-3.3-70b', messages: msgs, signal }));
    expect(out).toEqual([
      { type: 'delta', text: 'Hel' },
      { type: 'delta', text: 'lo' },
      { type: 'usage', input: 11, output: 2 },
    ]);
    expect(sent.url).toBe('https://p.example/v1/chat/completions');
    expect(sent.headers.authorization).toBe('Bearer k');
    expect(sent.body).toMatchObject({ model: 'llama3-3-70b', stream: true, stream_options: { include_usage: true } });
  });

  it('maps HTTP errors to typed errors and refuses unmapped models', async () => {
    const make = (status: number, text = '') =>
      createOpenAiCompatibleProvider({
        name: 't',
        baseUrl: 'https://p.example/v1',
        apiKey: null,
        modelMap: { 'gpt-oss-120b': 'gpt-oss-120b' },
        fetch: (async () => new Response(text, { status })) as unknown as typeof fetch,
      });
    const code = async (status: number, text?: string, model = 'gpt-oss-120b') => {
      try {
        await collect(make(status, text).chatStream({ model, messages: msgs, signal }));
        return 'none';
      } catch (e) {
        return (e as ProviderError).code;
      }
    };
    expect(await code(404)).toBe('model_unavailable');
    expect(await code(400, '{"error":{"message":"model not found"}}')).toBe('model_unavailable');
    expect(await code(400, '{"error":{"message":"context too long"}}')).toBe('provider_error');
    expect(await code(429)).toBe('provider_error');
    expect(await code(502)).toBe('provider_error');
    expect(await code(200, '', 'deepseek-v3.1')).toBe('model_unavailable'); // unmapped
  });

  it('times out waiting for the first byte', async () => {
    const provider = createOpenAiCompatibleProvider({
      name: 't',
      baseUrl: 'https://p.example/v1',
      apiKey: null,
      modelMap: { 'gpt-oss-120b': 'x' },
      firstByteTimeoutMs: 30,
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch,
    });
    await expect(collect(provider.chatStream({ model: 'gpt-oss-120b', messages: msgs, signal }))).rejects.toMatchObject({
      code: 'timeout',
    });
  });
});

describe('presets and model health', () => {
  it('tinfoil maps only the models it serves; unmapped ones are unavailable', async () => {
    const env = loadEnv({ INFERENCE_PROVIDER: 'tinfoil', INFERENCE_API_KEY: 'k' });
    expect(env.inference).toMatchObject({ kind: 'openai-compatible', baseUrl: 'https://inference.tinfoil.sh/v1' });
    expect(env.inference!.modelMap).toEqual({ 'gpt-oss-120b': 'gpt-oss-120b', 'llama-3.3-70b': 'llama3-3-70b' });
    const provider = createOpenAiCompatibleProvider({
      name: 'tinfoil',
      baseUrl: env.inference!.baseUrl!,
      apiKey: 'k',
      modelMap: env.inference!.modelMap,
      fetch: (async () => Response.json({ data: [{ id: 'gpt-oss-120b' }, { id: 'deepseek-v3.1' }] })) as unknown as typeof fetch,
    });
    const health = new ModelHealth(provider, null, silentLog);
    await health.refresh();
    expect(Object.fromEntries(health.all().map((m) => [m.id, m.status]))).toEqual({
      'deepseek-v3.1': 'unavailable', // listed by the provider but not mapped: never silently served
      'qwen3-235b': 'unavailable',
      'gpt-oss-120b': 'ok',
      'llama-3.3-70b': 'unavailable', // mapped but not listed
    });

    const extended = loadEnv({ INFERENCE_PROVIDER: 'tinfoil', INFERENCE_MODEL_MAP: '{"qwen3-235b":"qwen3-x","bogus":"y"}' });
    expect(extended.inference!.modelMap['qwen3-235b']).toBe('qwen3-x');
    expect(extended.warnings.some((w) => w.includes('bogus'))).toBe(true);
  });

  it('openrouter maps all four models and sends the no-retention provider policy', async () => {
    const env = loadEnv({ INFERENCE_PROVIDER: 'openrouter', INFERENCE_API_KEY: 'k' });
    const inf = env.inference!;
    expect(inf.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(Object.keys(inf.modelMap).sort()).toEqual(['deepseek-v3.1', 'gpt-oss-120b', 'llama-3.3-70b', 'qwen3-235b']);
    let sent: any;
    const provider = createOpenAiCompatibleProvider({
      name: 'openrouter',
      baseUrl: inf.baseUrl!,
      apiKey: 'k',
      modelMap: inf.modelMap,
      extraBody: { ...inf.extraBody, model: 'must-not-override', stream: false },
      extraHeaders: inf.headers,
      fetch: (async (_url: string, init: RequestInit) => {
        sent = { headers: init.headers, body: JSON.parse(init.body as string) };
        return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']);
      }) as typeof fetch,
    });
    await collect(provider.chatStream({ model: 'deepseek-v3.1', messages: msgs, signal }));
    expect(sent.body).toMatchObject({
      model: 'deepseek/deepseek-chat-v3.1',
      stream: true,
      provider: { data_collection: 'deny', zdr: true },
    });
    expect(sent.headers['X-Title']).toBeTruthy();
    expect(sent.headers.authorization).toBe('Bearer k');

    const relaxed = loadEnv({ INFERENCE_PROVIDER: 'openrouter', INFERENCE_EXTRA_BODY: '{"provider":{"data_collection":"deny"}}' });
    expect(relaxed.inference!.extraBody).toEqual({ provider: { data_collection: 'deny' } });
    expect(loadEnv({ INFERENCE_PROVIDER: 'openrouter', INFERENCE_EXTRA_BODY: 'nope' }).warnings.some((w) => w.includes('INFERENCE_EXTRA_BODY'))).toBe(true);
  });

  it('generic preset maps identity; listing unsupported means all ok; failures degrade', async () => {
    expect(loadEnv({ INFERENCE_PROVIDER: 'openai-compatible' }).inference).toBeNull(); // needs a base URL
    const env = loadEnv({ INFERENCE_PROVIDER: 'openai-compatible', INFERENCE_BASE_URL: 'https://p.example/v1' });
    expect(env.inference!.modelMap['deepseek-v3.1']).toBe('deepseek-v3.1');
    const provider = createOpenAiCompatibleProvider({
      name: 'g',
      baseUrl: 'https://p.example/v1',
      apiKey: null,
      modelMap: env.inference!.modelMap,
      fetch: (async () => new Response('', { status: 404 })) as unknown as typeof fetch,
    });
    const health = new ModelHealth(provider, null, silentLog);
    await health.refresh();
    expect(health.all().every((m) => m.status === 'ok')).toBe(true);
    for (let i = 0; i < 3; i++) health.reportFailure('qwen3-235b', 'provider_error');
    expect(health.status('qwen3-235b')).toBe('degraded');
    health.reportFailure('gpt-oss-120b', 'model_unavailable');
    expect(health.status('gpt-oss-120b')).toBe('unavailable');
    expect(loadEnv({ INFERENCE_PROVIDER: 'nope' }).inference).toBeNull();
    expect(new ModelHealth(null, null, silentLog).status('deepseek-v3.1')).toBe('unavailable');
  });
});
