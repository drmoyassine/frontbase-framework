# CF-22 P0 — Product-Repo Pre-Pass Delivery Report

**Date:** 2026-07-15 · **Historical status:** ✅ DELIVERED at the cited commits<br>
**Current audited status:** ⚠️ MAINTENANCE GATE RED — current product source has outgrown the committed contract artifacts
**Repo:** product `Frontbase-` (the frontbase-dbsync app whose community console the framework will serve)
**Parent plan:** [`docs/cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) (contract-first + artifact-reuse)

> P0's job: turn the product's FastAPI backend into a **committed, deterministic,
> fully-typed OpenAPI contract** and generate a typed client from it — the source
> of truth the framework backend (P2) reimplements and the framework worker (P3)
> ships. Everything downstream is only as good as this contract.

> **2026-07-15 audit:** `export_openapi.py --check` now reports 11 changes in
> both `openapi.community.json` and `openapi.full.json`. The original delivery is
> valid historically, but P0 must be refreshed before re-vendoring or accepting
> P3. See [`cf-22-p0-p3-audit.md`](./cf-22-p0-p3-audit.md).

---

## 1. Headline numbers

| Metric | Before P0 | After P0 |
|---|---|---|
| Routes with a typed success response | ~70 (20%) | **341 / 341 (100%)** |
| Untyped-response gaps | 261 | **0** (ratcheted; new untyped route fails CI) |
| Export determinism | non-deterministic | **byte-identical across runs** |
| Generated typed client | none (hand-written axios) | **18 files / ~35k lines** (SDK + Zod + TanStack Query), tsc-clean |
| Contract drift detection | none | **CI gates: spec staleness + hygiene + client staleness** |
| Redirect-loop endpoints | 2 (infinite 307) | **0** |

**Contract surface:** 341 operations = **286 community** (self-host) + **55 cloud-only**,
across **226** component schemas. Edition is *derived* (an op is `community` iff it
exists in the self-host build), never hand-tagged.

---

## 2. Workstream W1 — OpenAPI contract machinery

**New scripts (`fastapi-backend/scripts/`):**

- **`export_openapi.py`** (137 lines) — imports the app twice in subprocesses
  (`DEPLOYMENT_MODE=self-host` → community spec; `=cloud` + `AUTH_PROVIDER=supabase`
  → full spec, no SuperTokens core needed). Annotates each operation
  `x-edition: community | cloud` from the mode diff. `--check` = staleness gate
  (regenerate vs committed; fails if a router change wasn't accompanied by a
  spec regen).
- **`openapi_check.py`** (141 lines) — hard hygiene gate: every operation has a
  unique `operationId`, ≥1 tag, an `x-edition`; no module-prefixed schema names
  (duplicate-class detector). Untyped success responses are a **ratchet** against
  `contracts/openapi_gaps.json` — existing gaps are baselined, any *new* untyped
  route fails the build, the baseline can only shrink.

**Central operationId generator** (`main.py`): `generate_unique_id_function` →
`<tag>_<handler>` so the generated client gets readable method names
(`actionsListDrafts`, `pagesGetPages`, …).

**Committed artifacts** (`fastapi-backend/contracts/`, now tracked):
`openapi.full.json`, `openapi.community.json`, `openapi_gaps.json` (empty),
+ `README.md` documenting the regenerate/gate workflow.

**Two real bugs fixed along the way:**
- **Non-deterministic export** — 9 duplicate pydantic class names (`BatchResult` ×5,
  `BulkDeleteRequest` ×2, `TestConnectionRequest` ×2) were resolved to
  module-path-prefixed names in set-iteration order, so the spec differed run-to-run.
  Renamed all 9 to unique names; pinned `PYTHONHASHSEED=0`; the checker now
  hard-fails on any `__`-prefixed schema name.
- **Dead/inconsistent routes** — removed the unreferenced `/api/test-route`,
  collapsed the duplicate `/health` + `/health/` into one `include_in_schema` route,
  tagged the meta routes.

---

## 3. Workstream W2 — Generated typed client

- **`@hey-api/openapi-ts`** (client-axios + `@tanstack/react-query` + `zod` plugins)
  generates **`src/client/`** — 18 files / ~35,000 lines: typed SDK, Zod schemas
  (reusable by the framework's `@hono/zod-openapi` in P1), and TanStack Query hooks.
- **`openapi-ts.config.ts`** points at `contracts/openapi.full.json`.
- **`src/lib/api-client.ts`** (56 lines) wires the generated axios client to the
  legacy runtime behavior (relative baseURL — Vite proxy in dev, Nginx in prod;
  cookie credentials self-host; Bearer + `X-Project-Id` in cloud). Side-effect
  imported first in `main.tsx`.
- **`src/services/variables-api.ts`** — exemplar migration onto the generated SDK
  (signatures unchanged, so consumers untouched).
- **ESLint** rule (`no-restricted-imports`) warns on raw `axios` outside the
  sanctioned client files — the seam for the remaining 18 service migrations (task #111).

---

## 4. Workstream W3 — Community edition boundary

- **`.env.community`** + **`npm run build:community`** (`vite build --mode community`).
- **Tree-shaking verified (corrects an earlier wrong assessment):** a content grep
  proves the cloud **UI** (Signup, Tenants Directory, Plans Manager, Billing,
  accept-invite) is **100% absent** from the community bundle. The bundle-size
  delta is tiny (~11 KB gzip) only because cloud UI shares ~95% of its deps with
  community UI — not because shaking failed. The residual cloud *API path strings*
  in the community bundle come from the all-editions client and are already public
  in the committed spec, so they are no new exposure.
- Gating audit: `AdminRoute` already edition-gates `/admin/*`; signup/invite are
  `isCloud()`-gated.

---

## 5. Workstream W4 — Loose-end sweep

- Removed dead `/api/test-route`; removed stray `DataPreviewModal.tsx.clean`.
- Renamed the 9 duplicate pydantic classes (see W1).
- Standardized the meta/health route shapes.

---

## 6. Response-model burn-down (261 → 0)

An **AST classifier** per route determined the honest typing: return-kind
(dict / list / mixed / str) plus variable-assignment tracing and dict-returning-helper
resolution. Structural schemas were written where shapes are knowable;
`dict[str, Any]` / `list[dict[str, Any]]` kept only for genuinely dynamic payloads
(RPC results, introspection, provider passthroughs).

**New structural schema modules** (`app/schemas/`, 405 lines total):
- `pages_api.py` — `PageOut` (serialize_page), versions, publish/batch results
- `auth_api.py` — `UserPayload`, `InviteInfo`, `SlugCheck`, `BlocklistEntry`,
  `AuditLogEntry`, `BotProtectionMetrics`, WAF, etc.
- `database_api.py` — `TableRef`, `ColumnInfo`, `TableSchemaData`, table-data/query envelopes
- `rls_api.py` — RLS list/message/data envelopes, metadata save + verify
- `storage_api.py` — `StorageMessageAck`, `StorageBucketResult`, `StorageFilesResult`,
  `StorageSignedUrlResult` (replaces the blanket `dict` over-collapse)

`delete_engine` (void delete) → `status_code=204`.

---

## 7. Two review rounds (the discipline that caught the real bugs)

### Round 1 — fresh-eye review → 3 fixes
1. **Staleness gate was inert** — the contract artifacts were *untracked*, so
   `git diff` saw nothing. Tracked them; **proven**: inject a router change →
   gate exits 1; revert → exits 0.
2. **No CI** — added **`.github/workflows/contracts.yml`**: a backend job
   (`export_openapi.py --check` + `openapi_check.py`) and a frontend job
   (`client:generate` + `git diff --exit-code src/client` + `tsc --noEmit`).
   Between them, a router change that forgets to regenerate the spec *or* the
   client is always caught.
3. **Empirical smoke found a real typing bug** — `AuditLog.id` / `IPBlocklist.id`
   are UUID **strings**, but were typed `Optional[int]` → production 500. Fixed to
   `str`, verified 200. (The spec gate can't see this — only runtime verification can.)

Cleanup: `TableRef.schema` pydantic shadow warning eliminated via
`Field(alias="schema")`; `contracts/README.md` added; `--check` compares against
the index (== HEAD on a fresh CI checkout).

### Round 2 — the three the user refused to let me defer
1. **Redirect loops FIXED.** A custom `TrailingSlashMiddleware` added trailing
   slashes to non-excluded paths, fighting Starlette's `redirect_slashes` into an
   infinite 307 loop on the **256 routes registered without a trailing slash**
   (`/api/queue/health`, `/api/security-events/summary`, …). **Removed the
   middleware entirely**; `redirect_slashes` now emits single, loop-free 307s.
   **0 loops, 0 regressions** across all 58 param-less GETs.
2. **W3 tree-shaking** — re-investigated; **it works** (see §4). My round-1 claim
   was wrong.
3. **`dict[str, Any]` over-collapse** — edge-resource domains were already
   structural (`Edge*Response`); **storage was the real over-collapse** → retyped
   16 routes with `storage_api.py` models. Remaining `dict` routes are
   predominantly `{success, message}` acks + genuinely-dynamic payloads (task #117).

---

## 8. Verification — all gates green

| Gate | Method | Result |
|---|---|---|
| Spec staleness | `export_openapi.py --check` | exit 0 (drift → exit 1, proven) |
| Hygiene | `openapi_check.py` | PASS — 0 gaps, unique op-ids, tagged, no dup schemas |
| Determinism | 3 consecutive exports | byte-identical |
| Client staleness | `client:generate` + `git diff` | exit 0 |
| Typecheck | `tsc --noEmit` (incl. generated client) | clean |
| Community build | `npm run build:community` | ✓ |
| Runtime smoke | TestClient, all 58 param-less GETs | **0 response_model 500s, 0 loops** |
| Drift-proof | inject router change / revert | fail → pass |
| CI workflow YAML | parse | valid |

---

## 9. Honest gaps (tracked, not hidden)

- **#117 (remaining `dict` typing):** ~150 routes across projects / admin / tenants /
  agent-integrations / Actions are still `dict[str, Any]` — but these are
  predominantly `{success, message}` acks and genuinely-dynamic RPC/introspection.
  The high-value surface (entity-CRUD serializers) is structurally typed.
- **Pre-existing DB-init noise:** `Failed to load Redis settings: no such table:
  project_settings` on startup in a fresh DB — unrelated to contracts; the table is
  created on first migration. Flagged, not in P0 scope.
- **`build:community` size:** 1.17 MB gzip — exceeds the framework worker's 1 MB
  inline budget, confirming the P3 plan to serve via Workers Static Assets (not
  inline). This is expected and already in the plan.

---

## 10. File inventory (103 files staged)

**New backend:** `scripts/export_openapi.py`, `scripts/openapi_check.py`,
`contracts/{openapi.full,openapi.community,openapi_gaps}.json`, `contracts/README.md`,
`app/schemas/{pages_api,auth_api,database_api,rls_api,storage_api}.py`.

**New frontend:** `openapi-ts.config.ts`, `src/lib/api-client.ts`, `src/client/**` (18 gen files),
`.env.community`, `.github/workflows/contracts.yml`.

**Modified:** `main.py` (operationId generator + meta routes + middleware removal),
~30 routers (`response_model` + `Any` imports), `app/models/schemas.py` (`MessageResponse`),
`src/services/variables-api.ts`, `src/main.tsx`, `eslint.config.js`, `package.json`.

---

## 11. Unblocks

- **P1 (task #107):** framework `@hono/zod-openapi` compat surface + `oasdiff`
  drift gate — now unblocked; consumes `openapi.community.json` + the generated
  Zod schemas.
- **P2 (task #108):** implement the community contract on framework primitives.
- **P3 (task #109):** serve the product's community console bundle from the
  framework worker (decision pending: open console vs private-release artifact).
