import type { InferenceEnv } from '../env';
import { createMockProvider } from './mock';
import { createOpenAiCompatibleProvider } from './openai-compatible';
import type { InferenceProvider } from './types';

export * from './types';
export { createMockProvider, estimateTokens, IMAGE_TOKENS } from './mock';
export { createOpenAiCompatibleProvider } from './openai-compatible';

export function createProvider(env: InferenceEnv | null): InferenceProvider | null {
  if (!env) return null;
  switch (env.kind) {
    case 'mock':
      return createMockProvider();
    case 'openai-compatible':
      return createOpenAiCompatibleProvider({
        name: env.preset,
        baseUrl: env.baseUrl!,
        apiKey: env.apiKey,
        modelMap: env.modelMap,
        extraBody: env.extraBody,
        extraHeaders: env.headers,
      });
  }
}
