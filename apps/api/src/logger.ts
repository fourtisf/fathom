import { randomUUID } from 'node:crypto';
import type { FastifyServerOptions } from 'fastify';

/**
 * Logging rules (CLAUDE.md §0):
 *  1. Never log prompts or completions: no bodies, no query strings, no error messages
 *     (JSON parse errors echo the raw body in their message).
 *  3. Never log IPs: no headers, no remoteAddress, no X-Forwarded-For.
 * Serializers are allow-lists; `redact` is defense in depth for anything logged ad hoc.
 */

type Loggable = { method?: string; url?: string; id?: unknown; routeOptions?: { url?: string } };

export function stripQuery(url: string | undefined): string | undefined {
  return url?.split('?')[0]?.split('#')[0];
}

const REDACT_KEYS = [
  'body',
  'messages',
  'prompt',
  'completion',
  'content',
  'input',
  'ip',
  'ips',
  'remoteAddress',
  'headers',
  'authorization',
  'cookie',
];

export const redactPaths = [
  ...REDACT_KEYS,
  ...REDACT_KEYS.map((k) => `*.${k}`),
  'req.headers',
  'req.body',
  'headers["x-forwarded-for"]',
  '*.headers["x-forwarded-for"]',
];

export const serializers = {
  req(req: Loggable) {
    return {
      method: req.method,
      url: req.routeOptions?.url ?? stripQuery(req.url),
      id: req.id,
    };
  },
  res(res: { statusCode?: number }) {
    return { statusCode: res.statusCode };
  },
  err(err: Error & { code?: string; statusCode?: number }) {
    return {
      type: err.name,
      message: '[omitted]',
      code: err.code,
      statusCode: err.statusCode,
      // Stack frames only: the first line is the message, which may contain user content.
      stack: err.stack?.split('\n').slice(1).join('\n') ?? '',
    };
  },
};

export interface LoggerOptions {
  level?: string;
  /** Destination for log lines (tests capture into memory). Defaults to stdout. */
  stream?: { write(msg: string): void };
}

export function fastifyLoggingOptions(opts: LoggerOptions = {}): Pick<
  FastifyServerOptions,
  'logger' | 'genReqId' | 'requestIdHeader'
> {
  return {
    logger: {
      level: opts.level ?? 'info',
      serializers,
      redact: { paths: redactPaths, remove: true },
      ...(opts.stream ? { stream: opts.stream } : {}),
    },
    // Never trust a client-supplied request id header; generate our own.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  };
}
