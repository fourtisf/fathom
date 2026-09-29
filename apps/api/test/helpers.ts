import { buildApp } from '../src/app';
import { loadEnv } from '../src/env';

/** Builds the app with every log line captured in memory. */
export async function buildCapturingApp(level = 'info') {
  const lines: string[] = [];
  const app = await buildApp({
    env: loadEnv({ NODE_ENV: 'test' }),
    logger: { level, stream: { write: (msg: string) => void lines.push(msg) } },
  });
  return { app, lines };
}
