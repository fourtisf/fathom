// PM2 process file. Build first: `pnpm build`, then `pm2 start ecosystem.config.cjs`.
module.exports = {
  apps: [
    {
      name: 'fathom-web',
      cwd: 'apps/web',
      script: 'pnpm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      name: 'fathom-api',
      cwd: 'apps/api',
      script: 'dist/server.js',
      env: { NODE_ENV: 'production', API_PORT: 4000, API_HOST: '127.0.0.1' },
      kill_timeout: 12000, // longer than the API's 10s graceful shutdown
    },
  ],
};
