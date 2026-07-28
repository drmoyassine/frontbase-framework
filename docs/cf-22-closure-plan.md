# CF-22 — Closure Plan

**Purpose:** everything that must happen for CF-22 to close with **no follow-ups and no
leftovers**. Written to be executed by someone who has not been in the prior sessions.

- **Read first:** [`cf-22-handover.md`](./cf-22-handover.md) (map, commands, traps), then
  [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) (source of truth).
- **Baseline for this plan:** framework `40c2afa`, product `7fbc0b9`.
- **Definition of done is in [§7](#7-definition-of-done). Nothing closes until every box there is ticked.**

---

## 0. The bar, and what is actually left

**The bar is 100% functional parity between the product and the framework.**
`external-disabled` and `shape-only` are **not** acceptable terminal states. An operation
is done when it does what the product's operation does, given the same configuration.

Measured against that bar today — **171 of 334 operations (51%) are not functional:**

| Ledger status | Count | Meaning under this bar |
|---|---:|---|
| `functional` | 163 | Done |
| `stub` | 48 | Declared, 501, no handler — the `/api/sync` surface (Work A) |
| `external-disabled` | 113 | Handler exists but reports "not configured" — **must be implemented** (Work A2) |
| `shape-only` | 10 | Returns a correct shape with no effect — **must be implemented** (Work A2) |

| # | Work | Size | Blocking closure? |
|---|---|---|---|
| **A** | Implement the 48 `/api/sync/*` operations | ~6–8 days | Yes — the Builder cannot bind to data |
| **A2** | Make the 123 non-functional operations real | **~3–5 weeks** | Yes — this IS the parity bar |
| **B** | Scheduled cross-repo drift | ~0.5 day | Yes (Gate 4 exit) |
| **C** | Legacy `/api/console/*` retirement | ~1 day | Yes (Gate 4 exit) |
| **D** | Fresh Cloudflare deploy proof, automated | ~0.5 day | Yes (Gate 4 exit) |
| **E** | Four recorded loose ends (§6) | ~1 day | Yes |
| **F** | Owner sign-off | — | Yes |

**Total: roughly 5–8 weeks.** That is the honest cost of 100% parity, and it is dominated
by A2 — which earlier CF-22 status reports counted as "closed" because they measured
against a 286-op denominator and treated `external-disabled` as an acceptable outcome.

**Do A first** (it unblocks the Builder), then A2 by tier. B, C, E run in parallel;
D and F come last.

### 0.1 Implementation parity vs verification — the distinction that matters

Every one of the 123 **can** be implemented. What varies is whether it can be *proved*
without third-party credentials:

- **Implementation parity** — the handler does the real thing when configured. Always
  achievable, and always required.
- **Verification** — proving it against a live provider needs real credentials
  (Cloudflare, Turso, Upstash, Netlify, Vercel, Google, an LLM key, a WordPress site).

This repo already has the pattern: **credential-gated live gates** (see the completed
F4c/F5d work). A live gate skips with a loud notice when its credential is absent and
runs for real when present.

**Closure requires each provider family's live gate to have been run at least once
against real credentials, with the run recorded.** A handler that has only ever been
exercised against a mock is not proven, and "the credential wasn't available" is exactly
the kind of leftover this plan exists to prevent. **The owner must supply one working
credential per provider family** — that is a hard input, not a nice-to-have.

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
- `wordpress/discover/` calls a live WordPress endpoint. **Implement it** and cover it with a credential-gated live gate — under the parity bar, `external-disabled` is not a terminal state.

**Exit:** relationships CRUD by index; sessions round-trip; non-Supabase returns
`applicable:false` rather than an error.

#### Wave A5 — settings + WordPress import (6 ops) · ~2 days · needs live credentials

```
GET  /api/sync/settings/redis/         → RedisSettingsResponse
PUT  /api/sync/settings/redis/         → RedisSettingsResponse
POST /api/sync/settings/redis/test/    → SyncRedisTestResult
POST /api/sync/wordpress/import/       → object
GET  /api/sync/wordpress/import/{id}/  → object
GET  /api/sync/wordpress/import/{id}/progress/  → text/event-stream
```

- Redis settings: persist in `KeyValueStore` so the console's form round-trips. `test/`
  must **actually connect** — Upstash Redis over its REST API works from a Worker, so
  this is implementable, not a dead end. Gate it on an Upstash credential.
- WordPress import must really import against a live WP site. The SSE endpoint **must
  stream `text/event-stream`**, not JSON, or the conformance gate fails on media type.
- ⚠️ **No `BaseHTTPMiddleware`-equivalent in the SSE path.** Recorded trap: middleware
  that buffers will break streaming.

### 1.4 Sheets OAuth (3 ops) — implement

```
POST /api/sync/datasources/sheets/connect/issue/     → SheetsConnectIssueResponse
POST /api/sync/datasources/sheets/connect/callback/  → SheetsConnectResult
GET  /api/sync/datasources/sheets/connect/status/    → SheetsConnectStatus
```

Google OAuth requires registered credentials. **The owner must supply a Google OAuth
client** — under the parity bar there is no descope option; the product connects Sheets,
so the framework must too. Store the refresh token encrypted (`secret-cipher.ts`), never
return it, and cover the flow with a credential-gated live gate.

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
6. **`external-disabled` is a work item, never an answer.** The classifier reads the
   runtime's own self-report, so an unwired handler that says "not configured" is
   indistinguishable from one that genuinely cannot run. Under the parity bar every such
   op must end `functional`; the only variable is whether proving it needs a credential.

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

---

## 1a. Work A2 — make the 123 non-functional operations real

`external-disabled` today mostly means **"the integration was never wired"**, not "this is
impossible". Two of the three largest clusters map directly onto primitives that already
exist in this repo. Get the current list any time with:

```bash
node packages/backend/test/compat-conformance.mjs --behavior --verbose
```

### Tier 1 — already have the primitive, just unwired (~30 ops, ~1 week)

| Cluster | Ops | Wire it to |
|---|---:|---|
| `storage` — create-folder, move, move-cross, move-status, providers CRUD, public-url, signed-url, upload | 12 | `s3StorageProvider` in `packages/edge-infra/src/storage/providers.ts` (R2/S3, presigned URLs) + the existing `storage_buckets` / `storage_files` tables |
| `database` — tables, table-schema, table-data, advanced-query, distinct-values | 5 | `datasourceRunner()` + `dialectOf()` — same introspection work as Work A2 wave A2 |
| `database` — RLS policies (list/create/update/delete/toggle/batch/bulk-delete), supabase-tables, test-supabase | 11 | `datasourceRunner()` against a Postgres/Supabase datasource: `pg_policies`, `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE/DROP POLICY` |

These need **no new third-party account** beyond a configured datasource, so they are the
highest value per day. Do this tier first.

⚠️ RLS and `advanced-query` interpolate identifiers. The **same SQL-injection rule as
Work A wave A2 applies**: validate every table/column/policy name against introspected
metadata, never a regex, and cover it with the mutation gate.

### Tier 2 — real provider integrations (~80 ops, ~2–3 weeks)

| Cluster | Ops | Needs | Foundation that exists |
|---|---:|---|---|
| `edge-engines` | 35 | Cloudflare API token | `cloudflareProvisioner` in `packages/edge-infra/src/provisioning/cloudflare.ts`; `deployCommand` in `packages/compiler/src/cli/deploy.ts` |
| `edge-providers` | 13 | per-provider tokens (Turso, Upstash, CF) | same `Provisioner` interface |
| `cloudflare` + `deno` | 8 | Cloudflare / Deno Deploy tokens | `cloudflareProvisioner` |
| `edge-databases` / `-caches` / `-queues` / `-vectors` / `-gpu` | 13 | Turso, Upstash Redis/QStash, Vectorize | `Provisioner` + the existing runners |
| `agent`, `agent-profiles`, `mcp-servers` | 14 | an LLM API key; an MCP server URL | the vendored agent contract |

Each needs a **credential-gated live gate**. Follow the existing F4c/F5d pattern exactly:
skip loudly without the credential, run for real with it.

### Tier 3 — small and local (~13 ops, ~2 days)

`auth` (2), `settings` (2), `variables` (1), `workflows` (1), `queue` (1), `actions` (1),
plus the 10 currently `shape-only`. Review individually — most need a persisted effect
rather than an integration. The `shape-only` ten are the ones returning a correct
constant while ignoring their store.

### Exit for Work A2

- `behavior.summary.json`: **`external-disabled: 0`, `shape-only: 0`, `stub: 0`,
  `functional: 334`**
- Every provider family has a live gate, and each has been run once for real, recorded in
  the source of truth with the date and what was exercised.

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
| E3 | The classifier trusts each handler's **self-report**. `database` (16) and `storage` (14) say "not configured" although the primitives exist | Folded into Work A2 Tier 1 — implement all 30 |
| E4 | Gate 1c(3) negative sweep exists, but `132 → 151` ops have "no falsifiable typed input" | Confirm that is inherent (no typed body/params) and record it, or extend the generator |

---

## 6. Sequencing

```
A1 → A2 → A3 → A4 → A5           Work A — the /api/sync datasource layer
                      ↘
                       A2-Tier1 → A2-Tier2 → A2-Tier3    Work A2 — make the 123 real
                          ↘ B, C, E in parallel — independent of A and A2
                                                      ↘ D (needs A + A2 complete)
                                                           ↘ F owner sign-off
```

Two ordering rules:

- **A before A2-Tier1.** They share the same introspection and identifier-validation
  code; doing A first means Tier 1 reuses it instead of duplicating it.
- **D last.** A deploy proof of an incomplete surface proves nothing and will need
  repeating. Run it once, when everything else is done.

---

## 7. Definition of done

CF-22 closes when **every** box is true. No exceptions, no "follow-up" bucket.

**Machine-checkable:**

- [ ] `pnpm --filter @frontbase/backend run gate:cf22` PASS
- [ ] `behavior.summary.json` shows **`functional: 334`** — and `stub: 0`,
      `external-disabled: 0`, `shape-only: 0`. **This is the parity bar.** Any non-zero
      in those three means an operation still does less than the product's.
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

**Live verification — one real run per provider family, recorded:**

Implementation alone is not proof. Each of these must have been exercised **once against
a real credential**, with the date and what was exercised written into the source of
truth. The owner supplies the credentials; this is a hard input.

- [ ] Cloudflare (engines, provisioning, deploy)
- [ ] Turso / libsql (edge-databases)
- [ ] Upstash Redis + QStash (edge-caches, edge-queues)
- [ ] Vectorize (edge-vectors)
- [ ] S3/R2 (storage upload, signed + public URLs, move)
- [ ] Postgres or Supabase (database introspection, advanced-query, **RLS policies**)
- [ ] An LLM provider (agent chat, agent profiles)
- [ ] An MCP server (mcp-servers, agent tools)
- [ ] Google OAuth (Sheets connect) — **implemented, not descoped**
- [ ] A WordPress site (import + discover) — **implemented, not descoped**
- [ ] Netlify + Vercel tokens (storage site targets)

**Recorded, not merely decided:**

- [ ] The consumer map for `/api/console/*` committed
- [ ] Every live gate's skip-vs-run condition documented, so a future run can tell
      "not configured" apart from "not implemented"

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
