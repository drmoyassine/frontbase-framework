# F5c Option A + F3b-durable — Sprint Delivery Report

**Date:** 2026-07-13 · **Status:** ✅ COMPLETE — zero open engineering follow-ups
**Sprint plan:** [`docs/plans/f5c-a-and-f3b-durable-sprint.md`](./plans/f5c-a-and-f3b-durable-sprint.md)
**Source ledger:** [`docs/phase-3-consolidated-delivery.md`](./phase-3-consolidated-delivery.md)

Two tracks, one sprint. **S1 (F5c Option A)** closed the last design-gated follow-up — Supabase now does *real* schema provisioning, not a stub. **S2 (F3b-durable)** closed the last open engineering follow-up — async workflow execution is now durable (survives isolate eviction). Only **F8b Stripe** remains, and it's deliberately deferred (own task).

---

## 1. Executive summary

| Track | Follow-up | Status | Commit |
|-------|-----------|--------|--------|
| S1 | F5c — Supabase schema-per-resource provisioning | ✅ CLOSED | `60f8b16` |
| S2.1 | Migration v6 — persist execution input | ✅ | `d6211e7` |
| S2.2–S2.4 + S2.6 | F3b-durable recovery sweep + idempotent complete + boot hook + route + test | ✅ CLOSED | _S2 commit_ |
| S2.5 | F3b-durable QStash redelivery dispatcher (gated) | ✅ | _S2.5 commit_ |

**Ledger delta:** F5c CLOSED (was a stub), F3b-durable CLOSED. **Open engineering follow-ups: 0.** Only F8b Stripe stays (deferred — its own task, not stable).

---

## 2. Track S1 — F5c Option A: Supabase schema provisioning

**Model:** one host Supabase project (`url` + `serviceKey`). Each edge resource maps to a dedicated Postgres schema in that project:
- `database` → `CREATE SCHEMA frontbase_<slug>`
- `vector` → schema + `pgvector` extension + a 768-dim `vectors` table (matches the CF Vectorize default from P2-c — consistent embedding dimensions cross-provider)
- de-provision → `DROP SCHEMA CASCADE`

Pure SQL over the service key via `supabaseRunner` (its `execute_sql` RPC runs the DDL). **No Management API / PAT.**

**What changed:**
- **`supabaseProvisioner`** fully rewritten: `opts { url, serviceKey, schemaPrefix? }`; `handles('database'|'vector')`; `slugify` + degenerate-name guard (no empty-schema footgun); `validateConnection()` helper.
- **`createConsole`**: new `supabaseProvisioning` dep; CF wins if both CF + Supabase configured (one-time warn); pre-built `provisioner` injection seam still takes precedence.
- **Test** rewritten: contract (`handles`, degenerate guard) + route wiring via the mock seam + credential-gated live DDL round-trip (create→verify→drop→verify, database + vector).
- **Docs:** "Provisioning from the console" section in `supabase-setup.md` (host-project model, `execute_sql` prerequisite, shared-quota caveat, `frontbase_<slug>` convention, DROP CASCADE).

**⚠️ Carry-forward caveat:** all provisioned schemas share the host project's quota (noisy neighbor). Fine for multi-tenant SaaS on one project; hard isolation needs separate projects.

---

## 3. Track S2 — F3b-durable: durable async dispatch

**Problem:** F3b async dispatch used `ctx.waitUntil(work())`. If the isolate was evicted mid-run, the `workflow_executions` row stayed `running` forever — a lie, and the run was lost. **Durable** = after a crash/restart the system reconciles: stuck runs are detected and **re-played** (not just failed), and completion is idempotent so a late original + a recovery run can't double-complete.

**Load-bearing insight (from reading the code):** re-running needs the original **input**, which wasn't persisted. So the fix is: persist input → add a recovery sweep that replays stuck runs → make completion idempotent → run recovery on boot.

### S2.1 — Migration v6: persist execution input
`ALTER TABLE workflow_executions ADD COLUMN input TEXT`. The down path **recreates the table** (SQLite can't `DROP COLUMN` portably pre-3.35 across D1/Turso) — apply/rollback/re-apply converges (verified). `schema.ts` + `migrations.mjs` updated (6 migrations, `[1..6]` applied).

### S2.2 — Store: input, idempotent complete, stuck list
- `createExecution(..., input?)` persists `JSON.stringify(input ?? {})`.
- **`completeExecution` is guarded** — `WHERE ... AND status = 'running'`. A terminal row can't be clobbered (the mutation proof below proves this has teeth).
- `listStuckExecutions(cutoffIso)` — the one legitimately **cross-tenant** system read (commented as such, like login's email lookup); returns `{id, tenantSlug, workflowId, input}` for replay.
- `getExecution(id)`.

### S2.3 — Recovery sweep
`recoverStuckExecutions(storeFor, now, cutoffIso)` (module-scope, exported): for each stuck row, load its workflow, parse the persisted input, re-run via the same `runAndRecordAt`. Workflow gone → `completeExecution(..., 'error', 'workflow_deleted', ...)` (not stuck forever). `runAndRecord` extracted to module scope (`runAndRecordAt`) for reuse.

### S2.4 — Boot hook + on-demand route
- `createConsole` kicks a **one-shot recovery** on first boot (rides the dispatcher → `ctx.waitUntil` on CF; controllable in tests). Default cutoff: now − 5 min.
- `POST /automations/_recover` (master_admin) — on-demand sweep, returns `{recovered, failed, cutoff}`.

### S2.5 — QStash redelivery dispatcher (credential-gated)
`qstashDispatcher({token, runUrl, callbackSecret?})` — the distributed path. **Honestly scoped:** a `work()` closure can't be serialized, so the dispatcher ignores it and publishes a **recovery-trigger** message to QStash; the receiving endpoint runs the idempotent sweep. QStash provides at-least-once redelivery of the trigger. Core durability is fully tested locally with no creds; QStash is the "don't rely on the next request to boot recovery" upgrade.
- 🚩 **Escalate flag** (in the header): the callback endpoint must auth the inbound (shared secret / signature). The existing `/_recover` is cookie/master_admin-gated; a dedicated shared-secret `/_run` is the follow-up if QStash is taken past the thin enqueue.

### S2.6 — Test + mutation proof
- **`durable-execution.mjs`** (12 checks, local): input persisted; idempotent complete (terminal row not clobbered); recovery re-runs a stuck run (real engine output); deleted-workflow → `workflow_deleted`; recovery idempotent with a late original; `POST /_recover` → `{recovered}`; non-master denied.
- **Mutation proof:** drop the `AND status = 'running'` guard → the idempotent-complete test goes RED. Wired into `backend/test/mutation.mjs` (now **8/8** gates).
- **`durable-execution-live.mjs`** (credential-gated on `QSTASH_TOKEN`/`QSTASH_RUN_URL`) — asserts the publish path; self-skips.

---

## 4. Verification (all green)

| Gate | Result |
|------|--------|
| `pnpm -r test` | **65** suites green (PASS + credential-skip). New: `supabase-provisioning` (rewritten), `durable-execution`, `durable-execution-live` (gated). |
| `pnpm -r test:mutation` | All RED-on-break. Backend now **8/8** (+1: the durable completeExecution guard). |
| `pnpm --filter @frontbase/example-cf-full smoke` | 10/10 — worker **390.6 KB gzip** (< 1 MB; `@upstash/qstash` already optional/stubbed). |
| TypeScript strict | All packages clean. |
| Migration v6 | apply/rollback/re-apply converges (the recreate-table down path is the fiddly bit — verified). |

---

## 5. Deviations ledger — final state

| ID | Status |
|----|--------|
| **F5c** | ✅ CLOSED — Option A shipped (real schema provisioning; was a token-validating stub) |
| **F3b-durable** | ✅ CLOSED — persisted input + recovery sweep + idempotent completion + QStash redelivery |
| **F8b** | 🛑 DEFERRED — Stripe billing (own task; not stable yet) |
| All other Phase-3 items (BUG-1, F4b, F7b, F7c, F5b, F4c, F5d, D1–D6, F8c, F3b) | ✅ CLOSED in earlier sprints |

**Open engineering follow-ups: 0.** The only remaining ledger item is F8b Stripe, deliberately deferred to its own task (`docs/plans/f8b-stripe-billing-DEFERRED.md`).

---

## 6. Carry-forward / escalate flags (not blockers)

1. **Supabase shared-quota (S1):** all provisioned schemas share the host project's quota. Hard isolation needs separate projects (out of scope).
2. **Supabase `execute_sql` prerequisite (S1):** provisioning inherits the host project's `execute_sql` function (documented in the guide).
3. **QStash callback auth (S2.5):** the recovery-trigger endpoint must authenticate inbound (shared secret / signature). The dispatcher sends an optional `callbackSecret` header; the receiver-side verification + a dedicated `/_run` endpoint is the follow-up if QStash moves past the thin enqueue.
4. **Migration v6 down-path on D1/Turso (S2.1):** the recreate-table down path converges on SQLite (verified); flagged only if a D1/Turso-specific dialect quirk surfaces on a live rollback (the apply path is safe).

---

## 7. Document map

- **This file** — the F5c-A + F3b-durable sprint record.
- [`phase-3-consolidated-delivery.md`](./phase-3-consolidated-delivery.md) — master ledger (now: F5c + F3b-durable CLOSED).
- [`plans/f5c-a-and-f3b-durable-sprint.md`](./plans/f5c-a-and-f3b-durable-sprint.md) — the build sheet this sprint executed.
- [`plans/f5c-supabase-provisioning-DECISION.md`](./plans/f5c-supabase-provisioning-DECISION.md) — Option A rationale.
- [`plans/f8b-stripe-billing-DEFERRED.md`](./plans/f8b-stripe-billing-DEFERRED.md) — the sole remaining (deferred) item.
