import type { FastifyPluginAsync } from 'fastify';
import { readStatus, type ServiceStatus } from '../status';

const CACHE_MS = 30_000;

/** Public 90-day status for the trust/status page. No auth; cached briefly. */
export const statusRoutes: FastifyPluginAsync = async (app) => {
  let cache: { at: number; services: ServiceStatus[] } | null = null;
  app.get('/status', async (request, reply) => {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      try {
        cache = { at: Date.now(), services: await readStatus(app.ctx) };
      } catch (err) {
        request.log.warn({ err }, 'status read failed');
        if (!cache) return reply.status(503).send({ error: { message: 'Status is unavailable right now', type: 'api_error', code: 'service_unavailable' } });
      }
    }
    return { services: cache.services };
  });
};
