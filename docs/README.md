# Frontbase Framework Evolution Documentation

This directory contains the documentation for the Frontbase Framework Evolution — the transformation of Frontbase into a modular, edge-native CMS framework built on the **Chimera (Universal eSSR)** architecture.

---

## 🧭 Guiding Principles

All documents in this directory serve three non-negotiable principles (Decisions A-12/A-13/A-14):

1. **Single-Edge Deployment** — the complete CMS (builder frontend, console API, rendering engine, data proxy, workflows) deploys as **one edge worker**. Zero infrastructure.
2. **Universal eSSR (the Chimera)** — **one Hono engine** renders every page in three environments: cloud edge (SEO/first load), browser service worker (zero-latency navigation, private pages, offline), and builder canvas (exact WYSIWYG preview). One set of isomorphic components; no React on published pages; no hydration drift.
3. **Six npm packages** — `edge-core`, `compiler`, `ui-components`, `builder`, `edge-infra`, `backend`. Fixed surface.

---

## 📚 Document Index

### [CHIMERA-ARCHITECTURE.md](./CHIMERA-ARCHITECTURE.md) ⭐ CANONICAL
**Status**: v2.0 — Adopted

The authoritative architecture specification. One engine, three environments; dependency-injected data providers; registered-query Edge Data Proxy; single-worker deployment layout; service-worker lifecycle rules; package mapping. **All other documents defer to this one on rendering and deployment questions.**

---

### [frontbase_framework_proposal_v1](./frontbase_framework_proposal_v1)
**Status**: v3.0 — Chimera architecture, single-edge deployment, 6 packages

The main proposal: executive summary, package architecture, Chimera pillars, honest gap analysis (what exists vs. what must be built), value engineering, risk matrix, Phase 0 spike design, roadmap, and success metrics.

**Key insight**: the existing ~1,600 lines of SSR string renderers are architecturally closer to the Chimera than React SSR — they become the seed of the engine, and today's dual component implementation (React + strings) collapses into one.

---

### [PACKAGE-STRUCTURE.md](./PACKAGE-STRUCTURE.md)
**Status**: v2.0 — 6 packages defined under the Chimera

Complete package definitions. `npx @frontbase/compiler init my-app --full` scaffolds 100% of the self-hosted CMS as a single-worker project.

- **Core (required)**: `@frontbase/edge-core` (the Chimera Engine, <70KB), `@frontbase/compiler` (build tooling + CLI + SW emitter), `@frontbase/ui-components` (the single set of isomorphic page components).
- **Optional**: `@frontbase/builder` (React shell + local draft DB + SW preview), `@frontbase/edge-infra` (providers, proxy, vault, queues, sync), `@frontbase/backend` (in-worker Hono console API + Drizzle).

---

### [ARCHITECTURE-SPLIT.md](./ARCHITECTURE-SPLIT.md)
**Status**: v2.0 — Chimera

The two-layer split (Core Framework / CMS Layer), installation patterns, competitive positioning, bundle budgets, and phase strategy.

---

### [MILESTONES.md](./MILESTONES.md)
**Status**: v3.1 — Phase 0 ✅ COMPLETE; Phase 1 greenlit

- **Phase 0** (Jul 2026): ✅ **DONE 2026-07-07** — Chimera validation spike, all gates passed, decision: **PROCEED**.
- **Phase 1** (8–10 wks, Q3 2026): Engine + Compiler + CLI.
- **Phase 2** (6–8 wks, Q4 2026): Infra + Console + Builder → the single-worker CMS.
- **Phase 3** (3–4 wks, Q1 2027): Agent experience & beta.
- **Phase 4** (2–3 wks, Q1–Q2 2027): GA.

**Engineering time**: ~21–27 weeks (solo-capacity estimates). **Calendar GA target**: Q1–Q2 2027.

---

### [PHASE0-DECISION-MEMO.md](./PHASE0-DECISION-MEMO.md)
**Status**: ✅ PROCEED — Phase 0 CLOSED (2026-07-07)

Phase 0 verdict with full evidence table and **17 Phase 1 inputs** banked from the spike. Agent test passed at 3× planned scope: 9/9 components of the real homepage (100% first attempt, 31/31 real production payloads). The live worker doubles as the standing demo — real homepage at `/homee`.

---

### [DECISIONS.md](./DECISIONS.md)
**Status**: v2.0 — Active

Decision log. Headline decisions: **A-12** (adopt Chimera Universal eSSR), **A-13** (single-edge-worker deployment; supersedes A-11 dual-backend), **A-14** (six packages fixed), plus the A-1…A-10 consolidation history.

---

### [OPENQUESTIONS.md](./OPENQUESTIONS.md)
**Status**: v3.0 Draft — unique IDs (CHM/ARC/PRD/IMP/AI/OPS)

Open questions tracker. Critical items: SW update lifecycle (CHM-1), worker size budget (CHM-3), registered-query authoring (CHM-4). Questions resolved by A-12/A-13 are listed in §Resolved.

---

### [technical-specification.md](./technical-specification.md)
**Status**: Draft — updated for Chimera runtime

Component manifest formats, compiler/Vite plugin architecture, CLI specifications, engine runtime spec (DataProvider DI, workflow provider interfaces), and agent integration formats.

---

### [comprehensive-analysis.md](./comprehensive-analysis.md)
**Status**: Historical — partially superseded

The original v1 analysis (2026-06-29). Retained for the current-state inventory and value-engineering analysis; its SSR recommendations are superseded by Decision A-12 (see banner in the document).

---

### [STACK.md](./STACK.md)
**Status**: v2.0 — Chimera stack

Technology stack: Hono + isomorphic JSX for all published pages, React confined to the builder shell, SQLite WASM draft DB, service-worker toolchain, edge-native persistence bindings, single-worker deployment targets.

---

### [system-services.md](./system-services.md)
**Status**: v1 — Cache · Queue · Vector · Embedding runtime

The dual-wired backing-service layer (adopted `is_default` registry row > `FRONTBASE_*` env JSON > floor): env reference and JSON shapes, queue receive endpoint auth and redelivery semantics, the RAG pipeline and its documented divergences, SSRF posture, per-tenant cache isolation, optional-dependency bundling, and the host capability matrix.

---

### Public release

#### [PUBLIC-RELEASE-STRATEGY.md](./PUBLIC-RELEASE-STRATEGY.md)
**Status**: Active preparation — canonical rollout contract (Decision A-20)

Release positioning, the R0–R4 release train, and the non-waivable release gates (product scope, package consumability, self-host path, security, verification, documentation, release operations, honest positioning).

#### [PUBLIC-RELEASE-AUDIT.md](./PUBLIC-RELEASE-AUDIT.md)
**Status**: Not started — R0 scope/truth audit

The read-first audit that freezes the first public edition, reconciles all claims with shipped behavior, and produces the ordered public-release backlog. Implements R0; its immediate action is to claim and execute R0.

#### [RELEASE-READINESS.md](./RELEASE-READINESS.md)
**Status**: Reference checklist — date-free

A single, date-free checklist of *what must be true* before Frontbase is cited by version, deployed, or adopted for teaching. Consolidates the release gates from the strategy and A-20 (it adds no new gates or timelines). Records that CF-22 console parity and the full builder canvas are accepted residue to be honestly scoped (A-20 pt 5), not parity gates.

---

## 🚦 Next Steps

### Phase 0 — ✅ COMPLETE (2026-07-07)
M0.1 ✅, M0.2 ✅, M0.3 ✅. Decision gate closed: **PROCEED**. Agent test passed 9/9 (real homepage, 100% first attempt); the real Frontbase homepage renders byte-identically through the engine and ships on the live worker at `/homee`. Full evidence + 17 Phase 1 inputs in [PHASE0-DECISION-MEMO.md](./PHASE0-DECISION-MEMO.md). *(One manual step outstanding: `npx wrangler deploy` from [spike-cf/](./spike-cf/) to push the homepage demo live.)*

### Phase 1 — up next (M1.1 engine extraction)
1. ✅ ~~Decide PRD-2~~ → **Decision A-15 (2026-07-07)**: fresh **private** monorepo `frontbase-framework` (`packages/{edge-core,compiler,ui-components,edge-infra}`), **Apache-2.0**; product repo untouched through Phase 1; golden-corpus parity (no cross-repo imports); these docs migrate to the new repo.
2. **Settle CHM-4** (registered-query authoring model) before compiler work begins (needed by M1.2).
3. Spin up the `frontbase-framework` repo: scaffold the monorepo, migrate these docs, generate the golden corpus from the production renderer.
4. Start **M1.1** (`@frontbase/edge-core` extraction), shaped by the memo's 17 Phase 1 inputs — env-reads behind engine config, DataProvider seam, anchor-based navigation, and the styling/asset pipeline seam (input 16).

---

## 🔄 Document Status

| Document | Status | Last Updated | Notes |
|----------|--------|--------------|-------|
| CHIMERA-ARCHITECTURE.md | ✅ v2.0 Canonical | 2026-07-06 | Adopted (A-12/A-13) |
| frontbase_framework_proposal_v1 | ✅ v3.0 | 2026-07-06 | Chimera rewrite |
| PACKAGE-STRUCTURE.md | ✅ v2.0 | 2026-07-06 | 6 packages under Chimera |
| ARCHITECTURE-SPLIT.md | ✅ v2.0 | 2026-07-06 | Chimera split |
| MILESTONES.md | ✅ v3.1 | 2026-07-07 | Phase 0 COMPLETE — Phase 1 greenlit |
| PHASE0-DECISION-MEMO.md | ✅ PROCEED (closed) | 2026-07-07 | Full evidence incl. agent test 9/9 + 17 Phase 1 inputs |
| OPENQUESTIONS.md | 🟡 v3.0 Draft | 2026-07-06 | Renumbered, Chimera questions added |
| DECISIONS.md | ✅ v2.0 | 2026-07-06 | A-12/A-13/A-14 added; A-11 superseded |
| technical-specification.md | 🟡 Draft | 2026-07-06 | Runtime spec updated for Chimera |
| comprehensive-analysis.md | 📜 Historical | 2026-06-29 | Superseded-in-part banner added |
| STACK.md | ✅ v2.0 | 2026-07-06 | Chimera stack |

**Version History**:
- v1.0 (2026-06-29): Initial documentation set.
- v2.0–v2.8 (2026-06-29 → 2026-07-05): Modular architecture; package consolidation 35→6; dual-backend option.
- **v3.0 (2026-07-06): Chimera (Universal eSSR) adopted as canonical architecture; single-edge-worker deployment (supersedes dual-backend); 6-package structure fixed; milestone/question IDs deduplicated; bundle target unified at <70KB; timeline arithmetic corrected.**

---

## 📝 Document Metadata

- **Created**: 2026-06-29
- **Version**: 3.0
- **Status**: Chimera architecture adopted
- **Next Review**: After Phase 0 spike completion
