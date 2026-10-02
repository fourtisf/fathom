import { brand } from '@fathom/config';
import type { ChatMessage, InferenceProvider } from './inference';
import type { ImageSize } from './images';

/**
 * Turns a short request ("a banner about noxsea") into a prompt an image model draws well. When the
 * request names our product, the model gets our real visual identity instead of guessing what the
 * word means. The prompt is user content: never logged or stored.
 */
export const BRAND_VISUAL =
  `${brand.name} (${brand.domain}) is a private AI chat website: wallet sign-in, zero prompt logs, chats that self-destruct. ` +
  'Visual identity: the logo is a "sealed drop", a smooth water drop with a keyhole cut out of it, filled with a ' +
  'violet-to-indigo-to-cyan gradient (#A89BFF, #6B78FF, #4FD6EC), on a rounded midnight-navy square tile. ' +
  'Backgrounds are deep midnight navy (#060A1C) with soft violet and cyan aurora glows, faint grid lines and ' +
  'frosted-glass cards with thin glowing borders. Mood: premium, calm, private, the deep sea at night. ' +
  'Typography: clean modern geometric sans-serif, white. The name is spelled exactly "Noxsea".';

const SHAPE: Record<ImageSize, string> = {
  square: 'a square image',
  landscape: 'a wide landscape image (16:9), e.g. a banner',
  portrait: 'a tall portrait image (9:16), e.g. a phone wallpaper or story',
};

export const mentionsBrand = (prompt: string) => new RegExp(brand.name, 'i').test(prompt);

export function imagePromptMessages(prompt: string, size: ImageSize): ChatMessage[] {
  const ours = mentionsBrand(prompt);
  return [
    {
      role: 'system',
      content:
        'You write prompts for a text-to-image model. Rewrite the request into one vivid, specific English prompt of ' +
        'at most 90 words: subject, composition, style, lighting and colors. The request may be in any language. ' +
        `The output is ${SHAPE[size]}. Image models garble long text, so include at most one short text element ` +
        '(1 to 3 words, in double quotes), and only if the request asks for text, a title, a banner, a poster or a logo. ' +
        'Keep the request\'s intent; do not add people, brands or text it did not ask for. Output only the prompt.' +
        (ours ? `\n\nThe request is about our own product. Use this brand identity faithfully:\n${BRAND_VISUAL}` : ''),
    },
    { role: 'user', content: prompt },
  ];
}

/** Without the rewriter (no provider, timeout, error), the brand facts still reach the image model. */
export const fallbackImagePrompt = (prompt: string) =>
  mentionsBrand(prompt) ? `${prompt}. ${BRAND_VISUAL}`.slice(0, 1800) : prompt;

const REWRITE_MODEL = 'deepseek-v4-flash';
const REWRITE_TIMEOUT_MS = 10_000;

export async function enhanceImagePrompt(
  provider: InferenceProvider | null,
  available: boolean,
  prompt: string,
  size: ImageSize,
  signal: AbortSignal,
): Promise<{ prompt: string; enhanced: boolean }> {
  if (!provider || !available) return { prompt: fallbackImagePrompt(prompt), enhanced: false };
  const sig = AbortSignal.any([signal, AbortSignal.timeout(REWRITE_TIMEOUT_MS)]);
  try {
    let text = '';
    for await (const chunk of provider.chatStream({
      model: REWRITE_MODEL,
      messages: imagePromptMessages(prompt, size),
      signal: sig,
      params: { max_tokens: 300 },
    })) {
      if (chunk.type === 'delta') text += chunk.text;
    }
    const out = text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
    if (out.length < 10) return { prompt: fallbackImagePrompt(prompt), enhanced: false };
    return { prompt: out.slice(0, 1800), enhanced: true };
  } catch {
    if (signal.aborted) throw signal.reason;
    return { prompt: fallbackImagePrompt(prompt), enhanced: false };
  }
}
