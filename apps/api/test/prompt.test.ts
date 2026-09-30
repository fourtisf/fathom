import { describe, expect, it } from 'vitest';
import { brand } from '@fathom/config';
import { buildSystemPrompt } from '../src/prompt';

describe('system prompt', () => {
  it('describes the product and matches privacy claims to the provider', () => {
    const tee = buildSystemPrompt({ preset: 'tinfoil', webSearch: false });
    const router = buildSystemPrompt({ preset: 'openrouter', webSearch: true });
    const none = buildSystemPrompt({ preset: null, webSearch: false });

    for (const p of [tee, router, none]) {
      expect(p).toContain(brand.name);
      expect(p).toContain('not an investment');
      expect(p).toContain('never logs or stores');
    }
    expect(tee).toMatch(/confidential-computing/);
    expect(router).not.toMatch(/enclave|confidential/i);
    expect(router).toMatch(/not to store prompts/);
    expect(none).not.toMatch(/enclave|confidential|not to store/i);
    expect(router).toMatch(/Web search/);
    expect(tee).not.toMatch(/Web search/);
    // Utility-token rule (CLAUDE.md §0.6): only negated mentions of yield/revenue.
    expect(router).toMatch(/pays no yield, dividends or revenue/);
  });
});
