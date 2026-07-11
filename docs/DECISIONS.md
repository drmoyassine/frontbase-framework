# Frontbase Framework: Decisions Log

**Version**: 1.0
**Status**: Active
**Last Updated**: 2026-06-29

---

## Overview

This document tracks all architectural and product decisions made during the Frontbase Framework Evolution.

---

## Decision A-1: Modular Architecture Split

**Date**: 2026-06-29
**Status**: ✅ APPROVED - Proceed with modular split
**Priority**: 🔴 CRITICAL
**Question**: Should Frontbase proceed with the modular architecture split?

### Decision

**Yes, proceed with modular split**

### Rationale

- **Competitive Positioning**: Enables pure framework to compete directly with Next.js, Remix, and Astro
- **Bundle Size Reduction**: Framework-only users get ~50KB vs ~300KB (83% reduction)
- **Flexible Installation**: Users choose what they need with feature flags
- **Clear Product Boundaries**: Core framework vs. builder layer vs. optional features
- **Market Segmentation**: Can target both developers (framework) and no-code teams (builder)

### Implementation Approach

```
Phase 1 (6-8 weeks): Extract @frontbase/core
- Remove database dependencies from core
- Remove backend service dependencies from core
- Implement file-system routing for pure framework
- Target: <50KB bundle size

Phase 2 (4-6 weeks): Extract @frontbase/builder
- Create optional builder package
- Database adapter for layout storage
- Builder integration layer

Phase 2+: Optional feature packages
- @frontbase/auth (authentication adapters)
- @frontbase/workflows (workflow engine)
- @frontbase/database (database adapters)
```

### Package Structure

```
@frontbase/core           # Pure framework (~50KB) - REQUIRED
@frontbase/cli            # CLI tools (shared)
@frontbase/components     # Component library (shared)
@frontbase/builder        # Visual builder (~200KB) - OPTIONAL
@frontbase/auth           # Authentication adapters - OPTIONAL
@frontbase/workflows      # Workflow engine - OPTIONAL
@frontbase/database       # Database adapters - OPTIONAL
```

### Success Criteria

- [ ] Core framework bundle size <50KB
- [ ] Core framework works without database dependencies
- [ ] Core framework works without builder dependencies
- [ ] Builder can be added to existing projects
- [ ] Installation patterns work: --pure, --with-builder, --full
- [ ] Performance benchmarks meet or exceed current implementation

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Extraction complexity | Phase 0 spike to validate feasibility |
| Breaking existing customers | Feature flags + compatibility layer |
| Increased maintenance | Clear package boundaries + peer dependencies |
| Customer confusion | Clear documentation + installation examples |

### Related Decisions

- Enables A-2: Core Framework Scope
- Enables P-1: Modular Architecture Positioning
- Enables P-2: Primary Target Audience

---

## Decision A-2: Core Framework Scope

**Date**: 2026-06-29
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL
**Question**: What features should be included in @frontbase/core?

### Decision

**Core includes: React, TypeScript, SSR, Zod, routing, state management, CLI, edge runtime**
**Core excludes: Components, database, backend services**

### Rationale

- **Edge Runtime Required**: Core framework must include Hono edge runtime for SSR and API routes
- **Components Separate**: Component library should be separate package - users can build their own or install
- **Zero External Dependencies**: Core has NO database, backend, or builder dependencies
- **Framework-First**: Core is pure framework - competitive with Next.js/Remix

### Package Structure Clarification

```
@frontbase/core           # Framework ONLY (~50KB)
  ├── React 18+
  ├── TypeScript 5+
  ├── Streaming SSR
  ├── Zod schema system
  ├── File-system routing (dev) + build-time routing (prod)
  ├── State management (Zustand integration)
  ├── CLI tools (check, lint, simulate)
  └── Edge runtime (Hono-based)

@frontbase/components     # Component library (optional)
  ├── Basic components (Button, Text, Heading, Card, etc.)
  ├── Form components (Input, Textarea, Select, etc.)
  ├── Layout components (Container, Row, Column)
  ├── Data components (DataTable, Chart, KPICard)
  └── Landing components (Hero, Features, Pricing, etc.)

@frontbase/builder        # Visual builder (optional)
  └── Can include @frontbase/components or require separate install
```

### Installation Patterns

```bash
# Pure framework (no components, no builder)
npm create frontbase@latest my-app --pure

# Framework + components (no builder)
npm create frontbase@latest my-app --with-components

# Framework + builder (includes components)
npm create frontbase@latest my-app --with-builder

# Full stack (everything)
npm create frontbase@latest my-app --full

# Add components later
npm install @frontbase/components

# Add builder later
npm install @frontbase/builder
```

### Success Criteria

- [ ] Core bundle size <50KB (without components)
- [ ] Core includes Hono edge runtime
- [ ] Core works without any database dependencies
- [ ] Core works without any builder dependencies
- [ ] @frontbase/components is separate optional package
- [ ] Users can build pure framework apps without components
- [ ] Builder can optionally bundle components

### Key Insights

- **Freeform Building**: Framework users can build without pre-made components
- **Component Flexibility**: Users can use @frontbase/components, build their own, or use other libraries
- **Builder Integration**: Builder and components are separate concerns that can be used together or independently

### Related Decisions

- Follows A-1: Modular Architecture Split
- Informs P-1: Modular Architecture Positioning
- Informs P-2: Primary Target Audience

---

## Decision P-1: Modular Architecture Positioning

**Date**: 2026-06-29
**Status**: ✅ APPROVED (Partial - Tagline TBD)
**Priority**: 🔴 CRITICAL
**Question**: How should we position Frontbase with the modular architecture split?

### Decision

**Positioning: Equal positioning for developers and no-code teams**
**Tagline: TBD - Needs to incorporate: edge, SSR, SPA, agent-first, human-first, visual DnD**

### Rationale

- **Equal Positioning**: Market equally to both developers (framework users) and no-code teams (builder users)
- **No Priority**: Neither framework nor builder is "primary" - both are first-class citizens
- **Flexible Messaging**: Different messaging for different audiences without prioritization

### Target Audiences by Package

```
@frontbase/core          → Developers (60%), AI Agents (40%)
@frontbase/components     → Developers (80%), AI Agents (20%)
@frontbase/builder        → Marketing teams (70%), Developers (30%)
@frontbase/auth           → All users
@frontbase/workflows      → Backend users, automation engineers
@frontbase/database       → Data-heavy applications
```

### Messaging Framework

**For Developers (Core Framework)**:
- "Fullstack framework with streaming SSR and edge runtime"
- "Agent-first with Zod schemas and deterministic tooling"
- "File-system routing like Next.js, but better for AI agents"

**For No-Code Teams (Builder)**:
- "Visual builder with code-level access"
- "Build visually, edit code, deploy anywhere"
- "Marketing pages in minutes, complex apps in hours"

**For Hybrid Teams**:
- "Start visually, refine with code"
- "Visual builder for speed, code for control"

### Tagline Requirements

**Must Include**:
- Edge (edge runtime, global deployment)
- SSR (streaming server-side rendering)
- SPA (single-page application capabilities)
- Agent-first (optimized for AI coding assistants)
- Human-first (great developer experience)
- Visual DnD (drag-and-drop builder)

**Proposed Taglines** (pending further discussion):
- "The fullstack framework for humans and agents"
- "Visual builder, framework power"
- "Code meets visual"
- "Edge-native fullstack framework"

### Success Criteria

- [ ] Clear messaging for developer audience
- [ ] Clear messaging for no-code audience
- [ ] Website shows both paths equally
- [ ] Documentation serves both audiences
- [ ] Installation examples for both paths
- [ ] Final tagline incorporates all required elements

### Related Decisions

- Follows A-1: Modular Architecture Split
- Follows A-2: Core Framework Scope
- Informs P-2: Primary Target Audience
- Informs pricing and packaging decisions

### Open Items

- [ ] Final tagline/messaging decision
- [ ] Website structure for dual positioning
- [ ] Documentation organization for dual audiences

---

## Decision P-2: Primary Target Audience (Updated for Modular)

**Date**: 2026-06-30
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL
**Question**: With modular architecture, who is the primary user for each package?

### Decision

**User Mix**: 50/50 balanced - equal priority for human developers and AI agents

**@frontbase/core Target Audience**:
- Startup/Enterprise devs
- Agent-heavy developers
- Indie developers
- Agency developers

**@frontbase/builder Target Audience**:
- Developer/designer hybrids
- Builder platform migrants (Webflow, Framer, etc.)
- No-code builders
- Marketing teams

**@frontbase/components Target Audience**:
- All @frontbase users
- Component library users

**Optional Packages Target**:
- @frontbase/auth: All users needing authentication
- @frontbase/workflows: Backend users, automation engineers
- @frontbase/database: Data-heavy applications

### Rationale

**50/50 Balanced Approach**:
- Equal priority for human developers and AI agents
- Neither humans nor agents are "primary" - both are first-class citizens
- Agent-first is a differentiator but not at expense of DX
- This balance influences: CLI design, documentation, error messages, feature prioritization

**Developer Segments**:
- **Startup/Enterprise devs**: Need production-ready frameworks with good DX
- **Agent-heavy devs**: Using Claude, Cursor, Gemini daily - need deterministic tools
- **Indie devs**: Solo developers needing fast iteration
- **Agency devs**: Building client projects - need reliability and speed

**Builder Segments**:
- **Developer/designer hybrids**: Can code and design - want both visual and code
- **Platform migrants**: Coming from Webflow, Framer - need familiar workflows
- **No-code builders**: Marketing teams - need visual tools
- **Marketing teams**: Need landing pages, content sites quickly

### Target Audience Breakdown by Package

```
@frontbase/core
├── 50% Human developers
│   ├── 40% Startup/Enterprise devs
│   ├── 30% Indie developers
│   └── 30% Agency developers
└── 50% AI agents (Claude, Cursor, Gemini)

@frontbase/builder
├── 70% Visual users
│   ├── 40% Marketing teams
│   ├── 35% No-code builders
│   └── 25% Platform migrants
└── 30% Developer/designer hybrids

@frontbase/components
└── All users (100% coverage)
```

### Implications

**For Core Framework**:
- CLI must work equally well for humans and agents
- Documentation must serve both audiences
- Error messages: clear for humans, actionable for agents
- Feature flags: simple for humans, deterministic for agents
- Zod schemas: clear contracts for agents, good DX for humans

**For Builder**:
- Visual-first UX but code export/import
- Familiar patterns for platform migrants
- Collaboration features for teams
- Preview modes for marketing users

**Success Criteria**:
- [ ] CLI works equally well for humans and agents
- [ ] Agent success rate >90% on core framework
- [ ] Human developer satisfaction >4.5/5
- [ ] Builder serves marketing teams effectively
- [ ] Platform migration guides available
- [ ] Documentation serves all target segments

### Related Decisions
- Follows A-1: Modular Architecture Split
- Follows A-2: Core Framework Scope
- Follows P-1: Modular Architecture Positioning
- Informs pricing and packaging strategy

---

## Decision A-3: Consolidated Monorepo Structure & Package Naming

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL
**Question**: How should we structure and name the framework packages to minimize maintenance overhead?

### Decision

1. Rename `@frontbase/core` to **`@frontbase/edge-core`**.
2. Rename `@frontbase/infra` / `@frontbase/database` and consolidate all backend edge infrastructure utilities (caches, state databases, vaults, queues, and storages) into **`@frontbase/edge-infra`**.
3. Consolidate dynamic query components (datatable, form, charts, info lists, kpi cards, grids) into **`@frontbase/data-components`**.
4. Integrate basic routing (`@frontbase/router`) and Liquid rendering (`@frontbase/liquid`) directly into the **`@frontbase/edge-core`** bundle.
5. Simplify the monorepo package count from 35 down to **11 core packages**.

### Rationale

- **Low Maintenance Overhead**: Consolidating 35 packages to 11 reduces directory footprint, removes circular configuration loops, and accelerates CI/CD pipelines.
- **Edge Identity**: The `-edge` prefixes highlight the native serverless/edge compatibility of our runtime design.
- **Unified Infrastructure Layer**: Treating storage, caching, state-dbs, secrets, and task queues as a single dependency unit (`@frontbase/edge-infra`) simplifies installation flags while keeping core framework builds clean.

### Simplified Monorepo Layout (11 Packages)

- `@frontbase/edge-core`: Core edge framework logic (Hono runtime, dev file-system routing, state integration, liquid engines).
- `@frontbase/compiler`: Vite plugin, AST parsing, and Zod schema extractor.
- `@frontbase/components`: ~70 default visual widgets.
- `@frontbase/data-components`: Dynamic, query-bound widgets (Table, Charts, InfoLists, Forms).
- `@frontbase/builder`: (Optional) Drag-and-drop page editor canvas.
- `@frontbase/workflows`: (Optional) Edge workflow automation engines.
- `@frontbase/auth`: (Optional) Adapters for Supabase, Clerk, and SuperTokens.
- `@frontbase/data-sync`: (Optional) Real-time sync engine.
- `@frontbase/edge-infra`: (Optional) Persistence engines (state-dbs, caches, vaults, queues, storage).
- `@frontbase/backend`: FastAPI web service wrapper and admin panel API endpoints.
- `@frontbase/cli`: CLI utility script.

---

## Decision A-4: UI Component Consolidation

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should static components and dynamic data components be unified under a single package?

### Decision

1. Combine `@frontbase/components` and `@frontbase/data-components` into a single **`@frontbase/ui-components`** package.
2. Group both the ~70 basic visual design layout elements and the dynamic, query-bound database widgets (DataTable, Forms, Charts) within this package.
3. Reduce the monorepo package footprint from 11 down to **10 core packages**.

### Rationale

- **Unified Rendering Context**: Both basic layout containers and query-bound widgets represent visual components that must be registered in `componentRegistry.tsx` and evaluated by Hono SSR and client-side Suspense/hydration pathways.
- **Dependency Reduction**: Merging them removes circular peer dependencies between the design system templates and data components, facilitating an easier and faster release/versioning cycle.

---

## Decision A-5: Edge Auth Middleware Relocation

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should edge-side authentication/JWT validation middleware reside in @frontbase/auth or @frontbase/edge-infra?

### Decision

1. Relocate the Hono edge runtime JWT validation and verification middleware from `@frontbase/auth` to **`@frontbase/edge-infra`**.
2. Keep `@frontbase/auth` focused purely on client-side React UI components, forms, and client auth provider hooks (Supabase/Clerk client wrappers).

### Rationale

- **Headless Infrastructure Alignment**: Edge-side JWT verification, session payload decoding, and token parsing represent server-side gateway infrastructure filters. Centralizing them inside `@frontbase/edge-infra` groups them with other edge persistence and request-filtering systems (caching, vaults, database schemas).
- **Lightweight Presentation Layer**: This keeps `@frontbase/auth` strictly visual and client-oriented, preventing frontend components from pulling in server-only edge libraries or config bindings.

---

## Decision A-6: Elimination of @frontbase/auth

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should @frontbase/auth be eliminated and its components split between edge-infra and ui-components?

### Decision

1. Eliminate the `@frontbase/auth` package entirely.
2. Relocate Hono Edge runtime authentication verification (JWT validation middleware) to **`@frontbase/edge-infra`**.
3. Relocate React UI auth form components, client session hooks (`useSession()`, `useUser()`), and client SDK wrappers into **`@frontbase/ui-components`**.
4. Reduce the monorepo package footprint from 10 down to **9 core packages**.

### Rationale

- **Clean Runtime Separation**: This isolates the presentation layer (Client UI/hooks in `@frontbase/ui-components`) from the gateway filter layer (Hono middlewares in `@frontbase/edge-infra`). 
- **Developer Convenience**: Removing `@frontbase/auth` eliminates a redundant monorepo package, simplifying installation flags and compilation structures.

---

## Decision A-7: Elimination of @frontbase/workflows

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should @frontbase/workflows be eliminated and split between edge-core and builder?

### Decision

1. Eliminate the `@frontbase/workflows` package entirely.
2. Relocate the **Workflow Execution Engine** (durable queue execution, checkpoint filters, rate-limiting, and triggers) to **`@frontbase/edge-core`** to make it a first-class programmatic runtime feature.
3. Relocate the **Visual Workflow Editor Canvas** (React Flow layouts, diagrams catalog, and properties nodes) to **`@frontbase/builder`** to centralize all visual editor tooling.
4. Reduce the monorepo package footprint from 9 down to **8 core packages**.

### Rationale

- **First-Class Programmatic Workflows**: Incorporating the engine into `@frontbase/edge-core` allows code-first developers to build robust, edge-native programmatic workflows (analogous to Inngest or Temporal) without needing the drag-and-drop builder console.
- **Visual Builder Integration**: Since the visual workflow layout builder is a visual tool that saves configuration drafts, it aligns perfectly within the `@frontbase/builder` package alongside the visual page builder.

---

## Decision A-8: Elimination of @frontbase/data-sync

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should @frontbase/data-sync be eliminated and its features split between edge-infra and builder?

### Decision

1. Eliminate the `@frontbase/data-sync` package entirely.
2. Relocate the **Data Sync Engine & Adapters** (MySQL/PostgreSQL sync scripts, WordPress post importers, Google Sheets rows connectors, and sync cron execution logic) to **`@frontbase/edge-infra`**.
3. Relocate the **Sync Configuration & Dashboard UI** (visual columns-mapping canvas, conflict settings pages, execution tables) to **`@frontbase/builder`**.
4. Reduce the monorepo package footprint from 8 down to **7 core packages**.

### Rationale

- **Batteries-Included Edge Infrastructure**: Consolidating sync adapters under `@frontbase/edge-infra` pairs database connectivity and third-party data extraction loops with standard persistence structures (caching, SQL schemas, vaults, storage), providing a single powerhouse infrastructure package.
- **Visual Console Integration**: The sync mapping schema board is an administrative, developer-facing visual configuration tool that saves drafts, making it a natural addition to `@frontbase/builder` along with page and workflow visual builders.

---

## Decision A-9: Elimination of @frontbase/cli

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should @frontbase/cli be eliminated and its binaries compiled inside @frontbase/edge-core?

### Decision

1. Eliminate the `@frontbase/cli` package entirely.
2. Relocate the CLI command binaries (`frontbase init/check/lint/simulate`) directly into **`@frontbase/edge-core`** under a `bin/` directory.
3. Declare binary execution path mappings inside the `@frontbase/edge-core` configuration file (`package.json`) to register it as the standard package executable:
   ```json
   "bin": {
     "frontbase": "./bin/frontbase.js"
   }
   ```
4. Reduce the monorepo package footprint from 7 down to **6 core packages**.

### Rationale

- **Simplified Installation & Execution**: Developers installing `@frontbase/edge-core` get immediate access to commands (`npx frontbase init` or `npx frontbase check`) without needing to manage separate version updates or packages.
- **Zero Runtime Weight**: CLI tooling modules (prompt packages, simulators, chalk) reside in execution-only bin files that are completely ignored by Vite when building streaming edge SSR bundles, keeping the edge runtime footprint under target limits.

---

## Decision A-10: Consolidation of CLI into @frontbase/compiler

**Date**: 2026-07-05
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Should the CLI binaries be relocated to @frontbase/compiler to ensure edge-core remains a pure runtime package?

### Decision

1. Relocate the CLI command binaries (`frontbase init/check/lint/simulate`) from `@frontbase/edge-core` into **`@frontbase/compiler`** under the `bin/` directory.
2. Register the binary path mapping executable inside `@frontbase/compiler`'s `package.json`:
   ```json
   "bin": {
     "frontbase": "./bin/frontbase.js"
   }
   ```
3. Keep `@frontbase/edge-core` as a **100% pure production edge runtime** (only containing Hono routing, Liquid filters, SSR engines, and workflows runner) with zero dev-only binary packages or CLI prompt dependencies.

### Rationale

- **Pure Edge Core Bundle**: Keeping CLI scripts inside the compiler completely separates build-time development tools (AST parsing, Vite hooks, linters, scaffolders) from production edge servers, preventing any dev dependency leaks into production dependencies.
- **Natural Scaffolding Alignment**: `@frontbase/compiler` is installed as a `devDependency` and runs at dev-time. Executing project bootstrap prompts via `npx @frontbase/compiler init` matches standard scaffolding conventions (e.g. `npx create-vite`) while keeping execution tools inside the dev-time compilation package.

---

## Decision A-11: Dual-Backend Architectures (FastAPI & Hono)

**Date**: 2026-07-05
**Status**: ⚫ SUPERSEDED by A-13 (2026-07-06) — the framework ships the Hono edge console only; FastAPI remains legacy-product scope outside the framework packages
**Priority**: 🟡 HIGH
**Question**: Should the admin dashboard console backend support both FastAPI (legacy containerized VM) and Hono (edge-native serverless) runtimes?

### Decision

1. Specify that `@frontbase/backend` supports **two backend implementation options**:
   - **FastAPI Backend (`@frontbase/backend/fastapi`)**: The existing Python/FastAPI codebase, designed for traditional containerized (Docker) VM hosting and enterprise database setups.
   - **Hono Edge Backend (`@frontbase/backend/hono`)**: An edge-native TypeScript/Hono implementation, built directly on top of `@frontbase/edge-core` and `@frontbase/edge-infra`, designed for pure serverless (Cloudflare Workers, Deno) hosting with zero-infrastructure base cost.
2. Ensure both backend choices consume the same Drizzle-managed database schemas from `@frontbase/edge-infra` to prevent database schema drift.

### Rationale

- **Edge-Native SaaS Flexibility**: Providing a Hono edge backend allows developers to host their entire Frontbase CMS console directly on edge networks (like Cloudflare) for free, matching the modern serverless lifecycle.
- **Backward Compatibility Moat**: Retaining the FastAPI implementation provides an easy, low-risk upgrade path for self-hosted enterprise clients running existing VM/Docker orchestration stacks.

---

## Decision A-12: Adoption of the Chimera (Universal eSSR) Architecture

**Date**: 2026-07-06
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL
**Question**: Which rendering architecture should the framework adopt — React 18 streaming SSR, dual server/client code generation, or the Chimera (Universal eSSR)?

### Decision

**Adopt the Chimera (Universal eSSR)** as the canonical rendering architecture. See [CHIMERA-ARCHITECTURE.md](./CHIMERA-ARCHITECTURE.md).

1. One Hono-based engine (`@frontbase/edge-core`) renders every page in three environments: cloud edge worker (first load/SEO), browser service worker (subsequent navigations, private pages, offline), and builder canvas (design-time preview).
2. Page components are **isomorphic Hono/JSX functions** rendered to HTML strings. Published pages ship **no React**; interactivity comes from a ~10 KB declarative client-behaviors runtime.
3. Environment differences are isolated behind a dependency-injected **DataProvider** (direct with edge secrets / proxy via registered queries / local SQLite-WASM draft).
4. The service worker never receives credentials or raw SQL: the **Edge Data Proxy** executes only compiler-registered queries (queryId + Zod params + tenant scope).
5. React survives in exactly one place: the builder's own UI shell in `@frontbase/builder`.

### Rationale

- **Resolves the dual-renderer debt**: today every component exists twice (React in the builder SPA + hand-written string renderers on the edge). React streaming SSR would have added a *third* renderer; the Chimera collapses to **one**.
- **The existing code favors it**: the ~1,600 lines of SSR string renderers in `services/edge/src/ssr/components/` are architecturally closer to engine components than to React SSR — they become the seed, not waste.
- **Exact WYSIWYG**: the builder previews with the production engine — fidelity is structural, not aspirational.
- **Zero hydration drift**: no server/client component split, no hydration mismatch class of bugs, no dual bundles.
- **Zero-latency navigation + offline** as built-in differentiators no mainstream framework offers.
- **Fallback-by-design**: browsers without service workers always render from the edge, so the SW layer carries no adoption risk.

### Supersedes / Resolves

- Supersedes the "React 18 Streaming SSR" pillar of proposal v2.x and Milestone 2.5 (streaming SSR setup).
- Resolves former open questions: SSR strategy, dual-bundle build output, client-only component strategy (see OPENQUESTIONS §Resolved).

### Success Criteria

- [ ] Byte-identical HTML for the same layout across edge, SW, and builder preview (CI parity suite).
- [ ] Engine bundle < 70 KB min+gzip; SW payload < 150 KB.
- [ ] Published pages ship 0 KB of React.
- [ ] Edge Data Proxy rejects all non-registered queries (security test suite).

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Engine-in-SW impractical (size/lifecycle/Safari) | Phase 0 spike validates first; Adjust path = ship edge-only eSSR, defer SW layer |
| SW staleness after publish | Versioned sw.js + skipWaiting + manifest revalidation (CHM-1) |
| Proxy abuse | Registered queries only; Zod param validation; tenant scoping (CHM-4) |

---

## Decision A-13: Single-Edge-Worker Deployment (Supersedes A-11)

**Date**: 2026-07-06
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL
**Question**: How does the complete CMS deploy?

### Decision

**The entire CMS — builder frontend, console API, eSSR engine, Edge Data Proxy, and workflows — deploys as ONE edge worker** (Cloudflare Workers primary, Deno Deploy secondary).

1. `@frontbase/backend` is a **TypeScript/Hono console sub-router mounted at `/api/console` inside the same worker** as the engine. There is no separate backend deployment and no Python in the framework deploy.
2. The FastAPI backend is **removed from framework scope**: it is not an npm package and not part of `--full` scaffolds. It remains the legacy self-hosted product's runtime and the data-migration source.
3. Builder SPA assets are served as static assets from the worker (excluded from script-size limits).
4. Persistence uses edge-native bindings via `@frontbase/edge-infra`: D1/Turso/Postgres-Hyperdrive, KV, R2, Queues.

### Rationale

- **Zero-infrastructure self-hosting**: `npx @frontbase/compiler deploy` gives anyone a complete visual CMS on a free edge plan — the strongest adoption lever the framework has.
- **Ends the dual-backend maintenance tax**: A-11 required maintaining 60+ console routes twice (Python + TypeScript) against shared schemas, with permanent drift risk between Alembic/SQLAlchemy and Drizzle. One implementation, one migration system (Drizzle).
- **Operational simplicity**: one deploy artifact, one URL, one log stream, one rollback lever.

### Supersedes

- **A-11 (Dual-Backend Architectures)** — marked superseded above.

### Success Criteria

- [ ] `init --full && deploy` produces a working CMS at a single URL on a free Cloudflare plan.
- [ ] Worker script < 400 KB min+gzip (hard limit 1 MB gzip on CF free).
- [ ] Console API feature-complete for CMS-critical routes (pages, drafts, publish, tenants, tokens, users) at Phase 2 exit; long-tail admin routes migrate post-GA.

---

## Decision A-14: Six-Package Structure Reaffirmed Under the Chimera

**Date**: 2026-07-06
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Does the 6-package consolidation hold under the Chimera architecture, and what are the packages' roles?

### Decision

The **six-package structure is fixed** (guiding principle #3); Chimera adoption redefines roles rather than adding packages:

```
@frontbase/edge-core      # The Chimera Engine — router, eSSR renderer, DataProvider DI, workflows, behaviors, SW primitives
@frontbase/compiler       # Vite plugin, schema extraction, query registrar, SW bundle emitter, CLI (init/check/lint/simulate/deploy)
@frontbase/ui-components  # THE single set of isomorphic page components + behaviors + auth primitives (no React)
@frontbase/builder        # React shell + local SQLite-WASM draft DB + canvas↔SW preview bridge + visual editors
@frontbase/edge-infra     # Direct data providers, Edge Data Proxy, caches, queues, vault, auth gates, sync, storage
@frontbase/backend        # Console API Hono sub-router (in-worker) + Drizzle schemas & migrations
```

New capabilities extend existing packages; adding a seventh package requires a new decision record.

### Rationale

- Preserves the consolidation benefits of A-3…A-10 (low maintenance overhead, simple peer trees, fast CI).
- Gives every Chimera concern an unambiguous home (see CHIMERA-ARCHITECTURE §5 package mapping).
- A fixed surface is itself agent-friendly: agents can memorize the full package topology.

---

## Decision A-15: Framework Repository & Licensing (settles PRD-2)

**Date**: 2026-07-07
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH
**Question**: Where does the framework code live, and under what license?

### Decision

1. **Fresh dedicated repository: `frontbase-framework`** — a monorepo with `packages/{edge-core,compiler,ui-components,edge-infra}` under one shared toolchain. The current product repo stays intact and untouched through Phase 1; it becomes the framework's **first consumer** after M1.1 proves byte-parity (extraction = move, not fork).
2. **Apache-2.0** for all four framework packages. Chosen over MIT for the explicit patent grant and enterprise-legal friendliness (a commercial layer sits on top); AGPL rejected — network copyleft suppresses adoption of an embeddable framework, and freeride protection comes from the commercial builder layer instead.
3. Repo starts **private**; flips public once Phase 1 is presentable (M1.1/M1.2 landed; at latest the Phase 3 beta).
4. `builder` and `backend` package placement + licensing remain **open** (PRD-1 residual, decide before Phase 2; builder still leaning BSL/proprietary per the PRD-1 tiering).
5. **Cross-repo parity strategy**: the M1.1 byte-identical regression suite lives in the framework repo and tests against a **golden corpus** — HTML snapshots generated once from the product repo's production renderer (including the real homepage) and committed as fixtures. No cross-repo code imports; the repos stay decoupled.
6. The framework docs (`docs/frontbase-framework/`, gitignored in the product repo) migrate to the new repo and become version-controlled.

### Rationale

- Keeps the shipping product de-risked during extraction — no toolchain or dependency churn in the product repo until the framework is proven.
- One roof for the four OSS packages preserves the A-3/A-14 consolidation benefits (shared CI, single version line, simple peer trees).
- Apache-2.0 matches the adoption goal: developers and agents embedding `edge-core` must never face an AGPL-dependency ban; the moat is the builder, the engine is the funnel.

---

## Decision A-16: Registered-Query Authoring Model (settles CHM-4)

**Date**: 2026-07-07
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL (was blocking M1.2)
**Question**: How are the named queries served by the Edge Data Proxy authored, typed, and registered?

### Decision

**One registry contract, two authoring paths; code-first is the M1.2 MVP.**

The registry contract (owned by `@frontbase/edge-core`, executed by `@frontbase/edge-infra`):

```ts
interface RegisteredQuery<P = unknown> {
    queryId: string;                 // namespaced, e.g. 'products.list'
    params: z.ZodType<P>;            // validated by the proxy before execution
    scope: 'public' | 'tenant' | 'user';
    ttlSeconds?: number;
    execute: (params: P, ctx: QueryContext) => Promise<Record<string, unknown>[]>;
}
```

- **Code-first (M1.2 MVP)**: projects export `defineQueries({...})`; the compiler extracts `{queryId, params, scope, ttl}` into the site manifest at build time. `execute` never leaves the server side.
- **Builder-first (Phase 2, M2.2)**: the builder's query UI emits the *same* manifest artifact at publish time — no second registry.
- The SW/browser only ever sees `{queryId, param schema}`; the proxy rejects unregistered IDs and invalid params (proven in M0.3: `evil.dropTables` → 404).

### Rationale

- The spike already validated this shape (baked registered queries + proxy rejection).
- One contract prevents the code/builder split from becoming two security surfaces.
- Zod params reuse the M1.2 extractor machinery — same round-trip safety net as component schemas.

---

## Decision A-17: DB Provider Verification Surface & Tenant-Isolation Layer

**Date**: 2026-07-10
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL (defines "done" for M2.1)
**Question**: CI has no live cloud DB credentials. How do we verify D1/Turso/Postgres/SQLite providers, and where does the tenant-isolation guarantee live so a credential-gated provider is still trustworthy?

### Decision

**1. SQLite (`LocalSqliteProvider`) is the CI-verified reference provider.** Every commit runs real
queries, real cross-tenant isolation tests, no-leak, and opaque-error gates against it. All RULE 1–4
security gates are fully CI-verifiable without credentials.

**2. D1 / Turso / Postgres are implemented behind the shared `DataProvider` interface and verified
against the *contract*.** Their live-DB gates are **credential-gated**: green against the interface on
every commit; exercised against real endpoints only where a test DB / connection string is provided
(local or a later CI matrix). Mirrors the product repo's own test approach.

**3. Tenant isolation lives in the provider-agnostic query layer, NOT in provider-specific mechanisms.**
The `execute` SQL MUST carry an application-level `WHERE tenant = ctx.tenant` (from `resolvePrincipal`
only). Provider-native isolation (Postgres/Supabase RLS, D1 bindings) is **defense-in-depth only**, never
the primary control. This is what makes the SQLite isolation test *authoritative for every provider*: the
guarantee under test is the same code path on all of them.

**4. Isolation + contract tests are written ONCE against the `DataProvider` interface, parameterized by
provider.** Enabling a cloud provider (creds present) runs the *identical* gates — never a
re-implementation. A credential-gated provider is therefore a deferred *run*, not a coverage gap.

### Rationale

- Unblocks M2.1 without cloud credentials while keeping the security gates genuinely authoritative.
- Prevents a silent coverage hole: if isolation were delegated to RLS, the SQLite test would prove
  nothing about the RLS-backed providers — exactly where CI can't see.
- One parameterized test suite = flip a provider live with zero new test code.

### Impact on M2.1 acceptance

"Done" for M2.1 = SQLite passes the full gate set (queries, cross-tenant isolation, no-leak, opaque
errors) AND D1/Turso/Postgres pass the shared contract test AND every provider's `execute` uses an
app-level tenant predicate (RLS/bindings additive only). Credential-gated live runs are documented, not
required for green. Updates the M2.1 plan gates accordingly.

---

## Decision A-19: Console DB Unification & CF D1 Default (M-DB.0)

**Date**: 2026-07-11
**Status**: ✅ APPROVED
**Question**: How does the admin console DB connect across adapters, and how is it provisioned on Cloudflare?

### Decision

1. **`ConsoleStore` consumes a `DbRunner`** (B1), not a libsql URL. A thin `sqliteRunner(url)` preserves `:memory:`/`file:`/`libsql://` for tests + Docker; `d1RunnerFromBinding(env.DB)` is the CF default. One seam, all four adapters.
2. **CF default DB = D1** (B2). `frontbase deploy` (CF) provisions a D1 database via `wrangler d1 create`, writes the `[[d1_databases]] binding="DB"` block (idempotent — B6), and the console + public data share ONE binding.
3. **Docker default = SQLite file** (`file:./data/frontbase.db`) via `sqliteRunner` — no external service.
4. **Migrations run via `DbRunner.exec`** (B5) — portable SQL, identical on all four.
5. **Lazy env-bound worker** (B10/BLOCKER-1): the scaffold `worker.ts` is `export default { fetch(req, env, ctx) }` with a cached `getEngine(env)` — D1 bindings only exist in per-request `env`, so the engine/console build is deferred to first request. `createConsole` takes `{ makeRunner, sessionSecret?, resolvePrincipal? }` (BLOCKER-2); `dbUrl` stays as a convenience.
6. **edge-infra is the adapter home** (B9): `buildDataProvider`/`DbRunner`/runners.ts are the single driver source. Credentials never leak (B8).

### Rationale

Unblocks the identity sprint (which seeds users into the console DB) and makes a fresh CF deploy actually have a console DB. The four blockers (env-init vs D1 binding, dbUrl hardwire, deploy-only-deploy, first-boot migration in getEngine) are each fixed by the lazy env-bound pattern.

---

## Decision History

| Date | Decision | Status |
|------|----------|--------|
| 2026-06-29 | A-1: Modular Architecture Split | ✅ Approved |
| 2026-07-05 | A-3: Consolidated Monorepo Structure & Package Naming | ✅ Approved |
| 2026-07-05 | A-4: UI Component Consolidation | ✅ Approved |
| 2026-07-05 | A-5: Edge Auth Middleware Relocation | ✅ Approved |
| 2026-07-05 | A-6: Elimination of @frontbase/auth | ✅ Approved |
| 2026-07-05 | A-7: Elimination of @frontbase/workflows | ✅ Approved |
| 2026-07-05 | A-8: Elimination of @frontbase/data-sync | ✅ Approved |
| 2026-07-05 | A-9: Elimination of @frontbase/cli | ✅ Approved |
| 2026-07-05 | A-10: Consolidation of CLI into @frontbase/compiler | ✅ Approved |
| 2026-07-05 | A-11: Dual-Backend Architectures (FastAPI & Hono) | ⚫ Superseded by A-13 |
| 2026-07-06 | A-12: Adoption of the Chimera (Universal eSSR) Architecture | ✅ Approved |
| 2026-07-06 | A-13: Single-Edge-Worker Deployment | ✅ Approved |
| 2026-07-06 | A-14: Six-Package Structure Reaffirmed Under the Chimera | ✅ Approved |
| 2026-07-07 | A-15: Framework Repository & Licensing (fresh private repo, Apache-2.0) | ✅ Approved |
| 2026-07-07 | A-16: Registered-Query Authoring Model (one contract, code-first MVP) | ✅ Approved |
| 2026-07-10 | A-17: DB Provider Verification Surface & Tenant-Isolation Layer | ✅ Approved |

---

## Document Metadata

**Version**: 2.0
**Status**: Active — Chimera architecture adopted (A-12/A-13/A-14)
**Owner**: Architecture Team
**Next Review**: As new decisions are made

**Related Documents**:
- [OPENQUESTIONS.md](./OPENQUESTIONS.md) - All open questions
- [ARCHITECTURE-SPLIT.md](./ARCHITECTURE-SPLIT.md) - Modular architecture details
- [MILESTONES.md](./MILESTONES.md) - Implementation roadmap
