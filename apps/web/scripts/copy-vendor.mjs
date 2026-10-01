// Serves third-party runtime files from our own origin, so no CDN sees who uses them:
// - pdf.js's worker (bundling it makes webpack minify an ES module as a script)
// - ONNX Runtime's WebAssembly files, used by on-device voice input (Whisper in the browser)
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vendor');
mkdirSync(join(out, 'ort'), { recursive: true });
mkdirSync(join(out, 'transformers'), { recursive: true });

const pdf = dirname(require.resolve('pdfjs-dist/package.json'));
copyFileSync(join(pdf, 'legacy', 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));

// transformers.js (self-contained build, ONNX Runtime included) and the ONNX Runtime WebAssembly it loads.
const tjs = dirname(require.resolve('@huggingface/transformers'));
const copy = (src, dst) => {
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
};
copy(join(tjs, 'transformers.min.js'), join(out, 'transformers', 'transformers.min.js'));
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) copy(join(tjs, f), join(out, 'ort', f));
