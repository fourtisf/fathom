import type { FastifyPluginAsync } from 'fastify';
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
      inference: provider !== null,
      // Only when the server enforces it: a widget without server verification would be theater.
      turnstileSiteKey: env.turnstile.secretKey ? env.turnstile.siteKey : null,
      topup: publicTopupConfig(app.ctx.topup),
    };
  });
};
