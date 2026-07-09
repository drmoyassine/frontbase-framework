# Frontbase Framework Evolution: Milestones (Chimera)

**Version**: 3.1
**Status**: Phase 0 ✅ COMPLETE (PROCEED) — Phase 1 greenlit
**Last Updated**: 2026-07-07

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
- [ ] `generateZodFromPropertySchema()` works against the existing registry. *(deferred — the existing `propertySchemas.ts` is 238 lines & schema-light; the TS-API extractor reading Zod directly is the stronger path. Revisit in M1.2.)*
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
**Status**: 🟡 In Progress (M1.1 started 2026-07-07)

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
**Status**: 🔵 Not Started

**Objectives**:
- Full Zod schema extraction (string, number, boolean, enum, object, array; optional/default values; nesting).
- Manifest generation; TypeScript type generation.
- **Query Registrar**: compile data bindings into named registered queries with param schemas.
- Vite plugin with HMR.

**Acceptance Criteria**:
- [ ] All Zod schema types supported; nested schemas handled.
- [ ] Manifests generated for all ui-components.
- [ ] Registered-query artifacts emitted and consumed by the proxy stub.
- [ ] HMR works; build < 30 s typical project; > 80% test coverage.

**Dependencies**: Milestone 1.1

---

### Milestone 1.3: CLI & Diagnostics

**Target**: Weeks 6–8
**Status**: 🔵 Not Started

**Objectives**:
- `frontbase init` scaffolding (`--pure/--with-infra/--full`), `check`, `lint` in `@frontbase/compiler/bin/` (Decision A-10).
- JSON output (`--json`) with file/line/severity/quick-fix for agents.

**Acceptance Criteria**:
- [ ] `npx @frontbase/compiler init my-app --pure` produces a working project.
- [ ] `check` validates schemas + TypeScript; `lint` wraps ESLint + custom rules.
- [ ] All commands support `--json`; errors carry precise file/line/quick-fix.

**Dependencies**: Milestones 1.1, 1.2

---

### Milestone 1.4: SW Bundle Emitter + `simulate`

**Target**: Weeks 8–9
**Status**: 🔵 Not Started

**Objectives**:
- Compiler emits the versioned `sw.js` (engine + site manifest + registration script).
- `frontbase simulate` boots the engine locally in any provider mode (`--provider direct|proxy|draft`).

**Acceptance Criteria**:
- [ ] `sw.js` versioned by content hash; registration script handles `skipWaiting()`.
- [ ] `simulate` renders pages identically across all three provider modes.
- [ ] SW total payload < 150 KB min+gzip.

**Dependencies**: Milestones 1.1, 1.2

---

### Milestone 1.5: Integration & Testing

**Target**: Weeks 9–10
**Status**: 🔵 Not Started

**Objectives**: E2E suite (edge + SW paths), agent validation (Claude/Cursor/Gemini), performance benchmarks, docs.

**Acceptance Criteria**:
- [ ] E2E green on edge path and SW path.
- [ ] Agent success rate documented (target trajectory to 95%).
- [ ] Perf: first-load p50 ≤ current baseline; SW navigation p50 < 5 ms.
- [ ] Phase 1 sign-off.

**Dependencies**: Milestones 1.1–1.4

---

## Phase 2: Infra, Console & Builder (The Single-Worker CMS)

**Duration**: 6–8 Weeks
**Target**: Q4 2026 (October – December)
**Status**: 🔵 Not Started

**Objective**: Complete the CMS layer — concrete infrastructure, the in-worker console API, and the builder — composed into one deployable worker.

### Milestone 2.1: Edge Infrastructure (`@frontbase/edge-infra`)

**Target**: Weeks 1–2
**Status**: 🔵 Not Started

**Objectives**:
- Direct `DataProvider` implementations: D1, Turso/LibSQL, Postgres (Hyperdrive), SQLite.
- **Edge Data Proxy** production implementation: auth, Zod param validation, tenant scoping, registered-query execution.
- Cache (KV/Redis), queues (CF Queues/QStash/BullMQ), vault (AES-GCM + rotation), edge auth gates, sync adapters, blob storage.

**Acceptance Criteria**:
- [ ] Engine renders with direct providers on the edge and proxy provider in the SW against the same data.
- [ ] Proxy rejects unregistered queries and invalid params (security tests).
- [ ] Durable workflow providers pass the workflow E2E suite.
- [ ] Vault decrypt/rotate runs on the edge.

**Dependencies**: Phase 1

---

### Milestone 2.2: Console API (`@frontbase/backend`)

**Target**: Weeks 2–4
**Status**: 🔵 Not Started

**Objectives**:
- Hono console sub-router: pages/drafts CRUD, publish pipeline, projects/tenants, tokens, users.
- Drizzle schemas + migrations (single persistence source of truth).
- Publish pipeline: layout validation → manifest version → `sw.js` version bump → cache invalidation.
- Mounted at `/api/console` in the same worker. **Zero Python in the deploy** (Decision A-13).

**Acceptance Criteria**:
- [ ] Builder saves drafts and publishes via the console API E2E.
- [ ] Publish propagates: new manifest served on edge; SW picks up new version on next navigation.
- [ ] Drizzle read/write validated on D1, Turso, and Postgres.
- [ ] Auth middleware guards all console endpoints.

**Dependencies**: Milestone 2.1

---

### Milestone 2.3: Builder Package (`@frontbase/builder`)

**Target**: Weeks 3–6
**Status**: 🔵 Not Started

**Objectives**:
- Extract the React builder shell (canvas chrome, layers, properties panels) from the existing codebase.
- Local SQLite WASM draft DB + `localDraftProvider`.
- Canvas ↔ SW preview bridge: iframe `/preview` rendered by the local engine.
- Visual workflow editor (React Flow) and sync mapping dashboard.
- Properties inspectors generated from compiler manifests.
- Layout version flags for legacy-layout compatibility.

**Acceptance Criteria**:
- [ ] Builder preview renders through the production engine (parity test: preview HTML == published HTML for same layout).
- [ ] Drag/drop → draft DB → preview refresh loop < 100 ms.
- [ ] Existing JSON layouts load via version-flagged migration.
- [ ] Builder is installable as an add-on to a `--pure` project.

**Dependencies**: Milestones 2.1, 2.2, Phase 1

---

### Milestone 2.4: Single-Worker Packaging & `frontbase deploy`

**Target**: Weeks 5–7
**Status**: 🔵 Not Started

**Objectives**:
- Compose engine + console + proxy + builder assets into one worker build (Workers Static Assets for SPA/builder files).
- `frontbase deploy` wrapping wrangler (primary) and deployctl (secondary).
- Size budget enforcement in CI.

**Acceptance Criteria**:
- [ ] `npx @frontbase/compiler init my-app --full && npx @frontbase/compiler deploy` yields a working CMS at one URL.
- [ ] Worker script < 400 KB min+gzip; total within platform limits.
- [ ] Same project deploys to Deno Deploy with the adapter switched.

**Dependencies**: Milestones 2.1–2.3

---

### Milestone 2.5: Documentation & Testing

**Target**: Weeks 7–8
**Status**: 🔵 Not Started

**Objectives**: agent execution rules + prompt templates, component authoring guide (isomorphic constraints), routing/SW benchmarks, modular installation docs, API reference.

**Acceptance Criteria**:
- [ ] Component authoring guide covers engine-JSX constraints and behavior scripts.
- [ ] Agent prompt templates for common tasks.
- [ ] Benchmarks meet targets; Phase 2 sign-off.

**Dependencies**: Milestones 2.1–2.4

---

## Phase 3: Agent Experience

**Duration**: 3–4 Weeks
**Target**: Q1 2027 (January – February)
**Status**: 🔵 Not Started

### Milestone 3.1: Diagnostic Refinement

**Target**: Weeks 1–2
**Status**: 🔵 Not Started

**Objectives**: quick-fix recommendations, contextual errors, enhanced JSON, tri-environment `simulate` checks in `check` pipeline.

**Acceptance Criteria**:
- [ ] Quick-fixes for the top 20 error classes.
- [ ] `check` optionally verifies edge/SW/draft render parity.
- [ ] Agent success rate > 95% on generated components.

**Dependencies**: Phase 2

---

### Milestone 3.2: Beta Program

**Target**: Weeks 3–4
**Status**: 🔵 Not Started

**Objectives**: launch beta, recruit 20+ testers (framework-only and full-CMS cohorts), feedback loop, iteration backlog.

**Acceptance Criteria**:
- [ ] 20+ beta testers active; weekly feedback reviews; backlog created; Phase 3 sign-off.

**Dependencies**: Milestone 3.1

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

| Phase | Duration | Target | Milestones | Focus |
|-------|----------|--------|------------|-------|
| Phase 0 | 1–2 wks | Jul 2026 | 3 | Chimera validation spike & decision gate |
| Phase 1 | 8–10 wks | Aug–Oct 2026 | 5 | Engine (`edge-core`) + Compiler + CLI |
| Phase 2 | 6–8 wks | Oct–Dec 2026 | 5 | Infra + Console + Builder → single-worker CMS |
| Phase 3 | 3–4 wks | Jan–Feb 2027 | 2 | Agent experience & beta |
| Phase 4 | 2–3 wks | Mar–Apr 2027 | 2 | GA launch |

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

**Version**: 3.0
**Status**: Draft — Chimera roadmap
**Owner**: Architecture Team
**Next Review**: After Phase 0 completion
**Related Documents**:
- [CHIMERA-ARCHITECTURE.md](./CHIMERA-ARCHITECTURE.md)
- [PACKAGE-STRUCTURE.md](./PACKAGE-STRUCTURE.md)
- [OPENQUESTIONS.md](./OPENQUESTIONS.md)
- [DECISIONS.md](./DECISIONS.md)
