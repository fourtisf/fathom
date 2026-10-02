import type { FastifyPluginAsync } from 'fastify';
import { VISION_MODEL } from '@fathom/config';
import { publicTopupConfig } from '../topup';

/** Public runtime config for the web app. */
export const configRoutes: FastifyPluginAsync = async (app) => {
  app.get('/config', async () => {
    const { env, health, provider, search } = app.ctx;
    return {
      chain: env.chain
        ? { id: env.chain.id, name: env.chain.name, rpcUrl: env.chain.rpcUrl, explorerUrl: env.chain.explorerUrl }
        : null,
      models: health.all(),
      webSearch: search !== null,
      tokenCheck: !!app.ctx.crypto?.scanner,
      livePrices: !!app.ctx.crypto?.prices,
      vision: !!provider?.providerModelId(VISION_MODEL.id),
      research: search !== null,
      // Fixed credits per search on top of tokens (0 when the search backend is flat-priced).
      searchCredits: search ? Number(search.feeMicro ?? 0n) / 1_000_000 : 0,
      audit: !!app.ctx.crypto?.sources,
      imageGen: app.ctx.images ? { credits: Number(app.ctx.images.costMicro) / 1_000_000 } : null,
      inference: provider !== null,
      // Only when the server enforces it: a widget without server verification would be theater.
      turnstileSiteKey: env.turnstile.secretKey ? env.turnstile.siteKey : null,
      topup: publicTopupConfig(app.ctx.topup),
    };
  });
};
