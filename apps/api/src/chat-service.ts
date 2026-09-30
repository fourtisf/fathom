import type { FastifyBaseLogger } from 'fastify';
import { getModel, tokenCostMicro, type ModelId, type ModelInfo } from '@fathom/config';
import type { AppContext } from './context';
import { errorBody } from './errors';
import { chargeUsage, toCredits } from './billing';
import { estimateTokens, ProviderError, type ChatMessage, type GenerationParams } from './inference';
import { searchSystemMessage } from './search';

/**
 * The one chat pipeline shared by the app (POST /chat) and the public API
 * (POST /v1/chat/completions), so pricing, pre-checks and charging can't drift.
 *
 * Content rules (CLAUDE.md §0): message text is never logged or stored. Only
 * aggregates (messages, credits per model per day) reach the database, and a
 * response is charged only after it finished successfully.
 */

const DEFAULT_OUTPUT_RESERVE_TOKENS = 1000;
const SEARCH_QUERY_CHARS = 300;

export type ChatErrorCode = 'model_unavailable' | 'provider_error' | 'insufficient_credits';

export type ChatEvent =
  | { type: 'search'; status: 'running' | 'unavailable' }
  | { type: 'search'; status: 'done'; sources: number }
  | { type: 'delta'; slot: number; text: string }
  | { type: 'done'; slot: number; model: string; credits: number; tokens: { input: number; output: number } }
  | { type: 'error'; slot: number; code: ChatErrorCode; message: string }
  | { type: 'end'; balance: number };

export interface ChatJob {
  userId: string;
  /** One model, or two in compare mode. */
  models: string[];
  /** Conversation from the client (may include system messages for the API). */
  messages: ChatMessage[];
  /** Prepended as the first system message when set (the app's product prompt). */
  systemPrompt?: string | null;
  webSearch: boolean;
  params?: GenerationParams;
}

export interface ChatSlot {
  slot: number;
  id: string;
  info: ModelInfo | undefined;
  up: boolean;
}

export type PreparedChat =
  | { ok: false; status: 402 | 503; body: ReturnType<typeof errorBody> & { error: Record<string, unknown> } }
  | { ok: true; slots: ChatSlot[]; run: (emit: (ev: ChatEvent) => void, signal: AbortSignal) => Promise<void> };

const chars = (msgs: ChatMessage[]) => msgs.reduce((n, m) => n + m.content.length, 0);

/** Pre-checks availability and balance; returns a runner that streams events and charges. */
export async function prepareChat(ctx: AppContext, job: ChatJob, log: FastifyBaseLogger): Promise<PreparedChat> {
  const { prisma, health, provider } = ctx;
  const slots: ChatSlot[] = job.models.map((id, slot) => {
    const info = getModel(id);
    return { slot, id, info, up: !!provider && !!info && health.status(id) === 'ok' };
  });
  const running = slots.filter((s) => s.up);
  if (running.length === 0) {
    const body = errorBody(503, 'This model is unavailable right now. You were not charged.', 'model_unavailable');
    return { ok: false, status: 503, body: { error: { ...body.error, model: job.models[0] } } };
  }

  // Search only when requested and configured; unavailable search means no ×1.6.
  const search = job.webSearch ? ctx.search : null;
  const baseMessages: ChatMessage[] = job.systemPrompt
    ? [{ role: 'system', content: job.systemPrompt }, ...job.messages]
    : job.messages;

  // Pre-check against an estimate, before anything streams. Staking discounts arrive in Phase 6.
  const discountBps = 0;
  const reserve = job.params?.max_tokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS;
  const estInput = estimateTokens(chars(baseMessages));
  const needed = running.reduce(
    (sum, s) => sum + tokenCostMicro(s.info!, estInput, reserve, { webSearch: !!search, discountBps }),
    0n,
  );
  const user = await prisma.user.findUnique({ where: { id: job.userId }, select: { creditsMicro: true } });
  if (!user || user.creditsMicro < needed) {
    const e = errorBody(402, 'Not enough credits. Top up to continue. You were not charged.', 'insufficient_credits');
    const balance = user?.creditsMicro ?? 0n;
    return { ok: false, status: 402, body: { error: { ...e.error, needed: toCredits(needed), balance: toCredits(balance) } } };
  }

  const run = async (emit: (ev: ChatEvent) => void, signal: AbortSignal): Promise<void> => {
    const send = (ev: ChatEvent) => {
      if (!signal.aborted) emit(ev);
    };

    const runSlot = async (slot: number, info: ModelInfo, messages: ChatMessage[], searched: boolean) => {
      const model: ModelId = info.id;
      let outChars = 0;
      let usage: { input: number; output: number } | null = null;
      try {
        for await (const chunk of provider!.chatStream({ model, messages, signal, params: job.params })) {
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
        if (signal.aborted) return;
        const code = err instanceof ProviderError && err.code === 'model_unavailable' ? 'model_unavailable' : 'provider_error';
        health.reportFailure(model, code);
        log.warn({ err, model, code }, 'chat provider failed');
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
      if (!usage) log.info({ model }, 'provider reported no usage; charged a character estimate');
      const cost = tokenCostMicro(info, tokens.input, tokens.output, { webSearch: searched, discountBps });
      let charged = 0n;
      try {
        charged = await chargeUsage(prisma, job.userId, model, cost);
      } catch (err) {
        log.error({ err, model }, 'charge failed');
      }
      // Emitted even if the client just left: the charge happened, so report it to whoever listens.
      emit({ type: 'done', slot, model, credits: toCredits(charged), tokens });
    };

    let messages = baseMessages;
    let searched = false;
    if (job.webSearch) {
      if (!search) {
        send({ type: 'search', status: 'unavailable' });
      } else {
        send({ type: 'search', status: 'running' });
        try {
          const lastUser = [...job.messages].reverse().find((m) => m.role === 'user');
          const query = (lastUser?.content ?? '').slice(0, SEARCH_QUERY_CHARS);
          const results = await search.search(query, signal);
          if (results.length > 0) {
            searched = true;
            const sys: ChatMessage = { role: 'system', content: searchSystemMessage(results) };
            messages = job.systemPrompt ? [baseMessages[0]!, sys, ...job.messages] : [sys, ...job.messages];
          }
          send({ type: 'search', status: 'done', sources: results.length });
        } catch (err) {
          if (!signal.aborted) {
            log.warn({ err }, 'web search failed');
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

    const after = await prisma.user.findUnique({ where: { id: job.userId }, select: { creditsMicro: true } });
    send({ type: 'end', balance: toCredits(after?.creditsMicro ?? 0n) });
  };

  return { ok: true, slots, run };
}
