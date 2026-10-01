/**
 * Read answers aloud with the device's own text-to-speech. Only on-device voices (localService) are used,
 * so the answer text is never sent to a cloud speech service.
 */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function voices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

const ID_WORDS = /\b(yang|dan|ini|itu|tidak|untuk|dengan|adalah|bisa|saya|anda|kamu|dari|akan|juga|sudah|atau)\b/gi;
/** Rough language guess for picking a voice: Indonesian or English. */
export function guessLang(text: string): 'id' | 'en' {
  const words = text.split(/\s+/).length || 1;
  return (text.match(ID_WORDS)?.length ?? 0) / words > 0.04 ? 'id' : 'en';
}

/** Markdown to something pleasant to hear: no code blocks, links read as their text, no symbols. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_~>#|]/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits into sentence-sized pieces: long utterances get cut off in some browsers. */
function pieces(text: string): string[] {
  const out: string[] = [];
  // Split after sentence punctuation followed by a space, so "V3.1" or "$2.84" stay whole.
  for (const s of text.split(/(?<=[.!?。])\s+/)) {
    let rest = s.trim();
    while (rest.length > 220) {
      const cut = rest.lastIndexOf(' ', 220);
      out.push(rest.slice(0, cut > 80 ? cut : 220));
      rest = rest.slice(cut > 80 ? cut + 1 : 220);
    }
    if (rest) out.push(rest);
  }
  return out;
}

let session = 0;

/**
 * Speaks `markdown` with an on-device voice. Resolves false when this device has no on-device voice.
 * `onStart` runs once a voice is chosen and speech begins; `onEnd` when it finishes or fails.
 */
export async function speak(markdown: string, onEnd: () => void, onStart?: () => void): Promise<boolean> {
  stopSpeaking();
  const my = ++session;
  const text = plainText(markdown);
  const lang = guessLang(text);
  const local = (await voices()).filter((v) => v.localService);
  const voice =
    local.find((v) => v.lang.toLowerCase().startsWith(lang) && v.default) ??
    local.find((v) => v.lang.toLowerCase().startsWith(lang)) ??
    (lang === 'id' ? local.find((v) => v.lang.toLowerCase().startsWith('ms')) : undefined) ??
    local.find((v) => v.default) ??
    local[0];
  if (!voice || my !== session) return false;
  onStart?.();
  const parts = pieces(text);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1.03;
    if (i === parts.length - 1) u.onend = () => { if (my === session) onEnd(); };
    u.onerror = () => { if (my === session) { session++; onEnd(); } };
    speechSynthesis.speak(u);
  });
  return true;
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  session++;
  speechSynthesis.cancel();
}
