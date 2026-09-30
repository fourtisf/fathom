import type { FastifyPluginAsync } from 'fastify';
import { MODELS, brand } from '@fathom/config';

export const modelRoutes: FastifyPluginAsync = async (app) => {
  const ownedBy = brand.name.toLowerCase();
  app.get('/models', async () => ({
    object: 'list' as const,
    data: MODELS.map((m) => ({
      id: m.id,
      object: 'model' as const,
      owned_by: ownedBy,
      context_length: m.contextK * 1024,
      pricing: { input_per_m: m.inputPerM, output_per_m: m.outputPerM },
      status: app.ctx.health.status(m.id),
    })),
  }));
};
