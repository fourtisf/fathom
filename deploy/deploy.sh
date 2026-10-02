#!/usr/bin/env bash
# Pull, migrate, build and (re)start Noxsea on the VPS. Run from anywhere: bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only
pnpm install --frozen-lockfile

# Export the repo-root .env so Prisma sees DATABASE_URL and Next inlines NEXT_PUBLIC_* at build time.
# Parsed as plain KEY=VALUE (same rules as ecosystem.config.cjs), never executed: values may contain
# spaces or JSON without quoting.
load_env() {
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    [[ $line =~ ^[[:space:]]*(#|$) ]] && continue
    [[ $line =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue
    key=${BASH_REMATCH[2]}
    val=${BASH_REMATCH[3]}
    if [[ $val =~ ^\"(.*)\"$ || $val =~ ^\'(.*)\'$ ]]; then
      val=${BASH_REMATCH[1]}
    else
      val=$(sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' <<<"$val")
    fi
    export "$key=$val"
  done < .env
}
[ -f .env ] && load_env

pnpm --filter @fathom/db exec prisma generate
pnpm --filter @fathom/db exec prisma migrate deploy
# On-device voice input: fetch the Whisper model once (skipped when already there; never fails the deploy).
node apps/web/scripts/fetch-voice-model.mjs
# Everything except the web app builds in place (the running API keeps its loaded bundle).
pnpm --filter './packages/*' --filter './apps/api' build
# The web app builds into a separate folder while the live site keeps serving the old build, then the
# two are swapped right before the reload. Building over .next in place deletes the CSS/JS the live
# pages point to, and anyone visiting mid-deploy gets an unstyled page.
rm -rf apps/web/.next-new
NEXT_DIST_DIR=.next-new pnpm --filter @fathom/web build
rm -rf apps/web/.next-prev
if [ -d apps/web/.next ]; then mv apps/web/.next apps/web/.next-prev; fi
mv apps/web/.next-new apps/web/.next
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

sleep 3
curl -fsS -o /dev/null http://127.0.0.1:3200/ && echo "web ok"
curl -fsS http://127.0.0.1:4200/health && echo " api ok"
