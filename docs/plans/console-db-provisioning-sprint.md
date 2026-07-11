# Console Database Unification & Provisioning Sprint (M-DB.0 + Milestone-3 DB Picker)

**Audience:** a junior implementer agent. **Every decision is pre-made. Make none yourself.** Undecidable → `docs/plans/db-blockers.md`, don't guess.
**Status:** PREREQUISITE for the identity sprint (`docs/plans/identity-and-provisioning-sprint.md`). The identity layer seeds users into the console DB — but today the console DB is (a) hardwired to the libsql client (can't talk to D1) and (b) never provisioned by deploy. Fix that first.
**Repo:** `frontbase-framework`. **Packages touched:** `@frontbase/backend` (console store → DbRunner), `@frontbase/compiler` (deploy-time D1 provisioning), `@frontbase/builder` (Milestone-3 DB picker UI). No new packages (A-14).
**Author:** Architecture, 2026-07-10.

---

## 0. The problem, stated precisely (read the code first)

**Two facts verified in the codebase:**
1. `packages/backend/src/db/store.ts` — `ConsoleStore.create(url)` does `createClient({ url })` (the `@libsql/client`). It is **hardwired to libsql**. That client speaks `:memory:`, `file:` (Docker SQLite), and `libsql://` (Turso) — but **NOT Cloudflare D1** (D1 has no libsql interface; it's a binding or a REST API).
2. `packages/compiler/src/cli/deploy.ts` + the scaffold `wrangler.toml` provision **no database at all** — no `[[d1_databases]]` binding, no `dbUrl` wired. A fresh CF deploy has no console DB.

**The elegant fix (already 80% built):** `packages/edge-infra/src/providers/types.ts` defines `DbRunner { query(sql,params), exec(sql,params) }`, and **all four adapters already implement it** — `d1DataProvider`, `tursoDataProvider`, `postgresDataProvider`, `sqliteDataProvider` (verified in `providers/cloud.ts` + `sqlite.ts`). The console store just doesn't *use* it. Switch `ConsoleStore` to consume a `DbRunner` and it speaks all four uniformly — and D1 becomes the natural CF default.

**Adapters that EXIST:** D1, Turso, Postgres (Neon), SQLite. **Supabase does NOT exist** in the framework (the product repo had `SupabaseRestProvider`; it was never ported). The Milestone-3 UI must only offer adapters that exist; Supabase is a **separate future port**, listed as "coming soon," not wired.

---

## DECISIONS ALREADY MADE (junior chooses nothing)

| # | Decision | Value |
|---|---|---|
| B1 | Console DB seam | `ConsoleStore` takes a **`DbRunner`** (from edge-infra), NOT a URL. A thin `sqliteRunner(url)` helper preserves the `:memory:`/`file:`/`libsql://` path for tests + Docker. |
| B2 | CF default DB | **D1**. `frontbase deploy` (CF target, not --dry-run) provisions a D1 database via `wrangler d1 create`, writes the `[[d1_databases]]` binding into `wrangler.toml`, and wires the console to a **D1 `DbRunner`** built from the binding. |
| B3 | D1 for the console | The console uses D1 through the SAME `DbRunner` the public-data `d1DataProvider` already uses (REST or binding). One D1 database, one binding (`DB`), shared by public data + console. |
| B4 | Docker default DB | **SQLite file** (`file:./data/frontbase.db`) via `sqliteRunner`. No external service. This is the WordPress-simple path. |
| B5 | Migrations across all | `migrateUp` already runs raw SQL via a `Client`; refactor it to run via `DbRunner.exec` so migrations work on D1/Turso/Postgres/SQLite identically. **SQL must be portable** (the existing DDL is; keep it ANSI-ish). |
| B6 | Provisioning is idempotent | `wrangler d1 create` only if no binding exists in `wrangler.toml`; re-running deploy reuses the existing D1. Never creates a second DB. |
| B7 | Milestone-3 picker options | **D1 (default), Turso, Postgres, SQLite** — the four that exist. **Supabase shown as "coming soon" (disabled).** Selecting a type + entering credentials writes them as deploy secrets and rebuilds the console's `DbRunner`. |
| B8 | Credentials never leak | DB credentials (Turso token, Postgres URL) stored as CF secrets / Docker env — never in `wrangler.toml`, git, or a response/log. A no-leak gate. |
| B9 | edge-infra is the adapter home | Any DB adapter the console uses is edge-infra's (`buildDataProvider`/`DbRunner`). The console NEVER hand-rolls a driver (RULE 6 — one source of truth). |
| B10 | Worker entry shape | The scaffold `worker.ts` is a **fetch-handler object** with a lazy, env-bound, cached `getEngine(env)` — NOT `export default engine`. This is mandatory for CF D1 (binding lives in `env`). See BLOCKER-1. |

---

## GOLDEN RULES 1–8 all apply (see the Phase 2 + Phase 3 plans). This touches DB access + secrets — RULE 1 (no-leak), RULE 2 (tenant predicate unchanged), RULE 3 (copies), RULE 4 (opaque errors), RULE 8 (mutation-prove).

**Record Decision A-19 (Console DB Unification & CF D1 Default)** in `docs/DECISIONS.md` summarizing B1–B9 before M-DB.0 closes.

---

## ⚠️ VERIFIED BLOCKERS (read before touching code — these were confirmed in the codebase 2026-07-10)

These are the exact reasons the console does not yet run on CF. The steps below fix each. Do NOT deviate.

**BLOCKER-1 — CF D1 bindings live in per-request `env`, but the console is built at MODULE-INIT.**
The scaffold `worker.ts` is `export default engine` — `createEngine`/`createConsole` run once at module load. A Cloudflare **D1 binding only exists inside `env`, which the runtime passes per request** (`export default { fetch(req, env, ctx) }`). So you **cannot** build a D1-backed console at init — there is no `env` yet.
- **FIX (decision B10):** the scaffold `worker.ts` becomes a **fetch-handler object**, not a bare engine: `export default { async fetch(req, env, ctx) { const engine = getEngine(env); return engine.fetch(req, env, ctx); } }` where `getEngine(env)` **lazily builds + caches** the engine on first request (module-scoped `let cached`). The D1 `DbRunner` is built from `env.DB` inside `getEngine`. Non-CF hosts (Node/Docker) pass a synthetic `env` with a `dbUrl`. **edge-core is NOT changed** — `engine.fetch` already accepts `(req, env, ctx)` (Hono signature); the wrapper just defers construction.
- **Console env access:** `createConsole` currently builds its store from `deps.dbUrl` at init. Change it to accept a **`makeRunner: (tenant) => Promise<DbRunner>`** (or a ready `DbRunner`), called lazily inside `storeFor` — so the runner can come from the per-request `env.DB`. The lazy `storeFor` cache already exists; just make its factory env-aware.

**BLOCKER-2 — `createConsole` takes `dbUrl` (libsql-only) and `resolvePrincipal` is REQUIRED with no `sessionSecret`.**
`CreateConsoleDeps = { resolvePrincipal, dbUrl, ... }` — `dbUrl` hardwires libsql (no D1), and there is no `sessionSecret` for the identity sprint to issue sessions against.
- **FIX (B1 + identity D2):** `CreateConsoleDeps` becomes `{ makeRunner, resolvePrincipal?, sessionSecret?, ... }`. `dbUrl` stays as a **convenience** that builds `sqliteRunner(dbUrl)` (Docker/tests unchanged). If `resolvePrincipal` is omitted but `sessionSecret` is given, build it from `createResolvePrincipal({ jwtSecret: sessionSecret, jwtCookie: 'fb_session' })` (this is the identity-sprint seam — land the field now, wire login in M-ID.1).

**BLOCKER-3 — `deploy.ts` only runs `wrangler deploy`; it provisions nothing.**
Confirmed: the live-deploy branch is `execFile('wrangler', ['deploy'])` — no `d1 create`, no binding write.
- **FIX (B2/B6):** before `wrangler deploy` (CF target, not `--dry-run`), run the new `provisionD1(cwd)` step: if `wrangler.toml` has no `[[d1_databases]]`, `execFile('wrangler', ['d1','create', '<name>-db'])`, parse the `database_id` from stdout, append the `[[d1_databases]] binding="DB", database_id="..."` block to `wrangler.toml`, then `wrangler d1 migrations` is NOT used (we run migrations in-worker on first boot via `migrateUp` on the D1 runner). Idempotent (B6).

**BLOCKER-4 (identity sprint dependency) — first-boot migration + seed must run inside the lazy `getEngine(env)`**, because that's the only place `env.DB` exists. `migrateUp(runner)` + `seedOwner` run there, guarded by a module-scoped `initialized` flag so they run once per isolate. Note this in the identity plan's ID.1.6.

---

# Milestone M-DB.0 — Unify the console on DbRunner + CF D1 provisioning (PREREQUISITE)

**Goal:** the admin dashboard runs on any adapter (D1 default on CF, SQLite file on Docker) through one seam; deploy provisions D1 automatically. **Target: Week 1. Do this BEFORE the identity sprint.**

### File map
```
packages/edge-infra/src/providers/
└── runners.ts              # NEW — sqliteRunner(url) + d1RunnerFromBinding(binding) → DbRunner (thin; reuse cloud.ts logic)
packages/backend/src/db/
├── store.ts                # EDIT — ConsoleStore.create(runner: DbRunner) instead of (url); no createClient
├── migrations.ts           # EDIT — migrateUp/Down/appliedVersions run via DbRunner.exec/query, not Client
└── users.ts (etc.)         # unaffected — they call this.client → change to this.runner
packages/compiler/src/cli/
├── deploy.ts               # EDIT — CF target: wrangler d1 create + write binding + wire console D1 (B2/B6)
└── provision-d1.ts         # NEW — the d1 provisioning helper (idempotent; parses/writes wrangler.toml)
packages/backend/src/index.ts  # EDIT — createConsole gains `runner: DbRunner` (replaces dbUrl); keeps dbUrl as a convenience that builds sqliteRunner
```

### Step-by-step
**DB.0.1 — Runner helpers (`edge-infra/providers/runners.ts`).** `sqliteRunner(url)` wraps `@libsql/client` as a `DbRunner` (the current ConsoleStore logic, extracted). `d1RunnerFromBinding(binding)` / `d1RunnerFromRest(opts)` reuse `cloud.ts`'s D1 logic as a `DbRunner`. Gate `edge-infra/test/runners.mjs`: each runner does a `CREATE/INSERT/SELECT` round-trip (SQLite live; D1 credential-gated per A-17).

**DB.0.2 — Migrations on DbRunner (`migrations.ts`).** Refactor `migrateUp/migrateDown/appliedVersions/schemaFingerprint` to take a `DbRunner`. Keep the existing DDL (portable). Gate: the existing migration test (apply/rollback/re-apply converges) passes on the SQLite runner; add a D1-credential-gated run.

**DB.0.3 — ConsoleStore on DbRunner (`store.ts`).** `ConsoleStore.create(runner, tenant)` — drop `createClient`; all `this.client.execute` → `this.runner.query/exec`. Keep a `ConsoleStore.fromUrl(url, tenant)` convenience that builds `sqliteRunner(url)` so tests/Docker are unchanged. **RULE 2 unchanged:** every SQL keeps its `WHERE tenant_slug = ?`. Gate: all existing `backend` suites (console/authz/publish/errors) pass on the runner; **the mutation harness's tenant-predicate mutation still goes RED** (RULE 8 — the isolation guarantee survives the refactor).

**DB.0.4 — CF D1 provisioning (`deploy.ts` + `provision-d1.ts`, B2/B6).** On `frontbase deploy` (CF, not dry-run): if `wrangler.toml` has no `[[d1_databases]]`, run `wrangler d1 create <app>-db`, capture the `database_id`, append the binding (`binding = "DB"`), and set the scaffold worker to build `d1RunnerFromBinding(env.DB)`. Idempotent (B6). Gate `compiler/test/provision-d1.mjs`: with a mocked wrangler, a fresh project gets a `d1 create` + a written binding; a second run reuses it (no second create); the binding name is `DB`.

**DB.0.5 — Scaffold wiring (the lazy env-bound worker — BLOCKER-1/B10).** Scaffold `worker.ts` becomes:
```ts
import { createEngine, directProvider } from '@frontbase/edge-core';
import { createConsole } from '@frontbase/backend';
import { d1RunnerFromBinding, sqliteRunner } from '@frontbase/edge-infra';
import { manifest } from './manifest.edge.js';

let cached: ReturnType<typeof createEngine> | null = null;
function getEngine(env: any) {
  if (cached) return cached;
  // CF: env.DB is the D1 binding. Docker/dev: env.DB_URL is a file: URL.
  const makeRunner = async () => env.DB ? d1RunnerFromBinding(env.DB) : sqliteRunner(env.DB_URL ?? 'file:./data/frontbase.db');
  const console = createConsole({ makeRunner, sessionSecret: env.SESSION_SECRET, queries });
  cached = createEngine({ manifest, data: directProvider(manifest), environment: 'edge', console });
  return cached;
}
export default { async fetch(req: Request, env: any, ctx: any) { return getEngine(env).fetch(req, env, ctx); } };
```
The Docker/dev scaffold passes `env.DB_URL='file:./data/frontbase.db'`. Update the `wrangler.toml` template to include the `[[d1_databases]]` block (written by `provisionD1`, or a commented placeholder pre-provision). **RULE 5:** an end-to-end test scaffolds a `--full` project and builds it with this worker shape (a `deploy --dry-run` composes it). **Verify `engine.fetch(req, env, ctx)` accepts the 3-arg Hono signature (it does — no edge-core change).**

### M-DB.0 acceptance gates
- [ ] `ConsoleStore` runs on a `DbRunner` (via `makeRunner`); all backend suites green on SQLite; D1 runner round-trips (credential-gated).
- [ ] `createConsole` accepts `{ makeRunner, sessionSecret?, resolvePrincipal? }`; the lazy env-bound worker builds the D1 runner from `env.DB` on first request (BLOCKER-1 fixed).
- [ ] Migrations run via DbRunner; apply/rollback/re-apply converges on SQLite + (gated) D1; first-boot `migrateUp` runs inside `getEngine(env)` once per isolate.
- [ ] `frontbase deploy` (CF) provisions D1 idempotently (`d1 create` + `[[d1_databases]]` binding write), reuses on re-run.
- [ ] Docker/dev path uses a SQLite file with no external service.
- [ ] **Tenant-predicate mutation still RED after the refactor (RULE 8); no-leak on DB credentials (RULE 1).**
- [ ] All prior suites + `pnpm -r test:mutation` green. **A-19 recorded.**
- [ ] **DEPLOYABILITY PROOF (the point of this milestone):** a `deploy --dry-run` composes the lazy-worker artifact; the routing smoke boots `getEngine({DB_URL:':memory:'})` and serves `/api/console/health` 200 + an unauth `/api/console/pages` 401. (The real `wrangler deploy` to a live URL is the user's manual step — but the artifact + local boot must pass.)

---

# Milestone-3 Addition — DB Picker in the Setup Wizard

**Goal:** the browser setup wizard (identity M-ID.3) lets the admin choose the console DB backend. **Depends on M-DB.0 + identity M-ID.3.** Fold into the identity M-ID.3 milestone.

### Decisions (B7 applies)
- The wizard's DB step offers: **D1 (default, pre-filled on CF), Turso, Postgres, SQLite (file)**. **Supabase: shown, disabled, "coming soon."**
- Selecting D1 (CF): nothing to enter — uses the provisioned binding. Selecting Turso/Postgres: fields for URL + token → stored as secrets → the worker rebuilds its `DbRunner` from `buildDataProvider(env)`.
- The wizard writes the choice + credentials, then runs `migrateUp` on the chosen runner before seeding the first admin.

### Step-by-step
**M3.DB.1 — Wizard DB step (`builder/src/setup/DbStep.tsx`).** A React step: radio (D1/Turso/Postgres/SQLite; Supabase disabled) + conditional credential fields. Posts to `POST /api/console/setup/db {driver, credentials}`. RULE 1: browser code, no edge-infra import (no-leak gate extended).
**M3.DB.2 — Setup DB API (`backend/routes/setup.ts`).** `POST /setup/db`: validates the driver + credentials by building the `DbRunner` and running a probe `SELECT 1`; on success stores the config (secrets) and runs `migrateUp`; on failure opaque `400 db_connection_failed` (RULE 4 — never echo the driver error). Only callable pre-init (no users yet). **RULE 8:** a mutation making it accept an unreachable DB (skip the probe) → a "bad credentials rejected" assertion goes RED.
**M3.DB.3 — provider registry surfaced.** `buildDataProvider(env)` (edge-infra, exists) is the single place driver→runner mapping lives (B9). The wizard/API never hand-roll a driver.

### Milestone-3 DB acceptance gates
- [ ] Wizard offers the 4 real adapters; Supabase disabled/"coming soon."
- [ ] Selecting a driver + valid credentials probes, stores as secrets, migrates, seeds — end to end (RULE 5).
- [ ] Bad credentials → opaque failure; probe-skip mutation RED (RULE 8); credentials never leak (RULE 1).

---

## Sequencing

**M-DB.0 FIRST** (prerequisite) → then the identity sprint (M-ID.1 → M-ID.2) → then M-ID.3 with the DB-picker addition folded in. The identity work assumes a provisioned, DbRunner-based console DB — M-DB.0 delivers exactly that.

**Future (not this sprint):** the **Supabase adapter** — port `../Frontbase-/services/edge/src/storage/SupabaseRestProvider.ts` into an edge-infra `DbRunner`; then flip it from "coming soon" to enabled in the wizard. One adapter, behind the seam M-DB.0 establishes.

## Quick reference
```bash
pnpm -r build && pnpm -r test && pnpm -r test:mutation
# new gates: edge-infra/test/runners.mjs · compiler/test/provision-d1.mjs · backend (existing, on runner)
```
