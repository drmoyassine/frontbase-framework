# Sprint — F5c Option A (Supabase schema provisioning) + F3b-durable (durable async dispatch)

**Date:** 2026-07-13 · **Owner:** (assign) · **Source ledger:** [`phase-3-consolidated-delivery.md`](../phase-3-consolidated-delivery.md) · **Decisions:** [`f5c-supabase-provisioning-DECISION.md`](./f5c-supabase-provisioning-DECISION.md) (Option A chosen)

Two independent tracks, one sprint. **F5c-A** closes the last design-gated follow-up; **F3b-durable** closes the last open engineering follow-up. Do them in order (S1 → S2); each track is self-contained and commits independently.

## How to work this sprint

- **One task = one commit.** Top-to-bottom.
- **Every task ships a test** wired into `packages/backend/package.json` `"test"` (or the package's own script) in run order. Credential-gated tests self-skip (print skip line, `process.exit(0)`) so CI stays green.
- **Build before test:** `pnpm --filter @frontbase/<pkg> build`, then run the node test (tests import from `dist/`).
- **Full gate before each commit:** `pnpm -r test` (all-green) + `pnpm -r test:mutation` (RED-on-break intact) + `pnpm --filter @frontbase/example-cf-full smoke` (< 1 MB gzip).
- **GOLDEN RULES.** RULE 1: server code in `edge-infra`/`backend`, never browser-imported. RULE 2: every store query filters `tenant_slug`; routes behind `defaultDenyAuth`. RULE 4: opaque error codes.
- **Secrets:** `git restore examples/cf-full/wrangler.toml` before every commit (real `database_id` is local-only; repo ships a placeholder).
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Gotchas (bit us before):** test `req(method, path, body)` helpers JSON-stringify `body` — pass a **raw object**, not `{ body: {...} }`. libsql file URLs on Windows need `file:` + forward slashes. A stub/provider whose method fires a real `fetch` then hits `process.exit(0)` can abort non-zero on Windows (libuv) — keep network calls out of no-op paths.

---

# TRACK S1 — F5c Option A: Supabase schema-per-resource provisioning

**Model (from the decision memo):** the operator configures ONE host Supabase project (`url` + `serviceKey`). Each edge resource of kind `database` → a dedicated Postgres **schema** (`frontbase_<slug>`); `vector` → a schema with `pgvector` + a vectors table. "Provision" = `CREATE SCHEMA`; "de-provision" = `DROP SCHEMA CASCADE`. **No Management API / PAT** — pure SQL over the service key, reusing `supabaseRunner`.

### S1.1 — Rewrite `supabaseProvisioner` for schema-per-resource

**File:** `packages/edge-infra/src/provisioning/supabase.ts` (full rewrite)

Change the opts shape (the old stub used a Management PAT `accessToken`; Option A uses the service key so it can run SQL):
```ts
export interface SupabaseProvisionerOpts {
    /** Host Supabase project URL: https://<ref>.supabase.co */
    url: string;
    /** Service role key for the host project (runs schema DDL). */
    serviceKey: string;
    /** Schema-name prefix (default 'frontbase_'). */
    schemaPrefix?: string;
}
```

Reuse `supabaseRunner` (already in this package) to execute DDL — its `exec()` runs arbitrary SQL through the `execute_sql` RPC, which is exactly what we need for `CREATE SCHEMA` / `DROP SCHEMA`. Import it from the sibling module:
```ts
import { supabaseRunner } from '../providers/runners.js';
import type { Provisioner, ProvisionResult } from './cloudflare.js';
```

Implement:
- `handles(kind)` → `kind === 'database' || kind === 'vector'`.
- `schemaName(name)` → `${prefix}${slug(name)}` where `slug` lowercases + replaces non-alphanumerics with `_` and trims. **Reject an empty/degenerate slug** (throw before running DDL — an empty schema name is a footgun; mirror the tenant-slug guard in `routes/tenants.ts`).
- `create(kind, name)`:
  - build `runner = supabaseRunner({ url, serviceKey })` (lazy — build once at factory scope, not per call).
  - `database`: `await runner.exec('CREATE SCHEMA IF NOT EXISTS "<schema>"')`.
  - `vector`: `CREATE SCHEMA IF NOT EXISTS "<schema>"` then `CREATE EXTENSION IF NOT EXISTS vector` then `CREATE TABLE IF NOT EXISTS "<schema>".vectors (id TEXT PRIMARY KEY, embedding vector(768), metadata JSONB)`. (768-dim to match the CF Vectorize default from P2-c — consistent cross-provider.)
  - return `{ provisioned: true, remoteId: schema, info: { provider: 'supabase', kind } }`.
  - on any error → let it throw; the route maps to opaque `provisioning_failed` (already wired in `phase2.ts`).
- `remove(kind, remoteId)`: `await runner.exec('DROP SCHEMA IF EXISTS "<remoteId>" CASCADE')` (remoteId IS the schema name).
- Keep a **`validateConnection()`** helper (rename from `validateToken`) that runs `SELECT 1` via the runner — for the credential-gated test + a "are these creds good?" check. Do NOT call it inside `create()` (network-in-no-op → Windows exit gotcha does not apply here since create does real work, but keep create focused on DDL).

Update the file header: remove the "stub / open question" language; document Option A + the shared-host-project noisy-neighbor caveat.

**⚠️ Escalate-if:** `supabaseRunner.exec` requires the `execute_sql` Postgres function to exist in the host project (documented in `docs/guides/supabase-setup.md`). Provisioning inherits that prerequisite — note it in the header + the guide. If a cleaner DDL path exists (direct PostgREST), it's a follow-up; `execute_sql` is the consistent seam today.

### S1.2 — Export shape unchanged, wire into `createConsole`

**Files:** `packages/edge-infra/src/index.ts` (export already there — no change), `packages/backend/src/index.ts`.

Add an optional dep so a host can enable Supabase provisioning:
```ts
/** Supabase host-project config (F5c Option A). When provided, edge-resource
 *  create provisions a Postgres schema (database) / pgvector schema (vector). */
supabaseProvisioning?: { url: string; serviceKey: string; schemaPrefix?: string };
```
Composition with the existing CF provisioner: **mutually exclusive is fine for v1** — if both CF and Supabase are configured, CF wins (it's the platform-native path) and Supabase is ignored with a one-time `console.warn`. Simpler than a composite; revisit only if a real need appears. Build the provisioner:
```ts
const provisioner: Provisioner =
    deps.provisioner
    ?? (deps.provisioning ? cloudflareProvisioner(deps.provisioning)
        : deps.supabaseProvisioning ? supabaseProvisioner(deps.supabaseProvisioning)
        : noopProvisioner);
```
Import `supabaseProvisioner` alongside the others. Build backend clean.

### S1.3 — Test: `packages/backend/test/supabase-provisioning.mjs` (REWRITE)

The old test asserted the stub contract (`handles=false`). Rewrite for Option A:
- **Non-gated contract checks (always run):** `handles('database') === true`, `handles('vector') === true`, `handles('cache') === false`. A degenerate name (e.g. `'!!!'`) → `create` throws (guard).
- **Credential-gated live checks** on `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (mirror `test/runners.mjs`): build the provisioner, `create('database', 'sprint probe <rand>')`, assert `provisioned && remoteId`. Then verify the schema exists (`supabaseRunner` `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`). Then `remove('database', remoteId)` and assert it's gone. Same for `vector` (also assert the `vectors` table + `vector` extension). **Always clean up** (drop the schema) even on assertion failure.
- Route-level: inject `supabaseProvisioner` via the `provisioner` seam (added in P2-c) into `createConsole`, `PUT /edge-resources/vec1 {kind:'vector',...}`, assert `provisioned:true` + status `provisioned`, then `DELETE` and assert `remove` ran (the de-provision path from P2-c already calls it). Use a **spy wrapper** around the real provisioner so the route test doesn't need live creds — wrap `supabaseProvisioner`-shaped mock that records create/remove, OR reuse the existing mock pattern from `provisioning.mjs`. (The live DDL is covered by the gated block; the route wiring is covered by the mock.)

Wire into the backend `"test"` script (it's already there — just ensure the rewritten file runs). Self-skip cleanly when creds absent.

**Commit:** `feat(provisioning): F5c Option A — Supabase schema-per-resource provisioning`

### S1.4 — Docs

**Files:** `docs/guides/supabase-setup.md` (add a "Provisioning from the console" section: host-project model, the `execute_sql` prerequisite, the shared-quota caveat, the `frontbase_<slug>` schema convention, DROP CASCADE on delete). Update the DECISION memo status line to **✅ A chosen + shipped**.

**Commit:** `docs: Supabase console-provisioning guide (F5c Option A)`

---

# TRACK S2 — F3b-durable: durable async workflow dispatch

**Problem:** F3b async dispatch uses `ctx.waitUntil(work())`. If the isolate is evicted mid-run, the `workflow_executions` row stays `status='running'` forever — a lie, and the run is lost. **Durable** = after a crash/restart the system reconciles: stuck runs are detected and **re-run** (not just failed), and completion is idempotent so a late original + a recovery run can't double-complete.

**Key enabler:** re-running needs the original **input**, which we don't persist today. So: persist input (migration v6), add a recovery sweep that replays stuck runs, make completion idempotent, and run recovery on boot.

### S2.1 — Migration v6: persist execution input

**File:** `packages/backend/src/db/migrations.ts` (append v6 — never edit a shipped migration)
```ts
{
    version: 6,
    name: 'execution_input',
    up: [`ALTER TABLE workflow_executions ADD COLUMN input TEXT`],
    down: [
        // SQLite can't DROP COLUMN pre-3.35 portably across D1/Turso; recreate the table.
        `CREATE TABLE workflow_executions_v5 (id TEXT NOT NULL, tenant_slug TEXT NOT NULL, workflow_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', trigger TEXT, result TEXT, error TEXT, started_at TEXT NOT NULL, ended_at TEXT, PRIMARY KEY (id, tenant_slug))`,
        `INSERT INTO workflow_executions_v5 (id, tenant_slug, workflow_id, status, trigger, result, error, started_at, ended_at) SELECT id, tenant_slug, workflow_id, status, trigger, result, error, started_at, ended_at FROM workflow_executions`,
        `DROP TABLE workflow_executions`,
        `ALTER TABLE workflow_executions_v5 RENAME TO workflow_executions`,
    ],
}
```
Update `test/migrations.mjs`: bump the rollback count to **6** and the applied-versions array to `[1,2,3,4,5,6]`. Update `schema.ts` `workflowExecutions` with the `input` column.

**Build + `node test/migrations.mjs`** — apply/rollback/re-apply must converge (the recreate-table down path is the fiddly bit; verify the fingerprint matches).

**Commit:** `feat(db): migration v6 — persist workflow execution input (durable re-run enabler)`

### S2.2 — Store: persist input, idempotent complete, list stuck

**File:** `packages/backend/src/db/phase2-store.ts`
- `createExecution(id, workflowId, trigger, now, input?)` — add `input` param; store `JSON.stringify(input ?? {})` in the new column.
- `completeExecution` — make it **idempotent / guarded**: only update rows still `running`:
  ```ts
  `UPDATE workflow_executions SET status=?, result=?, error=?, ended_at=? WHERE id=? AND tenant_slug=? AND status='running'`
  ```
  (So a recovery re-run that finishes after the original — or vice-versa — can't clobber a terminal row.)
- `listStuckExecutions(cutoffIso, limit=50)` — returns `running` rows with `started_at < cutoffIso`, **across all tenants** (recovery is a system op; SELECT `id, tenant_slug, workflow_id, input`). This is the one legitimately cross-tenant read (like login) — comment it as such.
- `getExecution(id)` if needed for tests.

### S2.3 — Recovery sweep in the route factory

**File:** `packages/backend/src/routes/phase2.ts`
- Export a `recoverStuckExecutions` function (or add to the factory) that: for each stuck row, load its workflow (`getWorkflow`), parse the persisted `input`, and re-run via the SAME `runAndRecord` helper. If the workflow no longer exists → `completeExecution(..., 'error', null, 'workflow_deleted', now)`. Guard so recovery of an execution whose original ISN'T actually dead is still safe (idempotent complete handles the race).
- `createExecution` calls now pass `input`.
- Threshold: default cutoff = **now − 5 min** (a run older than the CF wall-clock limit is presumed dead). Make it a param for the test.

### S2.4 — Boot hook: run recovery on engine assembly

**Files:** `packages/backend/src/index.ts` (createConsole) + `examples/cf-full/src/worker.ts`.
- In `createConsole`, after stores are built, if a `dispatcher` is configured, kick a **one-shot recovery** on first boot: `dispatcher(() => recoverAll(phase2StoreFor, cutoff))` where `recoverAll` sweeps `listStuckExecutions` and re-runs each. (Reuse the dispatcher so on CF it rides `ctx.waitUntil` of the first request; in tests it's controllable.) Keep it best-effort + opaque on error.
- Add a **master-admin route** `POST /automations/_recover` that triggers the sweep on demand (behind `requireRole('master_admin')`), returning `{ recovered: n }` — useful operationally + directly testable without fiddling boot timing.

### S2.5 — QStash durable-delivery dispatcher (the distributed path, credential-gated)

**File:** `packages/edge-infra/src/queue/providers.ts` (extend) OR a small new `dispatchers.ts`.
- Add `qstashDispatcher(opts: { token: string; runUrl: string }): (work) => void` — **note the honest limitation:** a `work: () => Promise<void>` closure can't be serialized to QStash. The durable-delivery model instead needs QStash to call back an HTTP endpoint. So this dispatcher's real job is to **enqueue a re-run request** (`POST {runUrl}` with `{ executionId }` + a signed header) that the worker's own `/automations/_recover` (or a dedicated `/_run`) endpoint services. Document that QStash provides *at-least-once redelivery of the recovery trigger*; the recovery sweep (S2.3) does the actual idempotent re-run.
- Keep this **thin + credential-gated**; the core durability (persisted input + recovery sweep + idempotent complete) is what's fully tested locally. QStash is the "don't even rely on the next request to boot recovery" upgrade.

### S2.6 — Tests

**File:** `packages/backend/test/durable-execution.mjs` (NEW) — all local, no creds:
1. **Input persisted:** dispatch async, read the execution row, assert `input` column holds the JSON.
2. **Idempotent complete:** complete a running execution twice; second call is a no-op (status/ended_at unchanged; assert result isn't overwritten by a second `completeExecution` with different args).
3. **Recovery re-runs a stuck run:** insert a `running` execution with `started_at` well in the past + a valid workflow + persisted input; call the recovery sweep; assert the row flips to `completed` with a real result (the engine ran).
4. **Recovery of a deleted workflow:** stuck `running` row whose workflow is gone → recovery marks it `error` = `workflow_deleted` (not stuck forever).
5. **Recovery is idempotent with a late original:** simulate the original completing AFTER recovery already completed it — the guarded `completeExecution` leaves the terminal row intact (no double-complete, no error).
6. **`POST /automations/_recover`:** master-admin → `{ recovered: n }`; non-master → 401/403.

**File:** `packages/backend/test/durable-execution-live.mjs` (NEW, credential-gated on `QSTASH_TOKEN`) — build `qstashDispatcher`, assert it enqueues (mock the runUrl endpoint or just assert the QStash publish call shape). Self-skip without the token.

Wire both into the backend `"test"` script after `async-execution.mjs`.

**Commits (S2, in order):**
- `feat(db): migration v6 — persist workflow execution input (durable re-run enabler)` (S2.1)
- `feat(backend): F3b-durable — recovery sweep + idempotent completion for stuck executions` (S2.2–S2.4 + S2.6 local test)
- `feat(dispatch): F3b-durable — QStash redelivery dispatcher (credential-gated)` (S2.5 + live test)

---

## Final acceptance for the whole sprint

- `pnpm -r test` — all green (new gated tests self-skip without creds).
- `pnpm -r test:mutation` — unchanged, all RED-on-break. **Add a mutation proof** for the guarded `completeExecution` (remove the `AND status='running'` guard → the idempotent-complete test must go RED). Wire into `backend/test/mutation.mjs`.
- `pnpm --filter @frontbase/example-cf-full smoke` — 10/10, worker < 1 MB gzip (qstash + supabase paths are optional/dynamic; confirm `@upstash/qstash` is in the cf-full OPTIONAL stub list — it already is).
- Update the ledger (`phase-3-consolidated-delivery.md` + `phase-3-followups-delivery.md`): **F5c → CLOSED** (Option A shipped); **F3b-durable → CLOSED**. New "total to close": only **F8b Stripe** remains (deferred). That means: **zero open engineering follow-ups.**
- Update `MILESTONES.md` parallel-track note accordingly.

## Escalate to senior (do not guess)

- If Supabase DDL over `execute_sql` fails in a way that suggests a different provisioning path is needed (S1.1 escalate-if).
- If migration v6's down-path (table recreate) doesn't converge on D1/Turso (SQLite dialect quirk) — the apply path is safe; the down path is the risk.
- QStash callback authentication model (signature verify vs shared secret) if S2.5 is taken past the thin enqueue — the `/_run` endpoint must not be trigger-able by randoms.
