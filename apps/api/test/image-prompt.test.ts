import { describe, expect, it } from 'vitest';
import type { InferenceProvider } from '../src/inference';
import { BRAND_VISUAL, enhanceImagePrompt, fallbackImagePrompt, imagePromptMessages } from '../src/image-prompt';

const fake = (reply: string | Error, seen: any[] = []): InferenceProvider =>
  ({
    async *chatStream(req: any) {
      seen.push(req);
      if (reply instanceof Error) throw reply;
      yield { type: 'delta', text: reply };
      yield { type: 'usage', input: 10, output: 20 };
    },
  }) as unknown as InferenceProvider;

describe('image prompt enhancer', () => {
  it('gives the rewriter our brand identity only when the request names it', () => {
    const ours = imagePromptMessages('hello create a banner about noxsea', 'landscape');
    expect(ours[0]!.content).toContain(BRAND_VISUAL);
    expect(ours[0]!.content).toContain('wide landscape');
    expect(ours[1]).toEqual({ role: 'user', content: 'hello create a banner about noxsea' });
    expect(imagePromptMessages('a cat on the moon', 'square')[0]!.content).not.toContain('sealed drop');
  });

  it('uses the rewritten prompt from the cheap model', async () => {
    const seen: any[] = [];
    const r = await enhanceImagePrompt(fake('"A wide banner: a glowing sealed drop logo on midnight navy, the word \\"Noxsea\\"."', seen), true, 'banner noxsea', 'landscape', new AbortController().signal);
    expect(r.enhanced).toBe(true);
    expect(r.prompt).toBe('A wide banner: a glowing sealed drop logo on midnight navy, the word \\"Noxsea\\".');
    expect(seen[0]).toMatchObject({ model: 'deepseek-v4-flash', params: { max_tokens: 300 } });
  });

  it('falls back to the request (plus brand facts) without a provider, when unavailable, or on errors', async () => {
    const sig = new AbortController().signal;
    expect(await enhanceImagePrompt(null, true, 'a cat', 'square', sig)).toEqual({ prompt: 'a cat', enhanced: false });
    expect((await enhanceImagePrompt(fake('x'), false, 'Noxsea poster', 'portrait', sig)).prompt).toBe(fallbackImagePrompt('Noxsea poster'));
    expect(fallbackImagePrompt('Noxsea poster')).toContain('sealed drop');
    expect(await enhanceImagePrompt(fake(new Error('down')), true, 'a cat', 'square', sig)).toEqual({ prompt: 'a cat', enhanced: false });
    expect(await enhanceImagePrompt(fake('ok'), true, 'a cat', 'square', sig)).toEqual({ prompt: 'a cat', enhanced: false });
  });

  it('stops when the client leaves', async () => {
    const ac = new AbortController();
    ac.abort(new Error('client disconnected'));
    await expect(enhanceImagePrompt(fake(new Error('aborted')), true, 'a cat', 'square', ac.signal)).rejects.toThrow('client disconnected');
  });
});
