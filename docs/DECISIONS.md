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

## Decision A-18: Identity & Provisioning Layer (M-ID.1)

**Date**: 2026-07-11  **Status**: ✅ APPROVED
PBKDF2-SHA256 password hashing (D1, 600k iters, Web Crypto); HS256 fb_session JWT (D2, 7-day, HttpOnly); single-site _default tenant (D3); owner/master_admin/tenant_admin roles in JWT claims (D4/D9); idempotent boot seeding from ADMIN_EMAIL/ADMIN_PASSWORD (D5); wrangler secret put deploy flags (D6); login/logout/me routes (D7); hash never returned (D8); edge-core frozen (D9); tenant provisioning returns temp password once (D10).

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

## Decision A-20: Public Release Positioning and Gated Rollout

**Date**: 2026-08-13
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL

### Context

The framework has completed substantial engine, compiler, infrastructure, backend, builder, and console work, while package consumability, external clean-room installation, self-host evidence, documentation, security residue, and release operations still need one coherent public-release contract. Frontbase may also be taught by downstream education products, but their timelines must not become Frontbase product governance.

### Decision

Prepare Frontbase for public release as a **self-hostable, AI/agent-oriented, edge-native app-builder and framework**. Use [`PUBLIC-RELEASE-STRATEGY.md`](./PUBLIC-RELEASE-STRATEGY.md) as the canonical rollout contract:

1. Audit and freeze a truthful first public edition and release label.
2. Prove external package consumption and clean-environment project creation outside the monorepo.
3. Prove adopter-controlled self-hosting for every deployment path claimed publicly.
4. Keep security, recoverability, documentation, versioning, and release automation as non-waivable gates.
5. Treat CF-22 as paused accepted residue unless explicitly reactivated; scope the public edition honestly around it.
6. Accept downstream consumer evidence only as input to generalized Frontbase requirements. NoCodeHero may teach a released Frontbase version but does not set Frontbase's roadmap, release label, or acceptance criteria.

### Rationale

This positioning expresses the architecture's actual differentiators while preventing “open repository,” “Cloudflare deploy,” or “course deadline” from being mistaken for a complete public product. A gated release train makes installation, ownership, security, and operations part of the self-hosting promise and lets Frontbase choose a smaller honest initial edition instead of overstating parity or portability.

### Consequences

- The immediate release action is the R0 scope/truth audit, not an uncontrolled feature sprint.
- Existing Phase 3/4 dates are planning evidence, not automatic launch commitments.
- Public claims must distinguish Cloudflare-first integration from other verified self-host paths.
- Package publication and clean-room consumption become explicit blockers.
- Downstream education can co-evolve with Frontbase through versioned capabilities and generalized evidence without importing business strategy into this repository.

---

## Decision A-21: Backendless Node/Docker Self-Host Adapter

**Date**: 2026-08-22
**Status**: ✅ APPROVED
**Priority**: 🟡 HIGH

### Context

The deployable CMS (`examples/cf-full`) ran only on Cloudflare Workers (D1 + Static Assets bindings). A-20 §3 requires adopter-controlled self-hosting for every deployment path claimed publicly, and self-hosting without a Cloudflare account needs a portable host.

### Decision

Support a **single backendless container** (and bare-metal Node) via `examples/cf-full/src/node.ts`: the SAME exported `createCmsEngine` with exactly three host swaps — `sqliteRunner` over a `file:` URL (sqlite-dialect parity with D1; generic PG/MySQL as the *app* DB remains the A-15-adjacent unclosable constraint), a disk-backed ASSETS shim over `console-dist/` (same binding contract, ETag/304), and a caught fire-and-forget dispatcher. `migrateUp` self-applies at boot; `ADMIN_*` seeds are idempotent. Docker gate = deploy-level console verification + hydrate-vendor presence (patch-hydrate silently skips without the vendor). Secrets are runtime env only; `.env` is gitignored; `.dockerignore` excludes `.dev.vars`/`.env`/`*.secret`.

A FastAPI A/B parity stack (product stack beside this container for differential testing) is a recorded future goal — the framework's Hono app implements its own full API, so the stacks are peers, never a frontend/backend pair. A two-service all-TS split was considered and rejected for now (artificial for a single-app architecture).

### Consequences

- Self-host claims in release materials can reference a verified Docker path, not just Cloudflare.
- `assetResponse` now treats asset-store 304s as hits (fixes conditional-GET 404s on both hosts).
- Image builds require `pnpm run fetch:console` staging first (posture B preserved); the gate fails fast otherwise.
- Runtime image carries a prod `node_modules` (libsql native addon cannot be bundled); per-arch builds only.

---

## Decision A-22: Console Source Consolidation (Phase 1 of framework-only)

**Date**: 2026-08-28
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL

### Context

The console SPA was built from the product repo by `scripts/fetch-console.mjs` and vendored at a pinned product SHA (`console-dist/CONSOLE_PIN`), while the product's Docker cloned this framework for `@frontbase/edge-core` — a bidirectional pin dance. The framework-only direction (2026-08-28) retires the product repo entirely, starting with the console.

### Decision

Move the console source into this workspace as `packages/console` (`@frontbase/console`, private; the 8 product sub-packages nest as alias-resolved source dirs). Zero behavior change: `builder-sw.js` is **byte-identical** to the product build, the SPA module graph is equivalent, and the CSS chunk hash matches. `CONSOLE_PIN` and `fetch:console` are retired; the validator slims to a staged-filesystem check (`validateStagedConsole`) plus the surviving contract-hash guard. `fetch:hydrate` replaces the product fetch for the hydration vendor only (Phase 2 will consolidate that source too). All 100 console devDependencies are pinned to exact product-resolved versions, with `pnpm.overrides` holding the 7 bundled runtime libs + rollup at product versions. The console's vitest is excluded from the root `pnpm test` filter (vitest 4 needs vite ^6; the build pins vite 5.4.21 for byte parity — revisit in Phase 2), and its `check` script scopes to `src/sw` + `src/client` (full-src tsc was never a product gate). CI browser acceptance becomes unconditional: the old `hashFiles(console-dist/assets/*.js)` gate was always false, so e2e never ran remotely — a coverage hole now closed.

### Consequences

- Fresh clones self-heal: the console builds from source; nothing product-built is committed.
- The product's shipped bundle accidentally bundled a **second React (19.2.3)** from a stray `packages/datatable/node_modules` install that its committed lockfile does not reproduce; the framework build resolves datatable to the shared React 18.3.1 — matching datatable's own `^18 || ^19` peer range. This is the only module-graph difference and it is deliberate (the stray install is excluded from the copy).
- The residual SPA size delta vs the last product build (−50 kB) is esbuild minified-identifier allocation noise seeded by that React difference — the programs are structurally identical.
- `examples/cf-full/e2e/playwright.config.ts` gained quoting on its `--var` values: playwright shells the command, and the space-containing default passphrase was being split, seeding `ADMIN_PASSWORD=correct` (found via the newly-run e2e; latent since CF-22).

---

## Decision A-23: Contract Inversion & Hydrate Source Consolidation (Phase 2 of framework-only)

**Date**: 2026-08-28
**Status**: ✅ APPROVED
**Priority**: 🔴 CRITICAL

### Context

A-22 left two live product inputs. The vendored community contract was pinned by `contracts/PRODUCT_COMMIT` + `CONTRACT_SHA256`, refreshed by `scripts/sync-contract.mjs` from a product checkout, and guarded by a drift gate (`scripts/contract-diff.mjs`) that compared the framework against the frozen product doc forever. The hydration bundle (`examples/cf-full/public/react/hydrate.vendor.js`) was `git show`-ed out of the product repo at that same pinned commit and byte-patched by `scripts/patch-hydrate.mjs` — six exact-once patches keyed on MINIFIED product identifiers to restore the builder-canvas data fallbacks. With the framework-only direction locked (2026-08-28), both product flows had to die: the framework becomes the single source of truth.

### Decision

1. **Contract inversion** — the framework owns its contract. `packages/backend/contracts/openapi.community.json` (334 ops / 349 schemas / 36 tags) stays the contract and gate denominator, content unchanged this phase, but in-place edits are now legitimate: `contracts:emit --check` staleness is the only guard (the behavior-ledger gate catches a dropped declaration — ledger entries ≠ measured ops). `openapi.full.json` (389 ops / 415 schemas) is vendored alongside as the console client-generation input until Phase 4 implements the 55 cloud-only ops. Deleted: `PRODUCT_COMMIT`, `CONTRACT_SHA256`, `sync-contract.mjs`, the drift gate (root script + backend test + CI step + its mutation proof), `differential.expected.json` (orphan), and the live-product tooling (`compat-live-conformance.mjs`, `differential-parity.mjs`, the byte-duplicate `compat-legacy-conformance.mjs`; `conformance:legacy` renames to `conformance`). The behavior ledger and the CF22_A3 `PRODUCT_VERIFIED_REFUSAL` reader are untouched — they consume committed historical artifacts (provenance, not a live dependency).
2. **Client generation in-repo** — `packages/console` gains `openapi-ts.config.ts` (`@hey-api/openapi-ts` 0.99.0 exact; input = the vendored full spec) + `client:generate`. The committed `src/client` regenerates byte-identically (verified at execution; the only deltas vs the product-committed output were two inert one-liners in `client.gen.ts`/`types.gen.ts` — the baked `baseURL`, overridden at runtime by `src/lib/api-client.ts`). CI gains two gates: regeneration staleness (`client:generate` → `git diff --exit-code`) and byte-equality of the console client's `zod.gen.ts` with the worker-embedded compat copy (`scripts/check-client-sync.mjs` — one generator, one spec).
3. **Hydrate source consolidation** — new `packages/hydrate` (`@frontbase/hydrate`, private; vite 7.3.1 + @vitejs/plugin-react 5.1.2 + react 19.2.3, all exact) builds `dist/hydrate.js` + `entry-*.css` from the ported product sources (`services/edge/src/client`: entry.tsx, globals.css, the UnifiedDataTable edge wrapper + 5 thin re-export wrappers, `repeater/*`), aliasing the 8 console sub-packages — verifiably the same sources the vendor was built from (the vendor's embedded `.tsx` paths name them). The six byte-patches become source-level: the five canvas fallbacks share one `isBuilderCanvas()` gate in `@frontbase/types` (a function called at bail time — the per-query re-evaluation is semantics, never hoist it to a module const), and the ui-event-trigger init is deferred to a macrotask in `entry.tsx`. The cf-full build stages `packages/hydrate/dist` → `console-dist/react/` (the only served location); the vendor's silent-skip paths are gone (a missing dist fails the build loudly). Smoke hydrate checks are unconditional: served ≡ built, the `chimera-rendered-by` gate literal present, CSS immutable — plus six source-anchor assertions (one per translated patch). Deleted: `fetch-hydrate.mjs`, `patch-hydrate.mjs`, `public/react/`, the `requireHydrateVendor`/`contractOnly` modes in the validator (replaced by `requireHydrate` on the staged tree — the deploy gate now judges the post-build tree it actually ships). Zero product references remain in build, test, deploy, CI, or Docker.
4. **Product archive** — the product repo (`drmoyassine/frontbase-dbsync`) becomes reference-only; no framework code path may reach it. Its GitHub archival is the user's action at phase end.

### Consequences

- The last vendored hydrate bundle was a **development-mode build** (292 jsxDEV annotations, 289 embedded `.tsx` source paths, dev React with full warning strings). The framework build is production React 19.2.3 — ~25% smaller (~770 KB vs ~1,027 KB minified) with a 1:1 content census (recharts/liquidjs/react-query/component registry markers equal). Behavior-equivalent for the hydration path; the regression net is the e2e builder-canvas flow in a real browser against workerd.
- The console SPA bundles changed bytes (the shared component sources gained the gate), but SPA behavior is unchanged: its components mount with default `mode='builder'` (gates 1–3 unreachable) and its `index.html` has no `chimera-rendered-by` meta (gates 4–5 reduce to the prior condition) — only `edge-core/src/shell.ts` stamps that meta, on published/canvas documents.
- Legitimate contract evolution now requires re-running `contracts:emit`; the staleness gate catches an edit that skips re-emission. The 334-op community denominator and all conformance-gate logic are unchanged.
- The console's vitest/vite-6 exclusion from the root test filter (A-22) was left as-is in this phase; it is build-parity hygiene, not a product dependency.

## Decision A-24: Four-Host Deploy Matrix & Pluggable State DB (Phase 3 of framework-only)

- **Date**: 2026-08-28
- **Status**: ✅ Approved
- **Related**: A-13 (single-edge-worker deployment), A-19 (console DB unification & CF D1 default), A-21 (Node/Docker self-host adapter), A-23 (Phase 2)

### Context

A-21's host-surface analysis showed `examples/cf-full` couples three capabilities directly to Cloudflare — the D1 binding (the engine's `runner`), the ASSETS binding, and `ctx.waitUntil` — while everything else already travels (system services resolve over HTTPS; `createCmsEngine` takes the host surface as constructor data). The locked go-live direction requires the same one-Hono-app CMS on Docker, Cloudflare, Vercel, and Deno Deploy, with the state database pluggable from adapters that already exist ("for CF deployment a D1 is the default choice, but the user should be able to deploy with whatever we do have adapters for"). Honest constraint: migrations are SQLite-dialect (DDL + `sqlite_master` introspection), so the app-DB menu is exactly the SQLite-family runners; Postgres-family stays the documented unclosable gap (A-17 lineage).

### Decision

1. **Four hosts, one example** — Cloudflare Workers (existing), Node/Docker (existing), **Vercel Edge** (new `src/vercel.ts`: `hono/vercel handle`, no `assets` — `vercel.json` owns the static matrix, the function owns every route needing state or a redirect, `config = { runtime: 'edge' }`), and **Deno Deploy** (new `src/deno.ts`: `Deno.serve` after engine init, the disk-ASSETS shim shared with node via new `src/assets-disk.ts`). All entries live in `examples/cf-full`; no new example dir.
2. **State-db resolver** — new `src/state-db.ts` with `describeStateDb` (pure decision table) + `resolveStateDb` (describe + construct; the libsql native client opens `file:` connections eagerly, so tests assert on the pure layer). Precedence, first match wins: `APP_DB_URL` (libsql/`:memory:`/`file:`, with `file:` refused on the no-filesystem hosts) → the complete `APP_DB_D1_ACCOUNT_ID`+`APP_DB_D1_DATABASE_ID`+`CLOUDFLARE_API_TOKEN` trio → `d1RunnerFromRest` (D1 itself is a choice on ANY host) → CF's `d1Binding` → node's `file:/data/app.db` Docker default. Any PARTIAL configuration throws at boot naming the exact missing variable(s) — never a silent fallback. A half-configured DB must fail at boot, not at first write. `displayUrl`/`label` (system cards) never carry a credential. This split also fixes the pre-existing `node.ts` authToken drop (`sqliteRunner(APP_DB_URL)` → the token now travels).
3. **Self-contained edge bundles** — `build.mjs` factors `emitEdgeArtifact` and adds an `edgeAlias` esbuild plugin for the NEW emits only: `@libsql/client` → its `lib-esm/web.js` (fetch-transport client; resolved through the importing package's own symlink realpath — version-agnostic, no `.pnpm` store walking). **`@upstash/qstash` is deliberately NOT re-pinned**: the `./cloudflare` subpath exports only `serve`, not `Receiver`; the `Receiver` used for signature verification lives in the main entry (bundled either way), and the dead computed `import(\`node:${m}\`)` template sits in the SHARED chunk both entries import — no alias could remove it, it has never executed on fetch-only hosts, and the worker bundle always shipped it. Proof obligations shift to the bundle gates (web-libsql marker present, native platform binaries absent, qstash endpoint literal present).
4. **Vercel routing is config-pinned** — `vercel.json` (phase-object rewrites): `beforeFiles` sends the `/frontbase-admin` shell to `/api/cms` (the function must own the `needsSetup` 302), `afterFiles` translates engine-emitted `/static/react/*` + `/static/icon.png` onto the CDN tree (a real file wins without a function invocation), `fallback` catch-alls to `/api/cms`; header rules pin hydrate (no-cache), hashed console assets (immutable) and the broad shell rule — ordered AFTER the assets rule so merge order cannot flatten the immutable cache. `api/cms.mjs` is a byte copy of `dist/vercel.mjs` (Vercel discovers `api/*` at the project root regardless of `outputDirectory`).
5. **Deploy tooling is per-host; the CLI stays Cloudflare-only** — `frontbase deploy` provisions Cloudflare (D1 + wrangler secrets + setup link) BY DESIGN; `--target vercel|deno` now REFUSES with `{ok:false, details:{hint}}` pointing at `pnpm run deploy:vercel|deploy:deno`, replacing the old silently-deploys-scaffold branch (deployctl deploying the scaffold artifact with no provisioning and no secrets). The new root scripts mirror `deploy.mjs`: build → `validateStagedConsole` → new shared gate `scripts/verify-host-artifact.mjs` (bundle + config + staged files, judged post-build so stale bytes can't be blessed) → secrets from env or stdin JSON, NEVER argv → host CLI. The scripts validate the state db through the deployed `describeStateDb` contract itself and refuse `:memory:`/`file:` on the edge hosts.
6. **Gates** — `src/smoke-host.ts` (per-host CLI): artifact gates, the disk-shim contract over the real staged console-dist, and a route matrix driving BOTH new entries over a real engine whose D1-REST calls are answered by stubbed fetch backed by in-memory SQLite — the same code path a real D1-over-REST deployment uses, credential-free. `test/state-db.mjs` (22 checks: precedence, fail-loud, host honesty, no-leak). `test/vercel-config.mjs` (the vercel.json contract). CI runs all three on every PR; live deploys stay in dispatch-only `vercel-fresh-deploy.yml` / `deno-fresh-deploy.yml` (scratch-named projects, fail-fast secrets, `always()` teardown, cloned from the CF-22 pattern).
7. **Pre-existing gap fixed in passing** — `/static/icon.png` was a live 404 on every host (the engine rewrites the favicon link to a root path nothing staged). The build stages `console-dist/icon.png`; smoke asserts served ≡ staged bytes on CF and Deno, the CDN header rule covers Vercel, and the Docker gate curls it.

### Consequences (limits stated as limits)

- **The app-DB menu is SQLite-dialect** (D1 binding / D1-over-REST / `file:` / `:memory:` / Turso-`libsql://` HRANA). Postgres/MySQL as the app DB remains the unclosable gap; `supabaseRunner` is a *datasource* runner, not an app-DB option. The resolver exposes exactly what exists — credential-gated ≠ coverage gap (A-17 pattern).
- **Deno Deploy**: no writable filesystem (state must be remote) and no BullMQ (TCP) — warn-and-skip. **Vercel Edge**: no filesystem at all; the static matrix lives in `vercel.json`, and two platform behaviors (header merge order, rewrite phase precedence) are pinned by the config gate and confirmed live by the dispatch workflow.
- **D1-over-REST is one round trip per statement, no transactions** — documented, not batched away.
- **Docker behavior is unchanged except two honest fixes**: `APP_DB_AUTH_TOKEN` now reaches the libsql client, and the system cards name the RESOLVED backend (a Turso-backed self-host no longer claims `file:` SQLite). `APP_DB_URL=file:/data/app.db` (the Dockerfile default) resolves identically.
- **CF-13 is retracted as written**: the old "deployctl path wired, blocker is credentials only" claim described the scaffold-deploying branch this decision deletes. Deno Deploy live support arrives with the deno-fresh-deploy workflow + `deploy:deno` script, not the compiler CLI.
- The edge bundles each grew by the shared-chunk content (≈482 KB min+gzip vs 481.6 KB for worker.mjs) — far under the 4 MB Vercel Edge ceiling, gated at build time.

---

## Decision A-25: Cloud Multi-Tenant Free Tier on app.frontbase.dev (Phase 4 of framework-only)

- **Date**: 2026-08-29
- **Status**: ✅ Approved
- **Related**: A-13 (single-edge-worker deployment), A-17 (tenant-isolation layer), A-22/A-23/A-24 (Phases 1–3), A-18 (identity & provisioning)

### Context

Phases 1–3 made the framework the single source of truth. Phase 4 ships the locked go-live: **public self-serve signup → build in the console → publish → live at `<slug>.frontbase.dev`** — on ONE shared community worker in the operator's Cloudflare account. The reference model is the product's cloud mode (read-only audit): a shared-rows SaaS where signup provisions DB rows only (tenant + owner + plan + default page, no infra), the serving worker resolves the tenant from the **Host header prefix alone**, the platform admin is a master-admin-only API, and a global plan catalog with `tenants.plan` as a soft FK gates features. Scope is **free tier only** (user decision): the product's free plan has `edge_engines: 0`, so per-tenant engines, custom domains, and Stripe are structurally Phase-5 machinery. The framework collapses the product's two-worker+VPS split into its single worker (A-13 — there is no separate control plane to split).

Two deliberate security fixes go beyond product fidelity: (1) **unregistered slugs are 404'd, not served** (the product served unknown-tenant pages); (2) **signup/login/forgot get the CF-16 rate limiter** (the product had none). Negative tenant lookups are never cached; positives hold 15 s in-isolate.

### Decision

1. **One artifact, env-gated** — `FRONTBASE_DEPLOYMENT_MODE=cloud` + `FRONTBASE_BASE_DOMAIN` activate tenancy; unset means byte-identical self-host (existing smoke green, unmodified). The two values ride `wrangler deploy --var` (non-secret, argv-safe) and are **never written to wrangler.toml** — a committed mode var would flip every self-host reusing the file into cloud boot.
2. **Serving plane** — `tenancy/host.ts` (pure host parsing: `tenant|app|reserved|apex|foreign`; reserved set = operational labels ∪ product signup slugs ∪ internal namespaces; 3–50-char slug) + `tenancy/serving.ts` (tenant-scoped page resolution, tenant-host state, `scopePrincipalToHost`). `resolvePrincipal` is wrapped so a session belonging to another tenant's member is anonymous on this host — closing a real cross-tenant hole in private-page gating (login is a cross-tenant email scan). Enrichment resolves from the host tenant only (the self-host `[_root, _default]` fallback is the leak, not the caches). edge-core hooks (`resolvePublishedPage`, `enrichLayout`, `resolveFaviconUrl`) take an optional `req` — fewer-args call sites stay valid.
3. **Signup & email** — signup validates the slug (reserved + format), 409s collisions, provisions tenant `plan='free' status='active'` + owner + `ensureHomepage` in one transaction with compensating delete; `/api/auth/me` populates `tenant_id`/`tenant_slug`. Resend carries password-reset links (`RESEND_API_KEY` secret, env/stdin only); failures stay non-enumerating. **Honest limits**: no email verification, no captcha — rate limiting is the only abuse control this phase.
4. **Platform admin** — `/api/admin/tenants*` (master_admin per handler, not the any-admin prefix guard) + the `/admin` cloud console (a second vite build, `--mode cloud`, base `/admin/`, staged to `console-dist/admin`). `/admin` on a TENANT host is a 404 by design: a login form on someone else's domain is a phishing surface. The app-host PlansManager edits the **`_global` catalog** (`adminPlansTenant` dep re-namespaces the `/api/admin/plans*` router) — without it the operator would edit rows nothing reads, since `tenants.plan` enforcement resolves `_global`. Per-tenant plan rows still win precedence; the default (no dep) router is untouched.
5. **Plan catalog & gates** — `seedPlanCatalog` idempotently seeds `free` into the existing `plans` table under `_global` **at cloud boot, not migration** (a migration-seeded catalog would change self-host, where "no plan ⇒ unlimited" is the tested contract). Enforcement fires only when limits resolve: counts → 402 `limit_exceeded` (pages, deploys_monthly — calendar-month Published-row approximation, team_members, edge_engines), flags → 403 (private_pages, api_access). `-1` unlimited, null inert, master_admin bypass preserved. **Counts are not metering** — no ledger, no cron; shared D1 capacity is the operator's concern.
6. **Rate limiting** — the existing `rateLimitGuard` gains a D1-backed CacheProvider (fixed-window `rate_limit_counters` table) and a synthetic `rl-anon` principal keyed on `CF-Connecting-IP` (left-most XFF fallback, documented spoofable → best effort). Cloud only; opaque 429.
7. **Deploy** — `deploy.mjs --mode cloud --base-domain` stays the single entry: stages BOTH console trees, gates on both (`requireCloud`), pushes `SESSION_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_ROLE`/`RESEND_API_KEY` stdin-only, and attaches `app.<zone>` + `*.<zone>` as Workers Custom Domains via the CF API (`cloud-domains.ts`, idempotent upsert, token header-only, per-hostname failure rows; missing creds → loud skip + dashboard path, API refusal → fail with remediation).

### Gates

Six backend suites (`tenant-host`, `cloud-serving`, `cloud-signup`, `admin-tenants`, `cloud-plan-gates`, `cloud-rate-limit`) + `smoke:cloud` (composed worker over Host headers, /admin served through the real Static-Assets path) + seven RULE 8 mutation proofs + the `console-pin` cloud-stage harness (29 fixtures) + compiler `cloud-domains`/`deploy-cloud` seams. Console unit + check gates stay green; self-host smoke untouched.

### Consequences (limits stated as limits)

- **The 11 `admin_agents_*` ops are framework stubs** — the cloud console's agent-analytics/credit/addons widgets degrade to error states. Phase-5 machinery (agent credits/metering are out of scope by plan §5).
- **Phase-5 boundary**: per-tenant engines, managed/BYO custom domains, per-tenant workers, Stripe, `remove_branding` server-side flip, email verification, captcha, metering beyond counts, admin impersonation, apex marketing site, hard tenant delete/data export, per-plan rate-limit quotas, per-tenant D1/regions.
- **Wildcards**: first visit to an unseen slug may hit a cert-provisioning window (platform behavior, documented); Custom Domains attach for `*.<zone>` depends on the zone's plan (dashboard fallback documented).
- **Self-host invariance is load-bearing**: every cloud code path is behind `cloudMode`/env gates, and the unmodified self-host smoke + plan-limits contract prove it each run.

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
| 2026-07-11 | A-18: Identity & Provisioning Layer | ✅ Approved |
| 2026-07-11 | A-19: Console DB Unification & CF D1 Default | ✅ Approved |
| 2026-08-13 | A-20: Public Release Positioning and Gated Rollout | ✅ Approved |
| 2026-08-22 | A-21: Backendless Node/Docker Self-Host Adapter | ✅ Approved |
| 2026-08-28 | A-22: Console Source Consolidation (Phase 1 of framework-only) | ✅ Approved |
| 2026-08-28 | A-23: Contract Inversion & Hydrate Source Consolidation (Phase 2 of framework-only) | ✅ Approved |
| 2026-08-28 | A-24: Four-Host Deploy Matrix & Pluggable State DB (Phase 3 of framework-only) | ✅ Approved |
| 2026-08-29 | A-25: Cloud Multi-Tenant Free Tier on app.frontbase.dev (Phase 4 of framework-only) | ✅ Approved |

---

## Document Metadata

**Version**: 2.3
**Status**: Active — Chimera architecture adopted; public-release rollout governed by A-20
**Owner**: Architecture Team
**Next Review**: As new decisions are made

**Related Documents**:
- [OPENQUESTIONS.md](./OPENQUESTIONS.md) - All open questions
- [ARCHITECTURE-SPLIT.md](./ARCHITECTURE-SPLIT.md) - Modular architecture details
- [MILESTONES.md](./MILESTONES.md) - Implementation roadmap
