/** Languages offered for voice input (Whisper language codes). Whisper needs to be told which one is spoken. */
export const VOICE_LANGS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ru', name: 'Русский' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'th', name: 'ไทย' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ar', name: 'العربية' },
];

/** 'auto' follows the browser's language when we offer it, else English. */
export function resolveVoiceLang(pref: string): string {
  if (pref !== 'auto' && VOICE_LANGS.some((l) => l.code === pref)) return pref;
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? 'en') : 'en';
  const code = nav.slice(0, 2).toLowerCase();
  return VOICE_LANGS.some((l) => l.code === code) ? code : 'en';
}
