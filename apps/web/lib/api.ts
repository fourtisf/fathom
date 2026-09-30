/** Browser client for the Noxsea API, reached same-origin via the /api rewrite. */

export type ModelStatus = 'ok' | 'degraded' | 'unavailable';

export interface AppConfig {
  chain: { id: number; name: string; rpcUrl: string; explorerUrl: string } | null;
  models: { id: string; name: string; status: ModelStatus }[];
  webSearch: boolean;
  inference: boolean;
}

export interface Settings {
  saveHistory: boolean;
  defaultBurn: 'off' | '1h' | '24h';
  webSearch: boolean;
}

export interface Me {
  address: string;
  credits: number;
  settings: Settings;
}

export interface CreditsSummary {
  balance: number;
  spentMonth: number;
  messagesMonth: number;
  usage14: { day: string; credits: number }[];
  byModel: { model: string; credits: number }[];
}

export interface TxRow {
  id: string;
  type: 'WELCOME_BONUS' | 'TOPUP' | 'STAKE' | 'UNSTAKE';
  token: string | null;
  amountPaid: string | null;
  credits: number;
  txHash: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? `http_${res.status}`, e?.message ?? res.statusText, body);
  }
  return body as T;
}

export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });
