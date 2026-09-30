import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { brand, getModel, tokenCostMicro, type ModelId, type ModelInfo } from '@fathom/config';
import { errorBody } from '../errors';
import { requireAuth } from '../session';
import { fixedWindow } from '../ratelimit';
import { chargeUsage, toCredits } from '../billing';
import { estimateTokens, ProviderError, type ChatMessage } from '../inference';
import { searchSystemMessage } from '../search';

/**
 * POST /chat: streams model answers as Server-Sent Events.
 * Content rules (CLAUDE.md §0): message text is never logged or stored. Only
 * aggregates (messages, credits per model per day) reach the database, and a
 * response is charged only after it finished successfully.
 */

export const CHAT_RATE_LIMIT = 20;
const MAX_MESSAGES = 50;
const MAX_TOTAL_CHARS = 100_000;
const OUTPUT_RESERVE_TOKENS = 1000;
const SEARCH_QUERY_CHARS = 300;
const PING_MS = 15_000;

export const SYSTEM_PROMPT =
  `You are ${brand.name}, a private assistant running on open-weight models. ` +
  'Be helpful, accurate and concise. Use Markdown when it helps. If you are not sure about something, say so.';

type Role = 'user' | 'assistant';
interface ChatBody {
  model: string;
  compareWith?: string;
  webSearch: boolean;
  messages: { role: Role; content: string }[];
}

export type ChatEvent =
  | { type: 'search'; status: 'running' | 'unavailable' }
  | { type: 'search'; status: 'done'; sources: number }
  | { type: 'delta'; slot: number; text: string }
  | { type: 'done'; slot: number; model: string; credits: number; tokens: { input: number; output: number } }
  | { type: 'error'; slot: number; code: 'model_unavailable' | 'provider_error' | 'insufficient_credits'; message: string }
  | { type: 'end'; balance: number };

function parseBody(raw: unknown): ChatBody | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Expected a JSON object';
  const b = raw as Record<string, unknown>;
  if (typeof b.model !== 'string') return 'model is required';
  if (b.compareWith !== undefined && b.compareWith !== null && typeof b.compareWith !== 'string') {
    return 'compareWith must be a model id';
  }
  if (b.compareWith === b.model) return 'compareWith must be a different model';
  if (b.webSearch !== undefined && typeof b.webSearch !== 'boolean') return 'webSearch must be a boolean';
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
    messages,
  };
}

const chars = (msgs: ChatMessage[]) => msgs.reduce((n, m) => n + m.content.length, 0);

function unavailable(reply: FastifyReply, model: string) {
  const body = errorBody(503, 'This model is unavailable right now. You were not charged.', 'model_unavailable');
  return reply.status(503).send({ error: { ...body.error, model } });
}

export const chatRoutes: FastifyPluginAsync = async (app) => {
  const { prisma, redis, health, activeStreams } = app.ctx;

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

    const provider = app.ctx.provider;
    const ids = [body.model, ...(body.compareWith ? [body.compareWith] : [])];
    const slots = ids.map((id, slot) => {
      const info = getModel(id);
      const up = !!provider && !!info && health.status(id) === 'ok';
      return { slot, id, info, up };
    });
    const running = slots.filter((s) => s.up);
    if (running.length === 0) return unavailable(reply, body.model);

    // Search only when requested and configured; unavailable search means no ×1.6.
    const search = body.webSearch ? app.ctx.search : null;
    const baseMessages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...body.messages];

    // Pre-check against an estimate, before anything streams. Staking discounts arrive in Phase 6.
    const discountBps = 0;
    const estInput = estimateTokens(chars(baseMessages));
    const needed = running.reduce(
      (sum, s) => sum + tokenCostMicro(s.info!, estInput, OUTPUT_RESERVE_TOKENS, { webSearch: !!search, discountBps }),
      0n,
    );
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditsMicro: true } });
    if (!user) return reply.status(401).send(errorBody(401, 'Sign in with your wallet', 'unauthenticated'));
    if (user.creditsMicro < needed) {
      const e = errorBody(402, 'Not enough credits. Top up to continue. You were not charged.', 'insufficient_credits');
      return reply
        .status(402)
        .send({ error: { ...e.error, needed: toCredits(needed), balance: toCredits(user.creditsMicro) } });
    }

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

    const runSlot = async (slot: number, info: ModelInfo, messages: ChatMessage[], searched: boolean) => {
      const model: ModelId = info.id;
      let outChars = 0;
      let usage: { input: number; output: number } | null = null;
      try {
        for await (const chunk of provider!.chatStream({ model, messages, signal: ac.signal })) {
          if (chunk.type === 'delta') {
            outChars += chunk.text.length;
            send({ type: 'delta', slot, text: chunk.text });
          } else {
            usage = { input: chunk.input, output: chunk.output };
          }
        }
        if (outChars === 0) throw new ProviderError('provider_error', 'empty completion');
      } catch (err) {
        // Client left before the answer finished: nothing to charge, nobody to tell.
        if (ac.signal.aborted) return;
        const code = err instanceof ProviderError && err.code === 'model_unavailable' ? 'model_unavailable' : 'provider_error';
        health.reportFailure(model, code);
        request.log.warn({ err, model, code }, 'chat provider failed');
        send({
          type: 'error',
          slot,
          code,
          message:
            code === 'model_unavailable'
              ? `${info.name} is unavailable right now. You were not charged.`
              : `${info.name} didn't finish its answer. You were not charged.`,
        });
        return;
      }
      health.reportSuccess(model);

      // Finished: charge by actual tokens. If the provider sent no usage, estimate from characters.
      const tokens = usage ?? { input: estimateTokens(chars(messages)), output: estimateTokens(outChars) };
      if (!usage) request.log.info({ model }, 'provider reported no usage; charged a character estimate');
      const cost = tokenCostMicro(info, tokens.input, tokens.output, { webSearch: searched, discountBps });
      let charged = 0n;
      try {
        charged = await chargeUsage(prisma, userId, model, cost);
      } catch (err) {
        request.log.error({ err, model }, 'charge failed');
      }
      send({ type: 'done', slot, model, credits: toCredits(charged), tokens });
    };

    try {
      let messages = baseMessages;
      let searched = false;
      if (body.webSearch) {
        if (!search) {
          send({ type: 'search', status: 'unavailable' });
        } else {
          send({ type: 'search', status: 'running' });
          try {
            const query = body.messages[body.messages.length - 1]!.content.slice(0, SEARCH_QUERY_CHARS);
            const results = await search.search(query, ac.signal);
            if (results.length > 0) {
              searched = true;
              messages = [baseMessages[0]!, { role: 'system', content: searchSystemMessage(results) }, ...body.messages];
            }
            send({ type: 'search', status: 'done', sources: results.length });
          } catch (err) {
            if (!ac.signal.aborted) {
              request.log.warn({ err }, 'web search failed');
              send({ type: 'search', status: 'unavailable' });
            }
          }
        }
      }

      await Promise.all(
        slots.map((s) => {
          if (s.up) return runSlot(s.slot, s.info!, messages, searched);
          send({
            type: 'error',
            slot: s.slot,
            code: 'model_unavailable',
            message: `${s.info?.name ?? 'This model'} is unavailable right now. You were not charged.`,
          });
          return undefined;
        }),
      );

      const after = await prisma.user.findUnique({ where: { id: userId }, select: { creditsMicro: true } });
      send({ type: 'end', balance: toCredits(after?.creditsMicro ?? 0n) });
    } catch (err) {
      request.log.error({ err }, 'chat stream failed');
    } finally {
      clearInterval(ping);
      activeStreams.delete(ac);
      if (!raw.writableEnded) raw.end();
    }
  });
};
