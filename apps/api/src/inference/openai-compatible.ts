import { readSseData } from './sse';
import { ProviderError, type ChatChunk, type ChatStreamRequest, type InferenceProvider } from './types';

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string | null;
  modelMap: Partial<Record<string, string>>;
  /** Merged into each chat request body; can't override model, messages or streaming fields. */
  extraBody?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
  firstByteTimeoutMs?: number;
  totalTimeoutMs?: number;
  fetch?: typeof fetch;
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/** Reads (and discards) an error body only to classify it. Never logged or returned. */
async function classify(res: Response): Promise<ProviderError> {
  let text = '';
  try {
    text = (await res.text()).slice(0, 2000);
  } catch {
    // ignore
  }
  const mentionsModel = /model/i.test(text) && /(not[ _-]?found|does not exist|unknown|unsupported|invalid|not available)/i.test(text);
  if (res.status === 404 || (res.status === 400 && mentionsModel)) {
    return new ProviderError('model_unavailable', 'model not available at provider', res.status);
  }
  if (res.status === 429) return new ProviderError('provider_error', 'provider rate limited', res.status);
  return new ProviderError('provider_error', `provider returned HTTP ${res.status}`, res.status);
}

/** Any OpenAI-compatible /chat/completions endpoint. No SDK: fetch + a small SSE parser. */
export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): InferenceProvider {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  const firstByteMs = opts.firstByteTimeoutMs ?? 15_000;
  const totalMs = opts.totalTimeoutMs ?? 120_000;
  const headers = (): Record<string, string> => ({
    ...opts.extraHeaders,
    'content-type': 'application/json',
    accept: 'text/event-stream, application/json',
    ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
  });
  const providerModelId = (m: string): string | null => opts.modelMap[m] ?? null;

  return {
    name: opts.name,
    providerModelId,

    async models() {
      let res: Response;
      try {
        res = await doFetch(`${base}/models`, { headers: headers(), signal: AbortSignal.timeout(10_000) });
      } catch {
        throw new ProviderError('provider_error', 'models request failed');
      }
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        await res.body?.cancel().catch(() => undefined);
        throw new ProviderError('not_supported', 'provider does not list models', res.status);
      }
      if (!res.ok) throw await classify(res);
      const json = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
      if (!json || !Array.isArray(json.data)) throw new ProviderError('provider_error', 'unexpected models response');
      return json.data.map((m) => m.id).filter((id): id is string => typeof id === 'string');
    },

    async attestation() {
      // The generic adapter has no attestation endpoint; provider-specific presets add it.
      return null;
    },

    async *chatStream(req: ChatStreamRequest): AsyncGenerator<ChatChunk> {
      const ac = new AbortController();
      let timedOut = false;
      const onAbort = () => ac.abort(req.signal.reason);
      if (req.signal.aborted) throw req.signal.reason;
      req.signal.addEventListener('abort', onAbort, { once: true });
      const timeout = (ms: number) =>
        setTimeout(() => {
          timedOut = true;
          ac.abort(new ProviderError('timeout', 'provider timed out'));
        }, ms);
      const firstByte = timeout(firstByteMs);
      const total = timeout(totalMs);

      const fail = (err: unknown): never => {
        if (req.signal.aborted) throw req.signal.reason;
        if (timedOut) throw new ProviderError('timeout', 'provider timed out');
        if (err instanceof ProviderError) throw err;
        throw new ProviderError('provider_error', 'provider request failed');
      };

      try {
        const providerModel = providerModelId(req.model);
        if (!providerModel) return fail(new ProviderError('model_unavailable', 'model not mapped for this provider'));
        let res: Response;
        try {
          res = await doFetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({
              ...opts.extraBody,
              model: providerModel,
              messages: req.messages,
              stream: true,
              stream_options: { include_usage: true },
            }),
            signal: ac.signal,
          });
        } catch (err) {
          return fail(err);
        }
        if (!res.ok) {
          clearTimeout(firstByte);
          return fail(await classify(res));
        }
        if (!res.body) return fail(new ProviderError('provider_error', 'empty provider response'));

        let usage: { input: number; output: number } | null = null;
        try {
          for await (const data of readSseData(res.body, () => clearTimeout(firstByte))) {
            if (data === '[DONE]') break;
            let chunk: StreamChunk & { error?: unknown };
            try {
              chunk = JSON.parse(data) as StreamChunk & { error?: unknown };
            } catch {
              continue;
            }
            if (chunk.error) throw new ProviderError('provider_error', 'provider stream error');
            const text = chunk.choices?.[0]?.delta?.content;
            if (typeof text === 'string' && text) yield { type: 'delta', text };
            const u = chunk.usage;
            if (u && Number.isInteger(u.prompt_tokens) && Number.isInteger(u.completion_tokens)) {
              usage = { input: u.prompt_tokens!, output: u.completion_tokens! };
            }
          }
        } catch (err) {
          return fail(err);
        }
        if (usage) yield { type: 'usage', ...usage };
      } finally {
        clearTimeout(firstByte);
        clearTimeout(total);
        req.signal.removeEventListener('abort', onAbort);
        if (!ac.signal.aborted) ac.abort();
      }
    },
  };
}
