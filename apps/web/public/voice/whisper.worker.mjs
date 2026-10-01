// Speech-to-text on the user's device: Whisper (open weights) running in WebAssembly inside this worker.
// transformers.js, ONNX Runtime and the model are all served from our own origin; audio never leaves
// the browser. Messages: see lib/voice/transcriber.ts.
import { env, pipeline } from '/vendor/transformers/transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';
env.useBrowserCache = true; // the model downloads once, then loads from the browser cache
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = '/vendor/ort/';
  env.backends.onnx.wasm.numThreads = 1;
}

let asr = null;
let loadedModel = '';
const files = new Map();

function load(model) {
  if (!asr || loadedModel !== model) {
    loadedModel = model;
    files.clear();
    asr = pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p) => {
        if (p.status !== 'progress' || !p.file) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        self.postMessage({ type: 'progress', loaded, total });
      },
    });
    asr.catch(() => {
      asr = null;
    });
  }
  return asr;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    const run = await load(m.model);
    if (m.type === 'load') return self.postMessage({ type: 'ready' });
    const out = await run(m.audio, { task: 'transcribe', language: m.language || 'en', chunk_length_s: 30, stride_length_s: 5 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
    self.postMessage({ type: 'result', id: m.id, text });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.type === 'transcribe' ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
