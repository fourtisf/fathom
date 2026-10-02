import { getModel, MODELS, VISION_MODEL } from '@fathom/config';
import { ProviderError, type ChatChunk, type ChatStreamRequest, type InferenceProvider } from './types';

export interface MockProviderOptions {
  /** Delay between chunks in ms. */
  delayMs?: number;
  /** Models that fail with provider_error (tests). */
  failModels?: string[];
  /** Models the mock does not serve (tests). */
  unavailableModels?: string[];
  /** Override the reply text (tests). */
  reply?: (model: string, receivedChars: number) => string;
  /** When false, no usage chunk is emitted (tests the char-based fallback). */
  reportUsage?: boolean;
}

export const estimateTokens = (chars: number): number => Math.ceil(chars / 3.5);
/** Rough input tokens per image, for the balance pre-check (providers report the real count). */
export const IMAGE_TOKENS = 1600;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Deterministic local provider for dev and tests. It never echoes the prompt. */
export function createMockProvider(opts: MockProviderOptions = {}): InferenceProvider {
  const delayMs = opts.delayMs ?? 15;
  return {
    name: 'mock',
    providerModelId: (m) => m,
    async models() {
      return [...MODELS.map((m) => m.id as string), VISION_MODEL.id].filter(
        (m) => !opts.unavailableModels?.includes(m),
      );
    },
    async attestation() {
      return null;
    },
    async *chatStream(req: ChatStreamRequest): AsyncGenerator<ChatChunk> {
      if (opts.unavailableModels?.includes(req.model)) {
        throw new ProviderError('model_unavailable', 'model not served', 404);
      }
      const chars = req.messages.reduce((n, m) => n + m.content.length, 0);
      const images = req.messages.reduce((n, m) => n + (m.images?.length ?? 0), 0);
      await sleep(delayMs, req.signal);
      if (opts.failModels?.includes(req.model)) throw new ProviderError('provider_error', 'mock failure', 500);
      const name = getModel(req.model)?.name ?? req.model;
      const text =
        opts.reply?.(req.model, chars) ??
        `Mock reply from ${name}: I received ${chars} characters${images ? ` and ${images} image${images > 1 ? 's' : ''}` : ''}.`;
      const parts = text.match(/.{1,12}/gs) ?? [];
      for (const part of parts) {
        yield { type: 'delta', text: part };
        await sleep(delayMs, req.signal);
      }
      if (opts.reportUsage !== false) {
        yield { type: 'usage', input: estimateTokens(chars) + images * IMAGE_TOKENS, output: estimateTokens(text.length) };
      }
    },
  };
}
