import type { FastifyPluginAsync } from 'fastify';
import { addressKind } from '@fathom/config';
import { errorBody } from '../errors';
import { ScanInputError } from '../crypto';
import { fixedWindow } from '../ratelimit';
import { ipHash } from '../iphash';

/**
 * Public Token Scanner: the Token Safety Check without a wallet or credits.
 * POST (not GET) so the scanned address never appears in a request line or access log.
 * Rate limited per salted IP hash; results come from the scanner's 5-minute cache when warm.
 */

const CHAIN_RE = /^[a-z]{2,20}$/;
export const SCAN_RATE_PER_MIN = 10;
export const SCAN_RATE_PER_DAY = 150;
const SCAN_TIMEOUT_MS = 25_000;

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post('/scan', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const scanner = app.ctx.crypto?.scanner;
    if (!scanner) return reply.status(503).send(errorBody(503, 'The token scanner is unavailable right now.', 'scanner_unavailable'));

    const b = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
    const address = typeof b.address === 'string' ? b.address.trim() : '';
    const chain = typeof b.chain === 'string' && CHAIN_RE.test(b.chain) ? b.chain : 'auto';
    if (!addressKind(address)) {
      return reply
        .status(400)
        .send(errorBody(400, 'Paste a token address: 0x… for EVM chains, or a Solana mint address.', 'invalid_address'));
    }

    const who = await ipHash(app.ctx, request.ip, 'scan');
    const day = new Date().toISOString().slice(0, 10);
    const [min, daily] = await Promise.all([
      fixedWindow(app.ctx.redis, `scan:${who}`, SCAN_RATE_PER_MIN, 60),
      fixedWindow(app.ctx.redis, `scan-day:${day}:${who}`, SCAN_RATE_PER_DAY, 86_400),
    ]);
    if (!min.ok || !daily.ok) {
      const retry = !min.ok ? min.retryAfter : daily.retryAfter;
      return reply
        .header('retry-after', String(retry))
        .status(429)
        .send(errorBody(429, !min.ok ? 'Too many scans. Wait a minute and try again.' : "You've reached today's free scans. Try again tomorrow.", 'rate_limited'));
    }

    try {
      const report = await scanner.scan(address, AbortSignal.timeout(SCAN_TIMEOUT_MS), chain);
      return { report };
    } catch (err) {
      if (err instanceof ScanInputError) return reply.status(400).send(errorBody(400, err.message, err.code));
      request.log.warn({ err }, 'public scan failed');
      return reply.status(502).send(errorBody(502, "Couldn't read this address right now. Try again in a moment.", 'scan_failed'));
    }
  });
};
