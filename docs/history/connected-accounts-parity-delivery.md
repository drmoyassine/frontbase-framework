# Connected Accounts — Community-Worker Parity Delivery

**Status:** DELIVERED · **Date:** 2026-08-02 · **Branch:** `main` · **CI:** green (compat-conformance CONFORMS 265 / VIOLATES 0; behavior-gate exit 0)

## Goal

Bring the runtime-portable community worker (`packages/backend/src/compat/`, the cf-full Hono worker — targets Cloudflare, Deno Deploy, Vercel) to parity with the product Python backend (`fastapi-backend/`) for the **Connected Accounts** surface: provider credential testing, account auto-naming, OAuth (Google Sheets), and live resource discovery / creation / engine-import — without breaking the fetch-only runtime-portability invariant (no raw TCP).

## What shipped (commits, in order)

| Commit | Wave | Content |
|---|---|---|
| `914dcd3` | 0 | Provider test-connection **strategy registry** foundation (7 providers) |
| `3b94fba` | 1 | +6 providers + **discovery payloads** (13 total: openai, anthropic, resend, mailgun, ollama, turso + supabase/neon/turso discovery) |
| `3e29df8` | 2 | `/api/cloudflare/connect` + `/api/deno/connect` **account auto-naming** |
| `6b87f15` | 3 | Honest discovery stubs + dropped a garbage-row side effect |
| `c7533b6` | 4 | Google Sheets OAuth `/issue` endpoint completion (table v16 + callback/status already shipped) |
| `f8c671d` | — | Behavior-ledger re-pin after Wave 3/4 (CI behavior-gate fix) |
| `e8557af` | R1 | **Resource strategy registry** + dispatchers (foundation for discovery/create/list-engines) |
| `df3dd23` | R1 | Tier 1 discovery/create/list-engines per provider (8 providers) |
| `bfec267` | — | Behavior-ledger re-pin after resource-discovery wiring |
| `cfe0b10` | R2 | **Opt-in redirect following** with per-hop SSRF re-validation |
| `8d1506d` | R2 | Tier 2 discovery — wordpress* + google_sheets |
| `4b474f4` | R2 | **Per-tenant discovery cache** (60s TTL, invalidate-on-create) + re-pin |

All on `origin/main`. The product repo (`Frontbase-`) was reverted to its pre-session state — no stray changes.

## Final provider parity matrix

| Provider | test | discover | create | list-engines | auto-name |
|---|:--:|:--:|:--:|:--:|:--:|
| cloudflare | ✅ | ✅ d1/kv/r2/queue/vectorize | ✅ d1/kv/queue | ✅ Workers | ✅ |
| supabase | ✅ | ✅ projects+pooler | — | ✅ functions | — |
| vercel | ✅ | ✅ projects+edge-config+blob | — | ✅ projects | — |
| netlify | ✅ | ✅ sites | — | ✅ sites | — |
| deno | ✅ | ✅ apps | — | ✅ apps | ✅ |
| neon | ✅ | ✅ orgs+projects+connection_uri | — | — | — |
| upstash | ✅ | ✅ redis/qstash/vector/search | ✅ redis | — | — |
| turso | ✅ | ✅ stored JSON + live | ✅ turso_db | — | — |
| openai | ✅ | — | — | — | — |
| anthropic | ✅ (x-api-key) | — | — | — | — |
| resend | ✅ | — | — | — | — |
| mailgun | ✅ (Basic+region) | — | — | — | — |
| ollama | ✅ (no-auth) | — | — | — | — |
| wordpress (+rest/+graphql) | ✅ | ✅ (redirect opt-in) | — | — | — |
| wordpress_plugin | — | ✅ (redirect opt-in) | — | — | — |
| google_sheets | OAuth flow | ✅ (redirect opt-in) | — | — | — |
| **postgres / mysql** | ❌ unclosable | ❌ unclosable | — | — | — |

**Closable: 15 account types + Sheets OAuth.** Only generic postgres/mysql remain unclosable (raw TCP wire protocol — no HTTP equivalent; hosted postgres via Supabase/Neon IS closable and shipped).

## Architecture

**Two parallel strategy registries** under `packages/backend/src/compat/routes/edge-providers/strategies/`:

1. **Test strategies** (`types.ts`, `bearer.ts`, `basic.ts`, `custom.ts`, `index.ts`) — credential testing. Auth-family split (Bearer / Basic / custom). `testProvider(provider, creds)` dispatcher. Extended with `parseDiscovery` so test-connection can also surface projects/db_name.

2. **Resource strategies** (`resources/*.ts`, `resources/index.ts`) — discover / createResource / listEngines. One file per provider. `discoverResources` / `createProviderResource` / `listEnginesForProvider` dispatchers; return a product-faithful `{success:false, detail}` for providers lacking the method.

**Route handlers** (`edge-providers.ts`) decrypt the account's stored creds via `p2(tenant).getEdgeResourceConfig(accountId)` (try/catch on cipher failure → graceful error) and delegate to the dispatchers. Tenant isolation via `providerFor(tenant, id)` gate + `getEdgeResourceConfig`'s `WHERE id=? AND tenant_slug=?`.

**guardedExternalFetch** (`external-http.ts`): HTTPS-only, private/loopback/link-local blocked, 10s timeout, `redirect:'manual'` by default (throws on 3xx). Opt-in 4th arg `{followRedirects}` re-validates every hop — used only by Tier 2 (tenant-controlled URLs).

**Discovery cache** (`resources/cache.ts`): per-tenant KV (`settings` table), 60s TTL, read-through on discover, invalidate-on-create (overwrites with expired timestamp since KV has no delete — no orphans).

## Verification

- `tsc -p tsconfig.json`: clean (real emit; conformance imports compiled `dist/`)
- `compat-conformance.mjs`: **CONFORMS 265 / VIOLATES 0** (improved from 262 baseline; +3 sheets ops)
- `compat-conformance.mjs --gate --behavior --behavior-gate`: **exit 0**
- `compat-sync-functional.mjs`: PASS (full sheets OAuth issue→callback→status→replay loop)
- `compat-negative.mjs`, `compat-tenant-matrix.mjs`, `compat-behavior-auth.mjs --gate`: all exit 0
- Differential: 577 cases compared, 0 contract divergence

After every intentional behavior change, `behavior.ledger.json` was re-pinned via `compat-conformance.mjs --dump-ledger` and committed (required for the CI behavior-gate to stay green).

## Security notes

- **Redirect opt-in (R3, Option A):** chosen over an allow-list. Every redirect hop is independently re-validated through `checkedExternalUrl`, so a public URL cannot redirect to a private/internal IP. Residual risk is the pre-existing DNS-rebinding gap (hostname checked as string, not resolved IP) — **not widened** by this change. Only Tier 2 (wordpress/sheets) opts in; Tier 1 fixed-host callers are unaffected.
- **Tenant isolation (RULE 2):** preserved throughout — every query scoped by `tenant_slug`; resource handlers gate on `providerFor(tenant, id)`.
- **Secrets:** `app_password` (WordPress) and `webAppSecret` (Sheets) are never echoed in discovery responses; resolved server-side from the encrypted Connected Account.

## Process lessons

1. **Workflow subagents inherit the launcher's cwd.** A first parallel-workflow round self-reported "complete" but wrote reference code into the wrong repo (product cloud edge) with wrong conventions (`@hono/zod-openapi`, `globalThis` D1) — their verification phases failed silently ("framework repo not present"). Fix: do framework work directly, OR inject absolute framework paths + explicit `cd "<framework>" &&` into every agent prompt. The later rounds (transfer + resource impl) used bulletproof path handling and succeeded.
2. **Never trust a workflow self-report when cwd ≠ target repo** — read `journal.jsonl` and verify against the real gate.
3. **Behavior-ledger re-pin is required for CI**, not optional. After any intentional behavior change, run `--dump-ledger` and commit `behavior.ledger.json`, or the contract workflow's `--behavior-gate` goes red even with `VIOLATES 0`.

## Outstanding (inherent, not gaps)

- **postgres / mysql** — permanently unclosable (raw TCP wire protocol). Hosted postgres via Supabase/Neon is closable and shipped.
- **DNS-rebinding** — pre-existing framework-wide limitation (guard checks hostname string, not resolved IP). Out of scope; would need resolved-IP validation at connect time.
- **Not deployed** — all work is on `origin/main`; the running VPS worker still serves old code until redeployed (deploys are manual per the VPS-deploy workflow; force `--no-cache`).
