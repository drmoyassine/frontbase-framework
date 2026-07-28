# CF-22 — Closure Plan

**Purpose:** everything that must happen for CF-22 to close with **no follow-ups and no
leftovers**. Written to be executed by someone who has not been in the prior sessions.

- **Read first:** [`cf-22-handover.md`](./cf-22-handover.md) (map, commands, traps), then
  [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) (source of truth).
- **Baseline for this plan:** framework `40c2afa`, product `7fbc0b9`.
- **Definition of done is in [§7](#7-definition-of-done). Nothing closes until every box there is ticked.**

---

## 0. What is actually left

Gates 0–3 are closed and gated. Gate 4 part 1 (browser acceptance) is done. What remains:

| # | Work | Size | Blocking closure? |
|---|---|---|---|
| **A** | Implement the 48 `/api/sync/*` operations | ~5–8 days | **Yes** — the Builder cannot bind to data without it |
| **B** | Scheduled cross-repo drift | ~0.5 day | Yes (Gate 4 exit) |
| **C** | Legacy `/api/console/*` retirement | ~1 day | Yes (Gate 4 exit) |
| **D** | Fresh Cloudflare deploy proof, automated | ~0.5 day | Yes (Gate 4 exit) |
| **E** | Four recorded loose ends (§6) | ~1 day | Yes — "no leftovers" means these too |
| **F** | Owner sign-off | — | Yes |

**Do A first.** B–E are small and independent; A determines the schedule.

---

## 1. Work A — implement the 48 `/api/sync/*` operations

### 1.1 Why this exists

`/api/sync/*` is the product's **DB-Synchronizer**: a FastAPI sub-application mounted at
`/api/sync` (`Frontbase-/fastapi-backend/main.py:1301`). It owns datasources, table
data, schema introspection, relationships, views, and WordPress import. Until product
`7fbc0b9` the exporter did not walk mounted sub-apps, so the contract never described
it and the framework never implemented it. **22 console source files depend on it** —
the Builder's data-binding, data tables, form field settings, and the datasource
selector. Full background: source of truth §7a.

They are currently **auto-stubbed at 501**. `behavior.summary.json` pins `stub: 48`, so
the count cannot grow silently and must reach `0`.

### 1.2 What you already have — do not rebuild these

| Asset | Where | Gives you |
|---|---|---|
| `datasources` table | migration in `packages/backend/src/db/migrations.ts` | tenant-scoped `id, name, kind, config, created_at, updated_at` |
| `datasourceRunner(kind, config)` | `packages/backend/src/db/datasource-runner.ts` | a `DbRunner` for sqlite / turso / d1 / supabase / postgres |
| `isIntrospectable(kind)`, `dialectOf(kind)` | same file | which kinds can be introspected, and sqlite vs postgres SQL |
| Provider runners | `packages/edge-infra/src/providers/` | the actual drivers (RULE 6: never hand-roll another) |
| `KeyValueStore` | `packages/backend/src/compat/store.ts` | the `settings` table, for session blobs |
| `serializeEdgeResource` pattern | `packages/backend/src/compat/routes/edge-shapes.ts` | the shape-sharing idiom to copy |

**The gap is real but narrower than 48 suggests:** the runner, the table, and the
dialect split already exist. Most of the work is introspection SQL, pagination, and
faithful response shaping.

### 1.3 The 48 operations, grouped by wave

Run `node -e` against `packages/backend/contracts/openapi.community.json` for exact
schemas; every response model named below is in `components.schemas`.

#### Wave A1 — datasource CRUD + connectivity (10 ops) · ~1 day

```
GET    /api/sync/datasources/                          → DatasourceResponse[]
POST   /api/sync/datasources/                     201  → DatasourceResponse
GET    /api/sync/datasources/{id}/                      → DatasourceResponse
PUT    /api/sync/datasources/{id}/                      → DatasourceResponse
DELETE /api/sync/datasources/{id}/                 204  → bodyless
POST   /api/sync/datasources/test-raw/                  → DatasourceTestResult
POST   /api/sync/datasources/{id}/test/                 → DatasourceTestResult
POST   /api/sync/datasources/{id}/test-update/          → DatasourceTestResult
GET    /api/sync/health/                                → SyncHealthResponse
GET    /api/sync/datasources/{id}/tables/               → string[]
```

- `DatasourceResponse` requires `id, name, type, is_active, created_at, updated_at`.
  Note **`type`**, not `kind` — the framework table column is `kind`; map it.
- Credentials go in `config` and **must be encrypted at rest** (`secret-cipher.ts`) and
  never returned. `DatasourceResponse` has no credential field — keep it that way.
- `test/` and `test-raw/` open a real connection via `datasourceRunner` and run
  `SELECT 1`. Return `{success, message, tables?, error?, suggestion?}`.
- `tables/` is introspection: `sqlite_master` vs `information_schema.tables` per
  `dialectOf(kind)`.

**Exit:** create → list → get → update → delete round-trips; a bad connection string
yields `success:false` with a message, not a 500.

#### Wave A2 — schema + table data (8 ops) · ~2 days · **the Builder's core**

```
GET   /api/sync/datasources/{id}/tables/{table}/schema/     → TableSchema
GET   /api/sync/datasources/{id}/tables/{table}/data/       → TableDataResponse
GET   /api/sync/datasources/{id}/tables/{table}/aggregate/  → TableAggregateResponse
GET   /api/sync/datasources/{id}/tables/{table}/distinct/{column}/ → DistinctValuesResponse
POST  /api/sync/datasources/{id}/tables/{table}/records/    → RecordMutationResponse
PATCH /api/sync/datasources/{id}/tables/{table}/records/{record_id} → RecordMutationResponse
GET   /api/sync/datasources/{id}/search                     → TableSearchResponse
GET   /api/sync/datasources/search-all/                     → SearchAllResponse
```

- `TableDataResponse` requires `records, total, offset, limit, has_more, fk_columns,
  timestamp_utc`. `fk_columns` is a display-lookup map keyed by column; `{}` is valid
  when there are no FKs.
- **`TableSchema` requires `columns`** and carries `foreign_keys`. Per-dialect:
  `PRAGMA table_info` + `PRAGMA foreign_key_list` (sqlite) vs `information_schema`
  columns + `pg_constraint` (postgres).
- 🔴 **SQL injection is the hazard here.** Table and column names arrive in the URL and
  cannot be bound as parameters. Validate every identifier against the introspected
  table/column list before interpolating — never against a regex alone. **Add a mutation
  gate proving a crafted `{table}` cannot escape.** This is the single most important
  security property in Work A.
- Pagination must be stable: always `ORDER BY` a deterministic key.

**Exit:** a real page of rows renders in Data Studio; create/patch persist and are
visible on re-read; a hostile identifier is rejected.

#### Wave A3 — views (10 ops) · ~1.5 days

```
GET    /api/sync/datasources/{id}/views/          → DatasourceViewResponse[]
POST   /api/sync/datasources/{id}/views/     201  → DatasourceViewResponse
GET    /api/sync/views/{view_id}/                 → DatasourceViewResponse
PATCH  /api/sync/views/{view_id}/                 → DatasourceViewResponse
DELETE /api/sync/views/{view_id}/            204  → bodyless
GET    /api/sync/views/{view_id}/records/         → ViewRecordsResponse
GET    /api/sync/views/{view_id}/count            → ViewCountResponse
POST   /api/sync/views/{view_id}/records     201  → ViewRecordMutationResponse
PATCH  /api/sync/views/{view_id}/records          → ViewRecordMutationResponse
POST   /api/sync/views/{view_id}/trigger/         → ViewTriggerResponse
```

- Needs a new migration: `datasource_views` (tenant-scoped) with `id, datasource_id,
  name, target_table, visible_columns, column_order, pinned_columns, filters,
  field_mappings, webhooks, linked_views, description, created_at, updated_at`.
  `DatasourceViewResponse` requires `name, target_table, id, datasource_id, created_at,
  updated_at`.
- `ViewRecordsResponse` is a **different envelope** from `TableDataResponse`:
  `records, total_records, current_page, total_pages, per_page, view_name,
  datasource_name, target_table, visible_columns, timestamp_utc`. Do not unify them.
- `trigger/` posts to the view's configured webhooks. In community, if no webhook is
  configured return `{success:true, message:'…0 webhooks', data:…}` — do **not** invent
  an outbound call. If webhooks ARE configured, honour them.

**Exit:** view CRUD round-trips; view records paginate; a view over a real table renders.

#### Wave A4 — relationships + sessions + migration checks (11 ops) · ~1 day

```
GET    /api/sync/datasources/{id}/relationships/                  → RelationshipsResponse
POST   /api/sync/datasources/{id}/relationships/            201   → RelationshipResponse
GET    /api/sync/datasources/{id}/relationships/user-defined/     → UserRelationshipsResponse
PUT    /api/sync/datasources/{id}/relationships/{index}/          → RelationshipResponse
DELETE /api/sync/datasources/{id}/relationships/{index}/          → RelationshipRemovedResponse
GET    /api/sync/datasources/{id}/tables/{table}/session/         → TableSessionResponse
POST   /api/sync/datasources/{id}/tables/{table}/session/         → TableSessionSaveResponse
DELETE /api/sync/datasources/{id}/tables/{table}/session/         → TableSessionClearedResponse
GET    /api/sync/datasources/{id}/check-migration                 → MigrationCheckResponse
POST   /api/sync/datasources/{id}/apply-migration                 → MigrationApplyResponse
GET    /api/sync/datasources/{id}/wordpress/discover/             → object
```

- Relationships are **indexed by position** (`{index}`), stored in the datasource's
  `config.relationships` array. `RelationshipResponse` requires `index, relationship`.
  Introspected FKs and user-defined relationships are **separate lists** — `/relationships/`
  returns `{tables, relationships}` (introspected), `/user-defined/` returns
  `{relationships:[{index,...}], total}`.
- Sessions are editor UI state: store as JSON in `KeyValueStore` under
  `sync_session:{datasource_id}:{table}`. The product returns `persisted:false` when
  Redis is down; the framework has no Redis, so always `persisted:true`.
- `check-migration` / `apply-migration` are Supabase-specific. For non-Supabase kinds
  return `{applicable:false, reason:'Migration only applies to Supabase datasources'}` —
  that is the product's own behaviour, not a stub.
- `wordpress/discover/` requires a live WordPress endpoint → `external-disabled`.

**Exit:** relationships CRUD by index; sessions round-trip; non-Supabase returns
`applicable:false` rather than an error.

#### Wave A5 — settings + WordPress import (6 ops) · ~0.5 day · mostly `external-disabled`

```
GET  /api/sync/settings/redis/         → RedisSettingsResponse
PUT  /api/sync/settings/redis/         → RedisSettingsResponse
POST /api/sync/settings/redis/test/    → SyncRedisTestResult
POST /api/sync/wordpress/import/       → object
GET  /api/sync/wordpress/import/{id}/  → object
GET  /api/sync/wordpress/import/{id}/progress/  → text/event-stream
```

- Redis settings: persist in `KeyValueStore` so the console's form round-trips.
  `test/` returns `success:false` with a clear message (no Redis in a Worker) →
  `external-disabled`.
- WordPress import needs a live WP site → `external-disabled`. The SSE endpoint **must
  stream `text/event-stream`**, not JSON, or the conformance gate fails on media type.
- ⚠️ **No `BaseHTTPMiddleware`-equivalent in the SSE path.** Recorded trap: middleware
  that buffers will break streaming.

### 1.4 Sheets OAuth (3 ops) — decide before starting

```
POST /api/sync/datasources/sheets/connect/issue/     → SheetsConnectIssueResponse
POST /api/sync/datasources/sheets/connect/callback/  → SheetsConnectResult
GET  /api/sync/datasources/sheets/connect/status/    → SheetsConnectStatus
```

Google OAuth requires registered credentials. Either implement with owner-supplied
credentials, or classify `external-disabled` with a truthful "not configured" response.
**Record whichever in the source of truth** — an undocumented choice is a leftover.

### 1.5 Constraints that apply to every handler

1. **RULE 2 — tenant scoping.** Every read and write filters by `c.get('tenant')`. The
   two-tenant matrix will exercise all identifier-bearing ops automatically; it must
   stay green.
2. **Workers runtime.** No `node:fs`, no `node:crypto`. Use Web Crypto.
3. **Exact contract paths, including trailing slashes.** Note `records/` (POST, with
   slash) vs `records` (view POST, no slash) — they differ per router.
4. **Encrypt datasource credentials at rest**; never return them.
5. **Shared shapes in one module** (`compat/routes/sync-shapes.ts`), mirroring
   `edge-shapes.ts`. Five tags drifted independently last time because each re-invented
   its own.
6. **`external-disabled` must be earned.** The classifier reads the runtime's own
   report, so an op that could work locally but returns "not configured" is
   mis-tagged. Only use it where a real external credential is genuinely required.

### 1.6 How to verify each wave

```bash
pnpm -r build
pnpm --filter @frontbase/backend run gate:cf22      # response + behavior + fuzz + tenant + security
pnpm --filter @frontbase/backend run conformance    # readable report
pnpm run contracts:diff                             # stubbed count must fall
```

After each wave, regenerate the behaviour ledger and commit it:
`behavior.summary.json` counts + fingerprint must move, with `stub` strictly decreasing.
**It can only shrink.** If it grows, something was un-implemented.

---

## 2. Work B — scheduled cross-repo drift (~0.5 day)

CI compares the framework against the **already-vendored** snapshot, so a product change
is invisible until someone re-vendors by hand. Gate 4 requires this be automatic.

Add `.github/workflows/contract-drift.yml`, `schedule:` daily:

1. Check out the framework; check out the product at `main` into a sibling path using a
   read-only deploy key (**secret name: `PRODUCT_REPO_TOKEN` — the owner must add it**).
2. Set up the product's pinned Python (`fastapi==0.139.0`, `PYTHONHASHSEED=0`) and run
   `export_openapi.py`.
3. `node scripts/sync-contract.mjs --product <path> --commit <sha>` into a scratch tree.
4. Fail (and open an issue) if any of: the regenerated product contract differs from its
   committed one; the vendored contract differs from the product's at that commit; the
   pins disagree; the console bundle hash changed.

**Exit:** a deliberate product-side change makes the scheduled run fail the next day.
Prove it once by hand.

---

## 3. Work C — retire the legacy `/api/console/*` surface (~1 day)

The framework still serves its own pre-CF-22 console API in parallel. Gate 4 requires
retirement — but **by evidence, not by name**.

1. **Build the consumer map.** For each `/api/console/*` route, grep the product console
   bundle, the framework's setup SPA, `examples/`, docs, and the smoke/e2e suites.
2. **Keep `/api/console/setup/*`.** First-run initialisation is framework-owned and has
   no product equivalent. This is not negotiable — removing it breaks fresh deploys.
3. **Keep `/api/console/health`** if any deploy tooling probes it (the Playwright
   `webServer.url` currently does — repoint it first if you remove it).
4. Remove the rest; add explicit assertions that retired paths return **404 or 410**, so
   retirement is proven rather than assumed.
5. Re-run the e2e suite: the console must be unaffected.

**Exit:** the consumer map is committed; retired routes assert 404/410; setup and health
still work on a fresh deploy.

---

## 4. Work D — automated fresh-deploy proof (~0.5 day)

The suite already accepts an external target:

```bash
E2E_BASE_URL=https://<worker>.workers.dev pnpm --filter @frontbase/example-cf-full e2e
```

Wire it into a manually-triggered (`workflow_dispatch`) job that deploys to a scratch
Cloudflare app, runs the suite against it, and tears the app down. **Deploys need owner
authorization and Cloudflare credentials in CI secrets — do not add these unilaterally.**

Two assertions only possible over https, already in the suite and currently skipped
locally: the `Secure` cookie flag, and asset `cache-control: immutable`.

**Exit:** one green run against a fresh deploy, with its URL and run id recorded in the
source of truth.

---

## 5. Work E — the recorded loose ends

All four are known and currently written down. "No leftovers" means closing them.

| # | Item | Fix |
|---|---|---|
| E1 | `POST /api/actions/drafts/{id}/test-node/{node_id}` is labelled `external-disabled` but its evidence reads *"persisted state effect (1 SQL observation)"* — label and evidence disagree | Re-derive; correct the classifier or the op |
| E2 | `behavior.summary.json` stores only counts + fingerprint, so the 113 `external-disabled` are auditable only by re-running `--verbose` | Persist the per-op ledger like `behavior.auth.json` already does |
| E3 | The classifier trusts each handler's **self-report**. `database` (16) and `storage` (14) are `external-disabled` because the handler says "not configured", though community-local primitives exist | Audit those 30; implement locally where possible, or justify each in the doc |
| E4 | Gate 1c(3) negative sweep exists, but `132 → 151` ops have "no falsifiable typed input" | Confirm that is inherent (no typed body/params) and record it, or extend the generator |

---

## 6. Sequencing

```
A1 → A2 → A3 → A4 → A5   (datasource layer; A2 is the critical one)
      ↘ B, C, E in parallel — independent of A
                                   ↘ D (needs A complete: the deploy must be final)
                                        ↘ F owner sign-off
```

Do **not** run D before A is finished — a deploy proof of an incomplete surface proves
nothing and will need repeating.

---

## 7. Definition of done

CF-22 closes when **every** box is true. No exceptions, no "follow-up" bucket.

**Machine-checkable:**

- [ ] `pnpm --filter @frontbase/backend run gate:cf22` PASS
- [ ] `behavior.summary.json` shows **`stub: 0`** — every contract op has a real handler
- [ ] Drift gate: `0 missing`, `0 divergent`, **`0 stubbed`**
- [ ] Conformance: `VIOLATES 0`, `UNREACHABLE 0`, `NO_SCHEMA 0`
- [ ] Tenant matrix green across all identifier-bearing ops (it grows with A)
- [ ] Negative/fuzz sweep audits 100% of ops
- [ ] **A mutation gate proves a crafted `{table}`/`{column}` cannot inject SQL**
- [ ] All mutation gates RED-on-break
- [ ] e2e suite green, and **test 15 removed** (its whole point is that `/api/sync` is missing)
- [ ] `pnpm -r build`, staleness, `console:check` all clean
- [ ] Scheduled drift workflow green, and proven to fail on a real product change
- [ ] Retired `/api/console/*` routes assert 404/410; setup + health still work

**Judgement calls that must be *recorded*, not merely made:**

- [ ] Sheets OAuth: implemented, or `external-disabled` with the reason written down
- [ ] WordPress import: `external-disabled` with the reason written down
- [ ] Every remaining `external-disabled` op justified (E3)
- [ ] The consumer map for `/api/console/*` committed

**Human:**

- [ ] Fresh Cloudflare deploy, suite green against it, URL + run id recorded
- [ ] **Owner walks all 8 console areas on that deploy and signs off in the source of truth**

**Documentation:**

- [ ] Source of truth §0/§7a/§8 updated; §7a resolved rather than left open
- [ ] `cf-22-handover.md` updated (or deleted, if nothing is left to hand over)
- [ ] MILESTONES.md CF-22 row closed
- [ ] This plan deleted — a closure plan for a closed milestone is itself a leftover

---

## 8. Traps — read before writing code

Each of these cost real debugging time. They are in `cf-22-handover.md §4` too; these
are the ones that will bite **this** work specifically.

1. **A 501 stub is a Hono route.** Use `implementedOps(app)` (captured pre-stub), never
   `routedOps` on a finished app.
2. **Redirecting a request without consuming its body kills the workerd isolate.** The
   trailing-slash 307 hit this: the client's replayed request got
   `503 Your worker restarted mid-request`. **GET hides it — workerd auto-retries GETs.**
   Any new redirect must drain `c.req.raw.body` first.
3. **`response_model` filters output.** A field the model omits is silently dropped. The
   product's sync models use `extra="allow"` for exactly this reason.
4. **Regenerate the product contract with the pinned toolchain only** —
   `fastapi-backend/venv/Scripts/python.exe`, `PYTHONHASHSEED=0`. The global interpreter
   is `fastapi 0.128` and emits a *different* spec.
5. **Never hardcode an op count in a gate.** Two gates broke rather than adapted when the
   contract widened; both now derive from the contract. Do not add a third.
6. **Trailing slashes are load-bearing** and inconsistent between sync routers.
7. **`core.autocrlf` fakes staleness** on Windows. Check `git diff --numstat` before
   believing a staleness report.
