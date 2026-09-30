// PM2 process file. Build first (`pnpm build`), then `pm2 startOrReload ecosystem.config.cjs`.
// Ports avoid 3000/4000 so they don't clash with other apps on the same VPS; Nginx proxies to them.
const path = require('node:path');

const WEB_PORT = 3200;
const API_PORT = 4200;

module.exports = {
  apps: [
    {
      name: 'noxsea-web',
      cwd: path.join(__dirname, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${WEB_PORT} -H 127.0.0.1`,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '600M',
    },
    {
      name: 'noxsea-api',
      cwd: path.join(__dirname, 'apps/api'),
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        API_PORT,
        API_HOST: '127.0.0.1',
        WEB_ORIGIN: 'https://noxsea.xyz',
      },
      kill_timeout: 12000, // longer than the API's 10s graceful shutdown
      max_memory_restart: '400M',
    },
  ],
};
