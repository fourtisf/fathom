// PM2 process file. Build first (`pnpm build`), then `pm2 startOrReload ecosystem.config.cjs`.
// Ports avoid 3000/4000 so they don't clash with other apps on the same VPS; Nginx proxies to them.
const fs = require('node:fs');
const path = require('node:path');

const WEB_PORT = 3200;
const API_PORT = 4200;

/** Tiny KEY=VALUE parser for the repo-root .env (no dependency). Missing file → {}. */
function loadDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = value;
  }
  return out;
}

const dotenv = loadDotEnv(path.join(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'noxsea-web',
      cwd: path.join(__dirname, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${WEB_PORT} -H 127.0.0.1`,
      env: { ...dotenv, NODE_ENV: 'production' },
      max_memory_restart: '600M',
    },
    {
      name: 'noxsea-api',
      cwd: path.join(__dirname, 'apps/api'),
      script: 'dist/server.js',
      env: {
        WEB_ORIGIN: 'https://noxsea.xyz',
        SIWE_DOMAIN: 'noxsea.xyz',
        ...dotenv,
        NODE_ENV: 'production',
        API_PORT,
        API_HOST: '127.0.0.1',
      },
      kill_timeout: 12000, // longer than the API's 10s graceful shutdown
      max_memory_restart: '400M',
    },
  ],
};
