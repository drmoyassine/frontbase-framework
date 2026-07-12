# Phase 3b — "Fill the gaps" Delivery Report

**Date:** 2026-07-12 · **Status:** ✅ COMPLETE (both features)
**Scope:** F7 Data Studio + F8 Plans — close the last two "coming soon" nav areas.

---

## What shipped

### F7 — Data Studio (datasources + table browser) ✅
- **Migration v5:** `datasources` table (id, tenant, name, kind, **encrypted config**, timestamps).
- **`packages/backend/src/db/datasource-runner.ts`** — kind → DbRunner factory (sqlite/turso/d1/supabase). One place maps datasource kinds to runners (RULE 6).
- **`packages/backend/src/routes/data-studio.ts`** — datasource CRUD (config stored encrypted via F6's SecretCipher, never leaked in list) + introspection:
  - `GET /datasources/:id/tables` — list tables (SQLite dialect: `sqlite_master`)
  - `GET /datasources/:id/tables/:t/columns` — `PRAGMA table_info`
  - `GET /datasources/:id/tables/:t/rows` — browse rows (bounded LIMIT/OFFSET)
  - `POST /datasources/:id/query` — **read-only** SELECT guard (rejects non-SELECT + semicolon chaining)
- **Frontend `DataStudio.tsx`** — 3-pane: datasources | tables | browser+query. Per-kind config form (sqlite/turso/d1/supabase). Live table data grid + SQL editor with results.
- **Test:** `data-studio.mjs` (12 checks) — CRUD, introspection, read-only guard, semicolon rejection, no-config-leak.

### F8 — Plans ✅
- **Migration v5:** `plans` table (id, tenant, name, price_cents, interval, limits JSON, is_active).
- **`packages/backend/src/routes/plans.ts`** — plan CRUD; limits JSON parsed for the client.
- **Frontend `Plans.tsx`** — plan cards (price/interval/limit badges), create/edit form with JSON limits editor, `-1` renders as ∞.
- **Test:** `plans.mjs` (10 checks) — CRUD, upsert-no-dup, limits round-trip, validation.

---

## Verification (all green)

- ✅ **Backend** 16 suites pass (incl. new `data-studio`, `plans`)
- ✅ **Mutation gates** RED-on-break
- ✅ **cf-full smoke** 10/10 — worker **338.0 KB gzip** (< 1 MB)
- ✅ **SPA** 186.9 KB gzip, no-leak green
- ✅ TypeScript strict across all packages
- ✅ Migration v5 apply/rollback/re-apply converges (5 migrations)

---

## Deviations / gaps

### F7 — Introspection is SQLite-dialect only
**Status:** `tables`/`columns`/`rows` use `sqlite_master` + `PRAGMA table_info` (works for sqlite/turso/d1-sqlite). Postgres (information_schema) and Supabase (PostgREST) datasources can be stored but introspection returns dialect-specific results or errors.
**Why:** Each dialect has its own schema-introspection SQL. SQLite is the common reference; dialect-specific introspection is additive.
**Follow-up (F7b):** Add per-dialect introspection adapters (Postgres `information_schema`, Supabase PostgREST `/rest/v1/`). Effort ~1-2 days.

### F7 — Postgres datasource kind not runnable yet
**Status:** `postgres` kind throws `postgres_runner_not_implemented` (CF-21 edge audit flagged a Postgres runner as pending). The kind can be selected but not connected.
**Follow-up (F7c):** Ship `postgresRunner` (Hyperdrive/serverless). Effort ~1-2 days.

### F7 — Query editor is read-only
**Status:** The `/query` route enforces SELECT-only (no DML/DDL). This is deliberate (safety), not a gap — but worth noting that schema changes must go through migrations.
**Status:** by design (not a deviation).

### F8 — Plans are CRUD only, no billing integration
**Status:** Plans are tier definitions (name/price/limits). No Stripe/payment integration, no subscription state, no enforcement of limits against tenants.
**Why:** Billing integration is a large separate concern (Stripe webhooks, subscription lifecycle, usage metering). The plan definitions are the foundation.
**Follow-up (F8b):** Stripe integration (checkout, webhooks, subscription state). Effort ~3-5 days.

### F8 — Limits not enforced
**Status:** Plan limits are stored but nothing enforces them (e.g. blocking page creation beyond `limits.pages`).
**Follow-up (F8c):** Wire limit checks into the relevant routes (pages/users/storage). Effort ~1-2 days.

---

## Follow-ups (consolidated, post-3b)

| # | Item | Phase | Effort |
|---|------|-------|--------|
| F7b | Per-dialect introspection (Postgres/Supabase) | 3c/future | 1-2 days |
| F7c | Postgres runner (Hyperdrive) | future | 1-2 days |
| F8b | Stripe billing integration | future | 3-5 days |
| F8c | Enforce plan limits in routes | 3c/future | 1-2 days |
| F1 | WYSIWYG visual canvas | 3c | 3-5 days |
| F2 | React Flow workflow editor | 3c | 2-3 days |
| F3b | Async workflow dispatch (durable queue) | 3c polish | 1-2 days |
| F4b | Multipart + presigned upload | 3c polish | 1 day |

---

## Where we stand after 3b

**All 11 nav areas now functional** (was 3.5/11 at CF-21 audit → 11/11 after 3b). The two remaining "coming soon" placeholders are gone:
- **Data Studio** → full datasource management + table browser + query editor
- **Plans** → full plan CRUD with limits editor

The console now has **feature parity with the product's sidebar surface** (every nav item does something real). What remains for "full product parity" is:
- **Phase 3c** — visual polish (WYSIWYG canvas, React Flow) + the 3a/3b integration follow-ups (async execution, multipart upload, Stripe, limit enforcement, dialect introspection).

**Calendar:** Phase 3c is the final pass (~2-2.5 weeks) → full parity mid-to-late August 2026.

---

## Architecture notes

- **Datasource config encryption reuses F6** (SecretCipher) — credentials in datasource configs are AES-256-GCM at rest, same as secret variables.
- **Read-only query guard** (`/^select\b/i` + no `;`) is defense-in-depth on top of the DbRunner — even if a datasource's credentials are powerful, the Data Studio can't mutate data.
- **Single runner factory** (`datasource-runner.ts`) — all datasource→DbRunner mapping in one place, consistent with RULE 6.
- **Plans limits as JSON** — flexible schema (any limit key), `-1` convention for unlimited, rendered as ∞ in the UI.
