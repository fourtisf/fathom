# Fathom: Build Spec for Claude Code

Private AI chat and API on open-weight models. Users sign in with a wallet, pay per message with credits bought in USDG (or USDC/ETH, auto-swapped) on Robinhood Chain, and no prompt is ever stored in readable form.

**Source of truth for UI/UX:** `prototype/fathom.html`. It is a single-file prototype with every screen, state and interaction. Match its look, copy, layout and flows. Everything in it that is simulated (wallet, transactions, attestation, model answers, numbers, contract addresses) must become real.

> "Fathom" is a working name. Keep all brand strings (name, domain, key prefix `fth_`, token `$FTHM`) in one config file so they can be renamed in one place.

---

## 0. Non-negotiable rules

1. **Never log prompts or completions.** Not in app logs, error trackers, Nginx access logs, Redis, DB, analytics, or crash dumps. Request bodies to `/v1/chat/*` and the chat websocket must be excluded from every logger. Add a test that fails if any logger receives message content.
2. **Never store readable chat content.** Saved history is client-side encrypted (key derived from the wallet signature). The server only stores ciphertext it cannot decrypt.
3. **Never log IP addresses** linked to a wallet. Strip `X-Forwarded-For` from logs; Nginx `access_log off` for app and API routes (or a format with no IP).
4. **Failed or unavailable requests are never charged.** Charge credits only after a successful model response.
5. **Credits are integers in the DB** (store micro-credits: 1 credit = 1,000,000 units) to avoid float errors.
6. **$FTHM is a utility token.** No revenue share, yield, or profit language anywhere in UI or contracts.
7. Remove the **"Prototype controls"** panel from production. Recreate its edge cases as real states driven by real errors.

---

## 1. Stack (use the existing house stack)

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind. Port the prototype's CSS tokens (colors, radii, shadows, gradients) into Tailwind theme + a small global CSS file |
| Wallet | wagmi + viem, RainbowKit or custom modal matching the prototype. SIWE (EIP-4361) for auth |
| Backend API | Fastify (TypeScript) |
| DB | PostgreSQL via Prisma |
| Cache / rate limit / sessions | Redis |
| Contracts | Solidity + Foundry, deployed to Robinhood Chain |
| Indexer | Small Node worker (viem `watchContractEvent`) that credits users on `CreditsPurchased` events |
| Hosting | Hostinger VPS, PM2, Nginx (TLS via Let's Encrypt) |
| Inference | Confidential-computing provider behind an adapter (see §6) |
| Analytics | Self-hosted Plausible or Umami. No Google Analytics, no pixels |

Monorepo layout:
```
apps/web        Next.js (landing, trust, docs, legal, app)
apps/api        Fastify (auth, credits, keys, chat, OpenAI-compatible /v1)
apps/indexer    chain event listener
packages/db     Prisma schema + client
packages/config brand, models, tiers, chain config
contracts/      Foundry project
```

---

## 2. Pages and routes (from the prototype)

| Prototype hash | Next.js route | Notes |
|---|---|---|
| `#/` | `/` | Landing: hero, Why Fathom + comparison table, privacy bento, how it works, models, pricing calculator, API, token (utility), FAQ, CTA |
| `#/trust` | `/trust` | Live attestation, verify-yourself command, encryption steps, contracts table, audits, bug bounty, 90-day status |
| `#/docs` | `/docs` | API docs (quickstart, auth, chat, models, errors, limits, agent wallets, staking) |
| `#/terms`, `#/privacy` | `/terms`, `/privacy` | Draft legal text. Keep the "draft" banner until a lawyer signs off |
| `#/app` | `/app` | Chat (gate when disconnected, onboarding checklist, compare mode, web search, burn timer) |
| `#/app/credits` | `/app/credits` | KPIs, 14-day usage bars, spend by model, transactions with explorer links |
| `#/app/keys` | `/app/keys` | Create (show once), list, revoke with confirm, max 10 |
| `#/app/stake` | `/app/stake` | Balance, staked, tier, progress, stake/unstake (7-day cooldown), tier cards |
| `#/app/settings` | `/app/settings` | Save history toggle, default burn, web search default, export JSON, delete all (type DELETE), disconnect |

Mobile: app uses bottom tab bar (see prototype under 860px).

---

## 3. Auth (SIWE)

- `GET /auth/nonce` → random nonce stored in Redis (5 min TTL).
- `POST /auth/verify` `{message, signature}` → verify with viem, check domain, chain ID, nonce; create/find `User` by address; set httpOnly, Secure, SameSite=Lax session cookie (JWT or Redis session, 7 days).
- On first sign-in grant **25 welcome credits** once per address (idempotent) and record a `Transaction` of type `WELCOME_BONUS`.
- UI states to implement (all shown in prototype): signature rejected, wrong network (banner + Switch network via `wallet_switchEthereumChain` / `wallet_addEthereumChain`), disconnected gate.

---

## 4. Database (Prisma, starting point)

```prisma
model User {
  id           String   @id @default(cuid())
  address      String   @unique // lowercase
  creditsMicro BigInt   @default(0)
  settings     Json     @default("{\"saveHistory\":true,\"defaultBurn\":\"off\",\"webSearch\":false}")
  createdAt    DateTime @default(now())
  apiKeys      ApiKey[]
  txs          Transaction[]
  usage        UsageDaily[]
  chats        EncryptedChat[]
}

model ApiKey {
  id         String    @id @default(cuid())
  userId     String
  name       String
  prefix     String    // e.g. "fth_live_ab12cd" shown in UI
  hash       String    @unique // sha256 of full key; full key never stored
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  revokedAt  DateTime?
  user       User      @relation(fields: [userId], references: [id])
}

model Transaction {
  id          String   @id @default(cuid())
  userId      String
  type        TxType   // WELCOME_BONUS | TOPUP | STAKE | UNSTAKE
  token       String?  // USDG | USDC | ETH
  amountPaid  String?  // decimal string in token units
  creditsMicro BigInt  @default(0)
  txHash      String?  @unique
  status      TxStatus // PENDING | CONFIRMED | FAILED
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
}

model UsageDaily {       // aggregates only, never content
  userId      String
  day         DateTime @db.Date
  model       String
  messages    Int      @default(0)
  creditsMicro BigInt  @default(0)
  @@id([userId, day, model])
}

model EncryptedChat {    // only if user enabled history
  id         String    @id @default(cuid())
  userId     String
  ciphertext Bytes     // encrypted client-side, server cannot read
  iv         Bytes
  burnAt     DateTime? // cron deletes rows past burnAt
  updatedAt  DateTime  @updatedAt
  user       User      @relation(fields: [userId], references: [id])
}
```

Cron (every minute): hard-delete `EncryptedChat` where `burnAt < now()`.

---

## 5. Credits, pricing, tiers

Put these in `packages/config` (values from the prototype):

- 1 USDG = 100 credits.
- Model base cost per average message (credits): DeepSeek V3.1 0.50, Qwen3 235B 0.45, gpt-oss 120B 0.25, Llama 3.3 70B 0.12. **Production must charge by tokens**, using the per-million-token prices on the Models table (input/output: 40/120, 35/110, 20/60, 12/30 credits per 1M tokens). The per-message numbers are only for UI estimates.
- Web search multiplier: ×1.6. Compare mode charges both models separately.
- Staking tiers (discount applied to every charge): Explorer 1,000 FTHM → 10%; Diver 10,000 → 20% + early model access + 300 req/min API; Abyss 50,000 → 30% + early access + 500 free credits/month. Unstake cooldown 7 days.
- Charge flow: estimate → check balance (return 402 / show "Not enough credits", no charge) → run model → compute actual tokens → atomic decrement in a Postgres transaction → update `UsageDaily`.

---

## 6. Inference and privacy architecture

- Build an `InferenceProvider` interface (`chat(stream)`, `models()`, `attestation()`), so the provider can change without touching the app.
- Use a **confidential-computing inference provider** that runs open-weight models on GPUs with confidential computing enabled and exposes a verifiable attestation report. Pick one that supports DeepSeek V3.1, Qwen3 235B, gpt-oss 120B and Llama 3.3 70B (or the closest available) and an OpenAI-compatible API. **Ask ALFA to confirm the provider before integrating**; list 2–3 candidates with pricing and model coverage.
- Encryption: browser encrypts the prompt to the enclave's public key from the attestation (HPKE or the provider's SDK). Our API only relays ciphertext. If the chosen provider can't support end-to-end encryption to the enclave, **tell ALFA** and change the marketing copy ("encrypted before it leaves your screen") to match reality before launch. Copy must never overclaim.
- `/trust` shows the live attestation fields (hardware, measurement, model hash, serving commit, signed time) from `provider.attestation()`, and "Verify again" re-fetches and verifies the signature.
- Model health: poll provider every 30s, store in Redis. Degraded model → show "Degraded" tag in the model menu and the prototype's error card with "Switch to Qwen3 and retry". No charge.
- Web search: server-side through our egress (e.g. Brave Search API) so the user's IP is never sent.

---

## 7. API (OpenAI-compatible)

- `POST /v1/chat/completions`: same body as OpenAI incl. `stream`, `tools`. Extra fields: `compare_with` (second model id), `web_search` (bool).
- `GET /v1/models`: ids `deepseek-v3.1`, `qwen3-235b`, `gpt-oss-120b`, `llama-3.3-70b` with live status.
- `POST /v1/auth/siwe`: exchange a signature for a short-lived session key (agents with their own wallet).
- Auth: `Authorization: Bearer fth_live_…`. Store only sha256 hash. Show full key once.
- Errors: 401 invalid/revoked key, 402 not enough credits (not charged), 429 rate limit with `retry-after`, 503 model unavailable.
- Rate limit (Redis sliding window): 60 req/min per key, 300 for Diver+.

App-internal endpoints (cookie auth): `/me`, `/credits/summary`, `/credits/transactions`, `/keys` (GET/POST/DELETE), `/settings` (GET/PATCH), `/export`, `/data` (DELETE all), `/chats` (encrypted blobs).

---

## 8. Smart contracts (Foundry, Robinhood Chain)

1. **CreditVault**: `buyCredits(uint256 usdgAmount)` pulls USDG (SafeERC20), emits `CreditsPurchased(buyer, usdgAmount, credits)`. Owner withdraw to treasury (multisig). Pausable. ReentrancyGuard.
2. **SwapRouter**: accepts USDC or ETH, swaps to USDG through an existing DEX/aggregator on Robinhood Chain with a user-set `minOut` (slippage), then calls `CreditVault`. If no reliable DEX liquidity exists, **tell ALFA** and ship USDG-only first.
3. **FTHM** token: standard ERC-20 (OpenZeppelin). No fee-on-transfer, no rebase.
4. **StakingTiers**: `stake(amount)`, `requestUnstake(amount)` (starts 7-day cooldown), `withdraw()`. `tierOf(address)` view. **No rewards or yield.**

Requirements: OpenZeppelin libs, 100% branch coverage on vault and staking, fuzz tests for amounts, Slither clean, verified source on the explorer. Deploy to testnet first. External audit before mainnet token launch (the UI already says "In progress").

Chain config (`packages/config/chain.ts`): Robinhood Chain chain ID, RPC URL, explorer URL, USDG address, all from env. **Verify the chain ID and the official USDG address from Robinhood's docs; do not trust the numbers in the prototype.**

Indexer: listen to `CreditsPurchased`, wait for N confirmations, idempotently credit the user by `txHash`, mark `Transaction` CONFIRMED. Failed/reverted tx → FAILED, no credits (matches prototype's "Failed · reverted" row).

---

## 9. Frontend states to implement (all exist in the prototype)

- Disconnected gate, signature rejected, wrong network banner + switch, low credits banner.
- Top-up modal: token tabs (USDG/USDC/ETH), amounts $5/$20/$50/$100, wallet balance, insufficient balance warning with "how to add funds", 3-step progress (Approve → Confirm → Done), failed tx message with retry.
- Getting-started modal (Robinhood Wallet / pay with USDC or ETH / bridge).
- Chat: onboarding checklist, compare mode (two columns), web search tool line, burn selector (off/1h/24h) with notes, forget chat animation, model degraded card, not-enough-credits card, typing effect.
- Keys: show-once modal with copy + warning, revoke confirm.
- Stake: validation messages, cooldown date, tier cards with current highlight.
- Settings: toggles, export JSON download, delete-all with typed DELETE.
- Accessibility: keyboard focus styles, `aria-*` as in prototype, `prefers-reduced-motion`.

---

## 10. SEO and meta

Keep the prototype's `<head>`: title, description, canonical, Open Graph, Twitter card, SVG favicon, JSON-LD. Generate a real 1200×630 `og.png`. Add `sitemap.xml` and `robots.txt` (disallow `/app`).

---

## 11. Environment variables

```
DATABASE_URL=
REDIS_URL=
SESSION_SECRET=
SIWE_DOMAIN=
CHAIN_ID=
RPC_URL=
EXPLORER_URL=
USDG_ADDRESS=
CREDIT_VAULT_ADDRESS=
SWAP_ROUTER_ADDRESS=
FTHM_ADDRESS=
STAKING_ADDRESS=
INDEXER_CONFIRMATIONS=3
INFERENCE_PROVIDER=
INFERENCE_API_KEY=
BRAVE_SEARCH_API_KEY=
PLAUSIBLE_DOMAIN=
```

---

## 12. Build order (ship each phase working end to end)

1. **Foundation:** monorepo, Prisma schema, Fastify skeleton, Next.js with ported design tokens, landing + trust + docs + legal pages as static pages from the prototype.
2. **Auth:** SIWE, sessions, gate, wrong-network handling, welcome credits.
3. **Chat:** provider adapter, streaming, model menu + health, credit charging by tokens, compare mode, web search, burn timer, no-logging test.
4. **Payments:** contracts on testnet, top-up modal wired to CreditVault, indexer, transactions page, credits dashboard.
5. **API:** keys page, `/v1/*` endpoints, rate limits, docs page matches behavior.
6. **Staking:** FTHM + StakingTiers on testnet, stake page, discounts applied to charges.
7. **Hardening:** encrypted history, export/delete, attestation on `/trust`, status page data, SEO, Nginx/PM2 deploy, logging audit.
8. **Mainnet:** only after ALFA approves and the contract audit is done.

## 13. Decisions ALFA must make (ask before building these parts)

1. Final brand name and domain (replaces "Fathom").
2. Confidential inference provider (you present options with cost and model coverage).
3. Whether the $FTHM token launches at all at v1, after legal review.
4. Treasury multisig address for CreditVault withdrawals.
5. Legal review of Terms and Privacy before removing the "draft" banner.

## 14. Definition of done

- Every screen and state in `prototype/fathom.html` exists and looks the same on desktop and mobile.
- A new user can connect, get 25 credits, chat, compare, top up with USDG on testnet, see the transaction, create an API key and call `/v1/chat/completions` with the OpenAI SDK.
- Automated test proves no prompt/completion text reaches any log or DB table.
- Lighthouse ≥ 90 on landing (performance, accessibility, SEO).
