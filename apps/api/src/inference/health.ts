import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { MODELS, type ModelId } from '@fathom/config';
import { ProviderError, type InferenceProvider } from './types';

export type ModelStatus = 'ok' | 'degraded' | 'unavailable';

const REDIS_KEY = 'models:health';
const CACHE_TTL_S = 60;
/** Provider errors within this window that mark a listed model as degraded. */
const DEGRADE_AFTER = 3;
const DEGRADE_WINDOW_MS = 2 * 60_000;

/**
 * Polls provider.models() and keeps a per-model status in memory and in Redis.
 * Listed → ok, not listed → unavailable, listing unsupported → all ok,
 * listing failed → last known (or unavailable if never known).
 * Recent provider errors on a listed model mark it degraded until the window passes.
 */
export class ModelHealth {
  private listed = new Map<ModelId, 'ok' | 'unavailable'>();
  private failures = new Map<ModelId, number[]>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly provider: InferenceProvider | null,
    private readonly redis: Redis | null,
    private readonly log: FastifyBaseLogger,
  ) {}

  status(id: string): ModelStatus {
    if (!this.provider) return 'unavailable';
    const base = this.listed.get(id as ModelId) ?? 'unavailable';
    if (base !== 'ok') return base;
    const now = Date.now();
    const recent = (this.failures.get(id as ModelId) ?? []).filter((t) => now - t < DEGRADE_WINDOW_MS);
    return recent.length >= DEGRADE_AFTER ? 'degraded' : 'ok';
  }

  all(): { id: ModelId; name: string; status: ModelStatus }[] {
    return MODELS.map((m) => ({ id: m.id, name: m.name, status: this.status(m.id) }));
  }

  reportFailure(id: string, code: string): void {
    if (!this.listed.has(id as ModelId)) return;
    if (code === 'model_unavailable') {
      this.listed.set(id as ModelId, 'unavailable');
      return;
    }
    const now = Date.now();
    const list = (this.failures.get(id as ModelId) ?? []).filter((t) => now - t < DEGRADE_WINDOW_MS);
    list.push(now);
    this.failures.set(id as ModelId, list);
  }

  reportSuccess(id: string): void {
    this.failures.delete(id as ModelId);
  }

  async refresh(): Promise<void> {
    if (!this.provider) return;
    const provider = this.provider;
    try {
      let listed: Set<string> | null;
      try {
        listed = new Set(await provider.models());
      } catch (err) {
        if (err instanceof ProviderError && err.code === 'not_supported') listed = null;
        else throw err;
      }
      for (const m of MODELS) {
        const pid = provider.providerModelId(m.id);
        this.listed.set(m.id, pid !== null && (!listed || listed.has(pid)) ? 'ok' : 'unavailable');
      }
      await this.redis
        ?.set(REDIS_KEY, JSON.stringify(Object.fromEntries(this.listed)), 'EX', CACHE_TTL_S)
        .catch(() => undefined);
    } catch (err) {
      this.log.warn({ err }, 'model health check failed');
      if (this.listed.size === 0) await this.loadCached();
    }
  }

  private async loadCached(): Promise<void> {
    try {
      const raw = await this.redis?.get(REDIS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const m of MODELS) {
        if (parsed[m.id] === 'ok' || parsed[m.id] === 'unavailable') this.listed.set(m.id, parsed[m.id] as 'ok');
      }
    } catch {
      // ignore: no cache
    }
  }

  async start(intervalMs = 30_000): Promise<void> {
    if (!this.provider || this.timer) return;
    await Promise.race([this.refresh(), new Promise((r) => setTimeout(r, 5_000).unref())]);
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
