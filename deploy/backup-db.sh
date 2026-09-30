#!/usr/bin/env bash
# Dump the Noxsea PostgreSQL database to /var/backups/noxsea, gzip it, keep the newest 14.
# Reads DATABASE_URL from the repo-root .env (parsed as KEY=VALUE, never executed).
# Usage (as root, or any user that can write BACKUP_DIR): bash deploy/backup-db.sh
# Restore: gunzip -c /var/backups/noxsea/noxsea-YYYYmmdd-HHMM.sql.gz | psql "$DATABASE_URL"
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR=${BACKUP_DIR:-/var/backups/noxsea}
KEEP=${KEEP:-14}

fail() { printf '!! %s\n' "$*" >&2; exit 1; }

# Same parsing rules as deploy/deploy.sh, but only reads the one key we need.
env_value() {
  local want=$1 line key val
  [ -f .env ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    [[ $line =~ ^[[:space:]]*(#|$) ]] && continue
    [[ $line =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]] || continue
    key=${BASH_REMATCH[2]}
    val=${BASH_REMATCH[3]}
    [ "$key" = "$want" ] || continue
    if [[ $val =~ ^\"(.*)\"$ || $val =~ ^\'(.*)\'$ ]]; then
      val=${BASH_REMATCH[1]}
    else
      val=$(sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' <<<"$val")
    fi
    printf '%s' "$val"
  done < .env
}

DATABASE_URL=${DATABASE_URL:-$(env_value DATABASE_URL)}
[ -n "$DATABASE_URL" ] || fail "DATABASE_URL is not set in $(pwd)/.env"
command -v pg_dump >/dev/null || fail "pg_dump not found (apt-get install postgresql-client)"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

OUT="$BACKUP_DIR/noxsea-$(date +%Y%m%d-%H%M).sql.gz"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

# Prisma-style URLs may carry ?schema=public, which libpq rejects; strip query params it doesn't know.
PG_URL=$(sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//' <<<"$DATABASE_URL")

pg_dump --no-owner --no-privileges --dbname="$PG_URL" | gzip -9 > "$TMP"
mv "$TMP" "$OUT"
chmod 600 "$OUT"

# Keep the newest $KEEP backups; delete only files matching our own naming pattern.
mapfile -t old < <(ls -1t "$BACKUP_DIR"/noxsea-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
for f in "${old[@]}"; do rm -f -- "$f"; done

printf '%s (%s)\n' "$OUT" "$(du -h "$OUT" | cut -f1)"
