# Phase 3 Sprint Plan — Hardening, Agent Experience & Beta (M3.0–M3.2)

**Audience:** an implementer agent taking Phase 3 with minimal supervision.
**Status:** Ready to execute. Phases 0–2 COMPLETE; all packages build, 30 test suites green; two Phase 2 security bugs found + fixed in the post-delivery audit (see the Phase 2 delivery report §5.1).
**Repo:** `frontbase-framework`. **Packages touched:** `@frontbase/compiler` (diagnostics, agent tooling), `@frontbase/builder` (full canvas), `@frontbase/edge-infra` (live cloud gates, rate limiting), `@frontbase/backend` (migration runner). No new packages (A-14: six is fixed).
**Author:** Architecture, 2026-07-10.

---

## 0. Read this first (orientation — 30 min, DO NOT SKIP)

Phase 3 has two halves. **M3.0 (front-loaded) clears the carried-forward backlog and codifies the
audit lesson** so the agent-experience work stands on solid, honestly-tested ground. Then **M3.1
(diagnostics + agent tooling)** and **M3.2 (beta)** deliver the agent experience proper.

The engine (`@frontbase/edge-core`) and compiler *core* (extractor, manifest, queries) are FROZEN in
behavior — you extend the CLI/diagnostics around them, you do not change their contracts without an
architecture decision.

**Before writing any code, read, in order:**
1. `docs/MILESTONES.md` — **especially the "Carried-forward items (live backlog)" table.** M3.0's job
   is that table. Every row (CF-1 … CF-17) has an ID; reference it in commits.
2. `docs/delivery/phase2-delivery-report.md` §5.1 — the two audit bugs (SEC-P2-1 page-path bypass,
   SEC-P2-2 hollow isolation test) and how they were fixed. **RULE 8 below exists because of these.**
3. `docs/plans/phase2-cms-sprint.md` §"GOLDEN RULES" — RULES 1–7 still apply. **This plan adds RULE 8.**
4. `docs/DECISIONS.md` — A-16 (query model + scope), A-17 (provider verification + app-level tenant
   predicate). No decision changes in Phase 3 unless you file one.
5. The CLI surface you extend: `packages/compiler/src/cli/{checker,linter,agent,simulate,types}.ts` and
   `packages/compiler/src/cli/index.ts` (the commander program).

**The product repo to EXTRACT FROM (read-only reference — never import; A-15 §5):**
- `../Frontbase-/src/components/builder/` — the full React builder canvas (CF-8): `BuilderCanvas.tsx`,
  `DraggableComponent.tsx`, `ComponentPalette.tsx`, `LayersPanel.tsx`, `AlignmentGuides.tsx`, etc.
- `../Frontbase-/src/lib/builder/` — builder logic/helpers.
- `../Frontbase-/services/edge/src/storage/edge-migrations.ts` — the migration pattern (CF-11).

---

## GOLDEN RULES — RULES 1–7 from Phase 2 STILL APPLY. Phase 3 adds RULE 8.

> Re-read RULES 1–7 in `docs/plans/phase2-cms-sprint.md`. Summary: (1) no server code in browser
> bundles + no-leak tests; (2) authenticated + tenant-scoped, deny-by-default + isolation tests;
> (3) no shared refs; (4) opaque client errors; (5) end-to-end scaffold builds; (6) single-owner types;
> (7) extraction discipline (Web Crypto, no cross-repo imports, zod 3.25, ESM `.js`).

### RULE 8 — A security/isolation/no-leak gate is worthless until a MUTATION proves it fails. (audit lesson)
Both Phase 2 audit bugs were **green gates that guaranteed nothing**: the isolation test used two
separate in-memory DBs (so "tenant B can't see A" passed even with the tenant predicate deleted); the
page path was never exercised at all. A passing test is not evidence — a test that **fails when you
break the thing it guards** is evidence.
- **Every isolation, no-leak, scope, and auth gate MUST ship with a documented mutation check**: a
  commented recipe (or a `*-mutation.mjs` companion, or a CI step) showing that removing the guarantee
  (delete the `WHERE tenant` clause / import the server module into the browser entry / drop the
  `enforceScope` call) makes the gate go RED. If you cannot make it go red by breaking the guarantee,
  the gate tests the wrong thing — fix the gate first.
- **Shared-state realism:** isolation tests use ONE shared datastore across tenants (a temp-file DB,
  not per-tenant `:memory:`). Separate stores prove storage separation, never predicate correctness.
- **Exercise the real entry point:** test the actual HTTP path (`app.fetch(...)`), not just the helper
  function, so a bypass in the router (like the eSSR page path) is caught.
- Apply RULE 8 retroactively in M3.0.4 to every existing security gate before adding new features.

**Escape hatch:** a missing seam in a frozen package → `docs/plans/phase3-blockers.md` with the exact
call you needed. Do not modify frozen contracts to paper over it.

---

## Definition of Done (Phase 3)

The carried-forward backlog is cleared (M3.0); every security gate is mutation-proven (RULE 8); the
builder has a working drag/drop canvas with < 100 ms preview loop; `frontbase check --parity` verifies
tri-environment render parity; agent success rate on generated components is measured **> 95%**; a live
worker is deployed to a public URL; and a 20+ tester beta is running with a feedback loop.

---

# Milestone 3.0 — Carried-Forward Hardening & Gate Integrity

**Goal:** clear the Phases 0–2 backlog and codify RULE 8. Front-loaded because Phase 3 features build
on it. **Target: end of Week 1.** This is mostly finishing work, not greenfield — the highest-value,
lowest-glamour milestone.

### Step-by-step (each step cites its carried-forward ID)

**3.0.1 — RULE 8 retrofit (CF-15) — DO THIS FIRST.** For every existing gate in
`edge-core/test/scope.mjs`, `edge-infra/test/{isolation,no-leak,proxy-auth}.mjs`,
`backend/test/authz.mjs`, `builder/test/no-leak.mjs`, `compiler/test/sw-no-leak.mjs`: add a documented
mutation recipe (a comment block: "to verify this gate is real, make change X and confirm it goes red")
and, where cheap, a `*-mutation.mjs` that programmatically breaks the guarantee against the built `dist`
and asserts the gate fails. Gate: a `pnpm -r test:mutation` script demonstrates each security gate
going red when its guarantee is removed. (The Phase 2 audit already did this manually for authz — make
it repeatable.)

**3.0.2 — Builder full canvas (CF-8).** Port `../Frontbase-/src/components/builder/BuilderCanvas.tsx`
+ `DraggableComponent`, `ComponentPalette`, `LayersPanel`, `AlignmentGuides` into
`packages/builder/src/components/`. Wire drag/drop → `localDraftProvider` (already shipped) → preview
iframe. **RULE 1:** the canvas is a browser SPA — it must NOT import edge-infra; the no-leak gate must
still pass (extend `builder/test/no-leak.mjs` to bundle the new canvas entry). **RULE 5:** an
end-to-end test scaffolds a builder-enabled project and renders. Gate: drag/drop → draft → preview
refresh measured **< 100 ms** (`builder/test/canvas-perf.mjs`); preview HTML still == published HTML
(the existing `parity` gate must stay green with the real canvas).

**3.0.3 — Legacy layout migration (CF-9).** Version-flag the layout format; a version-flagged migration
loads existing product-repo JSON layouts. Gate: a corpus of legacy layouts (reuse `golden-corpus`)
loads and renders byte-identically after migration.

**3.0.4 — Cloud-DB live gates (CF-10).** The parameterized isolation suite (`edge-infra/test/_harness.mjs`)
already runs the IDENTICAL assertions against D1/Turso/Postgres when creds are present. Provision a
throwaway test DB for each (or document the exact env vars), run the suite, record results. **RULE 8:**
confirm the live run also fails under mutation (break the predicate, watch the live gate go red). Gate:
`D1_*`/`TURSO_*`/`POSTGRES_URL` present → isolation suite green on each; documented in the report.

**3.0.5 — Drizzle migration runner (CF-11).** Replace auto-create-on-boot in `backend/src/db/store.ts`
with a real versioned, reversible runner (port the pattern from `edge-migrations.ts`). The Drizzle
schema stays the single source of truth (A-13, no Python). Gate: apply → rollback → re-apply leaves the
schema identical; a fresh DB and an upgraded DB converge.

**3.0.6 — Live deploy (CF-12, CF-13).** Run `wrangler deploy` on `examples/cf-worker` (or a `--full`
scaffold) to a public `*.workers.dev` URL; verify the browser SW-handover click-test (nav → SW renders
locally). Do the deployctl/Deno path too if a Deno Deploy token is available. Gate: a live URL + a
recorded handover verification. *(This is the one genuinely manual step — needs the user's CF account.)*

**3.0.7 — Small carried items.** CF-1 (Safari/iOS + SW-disabled fallback: add an explicit test that a
pre-SW load renders from the edge, and document iOS behavior). CF-5 (document `simulate --serve`'s
optional `@hono/node-server`). CF-16 (rate limiting on the proxy: a simple per-principal token bucket in
edge-infra, opt-in via config; RULE 4 opaque `rate_limited` 429). Close CF-2 as superseded.

### M3.0 acceptance gates
- [ ] RULE 8: every security gate has a mutation proof; `test:mutation` script green.
- [ ] Builder canvas: drag/drop → preview < 100 ms; parity + no-leak still green.
- [ ] Legacy layouts migrate + render byte-identically.
- [ ] Cloud-DB isolation gates green where creds present (D1/Turso/Postgres).
- [ ] Migration runner: apply/rollback/re-apply converges.
- [ ] Live `*.workers.dev` URL + SW-handover verified.
- [ ] Frozen edge-core + all Phase 1/2 suites still green (regression).

---

# Milestone 3.1 — Diagnostic Refinement & Agent Tooling

**Goal:** raise the agent success rate to **> 95%** with better diagnostics, tri-environment parity
checks, and prompt templates. **Target: Weeks 1–2.** Depends on M3.0.

### File map
```
packages/compiler/src/
├── cli/
│   ├── checker.ts          # extend: --parity (edge/SW/draft), richer diagnostics
│   ├── quickfix.ts         # NEW — quick-fix suggestions for the top 20 error classes
│   └── agent/
│       └── templates/      # NEW — prompt templates (component/page/query/workflow)
└── ...
docs/guides/agent-authoring.md   # NEW — the agent execution guide
```

### Step-by-step

**3.1.1 — Quick-fixes for the top 20 error classes.** Extend the diagnostics (MISSING_SCHEMA,
UNSUPPORTED_ZOD, FB001/2/3, TS####) with machine-applicable `fix` payloads in the `AgentOutput`. Each
quick-fix is a concrete edit (add `.describe()`, replace `z.union` with `z.enum`, add the `Schema`
export, etc.). Gate: `compiler/test/quickfix.mjs` — each of the 20 classes emits a valid, applicable
fix; applying it makes `check` pass.

**3.1.2 — `check --parity` (CF-3 dev-server adjacency).** Add a `--parity` flag that renders each page
through all three providers (reuse `simulate.ts`'s `direct|proxy|draft` harness) and reports any
byte-diff as a diagnostic. Gate: a fixture that renders identically → parity OK; a deliberately
provider-sensitive fixture → a parity diagnostic with the diff location.

**3.1.3 — Agent prompt templates (CF-14).** Ship templates for the common tasks (author a component,
add a page, define a query, build a workflow) that encode the conventions + the golden rules. Gate: a
cold-agent run using the templates measures success rate.

**3.1.4 — Agent success-rate at scale (> 95%).** Extend `compiler/test/agent-success-rate.mjs`: raise
N (more component types + harder shapes: nested arrays-of-objects, formats, nullable) and measure. The
Phase 1 baseline was 100% at N=8; the > 95% bar must hold at higher N and difficulty. Gate: documented
rate ≥ 95% across the larger cohort.

**3.1.5 — ESLint wrapping (CF-4) + dev FS routing (CF-3).** Wrap the 3 custom rules in ESLint's
programmatic API (they already work standalone). Add dev-only file-system routing to the compiler's
dev-server path. Gate: `lint` runs via ESLint; `simulate` picks up FS routes in dev.

### M3.1 acceptance gates
- [ ] Quick-fixes for the top 20 error classes; applying a fix makes `check` pass.
- [ ] `check --parity` verifies edge/SW/draft render parity.
- [ ] Agent success rate **> 95%** documented at raised N/difficulty.
- [ ] Agent prompt templates shipped; ESLint wrapping + dev FS routing done.

---

# Milestone 3.2 — Beta Program

**Goal:** launch a beta with 20+ testers and a feedback loop. **Target: Weeks 3–4.** Depends on M3.1.

### Step-by-step
**3.2.1 — Beta onboarding.** A `--pure` and a `--full` quick-start path (reuse `init`), an issues
template, and a feedback channel. **3.2.2 — Recruit 20+ testers** across two cohorts (framework-only,
full-CMS). **3.2.3 — Feedback loop:** weekly review; triage into an iteration backlog (a
`docs/beta-backlog.md`). **3.2.4 — Phase 3 delivery report** (`docs/delivery/phase3-delivery-report.md`,
same structure as Phase 1/2, with a RULE 1–8 security section). Mark M3.0–M3.2 → 🟢, Phase 3 → 🟢.

### M3.2 acceptance gates
- [ ] 20+ beta testers active; weekly reviews; iteration backlog created.
- [ ] Phase 3 delivery report; **Phase 3 sign-off.**

---

## Sequencing, risks & guardrails

**Order:** M3.0 FIRST (it's the foundation + the honesty debt), then M3.1, then M3.2. Within M3.0, do
3.0.1 (RULE 8 retrofit) before anything else — you want the mutation harness in place before you touch
security-adjacent code.

**Top risks (each with its guardrail):**
1. *Adding features on hollow gates* → RULE 8: mutation-prove every security gate first (3.0.1).
2. *Builder canvas pulling server code into the SPA* → RULE 1: extend `builder/no-leak` to the canvas entry.
3. *Migration runner corrupting the single-source schema* → apply/rollback/re-apply convergence test.
4. *Cloud-DB gate green-but-hollow* → RULE 8 applies to live runs too (mutate the predicate, watch it fail).
5. *Agent success-rate measured on too-easy a cohort* → raise N and difficulty; the > 95% bar is meaningless at N=8.
6. *Scope creep into GA polish* → marketing/support/launch are Phase 4. Deliver the agent experience + beta.

**Every milestone ends the same way:** gates green → `pnpm -r build && pnpm -r test` green → **all
frozen Phase 0/1/2 suites still green (regression)** → mutation harness still red-on-break → commit with
the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer → push → tick MILESTONES + the
carried-forward table.

## Quick reference
```bash
# build/test everything
pnpm -r build && pnpm -r test
# the regression that must NEVER go red
pnpm --filter @frontbase/edge-core test        # parity 14/14 + scope (now covers page path)
# the NEW Phase 3 integrity gate
pnpm -r test:mutation                          # every security gate must go RED when its guarantee is broken
# carried-forward tracker: docs/MILESTONES.md § Carried-forward items (CF-1 … CF-17)
```
