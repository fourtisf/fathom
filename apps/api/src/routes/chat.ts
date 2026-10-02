import type { FastifyPluginAsync } from 'fastify';
import { getPersona, MAX_CHAT_IMAGES, tokenAddress, VISION_MODEL } from '@fathom/config';
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
/** Decrypted memory facts sent with a chat (the browser holds the key). */
export const MAX_MEMORY_CHARS = 4000;
/** One resized image (the browser sends JPEG/PNG/WebP at most IMAGE_MAX_SIDE px) as a base64 data URL. */
const MAX_IMAGE_CHARS = 2_000_000;
const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
/** Room for MAX_CHAT_IMAGES images plus the text limit; stays under Nginx's 10 MB client_max_body_size. */
export const CHAT_BODY_LIMIT = MAX_CHAT_IMAGES * MAX_IMAGE_CHARS + 1_000_000;

type Role = 'user' | 'assistant';
interface ChatBody {
  model: string;
  compareWith?: string;
  webSearch: boolean;
  research: boolean;
  persona: string | null;
  memory: string | null;
  messages: { role: Role; content: string; images?: string[] }[];
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
  if (b.research !== undefined && typeof b.research !== 'boolean') return 'research must be a boolean';
  if (b.memory !== undefined && b.memory !== null && (typeof b.memory !== 'string' || b.memory.length > MAX_MEMORY_CHARS)) {
    return `memory must be a string of at most ${MAX_MEMORY_CHARS} characters`;
  }
  if (b.persona !== undefined && b.persona !== null && (typeof b.persona !== 'string' || !getPersona(b.persona))) {
    return 'persona must be a known chat mode';
  }
  if (!Array.isArray(b.messages) || b.messages.length < 1 || b.messages.length > MAX_MESSAGES) {
    return `messages must have 1 to ${MAX_MESSAGES} entries`;
  }
  let total = 0;
  let imageTotal = 0;
  const messages: ChatBody['messages'] = [];
  for (const m of b.messages as unknown[]) {
    const mm = m as Record<string, unknown> | null;
    if (!mm || (mm.role !== 'user' && mm.role !== 'assistant') || typeof mm.content !== 'string') {
      return 'each message needs role "user" or "assistant" and string content';
    }
    total += mm.content.length;
    let images: string[] | undefined;
    if (mm.images !== undefined) {
      if (mm.role !== 'user' || !Array.isArray(mm.images)) return 'images are allowed on user messages only, as an array';
      if (!mm.images.every((u): u is string => typeof u === 'string' && u.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(u))) {
        return 'each image must be a PNG, JPEG or WebP data URL of at most 2 MB';
      }
      imageTotal += mm.images.length;
      if (mm.images.length) images = mm.images;
    }
    messages.push({ role: mm.role, content: mm.content, ...(images ? { images } : {}) });
  }
  if (imageTotal > MAX_CHAT_IMAGES) return `a conversation may include at most ${MAX_CHAT_IMAGES} images`;
  if (total > MAX_TOTAL_CHARS) return `messages may contain at most ${MAX_TOTAL_CHARS} characters in total`;
  const last = messages[messages.length - 1]!;
  if (last.role !== 'user' || !last.content.trim()) return 'the last message must be a non-empty user message';
  return {
    model: b.model,
    compareWith: typeof b.compareWith === 'string' ? b.compareWith : undefined,
    webSearch: b.webSearch === true,
    research: b.research === true,
    memory: typeof b.memory === 'string' && b.memory.trim() ? b.memory.trim() : null,
    persona: typeof b.persona === 'string' ? b.persona : null,
    messages,
  };
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  const { redis, activeStreams } = app.ctx;
  // Built per request: top-ups become live once the USDG decimals have been read.
  const systemPrompt = (persona: string | null, memory: string | null) =>
    buildSystemPrompt({
      persona,
      memory,
      preset: app.ctx.env.inference?.preset ?? null,
      webSearch: !!app.ctx.search,
      research: !!app.ctx.search,
      topups: !!app.ctx.topup?.ready,
      developerApi: true,
      tokenAddress: tokenAddress(),
      tokenCheck: !!app.ctx.crypto?.scanner,
      livePrices: !!app.ctx.crypto?.prices,
      audit: !!app.ctx.crypto?.sources,
      imageGen: !!app.ctx.images,
      vision: !!app.ctx.provider?.providerModelId(VISION_MODEL.id),
    });

  app.post('/chat', { preHandler: requireAuth, bodyLimit: CHAT_BODY_LIMIT }, async (request, reply) => {
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
        systemPrompt: systemPrompt(body.persona, body.memory),
        webSearch: body.webSearch,
        research: body.research,
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
