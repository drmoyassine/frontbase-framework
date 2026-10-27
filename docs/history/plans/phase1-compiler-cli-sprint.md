# Phase 1 Sprint Plan — Compiler, CLI, SW Emitter & Integration (M1.2–M1.5)

**Audience**: a junior developer agent implementing M1.2 → M1.5 with minimal supervision.
**Status**: Ready to execute. M1.1 (`@frontbase/edge-core`) is COMPLETE — all gates green.
**Repo**: `frontbase-framework` (this repo). **Package under construction**: `@frontbase/compiler`.
**Author**: Architecture, 2026-07-09.

---

## 0. Read this first (orientation — 20 min, do not skip)

You are building `@frontbase/compiler` — the build-time tool that turns a developer's `.tsx`
components into the artifacts `@frontbase/edge-core` consumes at runtime. The engine is DONE
and frozen; you consume its public API, you do **not** modify it.

**Before writing any code, read, in order:**
1. `docs/CHIMERA-ARCHITECTURE.md` — the canonical architecture. Non-negotiable.
2. `docs/technical-specification.md` §Build Pipeline, §CLI Tooling — the compiler/CLI design.
   ⚠️ The spec shows `swc`/`recast` for parsing; **we use the TypeScript compiler API instead**
   (see M1.2). Treat the spec's code blocks as intent, not literal copy.
3. `docs/DECISIONS.md` A-14 (six packages), A-15 (repo/license), **A-16 (registered-query model)**.
4. `packages/edge-core/src/index.ts` — the engine's public API (your compile target).
5. `packages/edge-core/src/manifest.ts` — `SiteManifest` / `RegisteredQuery` / `PageEntry`.
   Your compiler's whole job is to **emit a valid `SiteManifest`**.
6. The **proven seed extractor**: `../Frontbase-/docs/frontbase-framework/spike/src/extractor.ts`
   (product repo). It already extracts Zod schemas via the TS compiler API, 14/14 assertions +
   round-trip. **This is your M1.2 starting point — copy it in and extend it, don't rewrite.**
   Its verifier `spike/src/extract-verify.ts` shows the round-trip test pattern to replicate.

**The golden rules of this codebase (learned in M1.1 — violate none):**
- **Gate-driven.** Every milestone ends with runnable gates (`pnpm --filter <pkg> test`, plus
  size/coverage). A milestone is "done" only when its gates are green. No "looks right".
- **No cross-repo imports.** The product repo (`../Frontbase-`) is a *reference to read*, never
  an import target. Copy code in; cite the source in a comment. (A-15 §5.)
- **Deterministic outputs.** Manifests, types, and `sw.js` must be byte-stable for identical
  input (sort keys, no timestamps in content, content-hash versioning). The M1.1 golden corpus
  exists because of this; you will extend it.
- **Zod is pinned at 3.25.** `.describe()` is a chainable method here (v4 changed it to metadata).
  The extractor targets 3.25 AST shapes. Do not bump zod.
- **ESM + `.js` import specifiers.** TS source imports sibling files as `./foo.js` (Node ESM).
  The M1.1 port hit 9 bugs from missing extensions — always write `.js`.
- **Commit per working increment** with green gates, message ending:
  `Co-Authored-By: Claude <noreply@anthropic.com>`. Push to `main`.

**Environment facts:** pnpm 10 workspace; `packages/*` and `examples/*` are members; Node 20+;
`typescript`, `esbuild`, `jsdom` already at the workspace root. Windows dev box, Git Bash shell.
`.gitattributes` marks corpus fixtures `-text` — never let CRLF touch generated fixtures.

**How to ask for help:** if a gate can't go green because the engine's API is missing something,
STOP and write the gap into `docs/plans/phase1-blockers.md` with the exact call you needed —
do not modify `@frontbase/edge-core` to paper over it without an architecture decision.

---

## Definition of Done (Phase 1 — all four milestones)

`npx @frontbase/compiler init my-app --pure` scaffolds a project; a developer writes a `.tsx`
component with a Zod `Schema`; `frontbase check` validates it; the compiler emits a `SiteManifest`
+ types + a versioned `sw.js`; `frontbase simulate` renders the pages identically on edge/proxy/draft
providers; and an E2E test proves a published page renders byte-identically on the edge path and the
SW path. Agent success rate on generated components is measured and documented.

---

# Milestone 1.2 — Compiler Core (`@frontbase/compiler`)

**Goal**: extract Zod schemas → component manifests + TS types, compile data bindings → registered
queries (A-16), and expose a Vite plugin with HMR. **Target: end of Week 6.**

### Deliverables & file map
```
packages/compiler/
├── src/
│   ├── index.ts                    # public API barrel
│   ├── extractor/
│   │   ├── schema.ts               # SEED: copy spike/src/extractor.ts, extend
│   │   ├── types.ts                # PropertyField, ComponentManifest (from seed)
│   │   └── typegen.ts              # manifest → TypeScript .d.ts string
│   ├── queries/
│   │   ├── defineQueries.ts        # the authoring API (A-16) — see below
│   │   └── registrar.ts            # collect defineQueries() calls → manifest.queries
│   ├── manifest/
│   │   └── build.ts                # assemble a full SiteManifest from components+queries+pages
│   └── vite/
│       └── index.ts                # frontbasePlugin() with HMR
├── test/
│   ├── extractor.mjs               # extends the spike's 14 assertions + round-trip
│   ├── queries.mjs                 # defineQueries → registrar → manifest.queries
│   ├── manifest.mjs                # full SiteManifest assembly + determinism
│   └── vite.mjs                    # transform + HMR invalidation
├── package.json
└── tsconfig.json
```

### Step-by-step

**1.2.1 — Package scaffold.** Update `packages/compiler/package.json`: `type: module`, deps
`typescript` + `zod@^3.25.76`, `peerDependencies: { "@frontbase/edge-core": "workspace:*" }`,
scripts `build` (tsc) + `test`. Add `tsconfig.json` extending `../../tsconfig.base.json`.
Gate: `pnpm --filter @frontbase/compiler build` succeeds with an empty `index.ts`.

**1.2.2 — Port the seed extractor.** Copy `spike/src/extractor.ts` → `src/extractor/schema.ts`
and `spike/src/extract-verify.ts` → `test/extractor.mjs`. Adjust imports. Confirm the 14
assertions + 5-case round-trip pass unchanged. This is your safety net before extending.
Gate: `node test/extractor.mjs` → 14/14 + round-trip agrees.

**1.2.3 — Extend Zod coverage.** The seed handles string/number/boolean/enum/array/object +
`.optional/.default/.describe/.min/.max`. Add, each with a new fixture + round-trip case:
- nested objects ≥2 deep; arrays of objects; `.email()`/`.url()`/`.uuid()` (record as string +
  a `format` hint); `.nullable()` (distinct from `.optional()`); literal via `z.enum` single-value.
- For **unsupported** constructs (`z.union`, `z.record`, `z.tuple`, `z.lazy`, refinements) emit a
  structured diagnostic `{code:'UNSUPPORTED_ZOD', node, message, suggestion}` — never crash.
  (This mirrors the DX friction the Phase 0 agent test surfaced — see PHASE0 memo.)
Gate: every construct has a round-trip assertion; manifest-derived schema agrees with the original.

**1.2.4 — Type generation.** `src/extractor/typegen.ts`: manifest → a `.d.ts` string that equals
`z.infer<typeof Schema>`. The seed already has `generateTypes`; extend it for the new kinds.
Gate: generated type string matches a hand-written expected type per fixture.

**1.2.5 — `defineQueries()` (A-16).** This is the code-first query authoring API. Signature:
```ts
// src/queries/defineQueries.ts
import type { ZodTypeAny } from 'zod';
export interface QueryDef<P = unknown> {
  params?: ZodTypeAny;                 // proxy validates before execution
  scope?: 'public' | 'tenant' | 'user';
  ttlSeconds?: number;
  execute: (params: P, ctx: QueryContext) => Promise<Record<string, unknown>[]>;
}
export function defineQueries(defs: Record<string, QueryDef>): Record<string, QueryDef>;
```
`registrar.ts` collects these (build-time) into `manifest.queries` as `RegisteredQuery` (from
edge-core), stripping `execute` from anything shipped to the browser. The `execute` stays server-side.
Gate (`test/queries.mjs`): a `defineQueries({...})` fixture → registrar → `manifest.queries` has
the right `queryId`, `params` (Zod), `scope`, `ttlSeconds`; `execute` is present on the edge object
and ABSENT from a `toBrowserManifest()` projection.

**1.2.6 — Full manifest assembly.** `manifest/build.ts`: given a set of extracted component
manifests, a query registry, and page layouts (JSON), emit a complete `SiteManifest` that
`createEngine()` accepts. Keys sorted; `version` is a content hash of the manifest body.
Gate (`test/manifest.mjs`): assembled manifest feeds `createEngine({manifest, data: directProvider(manifest), environment:'edge'})`
and renders a page 200 OK; re-running the build produces a **byte-identical** manifest (determinism).

**1.2.7 — Vite plugin + HMR.** `src/vite/index.ts`: `frontbasePlugin()` per the spec's shape.
`transform` runs extraction on `**/*.tsx` matching the component convention; `buildEnd` writes
manifests; `handleHotUpdate` invalidates the module graph for changed component files.
Gate (`test/vite.mjs`): drive the plugin's `transform`/`handleHotUpdate` in-process (no full Vite
server needed) — a changed fixture triggers invalidation; transform returns a manifest for a
Schema-bearing file and `null` for a non-component file.

### M1.2 acceptance gates (all green to close)
- [ ] `pnpm --filter @frontbase/compiler test` green: extractor (all Zod kinds + round-trip),
      queries, manifest assembly + determinism, vite transform/HMR.
- [ ] Manifests generated for a representative set (use the 9 agent-test component types from Phase 0
      as fixtures — copy them from `spike/fixtures/agent-test/` in the product repo).
- [ ] Registered-query artifacts consumed by the engine's Edge Data Proxy (assemble a manifest with
      a query, POST `/api/data/:id` through `createEngine`, assert Zod rejection on bad params).
- [ ] Coverage > 80% (add `c8`: `pnpm --filter @frontbase/compiler exec c8 node test/...`).
- [ ] Determinism: building twice yields byte-identical manifest + types.

---

# Milestone 1.3 — CLI & Diagnostics

**Goal**: `frontbase init/check/lint` in `@frontbase/compiler/bin/`, all with `--json` agent output.
**Target: end of Week 8.** Depends on M1.2.

### File map
```
packages/compiler/
├── bin/frontbase.mjs               # #!/usr/bin/env node shim → src/cli/index.js
├── src/cli/
│   ├── index.ts                    # commander program
│   ├── commands/{init,check,lint}.ts
│   ├── checker/ComponentChecker.ts # schema + tsc conformance
│   ├── agent/AgentFormatter.ts     # --json shape (spec §Agent Integration)
│   └── templates/                  # init scaffolds: pure / with-infra / full
└── test/cli.mjs
```
Add `"bin": { "frontbase": "./bin/frontbase.mjs" }` to package.json.

### Step-by-step

**1.3.1 — `commander` program + `--json` everywhere.** Every command supports `--json`. The JSON
shape is the spec's `AgentOutput` (§Agent Integration): `{version, type, success, summary, issues[],
recommendations[]}`. Issues carry `{file, line, code, message, severity, fixable, fix}`.

**1.3.2 — `init` scaffolding.** `frontbase init <name> --pure|--with-infra|--full`.
- `--pure`: `@frontbase/edge-core` + `@frontbase/compiler` (dev) + one example component + a page
  layout + a minimal `worker.ts` (copy the shape of `examples/cf-worker`) + `vite.config.ts` wiring
  `frontbasePlugin()`. The output must **build and run** (`pnpm build && node dist/smoke`).
- `--with-infra` / `--full`: same + placeholders for edge-infra / builder+backend (those packages are
  Phase 2 — scaffold the wiring and a TODO, don't invent the packages).
Gate: `frontbase init demo --pure` in a tmp dir → `pnpm install && pnpm build` succeeds; the scaffolded
smoke test passes.

**1.3.3 — `check`.** Runs the M1.2 extractor + `tsc --noEmit` over the project. Reports: missing
`Schema` export, unsupported Zod constructs (from 1.2.3), TS errors, unregistered components — each
with precise `file:line` and a `fix` suggestion. Exit non-zero on error.
Gate: a fixture project with 1 good + 1 broken component → `check --json` lists exactly the broken
one's issue with correct line; exit code 1.

**1.3.4 — `lint`.** Wrap ESLint programmatic API + custom rules: (a) no `window`/`document` in engine
components (they render server-side), (b) navigation must be `<a href>` not `data-navigate-to`-only
(Phase 1 input #3), (c) every `Schema` property has `.describe()`. `--fix` where safe.
Gate: fixtures trip each custom rule; `--json` output is agent-shaped.

### M1.3 acceptance gates
- [ ] `npx @frontbase/compiler init my-app --pure` produces a project that builds & runs.
- [ ] `check` validates schema + TypeScript; `lint` runs ESLint + the 3 custom rules.
- [ ] All commands support `--json` with precise `file/line/severity/quick-fix`.
- [ ] `test/cli.mjs` green; coverage maintained > 80%.

---

# Milestone 1.4 — SW Bundle Emitter + `simulate`

**Goal**: compiler emits a content-hash-versioned `sw.js`; `frontbase simulate` boots the engine
locally in any provider mode. **Target: end of Week 9.** Depends on M1.2.

### File map
```
packages/compiler/src/
├── emit/
│   ├── swBundle.ts                 # esbuild: engine + manifest + registration → sw.js
│   └── version.ts                  # content-hash the bundle
└── cli/commands/simulate.ts        # local Hono server, --provider direct|proxy|draft
```

### Step-by-step

**1.4.1 — SW bundle emitter.** `emit/swBundle.ts` esbuild-bundles a generated SW entry (the shape of
`examples/cf-worker/src/sw.ts`: `createEngine({manifest, data: proxyProvider('/api/data'),
environment:'service-worker'})` + `attachServiceWorker`). The site manifest is baked in. Output
`sw.js` + `sw.<hash>.js` where `<hash>` is a content hash (`version.ts`). Registration script uses
`skipWaiting()` (already in `attachServiceWorker`).
Gate: emitted `sw.js` is valid JS, contains the manifest, and its filename hash changes iff content
changes (determinism: same input → same hash).

**1.4.2 — `simulate`.** `frontbase simulate --port 3000 --provider direct|proxy|draft`.
Boots a Node Hono server via `@hono/node-server` running `createEngine` with the chosen provider:
- `direct`: `directProvider(manifest)` (edge path).
- `proxy`: serves `/api/data` AND a `proxyProvider` engine (simulates the SW's data path).
- `draft`: a local in-memory draft provider (stub now; real SQLite-WASM draft is Phase 2 builder).
Gate: `simulate` renders the SAME page byte-identically across all three providers (extend the M1.1
parity harness — the three provider outputs must match each other for a fixture page).

**1.4.3 — SW payload budget.** Measure the emitted `sw.js` min+gzip. Reuse `edge-core/scripts/size.mjs`
pattern. Must be < 150 KB (the M0.1 headroom; current engine bundle is 57 KB, so ample).
Gate: size check in `test/emit.mjs` fails if > 150 KB.

### M1.4 acceptance gates
- [ ] `sw.js` versioned by content hash; registration handles `skipWaiting()`.
- [ ] `simulate` renders identically across `direct`/`proxy`/`draft`.
- [ ] SW payload < 150 KB min+gzip (CI-gated).

---

# Milestone 1.5 — Integration & Testing (Phase 1 sign-off)

**Goal**: E2E on edge + SW paths, agent-generation success rate measured, perf benchmarks, docs.
**Target: end of Week 10.** Depends on M1.1–M1.4.

### Step-by-step

**1.5.1 — E2E harness.** In `examples/cf-worker` (or a new `examples/full-project` scaffolded by
`init`): a real project compiled by the compiler, served by `simulate`. Test the edge path (HTTP GET)
and the SW path (drive `attachServiceWorker` + the engine in jsdom, as `edge-core/test/behaviors.mjs`
does). Assert byte-parity between the two paths for every page.
Gate: `pnpm --filter @frontbase/example-* test` green on both paths.

**1.5.2 — Agent-generation success rate.** Re-run the Phase 0 agent test methodology at compiler scale:
have an agent generate N components against the convention; run `frontbase check` on each; record the
pass rate in `docs/plans/phase1-agent-results.md`. Phase 0 hit 9/9; target ≥ 90% and document failures
as compiler diagnostics to improve.

**1.5.3 — Perf benchmarks.** Extend the spike timing method: first-load render p50 (edge) ≤ the M1.1
baseline; SW navigation render p50 < 5 ms. Record in the results doc.

**1.5.4 — Docs.** A `docs/guides/authoring-components.md` (the Zod convention, isomorphic constraints,
supported/unsupported Zod, the anchor-nav rule) and `docs/guides/cli.md` (all commands + `--json`).

### M1.5 acceptance gates (Phase 1 sign-off)
- [ ] E2E green on edge path and SW path (byte-parity between them).
- [ ] Agent success rate documented (≥ 90%, trajectory to 95%).
- [ ] Perf: first-load p50 ≤ baseline; SW nav p50 < 5 ms.
- [ ] Authoring + CLI guides written.
- [ ] MILESTONES.md: M1.2–M1.5 → 🟢; Phase 1 → 🟢. Update the memory note.

---

## Sequencing, risks & guardrails

**Order is strict**: 1.2 → (1.3 ∥ 1.4 can overlap once 1.2 is green) → 1.5 last. 1.3 and 1.4 both
depend only on 1.2, so they can be built in parallel if capacity allows; 1.5 needs all.

**Top risks (and the guardrail):**
1. *Rewriting the extractor from scratch* → don't; the spike version is proven, extend it (1.2.2).
2. *Non-deterministic manifests* (Map iteration order, timestamps) → sort keys, hash content, test
   determinism explicitly (1.2.6).
3. *Cross-repo import creep* → the product repo is read-only reference; copy + cite (golden rule).
4. *Engine API gaps* → if the compiler needs something `edge-core` doesn't expose, STOP and file it in
   `docs/plans/phase1-blockers.md`; don't fork the frozen engine.
5. *zod version drift* → pinned 3.25; the AST walker depends on it.
6. *Scope creep into Phase 2* → builder (SQLite-WASM draft), edge-infra (real providers), and backend
   (console/publish) are OUT. Scaffold wiring + TODOs only.

**Every milestone ends the same way**: gates green → `pnpm -r build && pnpm -r test` green →
commit with the co-author trailer → push → tick the boxes in `MILESTONES.md`.

## Quick reference — commands
```bash
# build & test one package
pnpm --filter @frontbase/compiler build
pnpm --filter @frontbase/compiler test
# whole workspace
pnpm -r build && pnpm -r test
# coverage
pnpm --filter @frontbase/compiler exec c8 node test/extractor.mjs
# the frozen engine's gates (must stay green — you should never break these)
cd packages/edge-core && pnpm test && node scripts/size.mjs
```
