/** Microphone capture for on-device voice input. Audio stays in memory and is dropped after transcription. */

export const MAX_RECORD_MS = 60_000;

export interface Recording {
  /** Stops and returns 16 kHz mono samples for Whisper. */
  stop(): Promise<Float32Array>;
  cancel(): void;
}

export function voiceInputSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/** Starts recording. `onLevel` gets the input level (0..1) every animation frame, for the meter. */
export async function startRecording(onLevel: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(250);

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
    raf = requestAnimationFrame(tick);
  };
  tick();
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => undefined);
  };

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        rec.onstop = async () => {
          cleanup();
          try {
            resolve(await decode(new Blob(chunks, { type: rec.mimeType })));
          } catch (e) {
            reject(e);
          } finally {
            chunks.length = 0;
          }
        };
        if (rec.state === 'inactive') rec.onstop(new Event('stop'));
        else rec.stop();
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      chunks.length = 0;
      cleanup();
    },
  };
}

/** Decodes the recording and resamples it to 16 kHz mono. */
async function decode(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    if (audio.numberOfChannels === 1) return audio.getChannelData(0).slice();
    const a = audio.getChannelData(0), b = audio.getChannelData(1);
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = (a[i]! + b[i]!) / 2;
    return out;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}
