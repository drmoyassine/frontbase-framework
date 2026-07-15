# Frontbase Framework Evolution: Milestones (Chimera)

**Version**: 3.6
**Status**: Phases 0, 1, 2 ✅ COMPLETE — Phase 3 (Agent Experience) next · CF-22 (console visual parity) OPEN
**Last Updated**: 2026-07-14

> **Phase status at a glance:** Phase 0 🟢 · Phase 1 🟢 · Phase 2 🟢 (M2.3 builder is *foundation-complete* — full canvas is a carried-forward item) · Phase 3 🔵 next · Phase 4 🔵.
> Carried-forward / deferred items from every phase are consolidated in **[§ Carried-forward items](#carried-forward-items-live-backlog)** so nothing is lost between phases.
>
> **Parallel track — CF-18 admin-console parity (not the "Phase 3: Agent Experience" milestone below):** a separate effort (3a→3b→3c + two follow-up sprints, 2026-07-12/13) took the admin console from MVP (3.5/11 nav areas) to full **functional-area** parity (11/11 areas backed by real endpoints + working UI, WYSIWYG + React Flow, real execution/storage/provisioning). **Single source of truth: [`docs/phase-3-consolidated-delivery.md`](./phase-3-consolidated-delivery.md)** — the deviations ledger is fully closed; only **F8b Stripe** remains deferred. **⚠️ Correction (2026-07-14): "full parity" measured feature-area coverage, NOT visual/UX depth.** The first real-world deploy showed the console is far thinner than the product's (~2.2k lines / 6 UI primitives vs ~11.5k lines / 52 shadcn primitives / 110-file builder studio). That gap is now tracked as **CF-22** — gap analysis + plan: [`docs/cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md). This track's "Phase 3" numbering is independent of the milestone Phase 3 in this file.

---

## Overview

Milestone tracking for the Chimera (Universal eSSR) implementation. Each milestone includes acceptance criteria, dependencies, and status. Estimates assume **solo-developer capacity**; engineering time totals ~21–27 weeks with GA targeted **Q1–Q2 2027**.

Guiding principles (all milestones serve these):
1. Complete CMS deployment in a single edge worker.
2. The Chimera eSSR model — one engine, three environments.
3. Six npm packages.

---

## Phase 0: Chimera Validation Spike

**Duration**: 1–2 Weeks
**Target**: July 2026
**Status**: 🟢 **COMPLETE (2026-07-07)** — decision gate closed: **PROCEED** ([PHASE0-DECISION-MEMO.md](./PHASE0-DECISION-MEMO.md))

### Milestone 0.1: Engine-in-Service-Worker Proof-of-Concept

**Target**: Days 1–4
**Status**: 🟢 **COMPLETE (2026-07-06)** — results in [spike/README.md](./spike/README.md)

**Objectives**:
- Bundle a minimal Hono app + the existing string renderers into a service worker.
- Intercept a navigation and render one real published page locally.
- Fetch page data through a stub `/api/data/:queryId` proxy (no raw SQL from the SW).
- Measure SW bundle size, install time, and render time.

**Acceptance Criteria**:
- [x] SW intercepts navigation and returns engine-rendered HTML. *(verified in Chromium)*
- [x] Data flows exclusively through the proxy stub (no secrets in the browser). *(registered query → 200; unknown query → 404)*
- [x] SW bundle < 150 KB min+gzip *(measured: **52.6 KB**)*; local render < 5 ms p50 *(measured: **~1.1–1.5 ms**)*.
- [ ] Behavior documented for Safari/iOS and SW-disabled browsers (fallback to edge path). *(deferred to CHM-2; fallback path exercised implicitly — pre-SW loads render from edge)*

**Key Phase 1 findings**: `renderPage` env-var reads must move behind engine config; storage import is the only impurity (favicon-only); renderer path otherwise SW-clean. See spike README §Findings.

**Dependencies**: None

---

### Milestone 0.2: Render Parity + Schema Extraction PoC

**Target**: Days 4–8
**Status**: 🟢 **COMPLETE (2026-07-06)** — results in [spike/README.md](./spike/README.md)

**Objectives**:
- Render the same published page on the edge path and in the SW; diff the HTML.
- Build a minimal AST extractor pulling a Zod `Schema` export from one component (Hero.tsx) and generating a manifest + TypeScript types.
- Validate the `propertySchemas.ts` → Zod generation bridge on real schemas.

**Acceptance Criteria**:
- [x] Byte-identical HTML between edge render and SW render for the test page. *(both `/` and `/products`, same-env-label test in `verify.mjs`)*
- [x] Schema extracted from Hero.tsx; valid manifest + types generated. *(14/14 assertions in `extract-verify.mjs`)*
- [x] `generateZodFromPropertySchema()` works against the existing registry. *(✅ CLOSED as superseded — CF-2: the TS-API extractor reads Zod directly and is the shipped path; the legacy `propertySchemas.ts` bridge is intentionally not built. No runtime depends on it.)*
- [x] Unit tests pass for extraction. *(Zod round-trip: manifest-derived schema agrees with original on 5 accept/reject cases)*

**Key Phase 1 findings**: TS compiler API is the right extractor tool (~190 lines, build-time only); zod v3 vs v4 AST shape differs (pin the version); round-trip testing is the extractor safety net. See spike README §Extraction findings.

**Dependencies**: Milestone 0.1

---

### Milestone 0.3: Single-Worker Deploy + Agent Validation + Decision Gate

**Target**: Days 8–12
**Status**: 🟢 **COMPLETE (2026-07-07)** — live deploy + SW-handover click-test PASSED; agent component-generation test PASSED at 3× planned scope (**9/9 components of the real homepage, 100% first attempt, 31/31 real payloads**); decision memo finalized (**PROCEED**). Results in [spike-cf/README.md](./spike-cf/README.md) + [PHASE0-DECISION-MEMO.md](./PHASE0-DECISION-MEMO.md).

**Objectives**:
- Deploy ONE worker serving: engine eSSR catch-all, `/sw.js`, a stub `/api/console/health` route, and static assets. Measure against platform script limits.
- Have Claude/Cursor generate 3+ components against the schema contract; validate with a prototype `frontbase check --json`.
- Write the decision memo.

**Acceptance Criteria**:
- [x] Single worker artifact serves all route classes (engine + console + data proxy + inlined SW). *(7/7 routing smoke)*
- [x] Worker script size measured and within budget (< 400 KB target, 1 MiB hard limit). *(measured: **104.6 KB** gzip)*
- [x] Live `wrangler deploy` to `*.workers.dev` + browser SW-handover verification. *(deployed to `frontbase-chimera-spike.studygram-inc.workers.dev`; **click-test PASSED** — nav to `/products` renders with `rendered-by=service-worker`, served by the SW, no edge round-trip)*
- [x] Decision memo: **Proceed / Adjust / Abort** → [PROCEED](./PHASE0-DECISION-MEMO.md) — finalized 2026-07-07.
- [x] Agent-generated components pass prototype validation; success rate documented. *(9/9 components — every prop-bearing type of the real homepage `homee.frontbase.json` — 100% first attempt; validated against 31 real production payloads + extraction round-trip. See memo §Agent test.)*

**Key Phase 1 findings**: engine is runtime-portable with zero changes across Node/SW/Worker (the Chimera's one-engine promise verified on all three hosts); `platform: 'browser'` is the correct esbuild target for Workers; no `nodejs_compat` flag needed; **navigation must be anchor-based** (production `Button`'s `data-navigate-to` needs a client behaviors script the Chimera doesn't ship — use `<a href>` so the SW intercepts). Full list in the decision memo §Phase 1 inputs.

**Dependencies**: Milestones 0.1, 0.2

---

## Phase 1: Engine & Compiler

**Duration**: 8–10 Weeks
**Target**: Q3 2026 (August – October)
**Status**: 🟢 **COMPLETE (2026-07-09)** — M1.1–M1.5 all green. `@frontbase/edge-core` extracted; `@frontbase/compiler` (extraction, A-16 query registrar, manifest assembly, Vite plugin, CLI, SW emitter, simulate) delivered. All gates green; delivery report `docs/delivery/phase1-delivery-report.md`.

**Objective**: Extract `@frontbase/edge-core` (the Chimera engine) and build the `@frontbase/compiler` MVP with CLI. No new persistence, no builder work.

### Milestone 1.1: Engine Extraction (`@frontbase/edge-core`)

**Target**: Weeks 1–4
**Status**: 🟢 **COMPLETE (2026-07-09)** — all acceptance criteria met. Renderer port · unified engine router · behaviors runtime · workflow engine (standalone in-memory, 4 provider seams; AI/MCP → edge-infra M2.1; edge-only subpath) · `examples/cf-worker` proving the package on all three hosts. `@frontbase/edge-core` builds standalone (zero db/backend/builder deps). **All gates green: parity 14/14 · engine 10/10 · behaviors 10/10 · workflow 12/12 · cf-worker smoke 6/6 · size 57.2 KB engine + 1.4 KB behaviors + 3.2 KB workflow (tree-shaken out of SW bundle).** One manual step remains for a live URL: `wrangler deploy` from `examples/cf-worker` (mechanism identical to the Phase 0 spike, which passed). **→ M1.2 (compiler) next.**

**Objectives**:
- ✅ Create the package; consolidate `lite.ts`/`full.ts` into the unified priority router.
- ✅ Port the SSR string renderers into engine components behind the eSSR renderer interface.
- ✅ Introduce the `DataProvider` DI contract; implement the built-in `proxyProvider`; remove hard-wired database/backend calls from the engine.
- ✅ Extract the workflow engine with in-memory queue/checkpoint defaults behind provider interfaces.
- ✅ Formalize the client behaviors runtime from the existing `interactive.ts` patterns.
- ☐ Dev-only file-system routing. *(deferred to M1.3/M1.4 tooling — it's a compiler/CLI dev-server concern, not an engine-runtime one)*

**Acceptance Criteria**:
- [x] `@frontbase/edge-core` builds standalone with zero database/backend/builder dependencies.
- [x] Existing published pages render **byte-identically** through the new engine (edge path) — regression suite in CI.
- [x] Workflows execute standalone (in-memory mode). *(12/12 acceptance tests; 4 provider seams; edge-only subpath)*
- [x] Bundle < 70 KB min+gzip (CI-gated). *(57.2 KB engine; workflow tree-shaken out)*
- [x] Engine boots inside a service worker using SW primitives from Milestone 0.1. *(`examples/cf-worker` builds the package into a deployable CF Worker + inlined SW bundle; 6/6 routing smoke incl. /sw.js handover + real homepage. Package proven on all three hosts: Node, CF Worker, browser SW. Live `wrangler deploy` + browser handover click-test is the one manual step — the mechanism is identical to the Phase 0 spike which passed.)*

**Dependencies**: Phase 0 decision gate

---

> **📋 Detailed junior-agent sprint plan for M1.2–M1.5**: [`docs/plans/phase1-compiler-cli-sprint.md`](./plans/phase1-compiler-cli-sprint.md) — step-by-step deliverables, file maps, per-step gates, sequencing, and guardrails.

### Milestone 1.2: Compiler Core (`@frontbase/compiler`)

**Target**: Weeks 4–6
**Status**: 🟢 **COMPLETE (2026-07-09)** — see [`docs/plans/phase1-compiler-cli-sprint.md`](./plans/phase1-compiler-cli-sprint.md).

**Objectives**:
- ✅ Full Zod schema extraction (string, number, boolean, enum, object, array; optional/default values; nesting; **plus** .nullable, format hints .email/.url/.uuid, ≥2-deep nesting, structured diagnostics for unsupported constructs).
- ✅ Manifest generation; TypeScript type generation (`generateTypes`).
- ✅ **Query Registrar** (A-16): `defineQueries()` → edge/browser projections (`toEdgeQueries`/`toBrowserQueries`); execute stripped from the browser.
- ✅ Deterministic SiteManifest assembly (content-hash version, sorted keys) — feeds `createEngine`, renders 200 OK, A-16 Zod rejection proven end-to-end.
- ✅ Vite plugin with HMR (`frontbasePlugin`).

**Acceptance Criteria**:
- [x] All Zod schema types supported; nested schemas handled. *(round-trip vs real zod on every kind)*
- [x] Manifests generated for a representative component set.
- [x] Registered-query artifacts emitted and consumed by the engine's Edge Data Proxy. *(manifest test: proxy accepts valid params, 400 on bad)*
- [x] HMR works; **91% line / 100% function coverage** (> 80% gate); determinism: rebuild byte-identical.

**Gates**: `pnpm --filter @frontbase/compiler test` → extractor + queries + manifest + vite all PASS; clean strict build; frozen edge-core gates still green.

**Dependencies**: Milestone 1.1 ✅

---

### Milestone 1.3: CLI & Diagnostics

**Target**: Weeks 6–8
**Status**: 🟢 **COMPLETE (2026-07-09)** — `init`/`check`/`lint` (+ `simulate`/`emit-sw` from M1.4), all with `--json` agent output. Gate: `test/cli.mjs` 20/20.

**Acceptance Criteria**:
- [x] `npx @frontbase/compiler init my-app --pure` produces a working project (buildable; `--with-infra`/`--full` scaffold Phase-2 wiring placeholders).
- [x] `check` validates schemas + TypeScript (MISSING_SCHEMA/UNSUPPORTED_ZOD/TS####); `lint` runs 3 custom rules (FB001 no-browser-globals, FB002 anchor-nav, FB003 describe-every-prop). ESLint wrapping is a documented thin layer on top.
- [x] All commands support `--json`; errors carry precise file/line/quick-fix (AgentFormatter → spec `AgentOutput`).

**Dependencies**: Milestones 1.1, 1.2 ✅

---

### Milestone 1.4: SW Bundle Emitter + `simulate`

**Target**: Weeks 8–9
**Status**: 🟢 **COMPLETE (2026-07-09)** — gates `test/sw-emit.mjs` + `test/simulate.mjs`.

**Acceptance Criteria**:
- [x] `sw.js` versioned by content hash; registration handles `skipWaiting()` (via `attachServiceWorker`). Determinism + content-sensitivity proven.
- [x] `simulate` renders pages identically across `direct`/`proxy`/`draft` (byte-identical bodies; provider is the only variable).
- [x] SW total payload < 150 KB min+gzip — **measured 54.7 KB**.

**Dependencies**: Milestones 1.1, 1.2 ✅

---

### Milestone 1.5: Integration & Testing

**Target**: Weeks 9–10
**Status**: 🟢 **COMPLETE (2026-07-09)** — Phase 1 sign-off. Full report: [`docs/delivery/phase1-delivery-report.md`](../delivery/phase1-delivery-report.md).

**Acceptance Criteria**:
- [x] E2E green on edge path and SW path — byte-parity both (records data included), `test/e2e-parity.mjs`.
- [x] Agent success rate documented — deterministic cohort 5/5 (100%), live cold-agent cohort **8/8 (100%)**, target ≥ 90% met (trajectory to 95% on track).
- [x] Perf: edge first-load p50 **0.06 ms**, SW nav p50 **0.05 ms** (budgets < 5 ms); extractor p50 0.073 ms.
- [x] Authoring (`docs/guides/authoring-components.md`) + CLI (`docs/guides/cli.md`) guides written.
- [x] **Phase 1 sign-off.**

**Dependencies**: Milestones 1.1–1.4 ✅

---

## Phase 2: Infra, Console & Builder (The Single-Worker CMS)

**Duration**: 6–8 Weeks
**Target**: Q4 2026 (October – December)
**Status**: 🟢 **COMPLETE (2026-07-10)** — M2.1–M2.5 all green. `@frontbase/edge-infra` (DataProviders/auth/vault/cache/queue/AI executors), `@frontbase/backend` (console API, default-deny auth, Drizzle, publish), `@frontbase/builder` (React shell + parity), and single-worker `frontbase deploy` delivered. All GOLDEN RULES hold; delivery report `docs/delivery/phase2-delivery-report.md`.

### Milestone 2.1: Edge Infrastructure (`@frontbase/edge-infra`)

**Target**: Weeks 1–2
**Status**: 🟢 COMPLETE (2026-07-10) — DataProviders (SQLite ref + D1/Turso/Postgres), resolvePrincipal auth, Web-Crypto vault, cache, durable queue, AI/MCP executors. 7 gates green incl. parameterized cross-tenant isolation (A-17).

**Objectives**:
- Direct `DataProvider` implementations: D1, Turso/LibSQL, Postgres (Hyperdrive), SQLite.
- **Edge Data Proxy** production implementation: auth, Zod param validation, tenant scoping, registered-query execution.
- Cache (KV/Redis), queues (CF Queues/QStash/BullMQ), vault (AES-GCM + rotation), edge auth gates, sync adapters, blob storage.

**Acceptance Criteria**:
- [x] Engine renders with direct providers on the edge and proxy provider in the SW against the same data.
- [x] Proxy rejects unregistered queries (404) and invalid params (400) — security tests (`edge-core/scope`, `edge-infra/proxy-auth`).
- [x] Durable workflow providers pass the workflow contract (`edge-infra/workflow-durable`).
- [x] Vault decrypt/rotate runs on the edge (Web Crypto AES-GCM; `edge-infra/vault`).
- [x] **Cross-tenant isolation** parameterized by provider (A-17); SQLite authoritative (`edge-infra/isolation`).
- [x] **No-leak**: edge-infra is server-only, never browser-importable (`edge-infra/no-leak`).

**Post-audit note (2026-07-10):** the Phase 2 security review found the eSSR **page path** bypassed scope/tenant (SEC-P2-1) — fixed in `edge-core` and regression-covered in `scope.mjs`. See `docs/delivery/phase2-delivery-report.md` §5.1.

**Dependencies**: Phase 1

---

### Milestone 2.2: Console API (`@frontbase/backend`)

**Target**: Weeks 2–4
**Status**: 🟢 COMPLETE (2026-07-10) — createConsole default-deny router, Drizzle single-source, tenant-scoped CRUD, publish pipeline (execute-stripped browser projection). 4 gates green.

**Objectives**:
- Hono console sub-router: pages/drafts CRUD, publish pipeline, projects/tenants, tokens, users.
- Drizzle schemas + migrations (single persistence source of truth).
- Publish pipeline: layout validation → manifest version → `sw.js` version bump → cache invalidation.
- Mounted at `/api/console` in the same worker. **Zero Python in the deploy** (Decision A-13).

**Acceptance Criteria**:
- [x] Builder (test client) saves drafts and publishes via the console API E2E (`backend/console`, `backend/publish`).
- [x] Publish propagates: content-hash manifest version bump + execute-stripped browser projection + cache purge (`backend/publish`).
- [~] Drizzle read/write validated on D1, Turso, and Postgres. *(🟢 CODE-READY — SQLite authoritative + contract-verified; the identical suite runs on each cloud DB when creds are set (`edge-infra/test/runners.mjs`, `backend/test/postgres-datasource.mjs`). Blocker is credentials, not code — CF-10)*
- [x] Auth middleware guards all console endpoints — **default-DENY** on the whole router (`backend/authz`).

**Post-audit note (2026-07-10):** the `authz` isolation test originally used two separate in-memory DBs (proving nothing); fixed to share one DB and mutation-verified (SEC-P2-2). See delivery report §5.1.

**Dependencies**: Milestone 2.1

---

### Milestone 2.3: Builder Package (`@frontbase/builder`)

**Target**: Weeks 3–6
**Status**: 🟡 FOUNDATION COMPLETE (2026-07-10) — React shell + localDraftProvider + canvas↔preview byte-parity + manifest-driven panels + no-leak. Full drag/drop + React Flow editor = documented follow-up. 4 gates green.

**Objectives**:
- Extract the React builder shell (canvas chrome, layers, properties panels) from the existing codebase.
- Local SQLite WASM draft DB + `localDraftProvider`.
- Canvas ↔ SW preview bridge: iframe `/preview` rendered by the local engine.
- Visual workflow editor (React Flow) and sync mapping dashboard.
- Properties inspectors generated from compiler manifests.
- Layout version flags for legacy-layout compatibility.

**Acceptance Criteria**:
- [x] Builder preview renders through the production engine — preview HTML == published HTML (`builder/parity`).
- [x] Drag/drop → draft DB → preview refresh loop < 100 ms. *(CF-8 DONE 2026-07-10 — canvas model + React view, loop **p50 0.18 ms / p95 1.05 ms**; React Flow workflow editor shipped in CF-18 Phase 3c)*
- [x] Existing JSON layouts load via version-flagged migration. *(CF-9 DONE 2026-07-10 — `compiler migrateLayout`; migrated legacy renders byte-identical to the golden corpus)*
- [x] Builder is installable as an add-on to a `--pure` project (localDraftProvider + manifest panels; no-leak gate green).

**Note:** M2.3 is **COMPLETE** — the parity guarantee, draft provider, manifest-driven panels, the full drag/drop canvas (CF-8), the React Flow workflow editor (CF-18 Phase 3c), and legacy-layout migration (CF-9) all ship and are gated.

**Dependencies**: Milestones 2.1, 2.2, Phase 1

---

### Milestone 2.4: Single-Worker Packaging & `frontbase deploy`

**Target**: Weeks 5–7
**Status**: 🟢 COMPLETE (2026-07-10) — composeWorker + frontbase deploy (wrangler/deployctl, --dry-run). /sw.js composition-boundary gate green; worker 54.9 KB < 400 KB.

**Objectives**:
- Compose engine + console + proxy + builder assets into one worker build (Workers Static Assets for SPA/builder files).
- `frontbase deploy` wrapping wrangler (primary) and deployctl (secondary).
- Size budget enforcement in CI.

**Acceptance Criteria**:
- [x] `init --full && deploy --dry-run` composes a working CMS worker artifact + in-process routing smoke (`compiler/deploy`).
- [x] Worker script < 400 KB min+gzip — **measured 54.9 KB**; served `/sw.js` has no server code (composition-boundary gate).
- [~] Same project deploys to Deno Deploy with the adapter switched. *(🟢 CODE-READY — deployctl path wired in `compiler/cli/deploy.ts`; the only remaining step is a live run against a Deno account. Blocker is credentials, not code. CF-13)*
- [~] **Live** `wrangler deploy` to a public URL. *(🟢 CODE-READY — dry-run + single-artifact proven (cf-full smoke 10/10, 390.6 KB gzip). To finish: `cd examples/cf-full && wrangler deploy` with a CF account + real D1 `database_id`. Blocker is a CF account, not code. CF-12)*

**Dependencies**: Milestones 2.1–2.3

---

### Milestone 2.5: Documentation & Testing

**Target**: Weeks 7–8
**Status**: 🟢 **COMPLETE (2026-07-10)** — guides + security sweep + Phase 2 delivery report; Phase 2 sign-off. Post-delivery security audit (2026-07-10) folded in (SEC-P2-1/-2 fixed).

**Acceptance Criteria**:
- [x] Component/infra/console/deploy guides written (`docs/guides/`).
- [x] Agent prompt templates for common tasks. *(✅ DONE 2026-07-10 — CF-14: `docs/guides/agent-authoring.md` ships component/page/query/workflow templates.)*
- [x] Benchmarks meet targets (publish p50 0.27 ms; worker 54.9 KB); **security sweep** RULES 1–4 green across all packages; Phase 2 sign-off.

**Dependencies**: Milestones 2.1–2.4

---

## Phase 3: Agent Experience

**Duration**: 3–4 Weeks
**Target**: Q1 2027 (January – February)
**Status**: 🔵 Not Started — **next up.**

> **📋 Detailed implementer sprint plan for M3.0–M3.2**: [`docs/plans/phase3-agent-experience-sprint.md`](./plans/phase3-agent-experience-sprint.md) — includes an **M3.0 carried-forward hardening milestone** (clears the audit-lesson RULE 8, the builder full-canvas port, cloud-DB live gates, and the live deploy) before the agent-experience work proper.

### Milestone 3.0: Carried-Forward Hardening & Gate Integrity

**Target**: Week 1 (front-loaded)
**Status**: 🟡 **MOSTLY COMPLETE (2026-07-10)** — all buildable items done; two credential-gated items (3.0.4 cloud-DB live, 3.0.6 live deploy) are user-side. 36 suites green across 5 packages; 12 mutation proofs RED-on-break.

**Objective**: clear the backlog that accumulated across Phases 0–2 and codify the audit lesson so Phase 3 builds on solid ground (see [§ Carried-forward items](#carried-forward-items-live-backlog)).

**Acceptance Criteria**:
- [x] **RULE 8 (mutation-tested gates)** codified + applied: `scripts/mutation-lib.mjs` + per-package `test/mutation.mjs` + `pnpm -r test:mutation`; **18 security gates proven to go RED when their guarantee is broken** (12 at M3.0, +6 auth/DB gates added 2026-07-11 for the identity sprint; the harness caught 2 hollow gates on its first run — backend user-guard, compiler serialization boundary). *(CF-15)*
- [x] Builder full canvas: drag/drop → draft → preview loop **p50 0.18 ms / p95 1.05 ms** (< 100 ms); pure model + React view; canvas-parity (preview == published) + no-leak green. *(CF-8; React Flow workflow editor deferred to M3.1/follow-up)*
- [x] Legacy-layout version-flagged migration: `migrateLayout` (v1 builder export/bare tree → current); migrated legacy renders **byte-identically** to the golden corpus. *(CF-9)*
- [x] Drizzle migration runner (versioned, reversible) replaces auto-create-on-boot; apply→rollback→re-apply converges; fresh DB == upgraded DB. *(CF-11)*
- [x] Rate limiting: per-principal token bucket, opaque 429, keyed by resolved principal; ships with its mutation proof. *(CF-16)* + Safari/SW-disabled fallback test. *(CF-1)*
- [~] Cloud-DB live gates run green where credentials are provided (D1/Turso/Postgres) — identical parameterized isolation suite (A-17). *(🟢 CODE-READY — gates ship + self-skip without creds; set env vars → `pnpm -r test` turns them green. Blocker is credentials, not code — CF-10)*
- [~] Live `wrangler deploy` to a public `*.workers.dev` URL + browser SW-handover verification. *(🟢 CODE-READY — dry-run + artifact proven; run `wrangler deploy` from `examples/cf-full` with a CF account. Blocker is a CF account, not code — CF-12/13)*

**Dependencies**: Phase 2

---

### Milestone 3.1: Diagnostic Refinement

**Target**: Weeks 1–2
**Status**: 🟢 **COMPLETE (2026-07-10)** — quick-fixes (machine-applicable `TextEdit` on Issues), `check --parity` (mutation-proven), agent templates, raised-difficulty success rate (18/18 = 100%), ESLint adapter + dev FS routing. Report `docs/delivery/m3.1-delivery-report.md`.

**Objectives**: quick-fix recommendations, contextual errors, enhanced JSON, tri-environment `simulate` checks in `check` pipeline, agent prompt templates (carried from M2.5).

**Acceptance Criteria**:
- [x] Quick-fixes for the diagnostic classes (MISSING_SCHEMA/FB003/UNSUPPORTED_ZOD machine-applicable; FB001/FB002/TS descriptive).
- [x] `check --parity` verifies edge/proxy/draft render parity (reuses `simulate`; **RULE 8 mutation-proven**).
- [x] Agent success rate **> 95%** at raised difficulty — **18/18 (100%)** (deterministic 10 harder shapes + live 8).
- [x] Agent prompt templates (component/page/query/workflow) + ESLint flat-config adapter + dev FS routing.

**Dependencies**: Milestone 3.0

---

### Milestone 3.2: Beta Program

**Target**: Weeks 3–4
**Status**: 🔵 Not Started

**Objectives**: launch beta, recruit 20+ testers (framework-only and full-CMS cohorts), feedback loop, iteration backlog.

**Acceptance Criteria**:
- [ ] 20+ beta testers active; weekly feedback reviews; backlog created; Phase 3 sign-off.

**Dependencies**: Milestone 3.1

---

## Carried-forward items (live backlog)

Consolidated deferred work from every phase, so nothing is lost between milestones. Each lands in **M3.0** (hardening) unless noted. Source milestone in brackets.

| # | Item | From | Lands in | Notes |
|---|---|---|---|---|
| CF-1 | Safari/iOS + SW-disabled fallback documented/tested | M0.1 (CHM-2) | M3.0 | ✅ DONE 2026-07-10 — `edge-core/test/fallback.mjs` (edge renders full page, no SW APIs) |
| CF-2 | `generateZodFromPropertySchema()` legacy bridge | M0.2 | — | ✅ **CLOSED (won't-build) 2026-07-13** — **superseded** by the TS-API extractor (M1.2), which reads Zod directly and is the shipped path. The legacy `propertySchemas.ts` bridge is intentionally not built; no runtime depends on it |
| CF-3 | Dev-only file-system routing | M1.1 | M3.1 | ✅ **DONE** (2026-07-10, M3.1.5) — `compiler/src/cli/devRouter.ts` (dev pages come from the FS; production builds use the baked manifest); gated by `compiler/test/m3.1.5.mjs` |
| CF-4 | ESLint programmatic wrapping for `lint` | M1.3 | M3.1 | ✅ **DONE** (2026-07-10, M3.1) — `compiler/src/cli/eslintPlugin.ts` ships a flat-config plugin (`eslint-plugin-frontbase`) exposing the 3 custom rules; `eslint` is an OPTIONAL peer dep (rules also run standalone via `lint`) |
| CF-5 | `simulate --serve` optional `@hono/node-server` dep documented | M1.4 | M3.0 | ✅ **DONE 2026-07-13** — `serve()` lazy-imports `@hono/node-server` and now throws a clear "install @hono/node-server" hint if it's absent (was a raw `ERR_MODULE_NOT_FOUND`); documented in `docs/guides/cli.md` §`simulate` (optional-dep callout). Compiler builds + all 16 suites green without the dep installed |
| CF-6 | Self-contained deployable full-CMS example (no published packages) + `init` version ranges | M1.3 | M4.1 (scaffold) | ✅ **Example DONE 2026-07-11** — `examples/cf-full` pre-bundles engine+console+D1-runner into ONE `dist/worker.mjs` (**142 KB gzip**, login-gated, smoke-proven end-to-end); `no_bundle=true`, no `npm install` on deploy. The `workspace:*`→version-range concern now only affects the *scaffold* path (M4.1), not this artifact |
| CF-6a | **Sever node from the publish path** so the console bundles for a Worker | M-DB.0 | 2026-07-11 | ✅ DONE — publish pipeline imported the `@frontbase/compiler` barrel (node:fs/zlib/crypto via vite/CLI/SW-emit) and `buildSiteManifest` used `node:crypto`. Added an edge-safe **sync sha256** (digests byte-identical to node → parity preserved) + narrow **`@frontbase/compiler/manifest`** subpath. CMS bundle now has **zero `node:` builtins, zero `require`** |
| CF-7 | Browser query projection → JSON-Schema (if SW needs client-side param validation) | M1.2 | future | ✅ **CLOSED (by-design) 2026-07-13** — `toBrowserQueries()` ships the execute-stripped projection with a `hasParams` marker (`compiler/queries/registrar.ts`); **param validation is edge-side by design** (RULE 2 — the browser never validates its own params). Full client-side JSON-Schema is only needed if a future feature validates in the SW; not required today |
| CF-8 | **Builder full canvas** (drag/drop < 100 ms) + React Flow workflow editor | M2.3 | M3.0 | ✅ DONE 2026-07-10 — canvas model + view, loop p50 0.18ms; React Flow workflow editor still a follow-up |
| CF-9 | Legacy JSON layout version-flagged migration | M2.3 | M3.0 | ✅ DONE 2026-07-10 — `compiler migrateLayout`; migrated legacy renders byte-identical to corpus |
| CF-10 | Cloud-DB **live** gates (D1/Turso/Postgres) | M2.1/2.2 | M-DB.0 | 🟢 **CODE-READY — user-action only.** SQLite authoritative (A-17); the identical parameterized suite runs on cloud DBs when creds are set. Live gates ship + self-skip without creds: `edge-infra/test/runners.mjs` (D1/Turso), `backend/test/postgres-datasource.mjs` (`POSTGRES_URL`), `supabase-provisioning.mjs` (`SUPABASE_*`). **To turn green:** set the env vars and run `pnpm -r test`. **Blocker is credentials, not code.** |
| CF-11 | Drizzle **migration runner** (versioned/reversible) | M2.2 | M3.0 | ✅ DONE 2026-07-10 — `backend/db/migrations.ts`; apply/rollback/re-apply converges. **Refactored onto `DbRunner` in M-DB.0** (migrations run on any adapter); migrations v1–v3 (schema, users, tenants) |
| CF-12 | **Live `wrangler deploy`** to public URL + SW-handover check | M1.1/M2.4 | M3.0 | 🟢 **CODE-READY — user-action only.** Dry-run + single-artifact proven (cf-full smoke 10/10, 390.6 KB gzip < 1 MB). **To turn green:** `cd examples/cf-full && wrangler deploy` (needs a CF account + a real D1 `database_id` in `wrangler.toml`), then click-test the SW handover. **Blocker is a CF account, not code.** |
| CF-13 | Live **Deno Deploy** via deployctl | M2.4 | M3.0 | 🟢 **CODE-READY — user-action only.** deployctl adapter wired (`compiler/cli/deploy.ts`). **To turn green:** run the deployctl path against a Deno Deploy project. **Blocker is a Deno account, not code.** |
| CF-14 | Agent prompt templates | M2.5 | M3.1 | ✅ DONE 2026-07-10 — `docs/guides/agent-authoring.md` (component/page/query/workflow templates) |
| CF-15 | **RULE 8 — mutation harness** (every security gate proven RED-on-break) | Phase 2 audit | M3.0 | ✅ DONE 2026-07-10; **extended 2026-07-12**: 12 → **20 proofs** (auth/DB gates, CF-19 deploy-seed no-argv-leak, +1 admin-console no-leak gate). `pnpm -r test:mutation` |
| CF-16 | Rate limiting / abuse protection on the proxy | Phase 2 audit | M3.0 | ✅ DONE 2026-07-10 — `edge-infra/proxy/ratelimit.ts` (per-principal bucket, opaque 429, mutation-proven) |
| CF-17 | Per-row / finer-grained authorization policy layer | Phase 2 audit | future | scope is coarse (public/tenant/user) by design today |
| CF-18 | **Admin console React UI** — shell + login + dashboard + pages + tenants | M-ID.3 / M3.DB | M-ID.3-UI | ✅ **DONE — FUNCTIONAL-AREA PARITY 2026-07-13** *(previously overstated as "FULL PARITY"; visual/UX-depth parity re-opened as CF-22)* — Phases 1+2+3 (a/b/c) + two follow-up sprints. **All 11 nav areas functional, no "coming soon" left** (Data Studio + Plans shipped in 3b). WYSIWYG canvas + React Flow workflow editor (3c); real execution/storage/provisioning/encrypted-secrets (3a); Supabase schema provisioning + durable async workflow execution (follow-up sprint 2). **Every deviation (D1-D6) + follow-up (F1-F8, F3b-durable, BUG-1) CLOSED with tests; 0 open engineering items** — only F8b Stripe deferred. Single source of truth: `docs/phase-3-consolidated-delivery.md`. Verification: 57+ suites green, mutation 8/8 RED-on-break, cf-full smoke 10/10 (390.6 KB gzip), SPA no-leak |
| CF-19 | **Deploy-seed gate** (`compiler/test/deploy-seed.mjs`) | M-ID.1.7 | 2026-07-11 | ✅ DONE — `frontbase deploy --admin-email/--admin-password/--setup-token/--session-secret` → `wrangler secret put SESSION_SECRET/ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_ROLE/SETUP_TOKEN` over **stdin, never argv**; auto-generates SESSION_SECRET (32 random bytes b64); email-without-password fails fast; result reports secret **names only**. Gate + **mutation proof** (value-on-argv → RED) |
| CF-20 | **Supabase adapter** → `DbRunner` behind the M-DB.0 seam | M-DB.0 / M3.DB | 2026-07-12 | ✅ DONE — `supabaseRunner()` factory in `edge-infra/providers/runners.ts` (PostgREST HTTP adapter, raw SQL via RPC `execute_query`/`execute_sql` functions). Docs: `docs/guides/supabase-setup.md`. Edge-parity audit (`docs/cf-21-edge-parity-audit.md`) completed. Parameterized isolation suite (A-17) runs on SQLite (authoritative) + Supabase (if creds). No-leak gated. **Next:** integrate into datasources UI (CF-18 Phase 2+) |
| CF-21 | **Port-parity audit + admin-console feature-parity scan** | ongoing | 2026-07-12 | ✅ DONE — Two parallel audits completed: (1) **Admin parity** (`docs/cf-21-admin-parity-audit.md`) — product console vs framework backend (~3.5/11 areas have framework backend). (2) **Edge parity** (`docs/cf-21-edge-parity-audit.md`) — product edge services vs framework edge-infra (DbRunner seam solid, Supabase/Neon adapters exist, porting matrix). Both inform CF-18 Phase 2+ sequencing |
| CF-22 | **Admin console 100% visual + functional parity (community edition)** — contract-first, artifact-reuse: framework backend becomes a drop-in for the product's community-edition FastAPI contract; worker serves the product's **built** console bundle | CF-18 / CF-21 | — | 🟡 **IN PROGRESS — P0 ✅ + P1 ✅ DELIVERED 2026-07-15** (P0: product-repo 341-op committed contract + generated client, CI green — `docs/cf-22-p0-delivery.md`. **P1: framework product-compat `/api` surface + drift gate** — vendored contract pinned `afe9e03`, deterministic 284-op emitted spec, drift gate GREEN (6 implemented `variables` / 278 stubbed / 0 missing / 0 divergent), 22-suite backend + mutation proof green, CI workflow — `docs/cf-22-p1-delivery.md`). Plan: **P0 ✅** → **P1 ✅** framework compat surface (plain Hono + vendored zod — `@hono/zod-openapi` needs zod v4, fallback taken) + native-Node drift gate (npm `oasdiff` is a placeholder pkg) → **P2** implement the 30 remaining tags against the gate's burn-down table → **P3** Workers Static Assets + serve product community bundle + auth shim + Playwright E2E. Scope: **self-host/single-tenant/community only**. Open decision at P3: console artifact open vs private release (default private, reversible). **Full plan: `docs/cf-22-admin-visual-parity-gap.md`** |

*(Note: CF-15 appeared twice in an earlier revision; consolidated into the single row above. The console-DB + identity sprint (**A-19** Console DB Unification / CF D1 default; **A-18** Identity & Provisioning) delivered M-DB.0 + M-ID.1–M-ID.3 and is covered by `docs/delivery/console-db-identity-delivery-report.md` — including a post-delivery security review that found & fixed 5 defects, 2 critical.)*

---

## Phase 4: GA Launch

**Duration**: 2–3 Weeks
**Target**: Q1–Q2 2027 (March – April)
**Status**: 🔵 Not Started

### Milestone 4.1: Launch Preparation

**Objectives**: finalize docs, marketing materials, support infrastructure, critical-bug burn-down, launch checklist.

**Acceptance Criteria**:
- [ ] Docs complete & reviewed; marketing ready; support in place; critical bugs resolved.

**Dependencies**: Phase 3

### Milestone 4.2: Public Launch

**Objectives**: public announcement, community onboarding, metrics monitoring, post-launch review.

**Acceptance Criteria**:
- [ ] Announcement out; docs public; community channels active; metrics tracked; post-launch review scheduled.

**Dependencies**: Milestone 4.1

---

## Milestone Status Legend

| Icon | Status |
|------|--------|
| 🔵 | Not Started |
| 🟡 | In Progress |
| 🟢 | Complete |
| 🔴 | Blocked |
| ⚫ | Cancelled |

---

## Summary

| Phase | Duration | Target | Milestones | Status | Focus |
|-------|----------|--------|------------|--------|-------|
| Phase 0 | 1–2 wks | Jul 2026 | 3 | 🟢 | Chimera validation spike & decision gate |
| Phase 1 | 8–10 wks | Aug–Oct 2026 | 5 | 🟢 | Engine (`edge-core`) + Compiler + CLI |
| Phase 2 | 6–8 wks | Oct–Dec 2026 | 5 | 🟢 | Infra + Console + Builder → single-worker CMS |
| Phase 3 | 3–4 wks | Jan–Feb 2027 | 3 | 🔵 | Hardening (M3.0) + agent experience + beta |
| Phase 4 | 2–3 wks | Mar–Apr 2027 | 2 | 🔵 | GA launch |

**Engineering time**: ~21–27 weeks. **Calendar**: July 2026 → GA Q1–Q2 2027.

### Package Deliverables by Phase

| Phase | Deliverables |
|-------|--------------|
| Phase 0 | Spike PoCs + decision memo |
| Phase 1 | `@frontbase/edge-core`, `@frontbase/compiler`, `@frontbase/ui-components` (consolidated from existing widget packages) |
| Phase 2 | `@frontbase/edge-infra`, `@frontbase/backend`, `@frontbase/builder`, single-worker deploy |
| Phase 3 | Agent tooling & prompt templates |
| Phase 4 | GA |

### Installation Examples

```bash
# After Phase 1
npx @frontbase/compiler init my-app --pure        # engine + compiler + components

# After Phase 2
npx @frontbase/compiler init my-app --full        # complete CMS → one worker
npx @frontbase/compiler init my-app --with-infra  # + durable providers, proxy, vault
npx @frontbase/compiler deploy                    # ship it
```

---

## Document Metadata

**Version**: 3.5
**Status**: Active — Phases 0–2 complete, Phase 3 next
**Owner**: Architecture Team
**Next Review**: After Phase 3 M3.0 (hardening) completion
**Related Documents**:
- [CHIMERA-ARCHITECTURE.md](./CHIMERA-ARCHITECTURE.md)
- [PACKAGE-STRUCTURE.md](./PACKAGE-STRUCTURE.md)
- [OPENQUESTIONS.md](./OPENQUESTIONS.md)
- [DECISIONS.md](./DECISIONS.md)
- Sprint plans: [Phase 1](./plans/phase1-compiler-cli-sprint.md) · [Phase 2](./plans/phase2-cms-sprint.md) · [Phase 3](./plans/phase3-agent-experience-sprint.md)
- Delivery reports: [Phase 1](./delivery/phase1-delivery-report.md) · [Phase 2](./delivery/phase2-delivery-report.md)
- **CF-18 admin-console parity (separate track):** [Phase 3 consolidated](./phase-3-consolidated-delivery.md) (3a/[3b](./phase-3b-delivery.md)/[3c](./phase-3c-delivery.md) detail; deviations ledger + BUG-1)
- **CF-22 admin-console visual parity (open):** [gap analysis + plan](./cf-22-admin-visual-parity-gap.md)
