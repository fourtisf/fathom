import type { FastifyPluginAsync } from 'fastify';
import { MODELS, brand } from '@fathom/config';

// Status is 'unknown' until provider health polling lands (Phase 3).
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
      status: 'unknown' as const,
    })),
  }));
};
