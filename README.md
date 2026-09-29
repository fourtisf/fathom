# Fathom

Private AI chat and API on open-weight models. Wallet sign-in, pay-per-message credits on Robinhood Chain, no readable prompts stored.

- **Build spec:** [`CLAUDE.md`](CLAUDE.md)
- **UI source of truth:** [`prototype/fathom.html`](prototype/fathom.html)
- **Brand strings** (name, domain, key prefix, token): `packages/config/src/brand.ts`

## Layout

```
apps/web        Next.js 14 (landing, trust, docs, legal; app shell from Phase 2)
apps/api        Fastify (health, /v1/models; auth, credits and chat in later phases)
packages/config brand, models, pricing, tiers, chain config
packages/db     Prisma schema, migrations, client
deploy/nginx    Nginx site config (access logs off)
```

`apps/indexer` and `contracts/` arrive in Phase 4 (payments).

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

## Production

`pnpm build`, then `pm2 start ecosystem.config.cjs` behind `deploy/nginx/fathom.conf` (TLS via Let's Encrypt).
