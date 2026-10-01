// Downloads the Whisper speech-to-text model once, so the app serves it from its own origin and voice
// input runs entirely in the user's browser. Writes public/models/voice.json, which turns voice input on.
// Usage: node scripts/fetch-voice-model.mjs [model]   (default: VOICE_MODEL or Xenova/whisper-base)
// Safe to re-run: files already present at the right size are skipped. Exits 0 on failure (voice stays off).
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const model = process.argv[2] || process.env.VOICE_MODEL || 'Xenova/whisper-base';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const OPTIONAL = new Set(['generation_config.json']);

async function get(file) {
  const dst = join(root, model, file);
  const url = `https://huggingface.co/${model}/resolve/main/${file}`;
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!head.ok) {
    if (OPTIONAL.has(file)) return 0;
    throw new Error(`${file}: HTTP ${head.status}`);
  }
  const size = Number(head.headers.get('content-length') ?? 0);
  if (existsSync(dst) && size && statSync(dst).size === size) return size;
  mkdirSync(dirname(dst), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${file}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${dst}.part`));
  renameSync(`${dst}.part`, dst);
  return statSync(dst).size;
}

try {
  let bytes = 0;
  for (const f of FILES) {
    const n = await get(f);
    bytes += n;
    console.log(`voice model: ${f} ${(n / 1e6).toFixed(1)} MB`);
  }
  writeFileSync(join(root, 'voice.json'), JSON.stringify({ model, bytes }) + '\n');
  console.log(`voice model ready: ${model} (${(bytes / 1e6).toFixed(0)} MB)`);
} catch (err) {
  console.warn(`voice model not downloaded (${err.message}); voice input stays off`);
}
