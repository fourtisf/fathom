import type { FastifyPluginAsync } from 'fastify';
import { getPersona, tokenAddress } from '@fathom/config';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { fixedWindow } from '../ratelimit';
import { buildSystemPrompt } from '../prompt';
import { prepareChat, type ChatEvent } from '../chat-service';

export type { ChatEvent } from '../chat-service';

/**
 * POST /chat: streams model answers as Server-Sent Events (the app's own format).
 * The pipeline (pre-checks, provider, charging) lives in chat-service.ts, shared with /v1.
 */

export const CHAT_RATE_LIMIT = 20;
const MAX_MESSAGES = 50;
const MAX_TOTAL_CHARS = 100_000;
const PING_MS = 15_000;

type Role = 'user' | 'assistant';
interface ChatBody {
  model: string;
  compareWith?: string;
  webSearch: boolean;
  persona: string | null;
  messages: { role: Role; content: string }[];
}

function parseBody(raw: unknown): ChatBody | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Expected a JSON object';
  const b = raw as Record<string, unknown>;
  if (typeof b.model !== 'string') return 'model is required';
  if (b.compareWith !== undefined && b.compareWith !== null && typeof b.compareWith !== 'string') {
    return 'compareWith must be a model id';
  }
  if (b.compareWith === b.model) return 'compareWith must be a different model';
  if (b.webSearch !== undefined && typeof b.webSearch !== 'boolean') return 'webSearch must be a boolean';
  if (b.persona !== undefined && b.persona !== null && (typeof b.persona !== 'string' || !getPersona(b.persona))) {
    return 'persona must be a known chat mode';
  }
  if (!Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > MAX_MESSAGES) {
    return `messages must have 1 to ${MAX_MESSAGES} entries`;
  }
  let total = 0;
  const messages: ChatBody['messages'] = [];
  for (const m of b.messages as unknown[]) {
    const mm = m as Record<string, unknown> | null;
    if (!mm || (mm.role !== 'user' && mm.role !== 'assistant') || typeof mm.content !== 'string') {
      return 'each message needs role "user" or "assistant" and string content';
    }
    total += mm.content.length;
    messages.push({ role: mm.role, content: mm.content });
  }
  if (total > MAX_TOTAL_CHARS) return `messages may contain at most ${MAX_TOTAL_CHARS} characters in total`;
  const last = messages[messages.length - 1]!;
  if (last.role !== 'user' || !last.content.trim()) return 'the last message must be a non-empty user message';
  return {
    model: b.model,
    compareWith: typeof b.compareWith === 'string' ? b.compareWith : undefined,
    webSearch: b.webSearch === true,
    persona: typeof b.persona === 'string' ? b.persona : null,
    messages,
  };
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  const { redis, activeStreams } = app.ctx;
  // Built per request: top-ups become live once the USDG decimals have been read.
  const systemPrompt = (persona: string | null) =>
    buildSystemPrompt({
      persona,
      preset: app.ctx.env.inference?.preset ?? null,
      webSearch: !!app.ctx.search,
      topups: !!app.ctx.topup?.ready,
      developerApi: true,
      tokenAddress: tokenAddress(),
      tokenCheck: !!app.ctx.crypto?.scanner,
      livePrices: !!app.ctx.crypto?.prices,
    });

  app.post('/chat', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.userId!;
    const rl = await fixedWindow(redis, `chat:${userId}`, CHAT_RATE_LIMIT, 60);
    if (!rl.ok) {
      return reply
        .header('retry-after', String(rl.retryAfter))
        .status(429)
        .send(errorBody(429, 'Too many messages. Try again in a moment.', 'rate_limited'));
    }

    const body = parseBody(request.body);
    if (typeof body === 'string') return reply.status(400).send(errorBody(400, body));

    const prepared = await prepareChat(
      app.ctx,
      {
        userId,
        models: [body.model, ...(body.compareWith ? [body.compareWith] : [])],
        messages: body.messages,
        systemPrompt: systemPrompt(body.persona),
        webSearch: body.webSearch,
        cryptoTools: true,
      },
      request.log,
    );
    if (!prepared.ok) return reply.status(prepared.status).send(prepared.body);

    // ---- Stream ----
    reply.hijack();
    const raw = reply.raw;
    // Keep headers set by hooks (helmet, CORS); hijack bypasses Fastify's own header writing.
    const inherited = reply.getHeaders() as Record<string, string | number | string[]>;
    raw.writeHead(200, {
      ...inherited,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    });
    raw.flushHeaders?.();

    const ac = new AbortController();
    activeStreams.add(ac);
    raw.on('close', () => {
      if (!raw.writableEnded) ac.abort(new Error('client disconnected'));
    });
    const send = (ev: ChatEvent) => {
      if (!ac.signal.aborted && !raw.destroyed) raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    };
    const ping = setInterval(() => {
      if (!ac.signal.aborted && !raw.destroyed) raw.write(': ping\n\n');
    }, PING_MS);

    try {
      await prepared.run(send, ac.signal);
    } catch (err) {
      request.log.error({ err }, 'chat stream failed');
    } finally {
      clearInterval(ping);
      activeStreams.delete(ac);
      if (!raw.writableEnded) raw.end();
    }
  });
};
