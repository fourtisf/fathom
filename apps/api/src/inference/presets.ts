import { brand, type ModelId } from '@fathom/config';

export type ProviderKind = 'mock' | 'openai-compatible';

export interface ProviderPreset {
  kind: ProviderKind;
  /** Default base URL (INFERENCE_BASE_URL overrides it). */
  baseUrl?: string;
  /**
   * Our model id → provider model id. For a named preset, a model with no entry is
   * unmapped and reported 'unavailable' (never silently served by a different model).
   * INFERENCE_MODEL_MAP overrides and extends it.
   */
  modelMap?: Partial<Record<ModelId, string>>;
  /** Generic presets map every model to the same id unless INFERENCE_MODEL_MAP says otherwise. */
  identityMap?: boolean;
  /** Extra JSON fields merged into every chat request (INFERENCE_EXTRA_BODY replaces it). */
  extraBody?: Record<string, unknown>;
  /** Extra request headers (non-secret). */
  headers?: Record<string, string>;
}

/**
 * INFERENCE_PROVIDER names one of these. Adding a vetted provider is one entry.
 * Only add URLs and model ids confirmed from the provider's own docs.
 */
export const INFERENCE_PRESETS: Record<string, ProviderPreset> = {
  mock: { kind: 'mock', identityMap: true },
  'openai-compatible': { kind: 'openai-compatible', identityMap: true },
  // Tinfoil: OpenAI-compatible, Bearer INFERENCE_API_KEY, the router always includes usage in streams.
  // Model ids from the models.dev catalog: verify at deploy against GET /v1/models.
  // DeepSeek V3.1 and Qwen3 235B are not served there, so they stay unmapped (unavailable).
  tinfoil: {
    kind: 'openai-compatible',
    baseUrl: 'https://inference.tinfoil.sh/v1',
    modelMap: { 'gpt-oss-120b': 'gpt-oss-120b', 'llama-3.3-70b': 'llama3-3-70b' },
  },
  // OpenRouter: a router, NOT confidential computing. Requests are restricted to upstream providers
  // that don't collect prompts (data_collection: deny) and to zero-data-retention endpoints (zdr).
  // Model ids from the models.dev catalog: verify at deploy against GET /v1/models.
  openrouter: {
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelMap: {
      'deepseek-v3.1': 'deepseek/deepseek-chat-v3.1',
      'qwen3-235b': 'qwen/qwen3-235b-a22b-2507',
      'gpt-oss-120b': 'openai/gpt-oss-120b',
      'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct',
    },
    extraBody: { provider: { data_collection: 'deny', zdr: true }, usage: { include: true } },
    headers: { 'X-Title': brand.name, 'HTTP-Referer': brand.siteUrl },
  },
};
