#!/usr/bin/env bash
# Pull, migrate, build and (re)start Noxsea on the VPS. Run from anywhere: bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile

# Export the repo-root .env so Prisma sees DATABASE_URL and Next inlines NEXT_PUBLIC_* at build time.
set -a; [ -f .env ] && . ./.env; set +a

pnpm --filter @fathom/db exec prisma generate
pnpm --filter @fathom/db exec prisma migrate deploy
pnpm build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

sleep 3
curl -fsS -o /dev/null http://127.0.0.1:3200/ && echo "web ok"
curl -fsS http://127.0.0.1:4200/health && echo " api ok"
