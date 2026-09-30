import { ApiError } from './api';

export type ChatEvent =
  | { type: 'search'; status: 'running' | 'done' | 'unavailable'; sources?: number }
  | { type: 'delta'; slot: 0 | 1; text: string }
  | { type: 'done'; slot: 0 | 1; model: string; credits: number; tokens: { input: number; output: number } }
  | { type: 'error'; slot: 0 | 1; code: string; message: string }
  | { type: 'end'; balance: number };

export interface ChatRequest {
  model: string;
  compareWith?: string;
  webSearch?: boolean;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

/** POST /api/chat and feed each server-sent event to `onEvent`. Throws ApiError for non-stream errors (402, 503, 429…). */
export async function streamChat(req: ChatRequest, onEvent: (e: ChatEvent) => void, signal?: AbortSignal) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    const e = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? `http_${res.status}`, e?.message ?? res.statusText, body);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(JSON.parse(data) as ChatEvent);
    }
  }
}
