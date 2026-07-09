# Phase 2 Sprint Plan — Infra, Console, Builder & Single-Worker Deploy (M2.1–M2.5)

**Audience:** a junior developer agent implementing M2.1 → M2.5 with minimal supervision.
**Status:** Ready to execute. Phase 1 (`@frontbase/edge-core` + `@frontbase/compiler`) is COMPLETE, all gates green, and **security-audited** (see the Phase 1 delivery report §10).
**Repo:** `frontbase-framework` (this repo). **Packages built this phase:** `@frontbase/edge-infra`, `@frontbase/backend`, `@frontbase/builder`, plus `deploy` in `@frontbase/compiler`.
**Author:** Architecture, 2026-07-10.

---

## 0. Read this first (orientation — 30 min, DO NOT SKIP)

Phase 2 turns the engine + toolchain into a complete, deployable CMS. You are wiring **concrete
implementations** into the seams Phase 1 defined, and extracting the production infra/console/builder
code from the product repo. The engine (`@frontbase/edge-core`) and compiler are **FROZEN** — you
consume their public APIs, you do not modify them without an architecture decision (see §Escape hatch).

**Before writing any code, read, in order:**
1. `docs/CHIMERA-ARCHITECTURE.md` — canonical. Non-negotiable.
2. `docs/delivery/phase1-delivery-report.md` — **especially §10 (the security audit).** The five bugs
   fixed there are the exact patterns you must not reintroduce. They are codified as GOLDEN RULES below.
3. `docs/DECISIONS.md` — A-13 (single-edge-worker, **zero Python in the deploy**), A-14 (six packages),
   A-15 (repo/Apache-2.0), A-16 (registered-query model + scope).
4. `packages/edge-core/src/index.ts` — the frozen public API you build against. Note especially:
   - `configureEngine({ resolvePrincipal, resolveUser, resolveFaviconUrl, ... })` — the host seam.
   - `type Principal = { user: UserContext | null; tenant?: string }`.
   - `type DataProvider = { query(queryId, params?, ctx?): Promise<Record<string,unknown>[]>; kind }`.
   - `type SiteManifest / PageEntry / RegisteredQuery / QueryContext`.
   - `enforceScope(query, principal)` — the deny-by-default scope gate (already enforced by the proxy).
5. `packages/edge-core/src/workflow/providers.ts` — `WorkflowProvider`, `WorkflowEvents`,
   `ExecutorRegistry`, `NodeExecutor` — the durable-workflow seams edge-infra implements.
6. `docs/plans/phase1-compiler-cli-sprint.md` — the Phase 1 plan, for format/voice and the extraction
   discipline (golden corpus, no cross-repo imports).

**The product repo to EXTRACT FROM (read-only reference — never import):**
`../Frontbase-/services/edge/src/` — the running edge service. Relevant trees:
- `storage/` — `IStateProvider.ts` + 6 providers (D1 `CfD1HttpProvider`, Turso `TursoHttpProvider`,
  Neon/Postgres `NeonHttpProvider`, Supabase `SupabaseRestProvider`, `LocalSqliteProvider`,
  `DrizzleStateProvider`) + `schema.ts` (Drizzle) + `edge-migrations.ts`.
- `cache/` — `ICacheProvider.ts` + `CfKvHttpProvider`, `DenoKvProvider`, redis adapters, `NullCacheProvider`.
- `config/` — `edgeSecrets.ts`, `tenantSecrets.ts`, `export.ts` (the vault: AES-GCM, rotation, versioning).
- `engine/qstash.ts` — durable queue.
- `routes/` — the console API surface (pages, versions, workflows, manifest, auth, deploy, etc.).
- `../../../src/components/builder` + `src/lib/builder` — the React builder shell.

---

## GOLDEN RULES (codified from the Phase 1 security audit — violating these is how Phase 1 broke)

These are not style preferences. Each maps to a real bug that shipped and had to be fixed. Phase 2 has
**more** attack surface (real DBs, secrets, multi-tenant data, a console API), so these matter more.

### RULE 1 — Nothing server-side may enter a browser/SW bundle. (SEC-1)
Phase 1 baked server-side `execute` closures (and any secrets they closed over) into the SW bundle
because one manifest was imported by both `worker.ts` and `sw.ts`. **Runtime stripping is too late —
if the source is in the bundler's input, it's in the output.**
- Server code (DB drivers, secrets, executors, connection strings, vault keys) lives in modules the
  **browser/builder bundle never imports**, even transitively.
- The browser gets **precomputed static data only** (like `emitBrowserManifest()` → a `JSON.stringify`d
  module: functions cannot survive serialization).
- **Every package that produces a browser artifact ships a `*-no-leak` test** that plants a canary
  secret in server code and greps the emitted bundle for it. No exceptions. (`compiler/test/sw-no-leak.mjs`
  is the template.)

### RULE 2 — Every data path is authenticated and tenant-scoped, deny-by-default. (SEC-2)
Phase 1 carried `scope` through the whole pipeline but **enforced nothing** — the proxy served
tenant-scoped queries to anonymous callers with no tenant threading. In Phase 2 you wire the REAL
`resolvePrincipal` (auth) and REAL database queries, so an isolation miss = cross-tenant data leak.
- Wire `resolvePrincipal` to real auth (M2.1). It returns `{ user, tenant }`; the proxy already calls
  `enforceScope` — do not bypass it.
- **Every DB query in edge-infra MUST filter by `ctx.tenant`.** A provider that runs a registered
  query's `execute` passes `ctx.tenant` through; the SQL MUST include a tenant predicate. Never trust a
  `tenant` value from request params — only from `resolvePrincipal`.
- **Every console endpoint (M2.2) is auth-guarded and tenant-scoped.** Default-deny middleware; a route
  that forgets the guard must fail its test.
- **Write a cross-tenant isolation test for every new data path** (`edge-core/test/scope.mjs` is the
  template: tenant A and tenant B provably get different rows; A cannot read B).

### RULE 3 — Never hand out a shared object by reference. (BUG-1)
Phase 1's `directProvider` returned the manifest's live `rows` array; a consumer mutating it corrupted
every later request. With real caches and shared config in Phase 2 this is worse. Return copies of any
cached/shared/manifest-owned data (`rows.map(r => ({...r}))`, structuredClone for deep). Cache reads
especially: a cache hit must not return the stored reference.

### RULE 4 — Errors are opaque to clients; detail is logged server-side. (BUG-2)
Phase 1 returned `err.message` + the engine environment label to callers. DB errors, vault errors, and
auth errors are the WORST to leak (they reveal schema, secret names, tenant existence). Every handler:
`console.error` the detail, return `{ error: '<opaque_code>' }` with the right status. Never echo an
exception message, stack, SQL, secret name, or connection string to a client.

### RULE 5 — In-repo tests can pass while a real consuming project fails. Always build one. (DEV-1)
Phase 1's compiler tests passed while a real `init` project failed to build (incompatible `SiteManifest`
type, missing `zod`/`@types/node` in the scaffold). **Every milestone that changes what a consuming
project imports ends with an END-TO-END scaffold build**: scaffold a project, `npm install` (pointing
deps at the local packages), `npm run build`, run its smoke test. The pattern is in
`compiler/scaffold-build-check.mjs` (Phase 1 used it to catch DEV-1). If a consuming project can't
build, the milestone is not done — no matter how green the unit tests are.

### RULE 6 — Type contracts have ONE owner. (DEV-1 root cause)
`@frontbase/edge-core` owns `SiteManifest`, `RegisteredQuery`, `QueryContext`, `Principal`, `DataProvider`.
edge-infra/backend/builder **import and alias** those types — they never redeclare their own structurally-
similar copy. A redeclared type compiles in isolation and breaks at the integration boundary.

### RULE 7 — The extraction discipline from Phase 1 still holds.
- **No cross-repo imports.** The product repo is a read-only reference; copy code in, cite the source in
  a comment. (A-15 §5.)
- **Deterministic outputs** (sorted keys, content hashes, no timestamps in content).
- **zod pinned at 3.25** — `.email()` etc. are modifiers, not `z.email`; `.describe()` is chainable.
- **ESM `.js` import specifiers** in TS source (Node ESM).
- **`node:crypto`/`node:fs` never reach a browser bundle** — they break the build (Phase 1 hit this in
  the SW emitter). Browser-safe crypto = Web Crypto (`crypto.subtle`).
- **Minification strips comments & tree-shakes unused code** — don't rely on either for a security
  boundary; rely on not-importing.
- **Commit per working increment** with green gates; message trailer `Co-Authored-By: Claude <noreply@anthropic.com>`. Push to `main`.

**Escape hatch:** if a seam is missing in the frozen engine/compiler, STOP and write it into
`docs/plans/phase2-blockers.md` with the exact call you needed. Do not modify frozen packages to
paper over it without an architecture decision.

---

## Definition of Done (Phase 2)

`npx @frontbase/compiler init my-app --full && npx @frontbase/compiler deploy` yields a working CMS at
one Cloudflare Worker URL: the builder saves drafts and publishes via the console API; a publish
propagates (new manifest on the edge, SW picks up the new version on next navigation); data flows
through real database providers with **enforced tenant isolation**; the vault decrypts/rotates on the
edge; **zero Python in the deploy**; worker < 400 KB min+gzip. Every data path has a passing
cross-tenant isolation test and no server code leaks into any browser bundle.

---

# Milestone 2.1 — Edge Infrastructure (`@frontbase/edge-infra`)

**Goal:** concrete `DataProvider` implementations (real DBs), the production Edge Data Proxy wiring
(auth + tenant scoping), cache/queue/vault, and durable workflow providers. **Target: end of Week 2.**

> This is the security-critical milestone. RULES 1–4 apply hardest here. Every provider touches real
> data and secrets.

### File map
```
packages/edge-infra/
├── src/
│   ├── index.ts                     # public barrel
│   ├── providers/
│   │   ├── types.ts                 # re-export/alias edge-core DataProvider, RegisteredQuery, QueryContext (RULE 6)
│   │   ├── d1.ts                    # CfD1HttpProvider → DataProvider
│   │   ├── turso.ts                 # TursoHttpProvider → DataProvider
│   │   ├── postgres.ts              # NeonHttpProvider (Hyperdrive) → DataProvider
│   │   ├── sqlite.ts                # LocalSqliteProvider → DataProvider
│   │   └── registry.ts             # buildDataProvider(env) — picks the driver from config
│   ├── proxy/
│   │   └── auth.ts                 # resolvePrincipal implementation (session/JWT → {user, tenant})
│   ├── cache/
│   │   ├── types.ts                # CacheProvider interface (alias/port ICacheProvider)
│   │   ├── kv.ts / redis.ts / null.ts
│   ├── queue/
│   │   ├── types.ts                # implements edge-core WorkflowProvider durable parts
│   │   └── qstash.ts / cfqueue.ts
│   ├── vault/
│   │   ├── crypto.ts               # AES-GCM via Web Crypto (crypto.subtle) — NO node:crypto
│   │   ├── vault.ts                # decrypt/encrypt/rotate/version
│   │   └── keys.ts                 # key resolution (env-injected, never bundled to browser)
│   └── executors/
│       └── ai.ts                   # AI/MCP NodeExecutors (the ones edge-core left as executor_not_registered)
├── test/
│   ├── providers.mjs               # each provider: query runs, returns rows
│   ├── isolation.mjs               # RULE 2: cross-tenant — A ≠ B, A can't read B
│   ├── proxy-auth.mjs              # resolvePrincipal + enforceScope end-to-end via createEngine
│   ├── vault.mjs                   # encrypt→decrypt round-trip, rotate, version
│   ├── cache.mjs                   # get/set/ttl; RULE 3 (returns a copy, not the stored ref)
│   ├── no-leak.mjs                 # RULE 1: no secret/driver in a browser-targeted bundle of this pkg
│   └── workflow-durable.mjs        # durable WorkflowProvider passes the edge-core workflow contract
├── package.json                    # peerDeps @frontbase/edge-core; deps: driver SDKs
└── tsconfig.json
```

### Step-by-step

**2.1.1 — Scaffold + type aliasing (RULE 6).** Create the package (Apache-2.0, `type: module`, peer
`@frontbase/edge-core: workspace:*`). `providers/types.ts` imports and re-exports `DataProvider`,
`RegisteredQuery`, `QueryContext`, `Principal`, `SiteManifest` from `@frontbase/edge-core`. No local
redeclarations. Gate: `pnpm --filter @frontbase/edge-infra build` clean.

**2.1.2 — DataProvider implementations.** Port each `storage/*Provider.ts` from the product repo into a
class/factory implementing edge-core's `DataProvider`. Each `query(queryId, params, ctx)`:
1. Looks up the registered query (from the manifest passed at construction).
2. Runs its `execute(params, ctx)` — the executor holds the SQL/statement.
3. **RULE 2:** the executor MUST include `ctx.tenant` in its WHERE clause. Provide a helper
   `requireTenant(ctx)` that throws (→ opaque 500) if a `tenant`/`user`-scoped query somehow reached
   execution without a tenant (defense in depth behind `enforceScope`).
4. **RULE 3:** return fresh row objects, never a driver's internal buffer reused across calls.
Gate (`providers.mjs`): each provider executes a query against a test DB (LocalSqlite for CI) and
returns rows.

**2.1.3 — `resolvePrincipal` (the auth wiring — RULE 2).** Port the product's session/JWT validation
(`middleware/auth.ts`, `ssr/lib/auth.ts`) into `proxy/auth.ts` as `resolvePrincipal(request) →
{ user, tenant }`. The host wires it: `configureEngine({ resolvePrincipal })`. **Tenant comes from the
validated session/JWT claims ONLY — never from request params or headers a client controls.**
Gate (`proxy-auth.mjs`): drive `createEngine` with this `resolvePrincipal`; assert a valid session on a
`tenant`-scoped query → 200 with the session's tenant; a forged/absent session → 401; a query params
`tenant` field is IGNORED (can't override the session tenant).

**2.1.4 — Cross-tenant isolation test (RULE 2 — the headline security gate).** `isolation.mjs`: seed a
test DB with rows for `tenant-A` and `tenant-B`. With `resolvePrincipal` returning tenant A, a
registered query returns ONLY A's rows; switch to tenant B, returns ONLY B's rows; assert A's result
set and B's are disjoint and A's query can never surface a B row. This test MUST exist before the
milestone closes.

**2.1.5 — Vault (RULE 1 + Web Crypto).** Port `config/edgeSecrets.ts` + `tenantSecrets.ts`. Crypto uses
**Web Crypto (`crypto.subtle`) AES-GCM** — NOT `node:crypto` (it breaks browser/worker bundles, Phase 1
lesson). Keys are env-injected at boot and **never** written into any artifact a browser imports.
Gate (`vault.mjs`): encrypt→decrypt round-trip, key rotation re-encrypts, version history is append-only.

**2.1.6 — Cache + durable queue.** Port `cache/*` behind a `CacheProvider` interface; **RULE 3: a cache
get returns a deep copy.** Port `engine/qstash.ts` + a CF Queues adapter as the durable
`WorkflowProvider` (edge-core defines the interface + in-memory default; you supply persistence).
Gate (`cache.mjs`, `workflow-durable.mjs`): cache ttl/copy semantics; durable provider passes the same
workflow execution contract as the in-memory one (reuse `edge-core/test/workflow.mjs` shape).

**2.1.7 — AI/MCP executors.** The nodes edge-core registers as `executor_not_registered` (ai.chat,
mcp.call, email, queue) get real `NodeExecutor`s here (port from `engine/node-executors.ts` +
`engine/qstash.ts`). Register them into an `ExecutorRegistry` the host passes to `executeWorkflow`.
Gate: a workflow with an `ai.chat` node runs (mock the AI SDK in test).

**2.1.8 — No-leak gate (RULE 1).** `no-leak.mjs`: bundle any browser-facing entry of edge-infra (there
should be NONE — this package is server-only; the test asserts that a naive `esbuild platform:browser`
of the package either fails or contains no driver/secret, proving it's not browser-importable). Document
that edge-infra is server-only and must never appear in `sw.ts`/builder bundles.

### M2.1 acceptance gates
- [ ] `pnpm --filter @frontbase/edge-infra test` green.
- [ ] Engine renders with a direct provider on the edge and the proxy provider in the SW against the same data.
- [ ] Proxy rejects unregistered queries (404) and invalid params (400) — security tests.
- [ ] **Cross-tenant isolation test passes (RULE 2).**
- [ ] Vault decrypt/rotate runs on the edge (Web Crypto, no node:crypto).
- [ ] Durable workflow providers pass the workflow contract.
- [ ] **No-leak test passes; edge-infra is documented server-only (RULE 1).**
- [ ] Coverage > 80%.

---

# Milestone 2.2 — Console API (`@frontbase/backend`)

**Goal:** the in-worker Hono console sub-router (pages/drafts CRUD, publish pipeline, projects/tenants,
tokens, users), Drizzle schemas + migrations, mounted at `/api/console`. **Zero Python (A-13).**
**Target: end of Week 4.** Depends on M2.1.

### File map
```
packages/backend/
├── src/
│   ├── index.ts                    # createConsole(deps) → Hono sub-router
│   ├── mw/
│   │   ├── auth.ts                # default-DENY auth guard (uses resolvePrincipal); RULE 2
│   │   └── errors.ts             # opaque error envelope; RULE 4
│   ├── routes/
│   │   ├── pages.ts / drafts.ts / versions.ts / projects.ts / tokens.ts / users.ts
│   │   └── publish.ts            # the publish pipeline (below)
│   ├── db/
│   │   ├── schema.ts             # Drizzle schemas (port storage/schema.ts) — the ONE source of truth
│   │   └── migrations/           # Drizzle migrations
│   └── publish/
│       └── pipeline.ts           # layout validate → manifest version → sw.js bump → cache purge
├── test/
│   ├── console.mjs               # CRUD + auth guard on every route
│   ├── authz.mjs                 # RULE 2: each route denies cross-tenant + unauthenticated
│   ├── publish.mjs               # publish propagation (manifest version bump, sw.js rev, cache purge)
│   └── errors.mjs                # RULE 4: no route leaks an exception/SQL to the client
├── package.json                  # peer edge-core + edge-infra
└── tsconfig.json
```

### Step-by-step

**2.2.1 — `createConsole(deps)` factory.** A function returning a Hono sub-router the host mounts via
`createEngine({ console })` at `/api/console`. `deps` injects the `DataProvider`, `resolvePrincipal`,
cache, and Drizzle db from edge-infra (RULE 6: import their types, don't redeclare).

**2.2.2 — Auth middleware, default-DENY (RULE 2).** `mw/auth.ts` runs `resolvePrincipal` and REJECTS
(401) any request without a valid principal, THEN checks the route's required scope/role. Applied to the
whole console router, not per-route (so a new route can't forget it). A route needing a specific role
declares it; the default is authenticated + tenant-scoped.

**2.2.3 — Error envelope (RULE 4).** `mw/errors.ts`: catch-all that logs detail server-side and returns
`{ error: code }`. No handler returns a raw exception. Test asserts a route that throws returns an
opaque body.

**2.2.4 — Drizzle schema + migrations (single source of truth).** Port `storage/schema.ts`. This is the
ONLY place persistence shape is defined (A-13: no parallel Python/Alembic). Every table with tenant
data has a `tenant` column and every query filters on it (RULE 2).

**2.2.5 — Routes.** Port `routes/{pages,versions,workflows,manifest,...}.ts` into the console router.
Each route: (a) behind the auth guard, (b) tenant-scoped in its DB calls, (c) opaque errors. **Every row
read/write is filtered by the principal's tenant — a test proves tenant A cannot CRUD tenant B's pages.**

**2.2.6 — Publish pipeline.** `publish/pipeline.ts`: validate the draft layout → assemble the
`SiteManifest` (reuse `@frontbase/compiler` `buildSiteManifest` — RULE 6, don't rebuild it) → bump the
content-hash version → emit the new `sw.js` (reuse the compiler's `emitSwBundle`/`emitBrowserManifest` —
RULE 1: the published SW manifest is the BROWSER projection, execute-stripped) → invalidate the cache.
Gate (`publish.mjs`): publishing a draft produces a new manifest version, a new `sw.<hash>.js`, and a
cache purge; the published SW manifest contains no `execute`/secret (reuse the no-leak assertion).

### M2.2 acceptance gates
- [ ] Builder (or a test client) saves drafts and publishes via the console API E2E.
- [ ] Publish propagates: new manifest on the edge; SW picks up the new version on next navigation.
- [ ] Drizzle read/write validated on D1, Turso, and Postgres (LocalSqlite in CI + a matrix note).
- [ ] **Auth middleware guards ALL console endpoints; per-route cross-tenant authz test passes (RULE 2).**
- [ ] **Published SW manifest is execute-stripped (RULE 1); no route leaks exceptions (RULE 4).**
- [ ] Coverage > 80%.

---

# Milestone 2.3 — Builder Package (`@frontbase/builder`)

**Goal:** the React builder shell + local SQLite-WASM draft DB + canvas↔SW preview bridge + visual
editors, generated from compiler manifests. **Target: end of Week 6.** Depends on M2.1, M2.2.

> RULE 1 applies to the builder bundle too: it is a browser SPA. It must NEVER import edge-infra
> (drivers/secrets) or the server console internals — it talks to the console API over HTTP and renders
> via the same engine in a local/preview provider.

### Step-by-step

**2.3.1 — Extract the React shell.** Port `src/components/builder` + `src/lib/builder` from the product
repo (canvas chrome, layers, property panels). React lives ONLY in this package (A-14: no React on
published pages). Point its API calls at `/api/console`.

**2.3.2 — Local draft provider (SQLite-WASM).** Implement `localDraftProvider` as a `DataProvider`
backed by SQLite-WASM in the browser — the builder's drafts. It implements the SAME `DataProvider`
interface (RULE 6). RULE 3: reads return copies.

**2.3.3 — Canvas ↔ preview bridge (the parity guarantee).** The preview iframe (`/preview`) renders the
draft layout through the SAME `@frontbase/edge-core` engine (in a `builder` environment), so preview
HTML == published HTML for the same layout. This is the headline builder gate — reuse the M1.1 byte-
parity approach: render a layout via the builder-preview path and via the edge path and diff (host label
normalized). **RULE 1: the preview engine uses a local/proxy provider — never edge-infra.**

**2.3.4 — Property inspectors from manifests.** Generate property panels from the compiler's
`ComponentManifest` (the `frontbasePlugin` output). No hand-written per-component panels.

**2.3.5 — Visual workflow editor + sync dashboard.** Port the React Flow editor; it emits the same
workflow node/edge JSON the engine's `executeWorkflow` consumes (RULE 6: the workflow types are
edge-core's).

**2.3.6 — Legacy layout migration.** Version-flagged migration so existing JSON layouts load (the
product's layout version flags).

### M2.3 acceptance gates
- [ ] **Builder preview renders through the production engine — preview HTML == published HTML (parity test).**
- [ ] Drag/drop → draft DB → preview refresh loop < 100 ms.
- [ ] Existing JSON layouts load via version-flagged migration.
- [ ] Builder installable as an add-on to a `--pure` project.
- [ ] **Builder bundle no-leak: contains NO edge-infra driver/secret (RULE 1) — grep the built SPA bundle.**

---

# Milestone 2.4 — Single-Worker Packaging & `frontbase deploy`

**Goal:** compose engine + console + proxy + builder into ONE worker; `frontbase deploy` wraps wrangler.
**Target: end of Week 7.** Depends on M2.1–M2.3.

### Step-by-step

**2.4.1 — Single-worker composition.** A build that assembles: the engine (`createEngine` with the real
`directProvider`, `resolvePrincipal`, and the console sub-router) + the builder SPA + assets, into one
CF Worker (Workers Static Assets for the SPA/builder files, the engine as the fetch handler). **RULE 1:
the worker's SW bundle served at `/sw.js` is the browser projection (execute-stripped); the worker's
server code (edge-infra) is in the fetch handler, NOT in `/sw.js`.** This is the single most important
composition boundary — a test must confirm the served `/sw.js` has no server code.

**2.4.2 — `frontbase deploy`.** Add `deploy` to `@frontbase/compiler`'s CLI (it already has
`init/check/lint/simulate/emit-sw`): wrap `wrangler deploy` (primary), `deployctl` (Deno, secondary).
Content-hash the worker; enforce the size budget in CI.

**2.4.3 — Size budget.** Worker < 400 KB min+gzip (the engine is ~57 KB, so there's room, but the
console + drivers add up — measure and gate, reuse `edge-core/scripts/size.mjs` pattern).

**2.4.4 — END-TO-END scaffold+deploy (RULE 5 — the milestone's real gate).** Scaffold `init --full`,
`npm install` (local packages), `npm run build`, and a `deploy --dry-run` that produces the worker
artifact and runs the routing smoke in-process (the `examples/cf-worker` pattern). If a real `--full`
project doesn't build+compose, this milestone is not done — regardless of unit tests (this is exactly
the DEV-1 class of bug).

### M2.4 acceptance gates
- [ ] `init --full && deploy` (dry-run in CI) yields a working CMS artifact at one URL shape.
- [ ] Worker < 400 KB min+gzip.
- [ ] **Served `/sw.js` contains no server code/secret (RULE 1, composition boundary test).**
- [ ] Same project targets Deno Deploy with the adapter switched.
- [ ] **End-to-end `--full` scaffold builds + composes (RULE 5).**

---

# Milestone 2.5 — Documentation & Testing (Phase 2 sign-off)

**Goal:** authoring/agent docs, benchmarks, the Phase 2 delivery report. **Target: end of Week 8.**

### Step-by-step
**2.5.1 — Docs.** `docs/guides/`: infra-providers (which DB, how to configure), console-api reference,
builder install, deploy. Update `authoring-components.md` for any Phase 2 constraints. Agent prompt
templates for common CMS tasks.
**2.5.2 — Benchmarks.** Routing/SW benchmarks vs the M1.5 baseline (first-load p50, SW nav p50 < 5 ms,
publish propagation time). Record numbers.
**2.5.3 — Security sweep (mandatory before sign-off).** Re-run the RULE 1–4 gates across ALL Phase 2
packages: no-leak (every browser artifact), cross-tenant isolation (every data path), opaque errors
(every handler), deny-by-default auth (every console route). Document results in the delivery report.
**2.5.4 — Phase 2 delivery report** (`docs/delivery/phase2-delivery-report.md`) — same structure as the
Phase 1 report, WITH a security section (§10-style) proving the golden rules hold. Mark M2.1–M2.5 → 🟢,
Phase 2 → 🟢 in MILESTONES.

### M2.5 acceptance gates
- [ ] Guides + agent templates written.
- [ ] Benchmarks meet targets.
- [ ] **Security sweep: RULE 1–4 gates green across all packages, documented.**
- [ ] Phase 2 delivery report written; **Phase 2 sign-off.**

---

## Sequencing, risks & guardrails

**Order:** 2.1 → 2.2 → 2.3 (2.2 and 2.3 can overlap once 2.1's providers + resolvePrincipal are green)
→ 2.4 → 2.5. 2.1 is the critical path AND the security foundation — do not rush it.

**Top risks (each with its guardrail):**
1. *Cross-tenant data leak* (the Phase 2 SEC-2) → RULE 2: real `resolvePrincipal`, tenant in every WHERE,
   isolation test per data path, tenant never from client input.
2. *Server code / secrets in the builder or /sw.js bundle* (the Phase 2 SEC-1) → RULE 1: server-only
   packages never browser-imported; no-leak test on every browser artifact; static-data-only to the browser.
3. *In-repo green but real CMS broken* → RULE 5: end-to-end `--full` scaffold build+compose is a gate.
4. *Redeclared types diverging* → RULE 6: edge-core owns the contracts; alias, never copy.
5. *Vault/DB using node:crypto or node: builtins in a worker/browser bundle* → Web Crypto + platform:browser
   builds fail loudly; keep server deps out of browser entries.
6. *Error/DB detail leaking to clients* → RULE 4: opaque envelopes, logged server-side.
7. *Scope creep* → Phase 3 (agent experience/beta) is OUT. Deliver the CMS, not the polish.

**Every milestone ends the same way:** gates green → `pnpm -r build && pnpm -r test` green → **the
frozen edge-core + compiler suites still green (regression)** → end-to-end scaffold build (where
applicable) → commit with the trailer → push → tick the boxes in `MILESTONES.md`.

## Quick reference
```bash
# build/test one package
pnpm --filter @frontbase/edge-infra build && pnpm --filter @frontbase/edge-infra test
# whole workspace
pnpm -r build && pnpm -r test
# frozen packages MUST stay green (regression — never break these)
pnpm --filter @frontbase/edge-core test    # parity 14/14 + scope 13/13
pnpm --filter @frontbase/compiler test     # 11 suites incl. sw-no-leak
# the security gates you add this phase (run them constantly)
#   */test/no-leak.mjs         (RULE 1)
#   */test/isolation.mjs       (RULE 2)
#   */test/errors.mjs          (RULE 4)
```
```
