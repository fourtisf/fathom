import type { FastifyBaseLogger } from 'fastify';
import type { AppContext } from './context';

/**
 * Service status for the public status page. A probe runs every 60s and adds one
 * sample per service to a Redis hash per UTC day (ok/warn/down counts, kept 100 days).
 * A day's status is its worst sample (ok < warn < down); uptime counts ok+warn samples.
 */

export type Level = 'ok' | 'warn' | 'down';
export const STATUS_DAYS = 90;
const TTL_S = 100 * 86_400;
const DAY_MS = 86_400_000;

export const SERVICES = ['API', 'Database', 'AI models', 'Top-ups', 'Web search'] as const;
export type ServiceName = (typeof SERVICES)[number];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const statusKey = (name: string, day: string) => `status:${slug(name)}:${day}`;

/** Services shown: optional features only when configured. */
export function activeServices(ctx: AppContext): ServiceName[] {
  return SERVICES.filter((s) => (s === 'Top-ups' ? !!ctx.topup : s === 'Web search' ? !!ctx.search : true));
}

/** Tracks recent web search outcomes (the search wrapper reports here). */
export class SearchHealth {
  failStreak = 0;
  ok(): void {
    this.failStreak = 0;
  }
  fail(): void {
    this.failStreak++;
  }
  level(): Level {
    return this.failStreak === 0 ? 'ok' : this.failStreak < 3 ? 'warn' : 'down';
  }
}

export async function probeServices(ctx: AppContext): Promise<Partial<Record<ServiceName, Level>>> {
  const out: Partial<Record<ServiceName, Level>> = { API: 'ok' };
  try {
    await ctx.prisma.$queryRaw`SELECT 1`;
    out.Database = 'ok';
  } catch {
    out.Database = 'down';
  }

  // Only models the provider is configured to serve count; unmapped ones are a config choice.
  if (!ctx.provider) out['AI models'] = 'down';
  else {
    const served = ctx.health.all().filter((m) => ctx.provider!.providerModelId(m.id) !== null);
    const ok = served.filter((m) => m.status === 'ok').length;
    out['AI models'] = ok === 0 ? 'down' : ok === served.length ? 'ok' : 'warn';
  }

  if (ctx.topup) {
    out['Top-ups'] = ctx.topup.ready && Date.now() - ctx.topup.lastTickAt < 2 * 60_000 ? 'ok' : 'warn';
  }
  if (ctx.search) out['Web search'] = ctx.searchHealth.level();
  return out;
}

export async function recordStatus(
  ctx: AppContext,
  levels: Partial<Record<ServiceName, Level>>,
  now: Date = new Date(),
): Promise<void> {
  const day = isoDay(now);
  const m = ctx.redis.multi();
  for (const [name, level] of Object.entries(levels)) {
    const k = statusKey(name, day);
    m.hincrby(k, level, 1).expire(k, TTL_S);
  }
  await m.exec();
}

export async function runStatusProbe(ctx: AppContext, log: FastifyBaseLogger, now: Date = new Date()): Promise<void> {
  try {
    await recordStatus(ctx, await probeServices(ctx), now);
  } catch (err) {
    log.warn({ err }, 'status probe failed');
  }
}

export interface ServiceStatus {
  name: ServiceName;
  days: (Level | null)[];
  uptime: string | null;
  today: Level | null;
}

/** Floors to 2 decimals so the page never overstates uptime: 99.999 → "99.99%". */
export function formatUptime(up: number, total: number): string | null {
  if (total === 0) return null;
  const pct = Math.floor((up / total) * 10_000) / 100;
  return `${pct}%`;
}

export async function readStatus(ctx: AppContext, now: Date = new Date()): Promise<ServiceStatus[]> {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: STATUS_DAYS }, (_, i) => isoDay(new Date(today - (STATUS_DAYS - 1 - i) * DAY_MS)));
  const services = activeServices(ctx);
  const m = ctx.redis.multi();
  for (const s of services) for (const d of days) m.hgetall(statusKey(s, d));
  const res = (await m.exec()) ?? [];
  return services.map((name, si) => {
    let up = 0;
    let total = 0;
    const levels = days.map((_, di) => {
      const h = (res[si * STATUS_DAYS + di]?.[1] ?? {}) as Record<string, string>;
      const ok = Number(h.ok ?? 0);
      const warn = Number(h.warn ?? 0);
      const down = Number(h.down ?? 0);
      if (ok + warn + down === 0) return null;
      up += ok + warn;
      total += ok + warn + down;
      return down > 0 ? 'down' : warn > 0 ? 'warn' : 'ok';
    });
    return { name, days: levels, uptime: formatUptime(up, total), today: levels[STATUS_DAYS - 1] ?? null };
  });
}
