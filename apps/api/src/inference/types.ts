export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** User images as data URLs (vision). Sent to the provider with the text, never stored or logged. */
  images?: string[];
}

export type ChatChunk = { type: 'delta'; text: string } | { type: 'usage'; input: number; output: number };

/** OpenAI sampling/tool fields passed through from the public API. All optional, pre-validated. */
export interface GenerationParams {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  seed?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: Record<string, unknown>;
  /** Passed through; tool calls in responses are not supported yet (text content only). */
  tools?: unknown[];
  tool_choice?: unknown;
}

export interface ChatStreamRequest {
  /** Our model id (e.g. "deepseek-v4-pro"); the provider maps it to its own id. */
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  params?: GenerationParams;
}

export interface Attestation {
  hardware: string;
  measurement: string;
  modelHash: string;
  servingCommit: string;
  signedAt: string;
  verified: boolean;
}

export interface InferenceProvider {
  readonly name: string;
  /** Streams a completion. Throws ProviderError on failure, or the signal's reason when aborted. */
  chatStream(req: ChatStreamRequest): AsyncIterable<ChatChunk>;
  /** Provider-side model ids currently served. Throws ProviderError('not_supported') if the provider can't list. */
  models(): Promise<string[]>;
  /** Maps our model id to the provider's id; null when this provider doesn't serve it. */
  providerModelId(model: string): string | null;
  attestation(): Promise<Attestation | null>;
}

export type ProviderErrorCode = 'model_unavailable' | 'provider_error' | 'timeout' | 'not_supported';

/** Typed provider failure. The message is ours and never contains provider bodies or user content. */
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
