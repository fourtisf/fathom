export type ModelId = 'deepseek-v3.1' | 'qwen3-235b' | 'gpt-oss-120b' | 'llama-3.3-70b';

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
  contextK: number;
  /** Credits per 1M input tokens. This is what production charges. */
  inputPerM: number;
  /** Credits per 1M output tokens. This is what production charges. */
  outputPerM: number;
  /** Credits for an average message. UI estimates only, never used for billing. */
  avgMessageCredits: number;
  logo: { letter: string; color: string };
}

export const MODELS: readonly ModelInfo[] = [
  {
    id: 'deepseek-v3.1',
    name: 'DeepSeek V3.1',
    short: 'DeepSeek',
    menuBlurb: 'Reasoning and code',
    tableBlurb: 'Default model',
    bestFor: ['Reasoning', 'Code'],
    contextK: 128,
    inputPerM: 40,
    outputPerM: 120,
    avgMessageCredits: 0.5,
    logo: { letter: 'D', color: '#4D6BFE' },
  },
  {
    id: 'qwen3-235b',
    name: 'Qwen3 235B',
    short: 'Qwen3',
    menuBlurb: 'Long documents, multilingual',
    tableBlurb: 'Most capable',
    bestFor: ['Long documents', 'Multilingual'],
    contextK: 256,
    inputPerM: 35,
    outputPerM: 110,
    avgMessageCredits: 0.45,
    logo: { letter: 'Q', color: '#7C3AED' },
  },
  {
    id: 'gpt-oss-120b',
    name: 'gpt-oss 120B',
    short: 'gpt-oss',
    menuBlurb: 'Fast with tools',
    tableBlurb: 'Built for agents',
    bestFor: ['Tools', 'Speed'],
    contextK: 128,
    inputPerM: 20,
    outputPerM: 60,
    avgMessageCredits: 0.25,
    logo: { letter: 'O', color: '#2A2F5A' },
  },
  {
    id: 'llama-3.3-70b',
    name: 'Llama 3.3 70B',
    short: 'Llama',
    menuBlurb: 'Quick everyday answers',
    tableBlurb: 'Lowest cost',
    bestFor: ['Chat', 'Summaries'],
    contextK: 128,
    inputPerM: 12,
    outputPerM: 30,
    avgMessageCredits: 0.12,
    logo: { letter: 'L', color: '#0EA5E9' },
  },
] as const;

export const DEFAULT_MODEL: ModelId = 'deepseek-v3.1';
/** Model offered by the "Switch to … and retry" action when the default is degraded. */
export const FALLBACK_MODEL: ModelId = 'qwen3-235b';

/**
 * The model that reads images (screenshots, charts, photos). Used automatically for messages with
 * images; it isn't in the chat model menu. Billed by tokens like the others (images count as input).
 */
export const VISION_MODEL = {
  id: 'qwen2.5-vl-72b',
  name: 'Qwen2.5-VL 72B',
  inputPerM: 40,
  outputPerM: 120,
} as const;
export type VisionModelId = typeof VISION_MODEL.id;
/** Images per request (counted across the conversation) and the longest side the browser resizes to. */
export const MAX_CHAT_IMAGES = 4;
export const IMAGE_MAX_SIDE = 1568;

const byId = new Map<string, ModelInfo>(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelInfo | undefined {
  return byId.get(id);
}

export function isModelId(id: string): id is ModelId {
  return byId.has(id);
}
