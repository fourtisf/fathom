import type { FastifyBaseLogger } from 'fastify';
import { getModel, tokenCostMicro, VISION_MODEL, type ModelInfo } from '@fathom/config';
import type { AppContext } from './context';
import { errorBody } from './errors';
import { chargeUsage, toCredits } from './billing';
import { estimateTokens, IMAGE_TOKENS, ProviderError, type ChatMessage, type GenerationParams } from './inference';
import { searchSystemMessage, type SearchResult } from './search';
import {
  mergeSources,
  parseQueries,
  planMessages,
  researchSystemMessage,
  RESEARCH_PLAN_MAX_TOKENS,
  RESEARCH_REPORT_MAX_TOKENS,
  RESEARCH_RESULTS_PER_QUERY,
} from './research';
import { runCryptoTools, type ToolEvent } from './crypto';

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

export type ResearchEvent =
  | { type: 'research'; stage: 'planning' }
  | { type: 'research'; stage: 'searching'; queries: string[] }
  | { type: 'research'; stage: 'writing'; sources: number };

export type ChatEvent =
  | { type: 'search'; status: 'running' | 'unavailable' }
  | { type: 'search'; status: 'done'; sources: number }
  | { type: 'delta'; slot: number; text: string }
  | { type: 'done'; slot: number; model: string; credits: number; tokens: { input: number; output: number } }
  | { type: 'error'; slot: number; code: ChatErrorCode; message: string }
  | ToolEvent
  | ResearchEvent
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
  /** Token Safety Check and live prices (the app's chat only; the public API stays a plain model API). */
  cryptoTools?: boolean;
  /** Deep Research: plan searches, run them, write a cited report (one model; needs web search). */
  research?: boolean;
  params?: GenerationParams;
}

/** What a slot needs to run and bill: a chat model, or the vision model. */
type Priced = Pick<ModelInfo, 'name' | 'inputPerM' | 'outputPerM'> & { id: string };

export interface ChatSlot {
  slot: number;
  id: string;
  info: Priced | undefined;
  up: boolean;
}

export type PreparedChat =
  | { ok: false; status: 402 | 503; body: ReturnType<typeof errorBody> & { error: Record<string, unknown> } }
  | { ok: true; slots: ChatSlot[]; run: (emit: (ev: ChatEvent) => void, signal: AbortSignal) => Promise<void> };

const chars = (msgs: ChatMessage[]) => msgs.reduce((n, m) => n + m.content.length, 0);
const imageCount = (msgs: ChatMessage[]) => msgs.reduce((n, m) => n + (m.images?.length ?? 0), 0);

/** Pre-checks availability and balance; returns a runner that streams events and charges. */
export async function prepareChat(ctx: AppContext, job: ChatJob, log: FastifyBaseLogger): Promise<PreparedChat> {
  const { prisma, health, provider } = ctx;
  // Messages with images go to the vision model alone (no compare): only it can read them.
  const images = imageCount(job.messages);
  const slots: ChatSlot[] = images
    ? [{ slot: 0, id: VISION_MODEL.id, info: VISION_MODEL, up: !!provider?.providerModelId(VISION_MODEL.id) }]
    : job.models.map((id, slot) => {
        // Legacy ids resolve to their replacement model.
        const info = getModel(id);
        return { slot, id: info?.id ?? id, info, up: !!provider && !!info && health.status(info.id) === 'ok' };
      });
  const running = slots.filter((s) => s.up);
  if (running.length === 0) {
    const body = errorBody(
      503,
      images ? "Reading images isn't available right now. You were not charged." : 'This model is unavailable right now. You were not charged.',
      'model_unavailable',
    );
    return { ok: false, status: 503, body: { error: { ...body.error, model: slots[0]!.id } } };
  }

  if (job.research && (!ctx.search || images)) {
    const body = errorBody(
      503,
      images ? 'Deep Research works with text questions. Remove the image to use it.' : 'Deep Research is not available right now. You were not charged.',
      'research_unavailable',
    );
    return { ok: false, status: 503, body: { error: { ...body.error } } };
  }
  // Research is one model writing one report.
  if (job.research) slots.splice(1);

  // Search only when requested and configured; unavailable search means no ×1.6.
  const search = job.webSearch || job.research ? ctx.search : null;
  const baseMessages: ChatMessage[] = job.systemPrompt
    ? [{ role: 'system', content: job.systemPrompt }, ...job.messages]
    : job.messages;

  // Pre-check against an estimate, before anything streams. Staking discounts arrive in Phase 6.
  const discountBps = 0;
  const reserve = job.research
    ? RESEARCH_REPORT_MAX_TOKENS + RESEARCH_PLAN_MAX_TOKENS
    : (job.params?.max_tokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS);
  // Research reads the conversation twice (plan + report) plus about 4k tokens of sources.
  const estInput = (estimateTokens(chars(baseMessages)) + images * IMAGE_TOKENS) * (job.research ? 2 : 1) + (job.research ? 4000 : 0);
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

    const runSlot = async (slot: number, info: Priced, messages: ChatMessage[], searched: boolean) => {
      const model = info.id;
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
      const tokens = usage ?? { input: estimateTokens(chars(messages)) + imageCount(messages) * IMAGE_TOKENS, output: estimateTokens(outChars) };
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

    /** Runs a provider stream to the end; deltas go to `onText`. Returns the text and token usage. */
    const collect = async (model: string, messages: ChatMessage[], maxTokens: number, onText?: (t: string) => void) => {
      let text = '';
      let usage: { input: number; output: number } | null = null;
      for await (const chunk of provider!.chatStream({ model, messages, signal, params: { max_tokens: maxTokens } })) {
        if (chunk.type === 'delta') {
          text += chunk.text;
          onText?.(chunk.text);
        } else usage = { input: chunk.input, output: chunk.output };
      }
      return { text, tokens: usage ?? { input: estimateTokens(chars(messages)), output: estimateTokens(text.length) } };
    };

    const runResearch = async (info: Priced) => {
      const model = info.id;
      const lastUser = [...job.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const now = new Date();
      let tokens = { input: 0, output: 0 };
      try {
        send({ type: 'research', stage: 'planning' });
        const plan = await collect(model, planMessages(lastUser, now), RESEARCH_PLAN_MAX_TOKENS);
        tokens = { input: plan.tokens.input, output: plan.tokens.output };
        const queries = parseQueries(plan.text, lastUser);
        send({ type: 'research', stage: 'searching', queries });

        const perQuery = await Promise.all(
          queries.map((q) =>
            search!.search(q, signal, RESEARCH_RESULTS_PER_QUERY).catch((err: unknown): SearchResult[] => {
              if (!signal.aborted) log.warn({ err }, 'research search failed');
              return [];
            }),
          ),
        );
        const sources = mergeSources(perQuery);
        send({ type: 'research', stage: 'writing', sources: sources.length });

        let messages: ChatMessage[] = [...baseMessages];
        const sys: ChatMessage = { role: 'system', content: researchSystemMessage(sources, queries, now) };
        if (job.cryptoTools && ctx.crypto) {
          const extra = await runCryptoTools(ctx.crypto, lastUser, signal, send, (tool, err) => log.warn({ err, tool }, 'crypto tool failed'));
          messages = [...messages.filter((m) => m.role === 'system'), sys, ...extra, ...messages.filter((m) => m.role !== 'system')];
        } else {
          messages = [...messages.filter((m) => m.role === 'system'), sys, ...messages.filter((m) => m.role !== 'system')];
        }
        const report = await collect(model, messages, RESEARCH_REPORT_MAX_TOKENS, (t) => send({ type: 'delta', slot: 0, text: t }));
        if (!report.text) throw new ProviderError('provider_error', 'empty completion');
        tokens = { input: tokens.input + report.tokens.input, output: tokens.output + report.tokens.output };
      } catch (err) {
        if (signal.aborted) return;
        const code = err instanceof ProviderError && err.code === 'model_unavailable' ? 'model_unavailable' : 'provider_error';
        health.reportFailure(model, code);
        log.warn({ err, model, code }, 'research failed');
        send({ type: 'error', slot: 0, code, message: `${info.name} couldn't finish the research. You were not charged.` });
        return;
      }
      health.reportSuccess(model);
      // Only a finished report is charged: planning + writing tokens, at the web search rate.
      const cost = tokenCostMicro(info, tokens.input, tokens.output, { webSearch: true, discountBps });
      let charged = 0n;
      try {
        charged = await chargeUsage(prisma, job.userId, model, cost);
      } catch (err) {
        log.error({ err, model }, 'charge failed');
      }
      emit({ type: 'done', slot: 0, model, credits: toCredits(charged), tokens });
    };

    if (job.research) {
      await runResearch(slots[0]!.info!);
      const after = await prisma.user.findUnique({ where: { id: job.userId }, select: { creditsMicro: true } });
      send({ type: 'end', balance: toCredits(after?.creditsMicro ?? 0n) });
      return;
    }

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

    if (job.cryptoTools && ctx.crypto) {
      const lastUser = [...job.messages].reverse().find((m) => m.role === 'user');
      const extra = await runCryptoTools(ctx.crypto, lastUser?.content ?? '', signal, send, (tool, err) =>
        log.warn({ err, tool }, 'crypto tool failed'),
      );
      if (extra.length) {
        // After the product prompt (and search results), before the conversation.
        const firstConv = messages.findIndex((m) => m.role !== 'system');
        messages = [...messages.slice(0, firstConv), ...extra, ...messages.slice(firstConv)];
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
