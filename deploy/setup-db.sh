#!/usr/bin/env bash
# One-time (re-runnable) setup of PostgreSQL + Redis for Noxsea on Ubuntu.
# Finds the running Postgres cluster and its port, creates the noxsea user/database with a fresh
# random password, writes DATABASE_URL and REDIS_URL into the repo-root .env and checks both.
# Usage (as root): bash deploy/setup-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=${ENV_FILE:-.env}

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n!! %s\n' "$*" >&2; exit 1; }

step "Installing PostgreSQL and Redis (skipped if present)"
if ! command -v pg_lsclusters >/dev/null || ! command -v redis-server >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql redis-server
fi
systemctl enable --now redis-server >/dev/null 2>&1 || true
systemctl enable postgresql >/dev/null 2>&1 || true

step "Finding the PostgreSQL cluster"
online_port() { pg_lsclusters -h | awk '$4 == "online" { print $3; exit }'; }
if [ -z "$(pg_lsclusters -h)" ]; then
  ver=$(ls /usr/lib/postgresql | sort -V | tail -1)
  echo "No cluster found; creating $ver/main"
  pg_createcluster "$ver" main --start
fi
if [ -z "$(online_port)" ]; then
  read -r ver name _ < <(pg_lsclusters -h | head -1)
  echo "Starting cluster $ver/$name"
  pg_ctlcluster "$ver" "$name" start || true
  sleep 2
fi
PORT=$(online_port)
[ -n "$PORT" ] || { pg_lsclusters; fail "PostgreSQL is not running. Check the log shown above (Log file column)."; }
pg_lsclusters
echo "Using PostgreSQL on port $PORT"

step "Creating database user and database 'noxsea'"
PASS=$(openssl rand -hex 24)
psql_admin() { sudo -u postgres psql -p "$PORT" -v ON_ERROR_STOP=1 -qtA "$@"; }
if [ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname='noxsea'")" = 1 ]; then
  psql_admin -c "ALTER USER noxsea WITH PASSWORD '$PASS';"
else
  psql_admin -c "CREATE USER noxsea WITH PASSWORD '$PASS';"
fi
if [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='noxsea'")" != 1 ]; then
  psql_admin -c "CREATE DATABASE noxsea OWNER noxsea;"
fi

step "Writing DATABASE_URL and REDIS_URL to $ENV_FILE"
touch "$ENV_FILE" && chmod 600 "$ENV_FILE"
sed -i '/^DATABASE_URL=/d;/^REDIS_URL=/d' "$ENV_FILE"
DB_URL="postgresql://noxsea:$PASS@127.0.0.1:$PORT/noxsea"
printf 'DATABASE_URL=%s\nREDIS_URL=redis://127.0.0.1:6379\n' "$DB_URL" >> "$ENV_FILE"

step "Checking connections"
PGPASSWORD=$PASS psql -h 127.0.0.1 -p "$PORT" -U noxsea -d noxsea -qtAc 'SELECT 1' >/dev/null \
  && echo "PostgreSQL: ok" || fail "Could not log in to PostgreSQL as noxsea on 127.0.0.1:$PORT"
[ "$(redis-cli -h 127.0.0.1 ping 2>/dev/null)" = PONG ] && echo "Redis: ok" || fail "Redis is not answering on 127.0.0.1:6379 (systemctl status redis-server)"

printf '\nDone. Now run: bash deploy/deploy.sh\n'
