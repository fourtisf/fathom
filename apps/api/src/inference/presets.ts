import { brand, type ModelId, type VisionModelId } from '@fathom/config';

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
  modelMap?: Partial<Record<ModelId | VisionModelId, string>>;
  /** Generic presets map every model to the same id unless INFERENCE_MODEL_MAP says otherwise. */
  identityMap?: boolean;
  /** Extra JSON fields merged into every chat request (INFERENCE_EXTRA_BODY replaces it). */
  extraBody?: Record<string, unknown>;
  /** Extra request headers (non-secret). */
  headers?: Record<string, string>;
  /**
   * What the assistant may truthfully say about where prompts are processed:
   * 'tee' = confidential-computing hardware with attestation; 'no-retention' = third-party
   * providers under a no-storage/no-training policy. Unset = no claim beyond Noxsea's own.
   */
  privacy?: 'tee' | 'no-retention';
}

/**
 * INFERENCE_PROVIDER names one of these. Adding a vetted provider is one entry.
 * Only add URLs and model ids confirmed from the provider's own docs.
 */
export const INFERENCE_PRESETS: Record<string, ProviderPreset> = {
  mock: { kind: 'mock', identityMap: true },
  'openai-compatible': { kind: 'openai-compatible', identityMap: true },
  // Tinfoil: OpenAI-compatible, Bearer INFERENCE_API_KEY, the router always includes usage in streams.
  // It doesn't serve the current model line-up yet, so nothing is mapped (every model reads
  // 'unavailable'); map ids with INFERENCE_MODEL_MAP once Tinfoil serves them.
  tinfoil: {
    kind: 'openai-compatible',
    baseUrl: 'https://inference.tinfoil.sh/v1',
    privacy: 'tee',
    modelMap: {},
  },
  // OpenRouter: a router, NOT confidential computing. Requests are restricted to upstream providers
  // that don't collect prompts (data_collection: deny) and to zero-data-retention endpoints (zdr).
  openrouter: {
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    privacy: 'no-retention',
    // Ids from openrouter.ai model pages (Oct 2026). Verify at deploy against GET /v1/models: a model
    // with no zero-retention endpoint answers 404 and shows as unavailable.
    modelMap: {
      'deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
      'kimi-k3': 'moonshotai/kimi-k3',
      'qwen3.5-397b': 'qwen/qwen3.5-397b-a17b',
      'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
      // Vision (images in chat): Qwen3.5 reads images natively. Override with VISION_MODEL.
      'qwen3.5-vision': 'qwen/qwen3.5-397b-a17b',
    },
    extraBody: { provider: { data_collection: 'deny', zdr: true }, usage: { include: true } },
    headers: { 'X-Title': brand.name, 'HTTP-Referer': brand.siteUrl },
  },
};
