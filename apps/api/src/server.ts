import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = await buildApp({ env });

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting down');
  const timer = setTimeout(() => process.exit(1), 10_000).unref();
  try {
    await app.close();
    clearTimeout(timer);
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'shutdown failed');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error({ err }, 'failed to start');
  process.exit(1);
}
