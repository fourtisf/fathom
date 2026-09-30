import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getModel } from '@fathom/config';
import { errorBody } from '../errors';
import { requireApiKey } from '../apikeys';
import { prepareChat, type ChatEvent } from '../chat-service';
import type { ChatMessage, GenerationParams } from '../inference';

/**
 * POST /v1/chat/completions: OpenAI-compatible, Bearer API key auth.
 * Extras: `compare_with` (second model id → choices[0] and choices[1]) and `web_search` (bool).
 * Same pipeline, prices and charging as the app's /chat (chat-service.ts). No product system
 * prompt is added: the caller's messages go to the model as sent.
 * Tools: `tools`/`tool_choice` are passed to the provider, but tool calls in responses are not
 * supported yet: only text content is returned, and an answer that is only a tool call fails
 * with provider_error (not charged).
 */

const MAX_MESSAGES = 500;
const MAX_TOTAL_CHARS = 500_000;
const PING_MS = 15_000;

interface V1Body {
  model: string;
  compareWith: string | null;
  webSearch: boolean;
  stream: boolean;
  includeUsage: boolean;
  messages: ChatMessage[];
  params: GenerationParams;
}

type ParseError = { status: 400 | 404; code?: string; message: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const present = (v: unknown) => v !== undefined && v !== null;

function textContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  let out = '';
  for (const part of content as unknown[]) {
    const p = part as { type?: unknown; text?: unknown } | null;
    if (!p || p.type !== 'text' || typeof p.text !== 'string') return null;
    out += p.text;
  }
  return out;
}

export function parseV1Body(raw: unknown): V1Body | ParseError {
  const bad = (message: string): ParseError => ({ status: 400, message });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Expected a JSON object');
  const b = raw as Record<string, unknown>;
  if (typeof b.model !== 'string' || !b.model) return bad('model is required');
  if (!getModel(b.model)) return { status: 404, code: 'model_not_found', message: `The model '${b.model.slice(0, 64)}' does not exist` };
  let compareWith: string | null = null;
  if (present(b.compare_with)) {
    if (typeof b.compare_with !== 'string') return bad('compare_with must be a model id');
    if (!getModel(b.compare_with)) {
      return { status: 404, code: 'model_not_found', message: `The model '${b.compare_with.slice(0, 64)}' does not exist` };
    }
    if (b.compare_with === b.model) return bad('compare_with must be a different model');
    compareWith = b.compare_with;
  }
  if (present(b.web_search) && typeof b.web_search !== 'boolean') return bad('web_search must be a boolean');
  if (present(b.stream) && typeof b.stream !== 'boolean') return bad('stream must be a boolean');
  if (present(b.n) && b.n !== 1) return bad('Only n = 1 is supported');

  if (!Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > MAX_MESSAGES) {
    return bad(`messages must have 1 to ${MAX_MESSAGES} entries`);
  }
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const m of b.messages as unknown[]) {
    const mm = m as Record<string, unknown> | null;
    const role = mm?.role === 'developer' ? 'system' : mm?.role;
    if (role === 'tool' || role === 'function') return bad('Tool messages are not supported yet');
    if (role !== 'system' && role !== 'user' && role !== 'assistant') {
      return bad('each message needs role "system", "developer", "user" or "assistant"');
    }
    const content = textContent(mm!.content);
    if (content === null) {
      return bad(role === 'assistant' && mm!.tool_calls ? 'Tool calls are not supported yet' : 'Only text content is supported');
    }
    total += content.length;
    messages.push({ role, content });
  }
  if (total > MAX_TOTAL_CHARS) return bad(`messages may contain at most ${MAX_TOTAL_CHARS} characters in total`);
  if (!messages.some((m) => m.role === 'user' && m.content.trim())) return bad('At least one non-empty user message is required');

  const params: GenerationParams = {};
  const range = (k: string, min: number, max: number): string | null => {
    const v = b[k];
    if (!present(v)) return null;
    if (!isNum(v) || v < min || v > max) return `${k} must be a number between ${min} and ${max}`;
    (params as Record<string, unknown>)[k] = v;
    return null;
  };
  for (const [k, min, max] of [
    ['temperature', 0, 2],
    ['top_p', 0, 1],
    ['presence_penalty', -2, 2],
    ['frequency_penalty', -2, 2],
  ] as const) {
    const err = range(k, min, max);
    if (err) return bad(err);
  }
  const maxTokens = present(b.max_tokens) ? b.max_tokens : b.max_completion_tokens;
  if (present(maxTokens)) {
    if (!Number.isSafeInteger(maxTokens) || (maxTokens as number) < 1 || (maxTokens as number) > 1_000_000) {
      return bad('max_tokens must be a positive integer');
    }
    params.max_tokens = maxTokens as number;
  }
  if (present(b.seed)) {
    if (!Number.isSafeInteger(b.seed)) return bad('seed must be an integer');
    params.seed = b.seed as number;
  }
  if (present(b.stop)) {
    const s = b.stop;
    const ok = typeof s === 'string' || (Array.isArray(s) && s.length <= 4 && s.every((x) => typeof x === 'string'));
    if (!ok) return bad('stop must be a string or up to 4 strings');
    params.stop = s as string | string[];
  }
  if (present(b.response_format)) {
    if (typeof b.response_format !== 'object' || Array.isArray(b.response_format)) return bad('response_format must be an object');
    params.response_format = b.response_format as Record<string, unknown>;
  }
  if (present(b.tools)) {
    if (!Array.isArray(b.tools)) return bad('tools must be an array');
    if (b.tools.length > 0) {
      params.tools = b.tools;
      if (present(b.tool_choice)) params.tool_choice = b.tool_choice;
    }
  }
  const so = b.stream_options as { include_usage?: unknown } | null | undefined;
  return {
    model: b.model,
    compareWith,
    webSearch: b.web_search === true,
    stream: b.stream === true,
    includeUsage: !!so && typeof so === 'object' && so.include_usage === true,
    messages,
    params,
  };
}

function openAiError(reply: FastifyReply, status: number, message: string, code: string, type?: string) {
  const body = errorBody(status, message, code);
  if (type) body.error.type = type;
  return reply.status(status).send(body);
}

export const v1ChatRoutes: FastifyPluginAsync = async (app) => {
  const { activeStreams } = app.ctx;

  app.post('/chat/completions', { preHandler: requireApiKey, bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
    const userId = request.userId!;
    const body = parseV1Body(request.body);
    if ('status' in body) {
      return openAiError(reply, body.status, body.message, body.code ?? 'invalid_request_error', 'invalid_request_error');
    }

    const models = [body.model, ...(body.compareWith ? [body.compareWith] : [])];
    const prepared = await prepareChat(
      app.ctx,
      { userId, models, messages: body.messages, webSearch: body.webSearch, params: body.params },
      request.log,
    );
    if (!prepared.ok) return reply.status(prepared.status).send(prepared.body);

    const id = `chatcmpl-${randomBytes(12).toString('hex')}`;
    const created = Math.floor(Date.now() / 1000);
    const compare = models.length > 1;
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, credits: 0 };
    const addUsage = (ev: Extract<ChatEvent, { type: 'done' }>) => {
      usage.prompt_tokens += ev.tokens.input;
      usage.completion_tokens += ev.tokens.output;
      usage.total_tokens += ev.tokens.input + ev.tokens.output;
      usage.credits = Math.round((usage.credits + ev.credits) * 1e6) / 1e6;
    };
    const finishReason = (ev: Extract<ChatEvent, { type: 'done' }>) =>
      body.params.max_tokens !== undefined && ev.tokens.output >= body.params.max_tokens ? 'length' : 'stop';
    let webSearch: { status: 'done'; sources: number } | { status: 'unavailable' } | undefined;
    const onSearch = (ev: Extract<ChatEvent, { type: 'search' }>) => {
      if (ev.status === 'done') webSearch = { status: 'done', sources: ev.sources };
      else if (ev.status === 'unavailable') webSearch = { status: 'unavailable' };
    };

    const ac = new AbortController();
    activeStreams.add(ac);
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) ac.abort(new Error('client disconnected'));
    });

    // ---- Non-streaming ----
    if (!body.stream) {
      const text = models.map(() => '');
      const done: (Extract<ChatEvent, { type: 'done' }> | undefined)[] = [];
      const errors: (Extract<ChatEvent, { type: 'error' }> | undefined)[] = [];
      let balance: number | undefined;
      try {
        await prepared.run((ev) => {
          if (ev.type === 'delta') text[ev.slot] += ev.text;
          else if (ev.type === 'done') {
            done[ev.slot] = ev;
            addUsage(ev);
          } else if (ev.type === 'error') errors[ev.slot] = ev;
          else if (ev.type === 'search') onSearch(ev);
          else if (ev.type === 'end') balance = ev.balance;
        }, ac.signal);
      } finally {
        activeStreams.delete(ac);
      }
      if (ac.signal.aborted) {
        // Client gone (nothing to send) or server shutting down: unfinished answers are not charged.
        if (reply.raw.destroyed) return reply;
        return openAiError(reply, 503, 'The server is restarting. You were not charged.', 'service_unavailable');
      }
      if (done.every((d) => !d)) {
        const allUnavailable = errors.every((e) => !e || e.code === 'model_unavailable');
        return allUnavailable
          ? openAiError(reply, 503, 'This model is unavailable right now. You were not charged.', 'model_unavailable')
          : openAiError(reply, 502, "The model didn't finish its answer. You were not charged.", 'provider_error');
      }
      return {
        id,
        object: 'chat.completion',
        created,
        model: body.model,
        system_fingerprint: null,
        choices: models.map((model, index) => {
          const d = done[index];
          const base = compare ? { index, model } : { index };
          if (!d) {
            const e = errors[index];
            return {
              ...base,
              message: { role: 'assistant', content: null, refusal: null },
              finish_reason: 'error',
              logprobs: null,
              error: { code: e?.code ?? 'provider_error', message: e?.message ?? 'No answer. You were not charged.' },
            };
          }
          return {
            ...base,
            message: { role: 'assistant', content: text[index], refusal: null },
            finish_reason: finishReason(d),
            logprobs: null,
          };
        }),
        usage,
        ...(webSearch ? { web_search: webSearch } : {}),
        ...(balance !== undefined ? { balance } : {}),
      };
    }

    // ---- Streaming (OpenAI chat.completion.chunk frames) ----
    reply.hijack();
    const raw = reply.raw;
    const inherited = reply.getHeaders() as Record<string, string | number | string[]>;
    raw.writeHead(200, {
      ...inherited,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    });
    raw.flushHeaders?.();
    const write = (data: unknown) => {
      if (!ac.signal.aborted && !raw.destroyed) raw.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
    };
    const chunk = (index: number, delta: Record<string, unknown>, finish: string | null, extra: Record<string, unknown> = {}) => ({
      id,
      object: 'chat.completion.chunk',
      created,
      model: models[index],
      system_fingerprint: null,
      choices: [{ index, delta, logprobs: null, finish_reason: finish, ...extra }],
    });
    const started = models.map(() => false);
    const ping = setInterval(() => {
      if (!ac.signal.aborted && !raw.destroyed) raw.write(': ping\n\n');
    }, PING_MS);

    try {
      await prepared.run((ev) => {
        switch (ev.type) {
          case 'delta':
            write(chunk(ev.slot, started[ev.slot] ? { content: ev.text } : { role: 'assistant', content: ev.text }, null));
            started[ev.slot] = true;
            break;
          case 'done':
            addUsage(ev);
            write(chunk(ev.slot, {}, finishReason(ev)));
            break;
          case 'error':
            if (compare) {
              write(chunk(ev.slot, {}, 'error', { error: { code: ev.code, message: ev.message } }));
            } else {
              const type = ev.code === 'model_unavailable' ? 'model_unavailable' : 'api_error';
              write({ error: { message: ev.message, type, code: ev.code } });
            }
            break;
          case 'search':
            onSearch(ev);
            break;
          case 'end':
            if (body.includeUsage) {
              write({
                id,
                object: 'chat.completion.chunk',
                created,
                model: body.model,
                system_fingerprint: null,
                choices: [],
                usage,
                balance: ev.balance,
                ...(webSearch ? { web_search: webSearch } : {}),
              });
            }
            write('[DONE]');
            break;
        }
      }, ac.signal);
    } catch (err) {
      request.log.error({ err }, 'v1 chat stream failed');
    } finally {
      clearInterval(ping);
      activeStreams.delete(ac);
      if (!raw.writableEnded) raw.end();
    }
  });
};
