import type { Address } from '@fathom/config';

/** Server-only helpers for /trust. Everything is read from the environment at request time. */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface InferenceInfo {
  /** Value of INFERENCE_PROVIDER, lowercased ('' when unset). */
  id: string;
  /** Whether a real model provider is configured (chat works). */
  connected: boolean;
  /** Who runs the models, in plain words. */
  provider: string;
  /** One-line summary of the privacy guarantee that actually applies. */
  summary: string;
  /** Key/value rows for the panel. */
  rows: [string, string][];
  /** Step 3 of "what happens to one message". */
  step: { title: string; text: string };
  /** Hardware attestation exists for this provider (confidential computing). */
  tee: boolean;
}

/**
 * Describes the configured inference provider truthfully. Must match the presets in
 * apps/api/src/inference/presets.ts: only 'tinfoil' is confidential computing.
 */
export function getInferenceInfo(env: Record<string, string | undefined> = process.env): InferenceInfo {
  const id = (env.INFERENCE_PROVIDER ?? '').trim().toLowerCase();
  switch (id) {
    case 'openrouter':
      return {
        id,
        connected: true,
        provider: 'OpenRouter, restricted to zero-data-retention providers',
        summary:
          'Every request is routed only to upstream providers that don’t collect data and serve zero-data-retention endpoints. This is the providers’ policy, not a hardware guarantee.',
        rows: [
          ['Upstream data collection', 'Denied'],
          ['Upstream retention', 'Zero data retention only'],
          ['In transit', 'HTTPS (TLS) both hops'],
          ['Hardware attestation', 'Not yet, planned'],
        ],
        step: {
          title: 'Answered under zero retention',
          text: 'OpenRouter sends it only to a provider that doesn’t store or train on it.',
        },
        tee: false,
      };
    case 'tinfoil':
      // TODO(phase 7): wire provider.attestation() and show the live report + "Verify again" here.
      return {
        id,
        connected: true,
        provider: 'Tinfoil, confidential computing',
        summary:
          'Models run on GPUs with confidential computing enabled, which produce a signed attestation report. Showing and verifying that report on this page is being wired up.',
        rows: [
          ['Provider', 'Tinfoil'],
          ['Hardware', 'Confidential-computing GPUs'],
          ['In transit', 'HTTPS (TLS) both hops'],
          ['Attestation report', 'Not shown here yet'],
        ],
        step: {
          title: 'Answered in confidential hardware',
          text: 'The model runs on a GPU with confidential computing enabled.',
        },
        tee: true,
      };
    case 'mock':
      return {
        id,
        connected: false,
        provider: 'Demo mode, no real model',
        summary: 'This server answers with canned demo replies. No message is sent to any AI provider.',
        rows: [
          ['Provider', 'None (demo replies)'],
          ['Hardware attestation', 'Not applicable'],
        ],
        step: { title: 'Answered locally', text: 'Demo mode: a canned reply, no AI provider involved.' },
        tee: false,
      };
    case '':
    case 'none':
      return {
        id,
        connected: false,
        provider: 'AI not connected',
        summary: 'No model provider is configured on this server, so chat is switched off and nothing is sent anywhere.',
        rows: [
          ['Provider', 'Not connected'],
          ['Hardware attestation', 'Not applicable'],
        ],
        step: { title: 'Not sent anywhere', text: 'No AI provider is connected yet, so chat is switched off.' },
        tee: false,
      };
    default:
      return {
        id,
        connected: true,
        provider: 'An OpenAI-compatible model provider',
        summary:
          'Requests go to a custom OpenAI-compatible provider. We make no retention or hardware claims about it beyond our own: we never log or store your messages.',
        rows: [
          ['Provider', 'Custom (OpenAI-compatible)'],
          ['In transit', 'HTTPS (TLS)'],
          ['Hardware attestation', 'No'],
        ],
        step: { title: 'Answered by the model', text: 'The provider generates the reply and sends it back to us.' },
        tee: false,
      };
  }
}

export interface AddressRow {
  name: string;
  purpose: string;
  address: Address | null;
}

function envAddress(key: string): Address | null {
  const v = process.env[key]?.trim();
  return v && ADDRESS_RE.test(v) ? (v as Address) : null;
}

/** On-chain addresses that matter today. Token and staking contracts are not deployed. */
export function getAddresses(): AddressRow[] {
  return [
    { name: 'USDG', purpose: 'Stablecoin for top-ups (coming soon)', address: envAddress('USDG_ADDRESS') },
    { name: 'Treasury', purpose: 'Will receive USDG top-ups (coming soon)', address: envAddress('TREASURY_ADDRESS') },
  ];
}

export function explorerAddressUrl(address: string): string | null {
  const base = process.env.EXPLORER_URL?.trim().replace(/\/$/, '');
  return base ? `${base}/address/${address}` : null;
}

export type DayStatus = 'ok' | 'warn' | 'down' | null;

export interface ServiceStatus {
  name: string;
  /** 90 daily buckets, oldest first; null means no data for that day. */
  days: DayStatus[];
  uptime: string | null;
  today: DayStatus;
}

const DAYS = 90;
const FALLBACK_SERVICES = ['Chat app', 'API', 'Model provider'];

function fallbackStatus(): ServiceStatus[] {
  return FALLBACK_SERVICES.map((name) => ({ name, days: Array<DayStatus>(DAYS).fill(null), uptime: null, today: null }));
}

const asDay = (v: unknown): DayStatus => (v === 'ok' || v === 'warn' || v === 'down' ? v : null);

/**
 * Real uptime from the API (`GET /status`). Falls back to the "No data yet" rendering if the API is
 * unreachable, slow (3s) or returns something unexpected.
 */
export async function getStatus(): Promise<ServiceStatus[]> {
  const base = (process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4200').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return fallbackStatus();
    const json = (await res.json()) as { services?: unknown };
    if (!Array.isArray(json.services) || json.services.length === 0) return fallbackStatus();
    return json.services
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as { name?: unknown }).name === 'string')
      .map((s) => {
        const raw = Array.isArray(s.days) ? s.days.slice(-DAYS).map(asDay) : [];
        const days = [...Array<DayStatus>(DAYS - raw.length).fill(null), ...raw];
        return {
          name: String(s.name),
          days,
          uptime: typeof s.uptime === 'string' && s.uptime ? s.uptime : null,
          today: 'today' in s ? asDay(s.today) : days[DAYS - 1] ?? null,
        };
      });
  } catch {
    return fallbackStatus();
  }
}
