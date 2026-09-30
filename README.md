# Noxsea

Noxsea (https://noxsea.xyz) is the product name; the spec in CLAUDE.md still uses the working name "Fathom", and internal package names stay `@fathom/*`.

Private AI chat and API on open-weight models. Wallet sign-in, pay-per-message credits in USDG on Robinhood Chain, no prompts or answers logged or stored in readable form.

- **Build spec:** [`CLAUDE.md`](CLAUDE.md)
- **UI source of truth:** [`prototype/fathom.html`](prototype/fathom.html)
- **Brand strings** (name, domain, key prefix, token, social links): `packages/config/src/brand.ts`

## Layout

```
apps/web        Next.js 14 (landing, trust, docs, legal, app)
apps/api        Fastify (auth, credits, chat, OpenAI-compatible /v1, top-up indexer)
packages/config brand, models, pricing, tiers, chain config
packages/db     Prisma schema, migrations, client
deploy/         Nginx config (access logs off), deploy, database, hardening and backup scripts
```

## Local setup

Requires Node 22, pnpm 10, PostgreSQL 16 and Redis 7.

```sh
pnpm install
cp .env.example .env          # fill in DATABASE_URL etc.
pnpm db:generate
pnpm --filter @fathom/db deploy   # apply migrations
pnpm dev:web                  # http://localhost:3000
pnpm dev:api                  # http://localhost:4000/health
```

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Deploy (Ubuntu 24.04 VPS)

Run as root from the repo checkout:

1. `bash deploy/setup-db.sh` — installs PostgreSQL and Redis if missing, creates the `noxsea` database with a fresh password and writes `DATABASE_URL` / `REDIS_URL` into `.env`. Re-runnable (it rotates the DB password).
2. Fill in the rest of `.env` (see below).
3. `bash deploy/deploy.sh` — pull, install, migrate, build, `pm2 startOrReload`, then health checks. Web runs on 127.0.0.1:3200, API on 127.0.0.1:4200; Nginx (`deploy/nginx/noxsea.conf`) proxies to them, TLS via `certbot --nginx`.
4. `bash deploy/harden.sh` — ufw (OpenSSH, 80, 443; SSH is always allowed before enabling), unattended-upgrades, fail2ban (sshd jail), pm2-logrotate (10M, keep 7) and a daily 03:17 database backup cron. Idempotent. If PM2 runs under another user: `PM2_USER=deploy bash deploy/harden.sh`. It does not change SSH config; switch to key-only login yourself.

### Backups

`bash deploy/backup-db.sh` dumps the database from `DATABASE_URL` in `.env` to `/var/backups/noxsea/noxsea-YYYYmmdd-HHMM.sql.gz` (mode 600) and keeps the newest 14. Cron log: `/var/log/noxsea-backup.log`. Restore with `gunzip -c <file> | psql "$DATABASE_URL"`. Copy backups off the server regularly.

## Environment

All config lives in the repo-root `.env` (template: `.env.example`), read by PM2 for both apps and exported by `deploy.sh` at build time.

| Group | Variables |
|---|---|
| Database / cache | `DATABASE_URL`, `REDIS_URL` |
| Auth | `SIWE_DOMAIN`, `COOKIE_SECURE`, `WEB_ORIGIN`, optional Cloudflare Turnstile keys |
| Chain | `CHAIN_ID`, `CHAIN_NAME`, `RPC_URL`, `EXPLORER_URL`, `USDG_ADDRESS` (verify against Robinhood's docs) |
| Top-ups | `TREASURY_ADDRESS`, `INDEXER_CONFIRMATIONS`, `TOPUP_MIN_USD` |
| Inference | `INFERENCE_PROVIDER` (`openrouter`, `tinfoil`, `openai-compatible`, `mock`, or empty = chat off), `INFERENCE_API_KEY`, `INFERENCE_BASE_URL`, `INFERENCE_MODEL_MAP`, `INFERENCE_EXTRA_BODY` |
| Web search | `BRAVE_SEARCH_API_KEY` (empty = web search off) |
| Web build | `NEXT_PUBLIC_WC_PROJECT_ID`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` + `NEXT_PUBLIC_PLAUSIBLE_SRC` (both set = self-hosted Plausible script; otherwise no analytics), `API_INTERNAL_URL` (default `http://127.0.0.1:4200`) |

`NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.

## Privacy model

What is true today (the site copy must match this; see `/trust`):

- **No content logs.** Prompts and completions are never written to logs, the database, Redis, error trackers or analytics. Request bodies are excluded from every logger, and `apps/api/test/no-logging.test.ts` fails if any log line contains message content, IPs or keys. Nginx access logs are off.
- **In transit, not end-to-end.** The browser sends prompts over HTTPS to our server, which relays them over HTTPS to the inference provider. The server sees them in memory while relaying; they are not encrypted to the model.
- **Provider.** With `INFERENCE_PROVIDER=openrouter`, requests are restricted to upstream providers with `data_collection: deny` and zero-data-retention endpoints (`zdr`). This is a provider policy, not hardware attestation. `tinfoil` (confidential computing) is supported by the adapter; showing its attestation on `/trust` is still to be wired.
- **Saved history** (optional) is encrypted in the browser with a key derived from the wallet signature; the server stores only ciphertext. Burn timers delete chats automatically.
- **No IPs linked to wallets.** IPs are only used, hashed, in short-lived Redis rate-limit counters.
- **Payments.** Top-ups are plain USDG transfers to the treasury, credited after confirmations. No custom contract holds funds. `$NOX` and staking are planned and not deployed.
