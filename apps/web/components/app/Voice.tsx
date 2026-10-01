'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_RECORD_MS, startRecording, voiceInputSupported, type Recording } from '@/lib/voice/recorder';
import { speak, speechSupported, stopSpeaking } from '@/lib/voice/speak';
import { modelReady, transcribe, voiceModel, warmUp } from '@/lib/voice/transcriber';

export type VoiceState =
  | { s: 'idle' }
  | { s: 'recording'; since: number }
  | { s: 'working'; download: { loaded: number; total: number } | null };

const MIC = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

/**
 * Voice input: record, then transcribe on this device with Whisper. `onText` gets the transcript.
 * `available` is false when the browser can't record or this server doesn't host the voice model.
 */
export function useVoiceInput(onText: (text: string) => void, onError: (msg: string) => void, language: string) {
  const [state, setState] = useState<VoiceState>({ s: 'idle' });
  const [level, setLevel] = useState(0);
  const [available, setAvailable] = useState(false);
  const rec = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const download = (loaded: number, total: number) =>
    setState((st) => (st.s === 'working' && !modelReady() ? { s: 'working', download: { loaded, total } } : st));

  useEffect(() => {
    if (!voiceInputSupported()) return;
    let live = true;
    void voiceModel().then((m) => live && setAvailable(!!m));
    return () => {
      live = false;
      rec.current?.cancel();
      clearTimeout(timer.current);
    };
  }, []);

  const stop = useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearTimeout(timer.current);
    setState({ s: 'working', download: null });
    try {
      const audio = await r.stop();
      if (audio.length < 16_000 * 0.4) throw new Error('short');
      const text = await transcribe(audio, language, download);
      if (!text || /^\[.*\]$/.test(text)) onError("Didn't catch that. Try again a bit closer to the mic.");
      else onText(text);
    } catch (e) {
      onError(e instanceof Error && e.message === 'short' ? 'Hold on a little longer, then tap Done.' : "Couldn't transcribe that. Try again.");
    } finally {
      setState({ s: 'idle' });
      setLevel(0);
    }
  }, [onText, onError, language]);

  const start = useCallback(async () => {
    if (rec.current || state.s !== 'idle') return;
    stopSpeaking();
    try {
      rec.current = await startRecording(setLevel);
    } catch {
      onError('Microphone access was blocked. Allow it in your browser to talk to Noxsea.');
      return;
    }
    setState({ s: 'recording', since: Date.now() });
    void warmUp(download); // fetch the model while the user speaks
    timer.current = setTimeout(() => void stop(), MAX_RECORD_MS);
  }, [state.s, stop, onError]);

  const cancel = useCallback(() => {
    rec.current?.cancel();
    rec.current = null;
    clearTimeout(timer.current);
    setState({ s: 'idle' });
    setLevel(0);
  }, []);

  return { state, level, available, start, stop, cancel };
}

export function MicButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button className="chip mic" onClick={onClick} disabled={disabled} aria-label="Voice input" title="Talk instead of typing. Transcribed on your device; audio never leaves your browser.">
      {MIC}
    </button>
  );
}

function Clock({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="vclock">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>;
}

/** Shown in the composer while recording or transcribing. */
export function VoiceBar({ state, level, lang, onStop, onCancel }: { state: VoiceState; level: number; lang: string; onStop: () => void; onCancel: () => void }) {
  const hist = useRef<number[]>(Array(24).fill(0));
  if (state.s === 'recording') hist.current = [...hist.current.slice(1), level];
  if (state.s === 'idle') return null;
  if (state.s === 'working') {
    const d = state.download;
    const pct = d && d.total ? Math.round((d.loaded / d.total) * 100) : null;
    return (
      <div className="voicebar" role="status">
        <span className="vdot busy" aria-hidden="true" />
        <span className="shim">
          {pct !== null && pct < 100
            ? `Downloading the voice model · ${pct}% (one time, ${Math.round((d!.total || 0) / 1e6)} MB)`
            : 'Transcribing on your device…'}
        </span>
      </div>
    );
  }
  return (
    <div className="voicebar" role="status" aria-label="Recording">
      <span className="vdot" aria-hidden="true" />
      <span className="vlabel">Listening</span>
      <span className="vlang" title="Spoken language. Change it in Settings → Voice.">{lang.toUpperCase()}</span>
      <Clock since={state.since} />
      <span className="vwave" aria-hidden="true">
        {hist.current.map((v, i) => (
          <i key={i} style={{ height: `${Math.max(3, Math.round(v * 22))}px` }} />
        ))}
      </span>
      <span className="vnote">Audio stays on this device</span>
      <span className="sp" />
      <button className="mact" onClick={onCancel}>
        Cancel
      </button>
      <button className="vdone" onClick={onStop}>
        Done
      </button>
    </div>
  );
}

/* ---------- read aloud ---------- */

let speakingKey: string | null = null;
const listeners = new Set<() => void>();
const setSpeaking = (k: string | null) => {
  speakingKey = k;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSpeaking(): string | null {
  return useSyncExternalStore(subscribe, () => speakingKey, () => null);
}

/** Speaks `text` with an on-device voice; returns false when the device has none. */
export async function readAloud(key: string, text: string): Promise<boolean> {
  return speak(
    text,
    () => {
      if (speakingKey === key) setSpeaking(null);
    },
    () => setSpeaking(key),
  );
}

export function stopReading(): void {
  stopSpeaking();
  setSpeaking(null);
}

export function ListenButton({ id, text, onUnavailable }: { id: string; text: string; onUnavailable: () => void }) {
  const speaking = useSpeaking();
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(speechSupported()), []);
  if (!supported || !text.trim()) return null;
  const on = speaking === id;
  return (
    <button
      className="mact"
      aria-label={on ? 'Stop reading aloud' : 'Read answer aloud'}
      onClick={async () => {
        if (on) return stopReading();
        if (!(await readAloud(id, text))) onUnavailable();
      }}
    >
      {on ? 'Stop' : 'Listen'}
    </button>
  );
}
