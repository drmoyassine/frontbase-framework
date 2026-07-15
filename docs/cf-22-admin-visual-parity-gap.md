# CF-22 — Admin Console 100% Visual + Functional Parity (gap analysis & plan)

**Date:** 2026-07-14 (v2) · **Updated:** 2026-07-15 (v4 — P0–P3 end-to-end audit)
**Status:** **RECOVERY IN PROGRESS — CF-22 is not complete.** P0 is historically delivered but its current source-artifact check is red; P1 is an inventory/spec-snapshot gate rather than handler-derived conformance; P2 has broad route/shape coverage but substantial behavioral and security gaps; P3 is locally integrated but acceptance remains open.
**Scope constraint (owner decision):** parity targets the **self-host / single-tenant /
community edition** of the product for the foreseeable future. Cloud-only surfaces
(tenants directory, plans manager, billing, SuperTokens/signup/invite, agent quota)
are out of scope.
**Trigger:** first real-world deploy via `pnpm run deploy:cf-full -- --app-name <name>`
(CF-19). Verdict from the field: the deployed `/console` "looks super poor" compared
to a regular product deployment (repo `Frontbase-` / frontbase-dbsync).

> **v2 note:** v1 of this doc proposed a "faithful port" — copying product components
> into `packages/admin-console` behind an API adapter (phases V1–V4). That plan was
> **rejected on scrutiny** (see §4) and replaced with the contract-first,
> artifact-reuse plan in §5. The gap analysis (§1–§3) is unchanged and still valid.

> **v4 audit:** The authoritative current assessment and recovery plan is
> [`cf-22-p0-p3-audit.md`](./cf-22-p0-p3-audit.md). Historical phase sections below
> are retained for design context. Where a delivery claim conflicts with the
> audit, the audit controls.

> **v5 field correction (2026-07-16):** the first deployed setup flow exposed two
> SPAs: the retired framework dashboard at `/setup#/dashboard` and the CF-22 product
> console at `/frontbase-admin/dashboard`. This was not a product cloud-edition
> deployment. The setup artifact accidentally retained the old dashboard router.
> It is now setup-only, signs in through `/api/auth/login`, and hands off to
> `/frontbase-admin/dashboard`. Historical comparisons to
> `@frontbase/admin-console` below describe the pre-CF-22 UI and no longer describe
> a reachable deployed dashboard. The full root-cause analysis, corrective actions,
> verification evidence, and follow-up plan are in the
> [`CF-22 setup-console cutover incident report`](./cf-22-setup-console-cutover-incident.md).
> See the P3 report section 4.1 for the retain/retire boundary between `/api/*` and
> the parallel `/api/console/*` namespace.

---

## 1. Was this known? Yes and no — CF-18's "FULL PARITY" measured the wrong axis

CF-18 is marked **✅ DONE — FUNCTIONAL-AREA PARITY 2026-07-13** in MILESTONES
(originally overstated as "FULL PARITY"). That claim is true for what it measured:
**functional-area coverage** — all 11 sidebar nav areas have real framework backend
routes and *a* working UI, with real execution/storage/provisioning and a closed
deviations ledger.

What it never measured is **visual/UX depth**. The CF-18 Phase-1 plan said it
explicitly — *"MVP pages are simpler than the product's (rewritten, not the
744/1215-line originals) — by design"* — but once CF-18 got stamped done, no tracked
item carried that admission forward. The gap was known at design time, then **lost
in the bookkeeping**. This document re-opens it as CF-22.

## 2. The numbers (why it looks poor)

Both consoles share the **same shell**: the framework's `Layout.tsx` is a faithful
port of the product's `src/modules/dbsync/components/Layout.tsx` (the shell the
product actually routes through as `UnifiedShell`), and the theme tokens in
`packages/admin-console/src/index.css` are byte-for-byte the product's
`src/index.css` HSL variables. **The sidebar matches. Everything behind it doesn't.**

| Dimension | Framework `@frontbase/admin-console` | Product `Frontbase-` console |
|---|---|---|
| Total SPA source | **~2,200 lines** (30 files) | **413 tsx files**; dashboard panels + admin pages alone ≈ **11,500 lines** |
| UI primitives | **6** hand-rolled (alert, badge, button, card, input, label) — **zero Radix** | **52** shadcn/ui primitives (dialog, table, tabs, select, dropdown-menu, tooltip, toast/sonner, skeleton, switch, popover, sheet, command, …) |
| Data layer | raw `useEffect` + `useState` fetches | TanStack Query v5 (+ persist) — caching, refetch, loading states |
| Feedback | inline text errors, no toasts | sonner toasts + confirmation dialogs |
| Dark mode | `.dark` CSS vars exist, **nothing ever sets the class** | `next-themes` with toggle |
| Loading states | literal `…` strings; Splash renders mojibake (`Loading�` — encoding bug in `App.tsx:20`) | skeletons, spinners, staged loading |
| Builder | `BuilderCanvas.tsx` (295 lines) embedded in `/pages` | dedicated **`/builder/:pageId`** full-screen studio — **110 tsx files** |
| Built bundle | 184.78 KB gzip SPA | **1.18 MB gzip** main JS chunk (4.6 MB raw assets) |

Per nav area the framework page is 5×–22× thinner than the product panel it mirrors
(e.g. Pages 133 vs 744+578 lines; Data Studio 206 vs ~2,000; Storage 167 vs 649 +
FileBrowser). Entirely absent: forgot/reset-password, `/variables`, RLS-policies UI,
auth-form builder, page-version history, sidebar collapse, `/automations/:id`
deep-links. (Cloud-only absences — TenantsDirectory 1,215 lines, PlansManager 600 —
are now out of scope by the community-edition constraint.)

## 3. Root cause

CF-18 chose (correctly, for MVP speed) **"port the shell, rewrite the pages"**
because product pages were coupled to ~80 FastAPI endpoints the framework lacked.
Phases 2–3 then grew the framework *backend* to functional parity, but kept the thin
rewritten *frontends*. Result: parity of capability, not of experience.

## 4. Strategy scrutiny — why every copy-based plan was rejected

The real choice is not "port vs rewrite"; it is **fork vs share**. Any strategy that
copies UI source into `packages/admin-console` — curated per-page ports (v1's plan)
or a wholesale copy — creates a fork that is complete on copy day and decays
silently thereafter:

- **No completeness guarantee.** "Screenshots match, signed off per area" is eyeball
  discipline; features behind modals and edge states get dropped with no machine
  noticing.
- **No drift story.** Every future product feature/fix must be manually re-ported,
  forever. During the migration window alone (~5–7 wk), the product keeps moving.
- **Wholesale copy is the worst long-term:** two divergent 400-file trees, dragging
  in cloud-only coupling the community scope excludes.

**What unlocks a better strategy (verified in the product repo):**
1. FastAPI emits OpenAPI for free (`app = FastAPI(...)`, `fastapi-backend/main.py:876`,
   ~30+ routers).
2. The frontend already has a centralized API seam: ~19 files in `src/services/` +
   `src/services/api-contracts.ts` (hand-written Zod "source of truth" for response
   shapes).
3. **The community console already exists as a build configuration of the product**:
   `isCloud()` edition gating (`src/lib/edition.ts`) + the self-host env-var
   master-admin auth mode. Nothing needs to be "ported" — the product is designed to
   run self-host/single-tenant against its own FastAPI.
4. Built product SPA main chunk is 1.18 MB gzip → exceeds the 1 MB inline-worker
   budget → Workers Static Assets required (already the documented migration path).

**Decision: contract-first, artifact-reuse.** The framework backend becomes a
drop-in replacement for the community-edition FastAPI contract, and the framework
worker serves the product's **built** console bundle. Visual parity is 100% by
construction and permanent (same compiled frontend); completeness is machine-checked
(spec diff); drift is an automated alarm, not human memory. The "extract console
into a shared package" end-state (option C) needs the same backend contract work
anyway — artifact-reuse is its first milestone with the invasive product refactor
deferred until source-level sharing earns its cost.

## 5. The plan (P0–P3)

### P0 — Product-repo pre-pass · ⚠️ HISTORICALLY DELIVERED; CURRENT STALENESS GATE RED
**Report: [`cf-22-p0-delivery.md`](./cf-22-p0-delivery.md).** Shipped to product-repo
main (`32b689b` + `70df2d6`), contracts CI green. Actuals vs the plan:

| Workstream | Outcome |
|---|---|
| **W1 — OpenAPI hygiene** | ✅ **341/341 ops typed** (was ~70), unique operationIds, derived `x-edition` tags; committed deterministic artifacts `contracts/openapi.{full,community}.json` (**286 community + 55 cloud-only ops, 202 community schemas, 31 tags**); untyped-response ratchet (`openapi_gaps.json`, empty). Two real bugs fixed: non-deterministic export (9 duplicate pydantic class names) and a would-500 `AuditLog.id` int-vs-UUID typing. |
| **W2 — Client consolidation** | ✅ `@hey-api/openapi-ts` generates `src/client/` (18 files: SDK + **Zod** + TanStack Query); runtime wiring in `lib/api-client.ts`; exemplar service migrated; eslint warns on raw axios. *Deferred:* remaining 18 service migrations (product task #111) — not a P1 blocker. |
| **W3 — Edition boundary** | ✅ `build:community` verified: cloud UI (signup/tenants/plans/billing/invite) **content-proven absent** from the community bundle. Bundle 1.17 MB gz → confirms P3's Static-Assets path. |
| **W4 — Loose ends** | ✅ Dead route + stray file removed; **bonus: killed a custom TrailingSlashMiddleware** causing infinite-307 loops on 256 no-slash routes. *Deferred:* full envelope standardization (typed as-is instead — changing shapes would break the existing frontend; the contract documents reality). |
| **CI** | ✅ `.github/workflows/contracts.yml`: spec staleness + hygiene + client staleness + tsc. First run caught real drift (fastapi version → spec content), forcing the pin `fastapi==0.139.0`. **Lesson: the fastapi version pin is part of contract determinism.** |

### P1 — Framework contract + drift gate · ⚠️ PARTIAL (inventory works; handler conformance does not)
- Scaffold the product-compatible console surface with **`@hono/zod-openapi`**,
  reusing the **Zod schemas generated from the product spec** (pydantic → OpenAPI →
  Zod → Hono route definitions) so framework validation is *derived from* the
  product contract, never hand-mirrored.
- **CI gate: `oasdiff`** — product community spec vs framework emitted spec; fails
  on any unmapped endpoint. From this day forward, "feature left behind" is
  machine-detected, permanently (a new product endpoint = an automatic named gap).
- Envelope: the compat surface adopts the product's `{success,data}` shape — a
  deliberate, documented exception to RULE 4's opaque-error shape (authed admin
  namespace, not the public proxy; messages stay non-leaky).

## 5a. P1 detailed spec (task #107) — compat surface + drift gate · ⚠️ PARTIAL AFTER AUDIT

> **Historical delivery claim; superseded by the P0–P3 audit.** Report: [`cf-22-p1-delivery.md`](./cf-22-p1-delivery.md).
> Vendored contract pinned to product `afe9e03`; the historical gate emitted 284
> operations because it silently omitted two contract-declared `OPTIONS` operations
> (corrected by the audit to 286); the counted drift gate was GREEN (6 implemented
> `variables` / 278 stubbed / 0 missing / 0 divergent); full 22-suite backend suite
> + mutation proof green; CI workflow added. **One spec deviation** (documented in
> the report): `@hono/zod-openapi`
> requires zod v4 (framework is zod 3), so the §5a fallback was taken — plain Hono
> + the vendored zod for runtime validation.

**Original goal:** the framework emits its own OpenAPI spec for a
product-compatible surface, and CI diffs it against the product's committed
`openapi.community.json`. The diff *starts* almost entirely red — that is the
point: it becomes P2's machine-generated burn-down list. P1 ships the machinery
plus one fully-conformant tag as proof.

**Inputs (from P0, product repo `fastapi-backend/contracts/`):**
`openapi.community.json` (286 ops / 202 schemas / 31 tags, deterministic,
CI-guarded) and the generated Zod schemas (`src/client/zod.gen.ts`).

### Deliverables

**D1 — Contract vendoring (`packages/backend/contracts/`)**
- Vendor `openapi.community.json` + `zod.gen.ts` into the framework repo,
  pinned to the product commit hash (`contracts/PRODUCT_COMMIT`).
- `scripts/sync-contract.mjs`: one command to re-vendor from a product checkout
  (path via env/flag), updating the pin. No network dependency; both repos are
  local. Refresh is deliberate (run the script), never implicit.
- Rationale: the framework repo must build/test hermetically, and contract
  bumps must be explicit, reviewable commits — the same artifact-pinning
  posture as the P3 console bundle.

**D2 — Compat router skeleton (`packages/backend/src/compat/`)**
- New Hono sub-app mounted at `/api` (product paths are `/api/<domain>/...`,
  NOT `/api/console/...`), coexisting with the existing `/api/console` routes
  (which keep serving the current admin-console SPA until P3 cuts over).
- **`@hono/zod-openapi`** `OpenAPIHono` root; per-tag route modules
  (`compat/routes/<tag>.ts`) mirroring the product's 31 community tags.
- Route definitions import request/response schemas **from the vendored
  `zod.gen.ts`** — never hand-written shapes. Where the product schema is
  `dict[str, Any]` (the honest-dynamic residue), use `z.record(z.unknown())` —
  matching looseness is correct, not lazy.
- Envelope: `{success, data?, message?, error?}` per the product contract
  (documented RULE-4 exception, §5 P1 bullet 3).
- Every route handler starts as `501 Not Implemented` **except** the P1
  proof-tag (below). A 501 stub still emits the correct spec entry — spec
  coverage and implementation are decoupled by design.
- Auth: stubs sit behind the existing `defaultDenyAuth` (RULE 2 holds from day
  one); the compat login route is part of the proof tag.
- RULE 1 unchanged: compat code lives in `backend`, is server-only, and the
  admin-console no-leak gate keeps proving no server code reaches the SPA.

**D3 — Spec emission + oasdiff gate**
- `packages/backend/scripts/emit-openapi.mjs` → `contracts/framework.openapi.json`
  (committed, deterministic — same discipline as P0; two runs diff clean).
- **Gate script `scripts/contract-diff.mjs`** running `oasdiff` (breaking +
  endpoint-coverage modes) product-community vs framework spec:
  - **Missing endpoint** (in product, absent from framework spec): FAIL.
  - **Implemented-but-divergent** (params/body/response schema mismatch): FAIL.
  - **`x-implemented: false`** (the 501 stubs carry this extension): reported
    as the burn-down count, not a failure — P2 drives this to zero.
  - Output: a per-tag conformance table (implemented / stubbed / divergent) —
    the single progress artifact for P2.
- Wire into the framework CI (`pnpm -r test` includes the gate; CI runs it on
  every push). Staleness gate for `framework.openapi.json` mirrors P0's
  (`git diff --exit-code` after regeneration).

**D4 — Proof tag: `variables` implemented end-to-end**
- Smallest real tag (6 ops: list/create/get/update/delete + template registry)
  with an existing framework primitive (settings/variables store from CF-18
  Phase 2, encrypted at rest).
- Implement all 6 ops fully conformant: oasdiff shows the tag green;
  **schemathesis** (or a Node equivalent conformance fuzz) runs against the
  worker for that tag; a backend test suite (`test/compat-variables.mjs`)
  exercises the product client's exact call shapes.
- Proves the whole chain: vendored Zod → OpenAPIHono route → framework service
  → emitted spec → oasdiff green — before P2 scales it to 30 more tags.

**D5 — RULE 8 mutation proof**
- Break the gate deliberately (delete one compat route) → `contract-diff` must
  go RED; restore → GREEN. Committed as `test/mutation/contract-diff.mjs`,
  joining the existing mutation harness.

### Exit criteria (all machine-checkable)
1. `contracts/` vendored + pinned; `sync-contract.mjs` round-trips clean.
2. Framework emits a deterministic `framework.openapi.json` covering **all 286
   community ops** (stubs included).
3. oasdiff gate green in CI: 0 missing, 0 divergent; burn-down table shows
   280 stubbed / 6 implemented (`variables`).
4. Proof-tag conformance suite green; mutation proof RED-on-break.
5. Existing 30 suites + mutation gates unaffected (`pnpm -r test`).

### Non-goals for P1 (→ P2)
Implementing the other 30 tags; auth-session compatibility beyond the proof
scope; Static Assets / console serving (P3); the product-side service
migrations (product task #111).

### Risks
- **Zod version skew:** hey-api emits Zod v4-flavored schemas; `@hono/zod-openapi`
  pins its own Zod peer. Verify at D1; if incompatible, the fallback is
  generating framework-side schemas from `openapi.community.json` directly
  (`openapi-zod-client`) — same derivation guarantee, different generator.
- **Path param syntax:** product uses `{param}` (OpenAPI) vs Hono's `:param` —
  the emitter must normalize before diffing (oasdiff compares OpenAPI, so
  emission-side normalization suffices).
- **31 tags × stub ceremony:** keep stubs table-driven (one `registerStub(tag,
  op)` helper reading the vendored spec) so D2 is hours, not days — hand-writing
  286 stub routes would be its own drift source.

### P2 — Implement the community contract · ❌ REOPENED (behavior/security/tenant proof incomplete)

### P3 — Integration: serve the real console · ⚠️ LOCALLY INTEGRATED, ACCEPTANCE INCOMPLETE · **spec in §5c**

## 5b. P2 detailed spec (task #108) — implement the 286-op community contract

> **Historical claim, reopened by the 2026-07-15 audit.** The registry now covers
> **285 compat operations plus engine-owned `GET /`**, but the binary “implemented”
> count proves neither functional behavior nor runtime conformance. Wave 2–5 tests,
> auth mutation proofs, tenant-isolation coverage, and multiple promised provider/
> persistence behaviors are missing; API-key storage has a critical plaintext/reveal flaw.
> Reports: [`cf-22-p2-wave1-delivery.md`](./cf-22-p2-wave1-delivery.md),
> [`cf-22-p2-complete-delivery.md`](./cf-22-p2-complete-delivery.md).
> **Next: P3 (#109)** — serve the product's community console bundle from the framework worker.

**Goal:** drive the P1 oasdiff burn-down table from 280-stubbed to 0, wave by
wave. Every wave is independently shippable and independently verifiable (the
conformance table is per-tag). **Definition of done per op:** oasdiff green
(shape-conformant), schemathesis (or Node-equivalent) fuzz passes, and a
behavior test exercises the *product client's exact call* (import the vendored
`zod.gen.ts` request shape in the test).

### Ground rules (apply to every wave)
- **Single-tenant pinning:** the compat surface serves ONE tenant. A
  `compatTenant()` helper resolves the default tenant slug once; product
  concepts `project_id`/`tenant_id` map to it. Tenant machinery stays internal
  (RULE 2 isolation still enforced in the stores — the pin is at the compat
  layer, not in the queries).
- **Auth mapping:** product self-host expects `user.is_master: true` for the
  env-var admin. Map framework `role === 'master_admin'` → `is_master: true` in
  every user-shaped response. (Full auth routes land in Wave 3; until then the
  existing `fb_session` guard protects stubs.)
- **Envelope:** `{success, data?, message?, error?}` exactly as the vendored
  schema says — where the product returns raw arrays (blocklist, audit-logs),
  return raw arrays. Conformance to reality, not to taste.
- **Schema deltas:** new tables go through the framework's migration system
  (append-only, idempotent DDL per existing contract). Each wave lists its
  migrations up front.
- **RULES:** every auth-adjacent route gets a mutation proof (RULE 8); no
  server code in SPA bundles (RULE 1 — unchanged); opaque errors stay for
  `/api/console/*` and the public proxy, the compat envelope exception applies
  only under the compat mount (RULE 4 note).

### Wave 1 — Console core · ~64 ops · est. 4–5 d
Tags: **pages (17) · settings (12) · database (10) · rls (14) · project (3) ·
Themes (3) · Meta (3) · security-events (2)** (+ `variables` already green from P1).
- *Existing primitives:* pages/drafts/publish store, settings/variables store
  (encrypted), datasource introspection (F7 runners), D1/SQLite DbRunner.
- *New build:* **page versions** (migration: `page_versions` table — immutable
  layout_data snapshots, rollback op), page soft-delete/restore/permanent
  (migration: `deleted_at` on pages if absent), themes CRUD (migration:
  `themes`), project settings record + branding asset upload (reuse F4b storage
  for the asset bytes), RLS policy CRUD mapped to the datasource adapter
  (Supabase adapter exists from CF-20; **non-Supabase datasources return the
  product's own "not configured" shape**, verified against the real FastAPI
  response, not invented), security-events list/summary (migration:
  `security_events` or map onto the existing audit trail), Meta health shapes.
- *Why first:* Dashboard, Builder Studio, Data Studio, Settings — the four
  areas a user sees in the first five minutes — light up when this wave lands.

### Wave 2 — Storage + data connections · ~41 ops · est. 3–4 d
Tags: **storage (23) · edge-databases (10) · Auth Forms (7) · Workflows (1)**.
- *Existing primitives:* F4b presigned upload + multipart + bucket/file store;
  edge-databases config records + provisioning (F5); email send needs a
  provider adapter (Resend/Mailgun HTTP — fetch-based, Workers-compatible).
- *New build:* auth-forms CRUD + primary-form designation (migration:
  `auth_forms`), storage provider connect flows for netlify-sites/
  vercel-projects (HTTP passthroughs to their APIs — credential-gated tests),
  compute-size/move/move-status mapped onto the F4b store.

### Wave 3 — Automations + authentication · ~42 ops · est. 4–5 d
Tags: **Actions (24) · Authentication (18)**.
- *Existing primitives:* F3b durable workflow execution (recovery sweep,
  QStash redelivery), workflow drafts + executions store.
- *New build:* automation **versions** (mirror page-versions pattern),
  publish-to-engine semantics (see Wave 4 note — in cf-full "the engine" is
  self, so publish = activate), executions export (CSV streaming), test/
  test-node (run a single node synchronously). Authentication: login/logout/me
  in the product's exact shapes (this is **the P3-critical subset** — P3's
  auth shim consumes it), forgot/reset-password (email adapter from Wave 2;
  the product's no-email `dev_link` fallback behavior included), blocklist +
  bot-protection + WAF + audit-logs (migrations: `ip_blocklist`, `audit_log`;
  settings-backed toggles).
- **Order note:** the Authentication tag should land FIRST within this wave —
  it unblocks P3 integration testing even before Actions completes.

### Wave 4 — Edge domain · ~104 ops · est. 6–8 d (the semantic-mapping wave)
Tags: **Edge Engines (33) · edge-providers (18) · edge-caches (7) ·
edge-queues (7) · edge-vectors (7) · Engine Inspector (8) · edge-api-keys (5) ·
edge-agent-profiles (4) · edge-gpu (7) · Cloudflare Deploy (4) · Cloudflare
Inspector (3) · Deno Deploy (1)**.
- **The mapping problem, decided up front:** in the product, FastAPI manages a
  fleet of *external* edge engines. In cf-full, the worker **is** an engine.
  Adopt the **self-engine model**: migration seeds one `is_system` engine row
  ("This deployment") whose adapter answers locally (health-check, logs via
  the engine's own log store, settings, source hash) instead of HTTP'ing out.
  Additional engines are legitimate too — the framework's CF-19 deploy
  machinery already creates real workers; **runtime** deploy/redeploy/teardown
  ops call the **Cloudflare REST API with a stored API token** (fetch-based —
  no wrangler in the worker), reusing the provisioning patterns from F5.
- *Existing primitives:* edge_resources config store (F5), live provisioning
  (CF API for D1/KV/Queues, Vectorize from F5b, Supabase Management API from
  F5c), key-rotation + secrets machinery (Edge Local Vault), engine bundle
  export (Portable Engine Move step 1).
- *New build:* edge-api-keys (migration: `edge_api_keys`; reveal-once
  semantics), edge-agent-profiles CRUD (config records), edge-gpu catalog/CRUD
  (CF Workers-AI API passthrough; catalog is credential-gated), inspector
  domain management (CF custom-domains API).
- *Verification:* credential-gated live gates (the F4c/F5d pattern) for every
  op that touches a real provider; everything else fuzz + fixture tests.
- **Descope valve:** if the wave overruns, `Cloudflare Inspector (3)` +
  `Deno Deploy (1)` + `edge-gpu (7)` are the negotiable tail (console areas
  degrade to an error card, not a blank page) — flag, don't silently slip.

### Wave 5 — Workspace Agent · ~27 ops · est. 3–4 d
Tags: **agent-integrations (15) · Agent MCP (6) · Agent (3) · Agent Settings (3)**.
- The framework has NO agent runtime today — this is the largest genuinely-new
  domain. Scope honestly: **CRUD + config first** (mcp-servers, agent-skills,
  profile installs, agent-settings — all config records, migrations:
  `mcp_servers`, `agent_skills`, `agent_profile_installs`, `agent_settings`),
  then **chat** as a thin streaming proxy to the tenant's configured LLM
  provider (credentials from Connected Accounts / provider records; SSE
  streaming — the worker supports it natively). MCP endpoints proxy to
  registered MCP servers over HTTP.
- `GET /api/agent/credits` returns the self-host shape (no quota pools in
  community — mirror what the product returns when quota is disabled, verify
  against FastAPI, don't invent).
- **This wave is deliberately last:** the console's Agent surface is the least
  "first-five-minutes" critical, and chat quality depends on provider creds
  the operator may not have configured.

### P2 exit criteria
1. oasdiff conformance table: **0 stubbed, 0 divergent** across all 31 tags
   (minus any explicitly-negotiated Wave-4 descopes, which must be listed in
   the delivery report — never silent).
2. Per-tag conformance/fuzz suites green; credential-gated live gates pass
   when creds are present, skip-with-notice when not.
3. Mutation proofs for every new auth-adjacent route (RULE 8 count grows).
4. `pnpm -r test` + `pnpm -r test:mutation` fully green; cf-full smoke intact.
5. Worker size check: compat layer adds code — assert gzip < 1 MB still holds
   (SPA leaves the bundle in P3, creating headroom).

## 5c. P3 detailed spec (task #109) — serve the real console

**Goal:** a fresh `pnpm run deploy:cf-full -- --app-name <x>` serves the
product's actual community console from the worker, logged in against the
framework backend, with E2E proof per nav area. **Blocking decision at start:
console-artifact posture** (§6) — default (b) private-release/local-artifact.

### Verified integration facts (from the product repo — do not rediscover)
- Self-host SPA mounts at **`basename="/frontbase-admin"`** (`src/lib/edition.ts:28`),
  NOT `/console`. The worker must serve it there.
- Product self-host cookie is **`frontbase_session`**; the framework issues
  **`fb_session`**. The SPA never reads either (HttpOnly) — it only needs
  login to succeed and the browser to replay the cookie. **Decision: keep
  `fb_session`**; the cookie name is server-internal. What must match is the
  login/me/logout request+response *shapes* (Wave 3 delivers them).
- Community bundle: single hashed JS (~1.17 MB gz) + CSS + favicon assets;
  BrowserRouter → every `/frontbase-admin/*` path must fall back to the shell.

### Deliverables

**D1 — Workers Static Assets migration (`examples/cf-full`)**
- Add `[assets]` (directory = `examples/cf-full/console-dist/`,
  `run_worker_first = true` so the worker keeps owning `/api/*` and the engine
  catch-all; assets serve only what the worker doesn't claim).
- Worker routing order becomes: `/api/*` (compat + console) → `/frontbase-admin`
  + `/frontbase-admin/*` → SPA shell from assets (SPA fallback for client
  routes) → engine catch-all (published pages) unchanged at `/` and slugs.
- Remove the inline `virtual:spa-bundle` for the console (the builder-canvas
  SPA); **worker gzip drops ~185 KB**, restoring budget headroom. Keep
  `virtual:sw-bundle` (engine SW) inlined — unchanged.
- `deploy.ts` passes through unchanged; `wrangler deploy` picks up `[assets]`
  automatically. Update the deploy-seed gate fixtures if the wrangler
  invocation shape changes.

**D2 — Console bundle acquisition (posture-(b) pipeline)**
- `scripts/fetch-console.mjs`: given a local product checkout path (env
  `FRONTBASE_PRODUCT_DIR` or `--product-dir`), runs `npm run build:community`
  there, copies `dist/` → `examples/cf-full/console-dist/`, and writes
  `console-dist/CONSOLE_PIN` (product commit hash + bundle sha256).
- `console-dist/` is **gitignored except `CONSOLE_PIN`** (repo stays clean of
  the commercial artifact — posture (b)); CI validates the pin format; the
  deploy script fails fast with a clear message if `console-dist/` is missing
  or its hash ≠ pin ("run `pnpm run fetch:console`").
- Flipping to posture (a) later = un-ignore the directory. One commit,
  as designed.

**D3 — Auth + first-run integration**
- The SPA's login page posts the product shape to `/api/auth/login` (Wave 3
  compat route) → framework verifies against its user store → sets `fb_session`
  → `/api/auth/me` returns `is_master: true` for master_admin. No SPA changes.
- First-run: cf-full's existing setup-token flow must reconcile with the
  product SPA's expectations — the worker redirects `/frontbase-admin` →
  setup page when no admin exists (reuse the CF-19 ADMIN_EMAIL/PASSWORD
  seeding). **The WordPress-style setup page (task #101) is already built** —
  D3 integrates with it as the existing surface; do not rebuild it.
- `/console` (old URL) → 301 to `/frontbase-admin` for continuity.

**D4 — E2E: Playwright happy-path per nav area (the permanent smoke)**
- Against a local `wrangler dev` (or miniflare) instance with seeded admin.
- 11 specs, one per nav area: login → Dashboard renders (metric cards
  populated) → Pages list + open builder → Data Studio datasources → Users →
  Storage buckets → Automations list + open detail → Edge Resources → Settings
  tabs → Variables → (Agent chat renders; send disabled without provider
  creds). Each asserts on REAL data round-trips (create → list → delete), not
  just render.
- Wire as `pnpm --filter @frontbase/example-cf-full test:e2e`; CI job separate
  from unit gates (slower); failure screenshots artifacted.

**D5 — Cutover + retirement**
- While E2E stabilizes, `/api/console/*` + the `@frontbase/admin-console` SPA
  keep working (parallel run).
- Cutover checklist: E2E 11/11 green on a real CF deploy → default URL printed
  by deploy switches to `/frontbase-admin` → `packages/admin-console` retired
  from the cf-full build (package archived, NOT deleted — `@frontbase/builder`
  canvas stays a first-class library; the no-leak gate moves with whatever
  still bundles it).
- MILESTONES + README updated; CF-22 closes when the field test (a fresh
  deploy by the owner) matches the product console visually and functionally.

**D6 — Permanent drift protection (closing the loop)**
- Framework CI gains a scheduled job: re-vendor the product contract
  (`sync-contract.mjs` against a pinned product ref), run oasdiff — a new
  product endpoint shows up as a NAMED gap within a day, forever.
- Console bump = `fetch-console.mjs` + pin commit; contract bump =
  `sync-contract.mjs` + pin commit. Both one-command, both reviewable.

### P3 exit criteria
1. Fresh `deploy:cf-full --app-name <new>` → visit `/frontbase-admin` → login
   with seeded admin → **the product console renders** (same pixels as a
   product self-host deployment).
2. Playwright 11/11 green against a real CF deployment.
3. Worker script gzip < 1 MB with headroom (SPA out of the bundle); assets
   served with immutable cache headers (hashed filenames).
4. `CONSOLE_PIN` + contract pin committed; both bump scripts round-trip.
5. Old `/console` redirects; admin-console package retired per D5 checklist.
6. **CF-22 exit:** owner field-test sign-off — the original complaint
   ("looks super poor") is falsifiable against the same console the product
   ships.

### P3 risks
- **Cookie flags:** `fb_session` must be `Secure; HttpOnly; SameSite=Lax` and
  scoped to `/` (the SPA calls `/api/*` from `/frontbase-admin/*` — same-origin,
  so Lax suffices; no CORS needed).
- **Base-path coupling:** if the product ever changes `BASE_PATH`, the worker
  route breaks — the fetch-console script should extract `BASE_PATH` from the
  built `index.html` and fail on mismatch rather than assume.
- **Setup-flow overlap:** task #101 (WordPress-style setup) and D3 first-run
  must be reconciled explicitly — one owner, not two half-implementations.
- **Asset caching vs bumps:** hashed filenames make caching safe, but
  `index.html` must be `no-cache` so console bumps propagate.

**Total ≈ 4.5–6 wk solo; P0 consumed ~2 days wall-clock (2026-07-14 → 15) against
the 1.5–2 wk estimate** (deferring the 18 product-side service migrations, #111,
which are off the critical path). Pixel parity arrives at the *start* of P3 (not
the end of the project); every P2 slice is independently shippable; the drift
alarm outlives the project. **P2's burn-down is no longer hand-tracked — it is
the oasdiff conformance table from P1/D3.**

## 6. Open decision — console-artifact posture (needed at start of P3)

Serving the product's built console from the framework worker means distributing the
commercial console (compiled) with the Apache-2.0 framework. Options:
- **(a) Open:** the community console is deliberately open — it *is* the community
  edition.
- **(b) Private-release artifact (DEFAULT):** the framework repo stays clean; the
  cf-full build/deploy fetches the console bundle from a private release (the
  `virtual:spa-bundle` seam / deploy script support this trivially).

P0–P2 are identical under either. **(b) is reversible (flipping to open is one
commit); (a) is forever** — so default (b), decide at P3 start, or earlier only if
the framework repo goes public first.

## 7. Non-goals
- Cloud edition: tenants directory, plans manager, billing (F8b stays deferred),
  SuperTokens/signup/invite, agent chat/quota.
- Source-level shared console package (option C) — revisit after launch only if
  artifact reuse proves insufficient.
- Pixel-parity of marketing/privacy pages — console only.
