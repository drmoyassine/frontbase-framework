# Frontbase Framework Evolution: Open Questions (Chimera)

**Version**: 3.0
**Status**: Draft — renumbered with unique IDs; questions resolved by Decisions A-12/A-13/A-14 moved to §Resolved
**Last Updated**: 2026-07-06

---

## Overview

Open questions requiring resolution before or during implementation, categorized and prioritized. IDs are unique and stable: **CHM** (Chimera-specific), **ARC** (architecture), **PRD** (product), **IMP** (implementation), **AI** (agent), **OPS** (operations).

---

## Chimera-Specific (New)

### CHM-1: Service Worker Update Lifecycle

**Priority**: 🔴 CRITICAL | **Status**: 🔵 Open

**Question**: What propagation guarantee do we make between "publish" and "every visitor renders the new version"?

**Context**: The SW caches the engine and site manifest. A stale SW rendering an old layout after publish is the Chimera's most user-visible failure mode.

**Proposed approach** (CHIMERA §7): content-hash-versioned `sw.js`, `skipWaiting()` + `clients.claim()` on publish, manifest revalidation on every navigation (stale-while-revalidate). Open detail: do we force a hard reload on breaking layout-schema changes?

**Decision Needed**: Before Milestone 1.4

---

### CHM-2: Safari/iOS & SW-Disabled Fallback Scope

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Question**: Which capabilities do we officially support on browsers with restricted service workers (iOS Safari eviction, private mode, enterprise policies)?

**Context**: Fallback-by-design means such browsers always render from the edge — correct but without zero-latency navigation/offline. Need an official support matrix and messaging (e.g., "offline mode requires a SW-capable browser").

**Decision Needed**: Before Phase 2 (docs) — measurement during Phase 0 spike

---

### CHM-3: Worker Size Budget Allocation

**Priority**: 🔴 CRITICAL | **Status**: 🔵 Open

**Question**: How do we allocate the platform script limit (1 MB gzip CF free / 10 MB paid) across engine + console + proxy + workflows?

**Proposed budget**: engine < 70 KB, console+proxy+workflows < 330 KB, total worker script < 400 KB, leaving headroom; builder SPA and `sw.js` served as static assets (excluded from script size). CI gates on every package.

**Decision Needed**: Before Phase 1 (validated in Phase 0 spike)

---

### CHM-4: Registered-Query Authoring Model

**Priority**: 🔴 CRITICAL | **Status**: ✅ **RESOLVED (2026-07-07) → Decision A-16** (one registry contract; code-first defineQueries() as M1.2 MVP; builder path emits the same artifact in M2.2)

**Question**: How are registered queries declared — compiler-extracted from component bindings only, or also hand-authored (SQL files / TS query builders)?

**Context**: The proxy executes only registered queries (CHIMERA §2). Builder data bindings compile automatically; code-first developers need an ergonomic way to register custom queries, and agents need a greppable convention.

**Options**: (1) compiler-extracted only; (2) `queries/*.ts` convention with Zod param schemas; (3) both.

**Recommendation**: Both — bindings auto-register; `queries/` convention for custom needs.

**Decision Needed**: Before Milestone 1.2

---

### CHM-5: Offline Write Semantics

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Question**: Do offline visitors get read-only cached pages, or do we queue mutations (form submits, workflow triggers) for replay?

**Recommendation**: Read-only at GA; background-sync mutation queue post-GA.

**Decision Needed**: Before Phase 2

---

### CHM-6: Draft Database Sync Strategy (Builder)

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Question**: How does the local SQLite WASM draft DB reconcile with server-side drafts (multi-device editing, collaboration, browser storage eviction)?

**Options**: (1) local-first with periodic push to console API; (2) server-authoritative with local cache; (3) CRDT-based sync (later).

**Recommendation**: Server-authoritative checkpoints with local-first editing buffer at GA; collaboration post-GA.

**Decision Needed**: Before Milestone 2.3

---

## Architecture & Technical

### ARC-1: Legacy Layout Migration Pathway

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Question**: How do existing serialized JSON layouts migrate to the compiler-manifest world?

**Proposed** (per ARCHITECTURE-SPLIT §Resolved): version flags on page records; the edge path renders legacy layouts via the legacy renderer until migrated; migration tooling in the console.

**Decision Needed**: Before Milestone 2.3

---

### ARC-2: Community Component Distribution

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Question**: npm packages (`@frontbase/component-*`), a central registry, or hybrid? Note: community components must be **isomorphic engine JSX** — the manifest must declare behaviors and queries so the SW bundle can include them.

**Recommendation**: npm packages with naming convention + manifest validation via `frontbase check`.

**Decision Needed**: Before Phase 3

---

### ARC-3: Package Peer Dependencies

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Proposed**:
```
@frontbase/edge-core      (no peers)
@frontbase/ui-components  (peer: edge-core)
@frontbase/builder        (peer: edge-core, ui-components)
@frontbase/edge-infra     (peer: edge-core)
@frontbase/backend        (peer: edge-infra)
@frontbase/compiler       (peer: edge-core; devDependency)
```

**Decision Needed**: Before Phase 1

---

## Product & Strategy

### PRD-1: Pricing Model

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Proposed**:
```
edge-core / compiler / ui-components → Free (open source)
edge-infra                           → Free
builder                              → Premium tiers
backend (console)                    → Free core, paid multi-tenant/enterprise features
```

**Decision Needed**: Before Phase 2

---

### PRD-2: Open Source Strategy

**Priority**: 🟡 HIGH | **Status**: ✅ **RESOLVED (2026-07-07) → Decision A-15**

**Decided**: fresh private monorepo `frontbase-framework` (`packages/{edge-core,compiler,ui-components,edge-infra}`); **Apache-2.0** for the four framework packages; product repo untouched through Phase 1 (golden-corpus parity, no cross-repo imports); public at earliest presentable Phase 1 state. *Residual (→ PRD-1, before Phase 2): builder + backend placement and licensing (builder leaning BSL/proprietary).*

---

### PRD-3: Positioning & Tagline

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Context**: Positioning centers on the Chimera differentiators — one renderer for production/preview/agents, whole CMS in one worker — not head-on Next.js competition. Tagline TBD; candidates: "One engine, everywhere", "The CMS that fits in a worker", "Design it, code it, ship it — same engine".

**Decision Needed**: Before Phase 4

---

### PRD-4: Community Support Model

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Options**: community-only / best-effort GitHub / paid tiers / enterprise-only.

**Decision Needed**: Before Phase 4

---

## Implementation & Execution

### IMP-1: Component Schema Format

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Question**: Pure Zod, extended Zod with `fb.*` helpers, or a custom DSL?

**Recommendation**: Extended Zod with Frontbase helpers (agent-familiar, less verbose, no new language).

**Decision Needed**: Before Milestone 1.2

---

### IMP-2: CLI Distribution

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Recommendation**: npx wrapper from `@frontbase/compiler` (primary); standalone binaries later for restricted environments.

**Decision Needed**: Before Milestone 1.3

---

### IMP-3: File-System Routing Scope

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Current proposal**: dev-only (production routing is manifest/database-driven). Revisit if code-first users demand production FS routes.

**Decision Needed**: Before Milestone 1.1

---

## Agent & AI Integration

### AI-1: LLM Context Target

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Recommendation**: optimize docs/prompts for a 32K baseline; extended context packs for larger models.

**Decision Needed**: Before Phase 3

---

### AI-2: Agent Error Recovery

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Recommendation**: semi-autonomous — agents auto-fix type/import/schema errors; logic errors flagged for review; configurable threshold.

**Decision Needed**: Before Phase 3

---

### AI-3: Prompt Template Ownership

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Recommendation**: official templates for core; community contributions reviewed.

**Decision Needed**: Before Milestone 3.2

---

## Performance & Operations

### OPS-1: Performance Regression Budget

**Priority**: 🟡 HIGH | **Status**: 🔵 Open

**Proposed budget**: edge first-load p50 regression ≤ +10 ms; SW navigation p50 < 5 ms; worker cold start ≤ +100 ms; per-package bundle gates in CI.

**Decision Needed**: Before Phase 1

---

### OPS-2: Monitoring & Observability

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Candidates**: SW adoption/version distribution, proxy query latency & rejection rates, publish propagation time, agent check pass rates, render parity violations.

**Decision Needed**: Before Phase 2

---

### OPS-3: Rollback Triggers

**Priority**: 🟢 MEDIUM | **Status**: 🔵 Open

**Candidate triggers**: error rate > 5% on published pages; SW render parity violations detected; edge p95 > 2× baseline; critical security issue in proxy; agent success < 80%.

**Rollback levers**: SW kill-switch (unregister + force edge path), worker version rollback, layout version flags.

**Decision Needed**: Before Phase 1

---

## Resolved (moved from open — see DECISIONS.md)

| Former Question | Resolution |
|---|---|
| Modular architecture split? | ✅ A-1 — proceed, 6 packages (A-14) |
| SSR strategy: streaming React vs dual-code vs Chimera? | ✅ **A-12 — Universal eSSR (Chimera)**. No React SSR; no dual bundles. |
| Build output: dual server/client bundles? | ✅ A-12 — single isomorphic engine bundle + behaviors; obsolete under Chimera |
| Client-only component strategy? | ✅ A-12 — all components isomorphic; heavy interactivity via behavior scripts; no client-only render path |
| Dual backend (FastAPI + Hono)? | ✅ **A-13 — Hono-only console in the same worker**; FastAPI is legacy-product scope |
| Manifest storage (file vs DB)? | ✅ Published manifest is a build artifact served by the worker; drafts live in the console DB |
| Core framework scope? | ✅ A-2/A-14 — engine per PACKAGE-STRUCTURE §1 |

---

## Summary

| Priority | Count | IDs |
|----------|-------|-----|
| 🔴 CRITICAL | 3 | CHM-1, CHM-3, CHM-4 |
| 🟡 HIGH | 9 | CHM-2, CHM-6, ARC-1, ARC-2, ARC-3, PRD-1, PRD-2, IMP-1, AI-1, AI-2, OPS-1 |
| 🟢 MEDIUM | 7 | CHM-5, PRD-3, PRD-4, IMP-2, IMP-3, AI-3, OPS-2, OPS-3 |

### Decision Timeline

| Phase | Decisions Needed |
|-------|------------------|
| Before/at Phase 0 | CHM-3 (validated by spike), OPS-1, OPS-3 |
| Before Phase 1 milestones | CHM-1 (M1.4), CHM-4 (M1.2), IMP-1 (M1.2), IMP-2 (M1.3), IMP-3 (M1.1), ARC-3, PRD-2 |
| Before Phase 2 | CHM-2, CHM-5, CHM-6 (M2.3), ARC-1 (M2.3), PRD-1, OPS-2 |
| Before Phase 3 | ARC-2, AI-1, AI-2, AI-3 (M3.2) |
| Before Phase 4 | PRD-3, PRD-4 |

---

## Document Metadata

**Version**: 3.0
**Status**: Draft — Chimera
**Owner**: Architecture Team
**Next Review**: Weekly during Phase 0, bi-weekly during implementation
**Related Documents**:
- [CHIMERA-ARCHITECTURE.md](./CHIMERA-ARCHITECTURE.md)
- [DECISIONS.md](./DECISIONS.md)
- [MILESTONES.md](./MILESTONES.md)
