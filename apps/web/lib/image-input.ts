import { IMAGE_MAX_SIDE } from '@fathom/config';

/** Reading images for vision: resized in the browser to a JPEG data URL, never uploaded anywhere but the chat request. */

export class ImageError extends Error {}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Server limit is 2,000,000 characters per image; stay comfortably below it. */
const MAX_DATA_URL = 1_800_000;

export const isImageFile = (f: File) => /^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name);

export async function readImage(file: File | Blob): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError('Image is too large (max 25 MB).');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new ImageError("Couldn't read this image. Try a PNG or JPEG.");
  }
  let side = IMAGE_MAX_SIDE;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageError("Couldn't read this image.");
      ctx.fillStyle = '#fff'; // transparent PNGs become readable on white, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      const url = canvas.toDataURL('image/jpeg', attempt === 0 ? 0.86 : 0.78);
      if (url.length <= MAX_DATA_URL) return url;
      side = Math.round(side * 0.75);
    }
  } finally {
    bmp.close();
  }
  throw new ImageError('Image is too detailed to send. Try a smaller screenshot.');
}
