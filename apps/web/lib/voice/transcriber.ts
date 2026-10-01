// The worker is a static file (public/voice/whisper.worker.mjs) importing transformers.js from /vendor:
// bundling ONNX Runtime breaks the minifier, and serving it ourselves keeps every download on our origin.
type WorkerIn = { type: 'load'; model: string } | { type: 'transcribe'; id: number; model: string; language: string; audio: Float32Array };
type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };

/** Which Whisper model this server hosts, from public/models/voice.json (absent: voice input is off). */
export interface VoiceModel { model: string; bytes: number }

let manifest: Promise<VoiceModel | null> | null = null;
export function voiceModel(): Promise<VoiceModel | null> {
  manifest ??= fetch('/models/voice.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<VoiceModel>) : null))
    .catch(() => null);
  return manifest;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
let progressCb: ((loaded: number, total: number) => void) | null = null;
let ready = false;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('/voice/whisper.worker.mjs', { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === 'progress') progressCb?.(m.loaded, m.total);
    else if (m.type === 'ready') ready = true;
    else if (m.type === 'result') {
      ready = true;
      waiting.get(m.id)?.resolve(m.text);
      waiting.delete(m.id);
    } else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id !== undefined) {
        waiting.get(m.id)?.reject(err);
        waiting.delete(m.id);
      } else for (const w of waiting.values()) w.reject(err);
    }
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.reject(new Error('voice worker crashed'));
    waiting.clear();
    worker?.terminate();
    worker = null;
    ready = false;
  };
  return worker;
}

/** True once the model is loaded in this tab (no download wait on the next transcription). */
export const modelReady = () => ready;

/** Starts loading the model in the background (e.g. when the user first presses the mic). */
export async function warmUp(onProgress?: (loaded: number, total: number) => void): Promise<void> {
  const m = await voiceModel();
  if (!m || ready) return;
  if (onProgress) progressCb = onProgress;
  getWorker().postMessage({ type: 'load', model: m.model } satisfies WorkerIn);
}

/** Transcribes 16 kHz mono audio on this device. `language` is a Whisper language code, e.g. 'en' or 'id'. */
export async function transcribe(audio: Float32Array, language: string, onProgress?: (loaded: number, total: number) => void): Promise<string> {
  const m = await voiceModel();
  if (!m) throw new Error('Voice input is not available on this server yet.');
  if (onProgress) progressCb = onProgress;
  const id = nextId++;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ type: 'transcribe', id, model: m.model, language, audio } satisfies WorkerIn, [audio.buffer]);
  });
}
