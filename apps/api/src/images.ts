/**
 * Image generation through any OpenAI-compatible /images/generations endpoint, or OpenRouter's /images
 * API (open-weight models such as FLUX.2 Klein, configured by env). Prompts and images are user content: never logged or stored. When the
 * provider answers with a URL, our server downloads the image, so the user's IP never reaches its CDN.
 */

export type ImageSize = 'square' | 'landscape' | 'portrait';
export const IMAGE_SIZES: Record<ImageSize, { w: number; h: number }> = {
  square: { w: 1024, h: 1024 },
  landscape: { w: 1344, h: 768 },
  portrait: { w: 768, h: 1344 },
};
/** OpenRouter's /images takes an aspect ratio instead of pixels. */
const ASPECT: Record<ImageSize, string> = { square: '1:1', landscape: '16:9', portrait: '9:16' };
const TIMEOUT_MS = 90_000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export interface GeneratedImage {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  base64: string;
}

export interface ImageGenerator {
  readonly model: string;
  /** Credits charged per finished image (micro-credits). */
  readonly costMicro: bigint;
  generate(prompt: string, size: ImageSize, signal: AbortSignal): Promise<GeneratedImage>;
}

export class ImageGenError extends Error {
  constructor(
    public readonly code: 'provider_error' | 'rejected' | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

/** Magic bytes, so a provider can't hand the browser something that isn't an image. */
export function sniffImage(buf: Uint8Array): GeneratedImage['mime'] | null {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) return 'image/webp';
  return null;
}

export interface ImageGeneratorOptions {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  costMicro: bigint;
  /** 'size' sends size:"WxH" (OpenAI style); 'wh' sends width/height (Together style). */
  sizeStyle?: 'size' | 'wh';
  extraBody?: Record<string, unknown>;
  /** 'openrouter': POST /images with aspect_ratio (OpenRouter's image API). Default: /images/generations. */
  api?: 'openai' | 'openrouter';
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export function createImageGenerator(opts: ImageGeneratorOptions): ImageGenerator {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  return {
    model: opts.model,
    costMicro: opts.costMicro,
    async generate(prompt, size, signal) {
      const { w, h } = IMAGE_SIZES[size];
      const sig = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);
      let res: Response;
      try {
        const openrouter = opts.api === 'openrouter';
        res = await doFetch(`${base}/${openrouter ? 'images' : 'images/generations'}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...opts.headers,
            ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          body: JSON.stringify(
            openrouter
              ? { ...opts.extraBody, model: opts.model, prompt, n: 1, aspect_ratio: ASPECT[size] }
              : {
                  ...opts.extraBody,
                  model: opts.model,
                  prompt,
                  n: 1,
                  response_format: 'b64_json',
                  ...(opts.sizeStyle === 'wh' ? { width: w, height: h } : { size: `${w}x${h}` }),
                },
          ),
          signal: sig,
        });
      } catch {
        if (signal.aborted) throw signal.reason;
        throw new ImageGenError(sig.aborted ? 'timeout' : 'provider_error', 'image request failed');
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        // 400/422 usually means the prompt was refused by the provider's safety filter.
        throw new ImageGenError(res.status === 400 || res.status === 422 ? 'rejected' : 'provider_error', `image provider HTTP ${res.status}`);
      }
      const json = (await res.json().catch(() => null)) as { data?: { b64_json?: unknown; url?: unknown }[] } | null;
      const item = json?.data?.[0];
      let bytes: Uint8Array | null = null;
      if (typeof item?.b64_json === 'string') {
        bytes = Uint8Array.from(Buffer.from(item.b64_json, 'base64'));
      } else if (typeof item?.url === 'string' && /^https:\/\//.test(item.url)) {
        const img = await doFetch(item.url, { signal: sig }).catch(() => null);
        if (!img?.ok) throw new ImageGenError('provider_error', 'image download failed');
        const buf = new Uint8Array(await img.arrayBuffer());
        if (buf.length <= MAX_IMAGE_BYTES) bytes = buf;
      }
      const mime = bytes && bytes.length <= MAX_IMAGE_BYTES ? sniffImage(bytes) : null;
      if (!bytes || !mime) throw new ImageGenError('provider_error', 'provider returned no image');
      return { mime, base64: Buffer.from(bytes).toString('base64') };
    },
  };
}

/** Local generator for dev and tests: a small PNG, never the prompt. */
export function createMockImageGenerator(costMicro: bigint): ImageGenerator {
  // 1×1 violet PNG.
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8+e/HfwAJPAPTZgA7PwAAAABJRU5ErkJggg==';
  return {
    model: 'mock-image',
    costMicro,
    async generate(_prompt, _size, signal) {
      await new Promise((r) => setTimeout(r, 20));
      if (signal.aborted) throw signal.reason;
      return { mime: 'image/png', base64: PNG };
    },
  };
}
