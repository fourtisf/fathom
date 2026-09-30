#!/usr/bin/env bash
# Pull, build and (re)start Noxsea on the VPS. Run from anywhere: bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

sleep 3
curl -fsS -o /dev/null http://127.0.0.1:3200/ && echo "web ok"
curl -fsS http://127.0.0.1:4200/health && echo " api ok"
