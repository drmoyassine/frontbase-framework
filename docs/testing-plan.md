# Frontbase Framework — Testing Plan

**Date:** 2026-07-13 · **Scope:** everything in `frontbase-framework` as it stands today (Phases 0-2 + the CF-18 admin-console arc: 3a/3b/3c + two follow-up sprints).

This is a practical, run-it-yourself plan across three tiers: **automated** (what CI already proves), **credential-gated** (automated but needs your accounts/keys), and **manual** (things only a human clicking through the app can verify). Each section says exactly what to run and what "pass" looks like.

---

## Tier 1 — Automated (no credentials, run right now)

This is the bulk of the safety net. Every package has its own `test` + `test:mutation` script; the root aggregates them.

### 1.1 Full workspace pass

```bash
pnpm -r build          # must be clean before testing (tests import from dist/)
pnpm -r test            # ~57+ suites across 6 packages
pnpm -r test:mutation   # proves the security/correctness gates fire RED when broken
```

**Expect:** all green. Credential-gated suites inside this run **self-skip** (print a skip line, exit 0) — they don't fail, they just don't exercise the live path. You'll see lines like:
```
(postgres-datasource: credential-gated — set POSTGRES_URL to run)
postgres-datasource: SKIP (no creds) ⏭️
```
That's expected, not a gap.

### 1.2 Per-package breakdown (if something fails, narrow to here)

| Package | What it proves | Command |
|---|---|---|
| `edge-core` | Engine renders byte-identically edge/proxy/draft; workflow engine executes real graphs; tenant scoping on the eSSR path | `pnpm --filter @frontbase/edge-core test` |
| `compiler` | Zod extraction, manifest assembly, CLI (`init`/`check`/`lint`/`simulate`/`deploy`), SW emitter, agent success-rate (18/18), perf budgets | `pnpm --filter @frontbase/compiler test` |
| `edge-infra` | DbRunner contract (SQLite/D1/Turso/Supabase/Postgres), auth, vault crypto, cache, rate limiting, cross-tenant isolation, no-leak | `pnpm --filter @frontbase/edge-infra test` |
| `backend` | Console API, default-deny auth, migrations (v1-v6), publish pipeline, Phase 2/3 features (automations/storage/provisioning/data-studio/plans/limits/durable execution) | `pnpm --filter @frontbase/backend test` |
| `builder` | Canvas model, drag/drop perf (<100ms), preview↔published parity, no-leak | `pnpm --filter @frontbase/builder test` |
| `admin-console` | SPA bundle carries no server code (RULE 1) | `pnpm --filter @frontbase/admin-console test` |

### 1.3 Mutation gates (the "does the test actually test anything" check)

```bash
pnpm -r test:mutation
```

Each package deliberately breaks one of its own security/correctness guarantees and asserts the test suite catches it (goes RED). **Expect:** every gate reports "N/N gates proven RED on break." Currently: backend 8/8, builder 1/1, admin-console 1/1, plus edge-core/compiler/edge-infra gates. If a gate reports fewer proofs than expected, a test regressed into a false-positive — that's a real bug in the test, not the feature.

### 1.4 Single-worker deploy artifact (size + composition)

```bash
pnpm --filter @frontbase/example-cf-full smoke
```

Builds the entire CMS (engine + console + admin SPA + D1 runner) into one `dist/worker.mjs`, then boots it in-process against an in-memory SQLite runner and exercises: public page render, `/sw.js` handover, `/console` SPA shell, health check, default-deny on `/me`, login → session cookie, wrong-password rejection, idempotent re-seed.

**Expect:** `10/10 checks PASS`, worker size **< 1024 KB gzip** (currently ~390 KB). This is your pre-deploy gate — if this fails, don't deploy.

---

## Tier 2 — Credential-gated automated tests

Same test files as Tier 1, but with real external services wired in. They already run as part of `pnpm -r test` — setting these env vars just un-skips the live assertions. Best done in a scratch/dev environment, never against production data.

### 2.1 Cloud database runners (`edge-infra` + `backend`)

```bash
# D1 (via REST API — no CF Worker needed)
export D1_ACCOUNT_ID=<your-cf-account-id>
export D1_DATABASE_ID=<a-test-d1-db-id>
export D1_API_TOKEN=<cf-api-token-with-d1-scope>

# Turso
export TURSO_URL=libsql://<your-db>.turso.io
export TURSO_TOKEN=<turso-auth-token>

# Supabase (covers supabaseRunner + the F5c provisioner)
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_KEY=<service-role-key>
# optional: SUPABASE_JWT, SUPABASE_SCHEMA

# Postgres / Neon
export POSTGRES_URL=<neon-or-supabase-pooler-connection-string>

pnpm --filter @frontbase/edge-infra test    # runners.mjs, providers.mjs, isolation.mjs go live
pnpm --filter @frontbase/backend test        # postgres-datasource.mjs, supabase-provisioning.mjs, storage-live.mjs, provisioning-live.mjs go live
```

**What this proves beyond Tier 1:**
- The identical parameterized tenant-isolation suite (A-17) passes on real D1/Turso/Postgres, not just SQLite.
- `supabaseRunner` executes real SQL over PostgREST.
- The F5c Supabase provisioner does real `CREATE SCHEMA` / `DROP SCHEMA CASCADE` DDL and cleans up after itself — **check your Supabase project afterward for orphaned `frontbase_*` schemas** if a run crashes mid-test (best-effort cleanup, not guaranteed under a hard kill).
- `storage-live.mjs` needs `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` / `STORAGE_ENDPOINT` / `STORAGE_BUCKET` (R2 or S3) — round-trips real bytes, then deletes.
- `provisioning-live.mjs` needs `CF_ACCOUNT_ID` / `CF_API_TOKEN` — creates and deletes a real CF KV namespace (cheapest resource, used as the probe).

**Setup for Supabase's SQL execution functions** (required before `supabaseRunner`/Data-Studio queries work): see `docs/guides/supabase-setup.md` §3 — you must create `execute_query`/`execute_sql` Postgres functions in your project first.

### 2.2 QStash durable dispatch (backend)

```bash
export QSTASH_TOKEN=<upstash-qstash-token>
export QSTASH_CALLBACK_SECRET=<a-shared-secret-you-pick>

pnpm --filter @frontbase/backend test    # durable-execution-live.mjs goes live
```

Proves the redelivery dispatcher actually enqueues against Upstash.

### 2.3 Cost/quota note

D1/KV/Vectorize creation and Supabase schema DDL are essentially free at test volumes, but QStash and sustained Postgres connections may accrue small costs on paid tiers. Use free-tier/sandbox accounts.

---

## Tier 3 — Manual (human-in-the-loop)

Nothing here is automatable without a browser-driving harness the project doesn't have yet. Do this after Tier 1 is green.

### 3.1 Local smoke — admin console, no deploy needed

```bash
pnpm --filter @frontbase/example-cf-full build
cd examples/cf-full
node dist/smoke.mjs    # same as the Tier-1 smoke, but you can also boot it interactively:
```

For a real click-through, run the compiler's dev simulate server (needs `@hono/node-server`, see below) or deploy to a real Worker (§3.3) — `smoke.mjs` itself is headless/non-interactive.

### 3.2 `simulate --serve` — local interactive render

```bash
npm i -D @hono/node-server   # optional peer dep, only needed for --serve
npx @frontbase/compiler simulate <manifest-path> --serve --port 3000
```

Open `http://localhost:3000` and click through pages in each provider mode (`--provider direct|proxy|draft`) — visually confirm they render identically.

### 3.3 Live Cloudflare deploy — the real end-to-end check

This is the one that proves the whole thing works in production, not just in-process.

```bash
cd examples/cf-full
# wrangler.toml needs a REAL D1 database_id — create one:
wrangler d1 create frontbase-full-cms
# paste the returned database_id into wrangler.toml [[d1_databases]] (don't commit it — see below)

wrangler secret put SESSION_SECRET      # any random 32+ byte string
wrangler secret put ADMIN_EMAIL         # e.g. you@example.com
wrangler secret put ADMIN_PASSWORD      # a real password — this logs you into /console

wrangler deploy
```

**⚠️ git hygiene:** `wrangler.toml` ships a placeholder `database_id` in the repo. After pasting your real one for local deploy, run `git restore examples/cf-full/wrangler.toml` before committing anything — don't let your real D1 ID land in a commit.

**Then click through, in order:**

| # | What to check | Where |
|---|---|---|
| 1 | Public page renders | `https://<your-worker>.workers.dev/` |
| 2 | SW handover — nav to a second page, confirm `rendered-by=service-worker` in devtools/response, no edge round-trip on subsequent navs | any internal link |
| 3 | Login | `/console` → log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| 4 | Dashboard loads | `/console/dashboard` |
| 5 | **Pages** — visual WYSIWYG canvas: add a component from the palette, edit its properties, see the live preview update, save draft, publish, confirm the published page renders the change | `/console/pages` |
| 6 | **Tenants** — create a new tenant, confirm a temp password is shown once | `/console/tenants` |
| 7 | **Automations** — React Flow canvas: drag a node, connect an edge, save, run, watch execution history flip to `completed` | `/console/automations` |
| 8 | **Edge Resources** — create a `database`/`cache`/`vector` resource (needs CF creds configured on the worker — `provisioning` deploy config), confirm status flips to `provisioned`, delete it, confirm de-provisioning (check the CF dashboard that the KV/D1/Vectorize resource is actually gone, not just the row) | `/console/edge` |
| 9 | **File Storage** — create a bucket, upload a file (needs `storage` deploy config for real bytes), download it back, delete it, confirm the object is gone from R2 (not just the console list) | `/console/storage` |
| 10 | **Settings/Variables** — add a secret variable, confirm it's masked in the list, confirm a plaintext setting is not | `/console/settings` |
| 11 | **App Users** — invite a user, confirm the temp password shows once, change their role, delete them | `/console/users` |
| 12 | **Data Studio** — connect a datasource (sqlite/turso/d1/supabase/postgres), browse its tables, run a read-only `SELECT`, confirm a non-SELECT query is rejected | `/console/data-studio` |
| 13 | **Plans** — create a plan with a `pages` limit of 1, publish a 2nd new page as a tenant on that plan, confirm it's rejected with a clear "limit reached" message (not a raw 500) | `/console/plans` + `/console/pages` |
| 14 | Logout works and re-visiting `/console` redirects to login | `/console` |

### 3.4 Durability check (optional, harder to trigger manually)

Genuinely exercising isolate eviction isn't practical by hand. The closest manual proxy: start a long automation run, then immediately hit the worker with unrelated traffic for a minute, and confirm the execution still completes (check `/console/automations` execution history). If you want to actually validate the recovery sweep, that's really a Tier-2 automated concern (`durable-execution.mjs` already does this deterministically) — treat this manual step as a sanity spot-check, not primary coverage.

### 3.5 Cross-browser / responsive spot-check (admin console)

The console is React SPA — no framework-level responsive/browser-matrix testing exists yet. If this matters for your rollout, manually check:
- Chrome/Firefox/Safari desktop — layout, WYSIWYG canvas, React Flow editor all usable.
- A phone-width viewport — sidebar collapses, forms are usable (no dedicated mobile design pass has been done; treat any breakage found here as a new backlog item, not a regression).

---

## Suggested cadence

| When | Run |
|---|---|
| **Every commit / PR** | Tier 1 (§1.1) — already fast, no creds needed |
| **Before a release / deploy** | Tier 1 + Tier 2 if you maintain persistent test-service creds (§2) + cf-full smoke (§1.4) |
| **After deploying to a real Worker** | Tier 3 §3.3 full click-through (§3.3 table) |
| **When touching storage/provisioning/durable-execution code specifically** | Re-run the matching Tier 2 live gate before merging — those code paths have no other way to catch a live-API contract drift |

## What this plan does NOT cover (known gaps, not silently assumed)

- **No load/perf testing** beyond the micro-benchmarks already in `compiler/test/perf.mjs` (extractor p50, render p50) and the builder canvas-perf test. No concurrency/soak testing exists.
- **No cross-browser automated testing** (Playwright/Cypress etc. — not present in this repo).
- **F8b Stripe billing** is deferred/unbuilt — nothing to test yet.
- **The QStash redelivery path is thin by design** (§ durable-execution architecture notes) — it proves enqueue, not a full crash-and-recover cycle against a live worker; `durable-execution.mjs` (Tier 1) is the actual correctness proof for recovery logic.
