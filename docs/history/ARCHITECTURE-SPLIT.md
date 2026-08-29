# Frontbase Framework: Modular Architecture (Chimera)

**Version**: 2.0
**Status**: Approved — Chimera (Universal eSSR), Single-Edge Deployment, 6 Packages
**Last Updated**: 2026-07-06

---

## Overview

This document describes the modular split of the Frontbase Framework under the **Chimera architecture** ([CHIMERA-ARCHITECTURE.md](../ARCHITECTURE.md) is canonical for rendering/deployment; [PACKAGE-STRUCTURE.md](../PACKAGE-STRUCTURE.md) for package contents).

Two layers, six packages:

1. **Core Framework** (`@frontbase/edge-core` + `@frontbase/compiler` + `@frontbase/ui-components`) — the Chimera engine, its build tooling, and the single set of isomorphic components. Developer/agent oriented.
2. **CMS Layer** (`@frontbase/builder` + `@frontbase/edge-infra` + `@frontbase/backend`) — optional visual editing, concrete infrastructure, and the console API. Together with the core, they compose the complete self-hosted CMS in **one edge worker**.

This separation enables:
- Pure code-first framework usage (engine + compiler only).
- The visual builder as an optional add-on with **exact** WYSIWYG fidelity (same engine renders design-time and production).
- One-command self-hosting: the entire CMS deploys as a single Cloudflare Worker / Deno Deploy unit at zero base cost.
- Zero component duplication: no React copies of page components, no parallel SSR renderers, no hydration drift.
- Flexible installation via CLI flags; smaller bundles for framework-only users.

---

## Package Structure

```
@frontbase/edge-core      # The Chimera Engine — Hono router, eSSR renderer, DI data providers, workflows, behaviors (Required Runtime)
@frontbase/compiler       # Vite plugin, schema extraction, query registration, SW emitter, CLI (Required Dev)
@frontbase/ui-components  # Isomorphic engine JSX page components + auth primitives (Required UI)
@frontbase/builder        # React builder shell, local draft DB, SW preview bridge, visual editors (Optional)
@frontbase/edge-infra     # Data providers, Edge Data Proxy, caches, queues, vault, auth gates, sync (Optional)
@frontbase/backend        # Console API — Hono sub-router in the SAME worker; Drizzle schemas (Optional)
```

---

## Installation Patterns

### Pattern 1: Pure Framework (Code-First)

```bash
npx @frontbase/compiler init my-app --pure
# → @frontbase/edge-core (dependency)
# → @frontbase/compiler (devDependency)
# → @frontbase/ui-components (dependency)
```

- **Features**: isomorphic eSSR (edge + service worker), convention routing, programmatic workflows (in-memory providers), client behaviors, `frontbase check/lint/simulate` diagnostics.
- **Target Audience**: developers and AI agents wanting a lightweight edge-native framework with a zero-latency navigation model.

### Pattern 2: Full CMS (Single-Worker Self-Hosted Stack)

```bash
npx @frontbase/compiler init my-app --full
# → All 6 packages, composed into ONE deployable worker
npx @frontbase/compiler deploy
```

- **Features**: visual drag-and-drop page editor with exact-parity preview, visual workflow constructor, sync dashboards, console API, data proxy, vault — one URL, one deploy.
- **Target Audience**: teams wanting a self-hosted visual CMS with full code access.

### Pattern 3: Framework + Infrastructure

```bash
npx @frontbase/compiler init my-app --with-infra
# → Core + @frontbase/edge-infra (durable workflows, direct data providers, proxy, vault, auth gates)
```

---

## Layer Details

### Core: The Engine and Its Tooling

```
┌──────────────────────────────────────────────────────────┐
│                    Developer / Agent                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          @frontbase/compiler (Dev Tools)           │  │
│  │  • CLI (init/check/lint/simulate/deploy)           │  │
│  │  • TSX → engine components (AST)                   │  │
│  │  • Zod schema extraction → manifests               │  │
│  │  • Data bindings → registered queries              │  │
│  │  • Engine → versioned sw.js bundle                 │  │
│  └────────────────────────────────────────────────────┘  │
│                          ▲ compiles for                  │
│  ┌───────────────────────┴────────────────────────────┐  │
│  │        @frontbase/edge-core (The Chimera)          │  │
│  │  • Unified single-worker Hono router               │  │
│  │  • eSSR renderer (isomorphic JSX → HTML)           │  │
│  │  • DataProvider DI (direct/proxy/local-draft)      │  │
│  │  • Programmatic workflows engine                   │  │
│  │  • Client behaviors runtime (~10 KB)               │  │
│  │  • SW lifecycle primitives                         │  │
│  └────────────────────────────────────────────────────┘  │
│      runs on: Cloud Edge │ Service Worker │ Builder      │
└──────────────────────────────────────────────────────────┘
```

### CMS Layer: Builder + Infra + Console

- `@frontbase/builder` is a React **shell** only; its preview iframe is the engine in a local SW reading a SQLite-WASM draft DB. Design-time output is production output.
- `@frontbase/edge-infra` owns everything with secrets or side effects: direct DB providers, the Edge Data Proxy (registered queries only), caches, queues, vault, auth gates, sync adapters.
- `@frontbase/backend` is a Hono sub-router mounted at `/api/console` **inside the same worker** — pages, drafts, publish pipeline, tenants, tokens — persisting via Drizzle through edge-infra adapters. There is no separate backend deployment (Decision A-13).

---

## Competitive Positioning

| Use Case | Frontbase (Chimera) | Next.js | Remix | Astro |
|----------|---------------------|---------|-------|-------|
| Pure code-first framework | ✅ | ✅ | ✅ | ✅ |
| Agent-first diagnostics | ✅ Built-in | ❌ | ⚠️ | ❌ |
| Visual builder (exact-parity preview) | ✅ Optional | ❌ | ❌ | ❌ |
| Zero-latency SW navigation + offline | ✅ Built-in | ❌ | ❌ | ⚠️ |
| Zod component contracts | ✅ Built-in | ❌ | ❌ | ❌ |
| Workflows engine | ✅ Built-in | ❌ | ❌ | ❌ |
| Whole CMS in one edge worker | ✅ | ❌ | ❌ | ❌ |

**Honest framing**: Frontbase does not out-compete Next.js on ecosystem breadth. It wins where builder + agent + edge unity matters: one renderer shared by production, preview, and tooling.

---

## Bundle Size Impact

| Configuration | Payload |
|---------------|---------|
| Engine core (`edge-core`, min+gzip) | **< 70 KB** |
| Engine + ui-components + behaviors (typical published site SW) | ~150 KB |
| Worker script (engine + console + proxy) | < 400 KB (limit: 1 MB gzip CF free) |
| Builder SPA (static assets, design-time only) | ~300 KB (not in worker script) |
| Published page client JS (no React) | ~10 KB behaviors runtime |

---

## Implementation Strategy

### Phase 1: Engine & Compiler
1. Extract the engine into `@frontbase/edge-core`: unified router, eSSR renderer (seeded from `services/edge/src/ssr/` string renderers), DataProvider DI seam, workflows runner, behaviors runtime.
2. Build `@frontbase/compiler`: schema extraction, manifests, registered queries, SW bundle emission, CLI.
3. Verify: existing published pages render byte-identically through the new engine on the edge path.

### Phase 2: CMS Layer
1. `@frontbase/edge-infra`: direct providers, Edge Data Proxy, caches/queues/vault/auth/sync.
2. `@frontbase/backend`: console Hono sub-router + Drizzle schemas; mounted in-worker.
3. `@frontbase/builder`: React shell, local draft DB, SW preview bridge, visual editors.
4. Single-worker packaging + `frontbase deploy`.

### Phase 3: Agent Experience
1. Diagnostic quick-fixes and tri-environment simulation checks.
2. Installation-combination testing; E2E code-generation diagnostics.

---

## Resolved Questions (formerly open here)

- **Rendering strategy**: Universal eSSR (Decision A-12). No React streaming SSR; no dual server/client codegen.
- **Backend**: Hono-only console in the same worker (Decision A-13). FastAPI is legacy-product scope.
- **Backward compatibility**: layout version flags; the edge path renders legacy layouts via the legacy renderer until migrated; SW layer ships behind a flag (fallback-by-design).
- **Default installation**: interactive prompt with `--pure` as the default selection.

---

## Document Metadata

**Version**: 2.0
**Status**: Approved
**Owner**: Architecture Team
**Related Documents**:
- [CHIMERA-ARCHITECTURE.md](../ARCHITECTURE.md) (canonical)
- [PACKAGE-STRUCTURE.md](../PACKAGE-STRUCTURE.md)
- [DECISIONS.md](./DECISIONS.md)
- [STACK.md](../STACK.md)
