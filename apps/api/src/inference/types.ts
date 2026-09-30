export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ChatChunk = { type: 'delta'; text: string } | { type: 'usage'; input: number; output: number };

export interface ChatStreamRequest {
  /** Our model id (e.g. "deepseek-v3.1"); the provider maps it to its own id. */
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
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
