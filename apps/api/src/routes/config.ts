import type { FastifyPluginAsync } from 'fastify';

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
      inference: provider !== null,
    };
  });
};
