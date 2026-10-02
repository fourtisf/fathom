export type ModelId = 'deepseek-v4-pro' | 'kimi-k3' | 'qwen3.5-397b' | 'deepseek-v4-flash';

export interface ModelInfo {
  id: ModelId;
  name: string;
  /** Short label for compact controls (pricing calculator). */
  short: string;
  /** One-liner in the chat model menu. */
  menuBlurb: string;
  /** Subtitle in the landing Models table. */
  tableBlurb: string;
  bestFor: readonly string[];
  /** Context window in thousands of tokens. */
  contextK: number;
  /** Credits per 1M input tokens. This is what production charges. */
  inputPerM: number;
  /** Credits per 1M output tokens. This is what production charges. */
  outputPerM: number;
  /** Credits for an average message (about 3k tokens in, 700 out). UI estimates only, never used for billing. */
  avgMessageCredits: number;
  /** Small label in the model menu and Models table. */
  badge?: string;
  /** Month the open weights were released (for "latest model" copy). */
  released: string;
  logo: { letter: string; color: string };
}

/**
 * Open-weight models, all served through the inference provider's zero-retention routing.
 * Prices are credits per 1M tokens (1 credit = $0.01), about 2× the provider's list price so
 * failed and unbilled requests are covered. Re-check provider prices when changing models.
 */
export const MODELS: readonly ModelInfo[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    short: 'DeepSeek',
    menuBlurb: 'Best all-round · reasoning and code',
    tableBlurb: 'Default model',
    bestFor: ['Reasoning', 'Code'],
    contextK: 1024,
    inputPerM: 50,
    outputPerM: 700,
    avgMessageCredits: 0.64,
    badge: 'Default',
    released: '2026-04',
    logo: { letter: 'D', color: '#4D6BFE' },
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    short: 'Kimi K3',
    menuBlurb: 'Most capable · deep thinking',
    tableBlurb: 'Most capable',
    bestFor: ['Hard problems', 'Agents'],
    contextK: 1024,
    inputPerM: 75,
    outputPerM: 2000,
    avgMessageCredits: 1.6,
    badge: 'New',
    released: '2026-07',
    logo: { letter: 'K', color: '#16181F' },
  },
  {
    id: 'qwen3.5-397b',
    name: 'Qwen3.5 397B',
    short: 'Qwen3.5',
    menuBlurb: 'Multilingual · reads images',
    tableBlurb: 'Multilingual and vision',
    bestFor: ['Languages', 'Long documents'],
    contextK: 262,
    inputPerM: 80,
    outputPerM: 470,
    avgMessageCredits: 0.57,
    released: '2026-02',
    logo: { letter: 'Q', color: '#7C3AED' },
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    short: 'V4 Flash',
    menuBlurb: 'Fastest · lowest cost',
    tableBlurb: 'Lowest cost',
    bestFor: ['Chat', 'Summaries'],
    contextK: 1024,
    inputPerM: 25,
    outputPerM: 60,
    avgMessageCredits: 0.12,
    badge: 'Fast',
    released: '2026-04',
    logo: { letter: 'F', color: '#0EA5E9' },
  },
] as const;

export const DEFAULT_MODEL: ModelId = 'deepseek-v4-pro';
/** Model offered by the "Switch to … and retry" action when the default is degraded. */
export const FALLBACK_MODEL: ModelId = 'qwen3.5-397b';

/**
 * Ids of models we served before, mapped to their replacements, so API clients and saved
 * preferences keep working after an upgrade. Names are kept for old usage rows.
 */
export const LEGACY_MODELS: Record<string, { to: ModelId; name: string }> = {
  'deepseek-v3.1': { to: 'deepseek-v4-pro', name: 'DeepSeek V3.1' },
  'qwen3-235b': { to: 'qwen3.5-397b', name: 'Qwen3 235B' },
  'gpt-oss-120b': { to: 'kimi-k3', name: 'gpt-oss 120B' },
  'llama-3.3-70b': { to: 'deepseek-v4-flash', name: 'Llama 3.3 70B' },
};

/** "1M" or "262K", for context windows. */
export const contextLabel = (k: number) => (k >= 1000 ? `${Math.round(k / 1024)}M` : `${k}K`);

/**
 * The model that reads images (screenshots, charts, photos). Used automatically for messages with
 * images; it isn't in the chat model menu. Billed by tokens like the others (images count as input).
 */
export const VISION_MODEL = {
  id: 'qwen3.5-vision',
  name: 'Qwen3.5 397B Vision',
  inputPerM: 80,
  outputPerM: 470,
} as const;
export type VisionModelId = typeof VISION_MODEL.id;
/** Images per request (counted across the conversation) and the longest side the browser resizes to. */
export const MAX_CHAT_IMAGES = 4;
export const IMAGE_MAX_SIDE = 1568;

const byId = new Map<string, ModelInfo>(MODELS.map((m) => [m.id, m]));

/** The model for an id, following legacy ids to their replacement. */
export function getModel(id: string): ModelInfo | undefined {
  return byId.get(id) ?? byId.get(LEGACY_MODELS[id]?.to ?? '');
}

/** Display name for any model id we ever billed (usage history), including vision and images. */
export function modelDisplayName(id: string): string {
  if (id === VISION_MODEL.id) return VISION_MODEL.name;
  if (id === 'image-generation') return 'Image generation';
  return byId.get(id)?.name ?? LEGACY_MODELS[id]?.name ?? id;
}

export function isModelId(id: string): id is ModelId {
  return byId.has(id);
}
