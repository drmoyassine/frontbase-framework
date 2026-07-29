# Frontbase Framework: Technology Stack (Chimera)

**Version**: 2.0
**Status**: Current — updated for the Chimera (Universal eSSR) architecture
**Last Updated**: 2026-07-06

---

## Overview

This document details the technology stack for the Frontbase Framework Evolution under the **Chimera architecture** ([CHIMERA-ARCHITECTURE.md](./CHIMERA-ARCHITECTURE.md)): one Hono engine rendering isomorphic JSX in three environments (cloud edge, browser service worker, builder canvas), the whole CMS deployed as a single edge worker.

**Headline stack changes under the Chimera (Decision A-12/A-13):**
- Published pages are rendered by **Hono + isomorphic JSX → HTML strings** (with LiquidJS filters). They ship **no React** — interactivity comes from the ~10 KB client behaviors runtime.
- **React is confined to the builder application shell** (`@frontbase/builder`): panels, layers tree, dialogs. Page previews are iframes rendered by the engine in a local service worker.
- New toolchain members: **Service Worker runtime** (engine host), **SQLite WASM** (builder draft DB), **Drizzle ORM** (console persistence), **Workers Static Assets** (builder SPA hosting).
- The Python/FastAPI backend is out of framework scope (legacy product only).

---

## Table of Contents

1. [Frontend Stack](#frontend-stack)
2. [Backend Stack](#backend-stack)
3. [Build & Tooling](#build--tooling)
4. [Package Management](#package-management)
5. [Testing](#testing)
6. [Development Tools](#development-tools)
7. [Deployment Targets](#deployment-targets)
8. [State Management Strategy](#state-management-strategy)

---

## Frontend Stack

### Core Framework

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Hono (+ isomorphic JSX)** | 4.x | Rendering engine for ALL published pages | Runs identically on edge and in service worker; JSX → HTML strings; no hydration |
| **LiquidJS** | Latest | Template variable resolution | Existing filter library; data-binding syntax in layouts |
| **Client Behaviors Runtime** | (Internal, ~10 KB) | Published-page interactivity | Declarative `data-fb-*` bindings; no React on published pages |
| **React** | 18.3+ | **Builder shell only** (`@frontbase/builder`) | Rich editor UI (panels, DnD, dialogs); never renders published components |
| **TypeScript** | 5.3+ | Type Safety | Zod integration, better DX for agents |
| **SQLite WASM** | Latest | Builder local draft database | Zero-latency design-time data; `localDraftProvider` for the engine |

**Why one Hono/JSX renderer instead of React SSR?** (Decision A-12)
- One implementation per component — eliminates the current React-plus-string-renderer duplication
- Byte-identical output across edge, service worker, and builder preview (exact WYSIWYG)
- No hydration → no hydration-mismatch bug class, ~10 KB client JS instead of ~140 KB React
- Small enough to run inside a service worker (the defining Chimera capability)

---

### State Management

> **Chimera scope note**: the React state layers below apply to the **builder shell** (`@frontbase/builder`) only. Published pages have no React state — their state lives in engine render context (server/SW side) and the declarative behaviors runtime (client side).

| Technology | Current Version | Proposed Evolution | Rationale |
|-------------|-----------------|-------------------|-----------|
| **Zustand** | 4.x | Continue + Enhance | Minimal boilerplate, TypeScript-first, no providers needed |
| **TanStack Query** | 5.x | Continue | Server state, caching, background refetch |
| **React Hook Form** | 7.x | Continue | Form state, validation integration with Zod |
| **Zod** | 3.25+ | Expand to all schemas | Runtime validation, TypeScript inference, agent-friendly |

**State Management Layers**:

```typescript
// 1. Component State (useState/useReducer)
// Local component state, ephemeral UI state

// 2. Global State (Zustand)
// Application-wide state: auth, user preferences, builder state
interface BuilderStore {
  pages: Page[];
  selectedPage: string;
  selectedComponent: string | null;
  // ... actions
}

// 3. Server State (TanStack Query)
// Data from APIs, databases, external services
const { data: pages } = useQuery({
  queryKey: ['pages'],
  queryFn: fetchPages,
});

// 4. Form State (React Hook Form + Zod)
// Form inputs, validation, submission
const { register, handleSubmit } = useForm({
  resolver: zodResolver(ComponentSchema),
});

// 5. URL State (React Router + Search Params)
// Routing, pagination, filters
```

**Why Zustand over Redux/Jotai/Recoil?**
- Minimal boilerplate (no providers, actions, reducers)
- TypeScript-first design
- Simple DevTools integration
- Easy for agents to understand (simple functions)
- Small bundle size (~1KB)

---

### Routing

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Hono Router** | 4.x | ALL page routing (edge + service worker) | One priority-mounted router for the whole worker |
| **React Router** | 6.x | Builder shell internal navigation only | Editor screens within `/app/*` |

**Routing Architecture (single worker)**:
```typescript
// Priority-mounted unified router (@frontbase/edge-core):
// 1. /sw.js + /assets/*      → engine bundle + static assets
// 2. /frontbase-admin/*      → pinned product console static assets
// 3. /api/*                  → product-compatible, tenant-scoped backend
// 4. /api/console/health     → retained liveness
// 5. /api/console/setup/*    → retained first-admin bootstrap
// 6. other /api/console/*    → 410 Gone
// 7. /api/data/:queryId      → Edge Data Proxy (registered queries)
// 8. *                       → published pages (eSSR catch-all)

// Development adds file-system routes (dev-only):
src/dev-routes/dashboard.tsx → /dev/dashboard
```

---

### UI Component Libraries

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Tailwind CSS** | 3.x | Styling | Utility-first, JIT compiler, responsive |
| **Lucide React** | Latest | Icons | Tree-shakeable, consistent, agent-friendly |
| **Headless UI** | (Internal) | Accessible Components | Base primitives for custom components |

---

## Backend Stack

### Edge Runtime

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Hono** | 4.x | Edge Framework | Unified runtime, multi-platform, TypeScript-first |
| **Cloudflare Workers** | (Platform) | Edge Deployment | Global edge network, fast cold starts |
| **Deno Deploy** | (Platform) | Edge Deployment Alternative | Native TypeScript, secure by default |
| **Docker/Node** | (Platform) | Development | Local development consistency |

**Why Hono?**
- Single codebase for multiple edge platforms
- TypeScript-first design
- Built-in middleware (CORS, auth, etc.)
- Fast (uses Web Standards)
- Easy for agents to understand (simple patterns)

---

### Authentication

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Supabase Auth** | Latest | Primary Auth Provider | Multi-tenant, Row-Level Security, OAuth |
| **JWT** | (Standard) | Token Format | Stateless, edge-compatible |

**Authentication Flow**:
```typescript
// 1. Client: Supabase Auth SDK
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});

// 2. Backend: JWT validation
const user = await verifyJWT(token);

// 3. Edge: Tenant context injection
app.use('*', tenantContextMiddleware);

// 4. Database: Row-Level Security
// All queries scoped to tenant_id
```

---

### Databases

| Technology | Version | Purpose | Environment | Rationale |
|-------------|---------|---------|-------------|-----------|
| **Cloudflare D1** | Latest | Default CMS database | Edge (single-worker) | Zero-config binding, free tier |
| **Turso/LibSQL** | Latest | Edge Database | Edge | HTTP-based, global replication |
| **PostgreSQL** | 15+ | Enterprise database (via Hyperdrive) | Production | ACID, RLS, JSON support |
| **SQLite** | 3.x | Local Database | Development | Zero-config, single file |
| **SQLite WASM** | Latest | Builder draft DB | Browser | Design-time local-first drafts |
| **Drizzle ORM** | Latest | Console persistence layer | All | Edge-compatible, single migration source (`@frontbase/backend`) |

---

### Workflow & Queues

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Upstash QStash** | Latest | Workflow Queue | Serverless, durable, HTTP-based |
| **Cloudflare Queues** | (Platform) | Alternative Queue | Platform-native, lower latency |
| **BullMQ** | Latest | Local Development | Redis-backed, testing |

---

## Build & Tooling

### Build Tools

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Vite** | 5.x | Build Tool | Fast HMR, optimized builds, plugin ecosystem |
| **SWC** | (Via Vite) | TypeScript/JSX Compilation | Fast (20x faster than Babel), Rust-based |
| **esbuild** | (Via Vite) | Minification | Extremely fast bundling |
| **tsup** | Latest | Package Building | TypeScript-first, ESM support |

**Why Vite over Webpack/esbuild CLI?**
- Fast development server (ESM native)
- Excellent React plugin ecosystem
- Built-in TypeScript support
- Simple configuration
- Wide adoption (agents familiar)

---

### Compiler Stack (New)

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **SWC Core** | Latest | AST Parsing | Fast, TypeScript/JSX support |
| **recast** | (Alternative) | AST Manipulation | Preserves formatting, code generation |
| **Zod** | 3.25+ | Schema Definition | Runtime validation, TypeScript inference |

**Compiler Pipeline**:
```
TSX Source → AST Parser → Schema Extractor → Code Generator → SSR/Client Bundles
```

---

### CSS Processing

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Tailwind CSS** | 3.x | Styling | JIT compiler, purging unused styles |
| **PostCSS** | 8.x | CSS Transforms | Tailwind dependency, autoprefixer |

---

## Package Management

### Package Structure

```
frontbase/
├── packages/
│   ├── @frontbase/edge-core/      # The Chimera Engine — router, eSSR renderer, DataProvider DI, workflows, behaviors, SW primitives
│   ├── @frontbase/compiler/       # Vite plugin, schema extraction, query registrar, SW bundle emitter, CLI
│   ├── @frontbase/ui-components/  # THE single set of isomorphic page components + auth primitives (no React)
│   ├── @frontbase/builder/        # React shell, SQLite WASM draft DB, canvas↔SW preview bridge, visual editors
│   ├── @frontbase/edge-infra/     # Data providers, Edge Data Proxy, caches, queues, vault, auth gates, sync
│   └── @frontbase/backend/        # Product-compatible API + retained setup/health + Drizzle
```

### Package Manager

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **pnpm** | 8.x | Package Manager | Fast, disk-efficient, workspace support |

**Why pnpm over npm/yarn?**
- Efficient disk usage (hard links)
- Fast installs (parallel downloads)
- Strict dependency handling
- Excellent workspace support
- Monorepo-first design

---

## Testing

### Testing Framework

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Vitest** | Latest | Unit/Integration Tests | Vite-compatible, fast, ESM native |
| **React Testing Library** | Latest | Component Testing | User-centric, accessibility-first |
| **Playwright** | Latest | E2E Testing | Cross-browser, fast execution |
| **MSW** | Latest | API Mocking | Service Worker-based, realistic |

---

### Testing Strategy

```typescript
// 1. Unit Tests (Vitest)
describe('SchemaExtractor', () => {
  it('should extract Zod schema from component', () => {
    const schema = extractSchema(componentCode);
    expect(schema).toMatchObject(expectedSchema);
  });
});

// 2. Integration Tests (Vitest)
describe('Vite Plugin', () => {
  it('should transform component', async () => {
    const result = await plugin.transform(code, id);
    expect(result.code).toBeDefined();
  });
});

// 3. Component Tests (RTL)
describe('Hero Component', () => {
  it('should render title', () => {
    render(<Hero title="Test" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});

// 4. E2E Tests (Playwright)
test('user can create page', async ({ page }) => {
  await page.goto('/builder');
  await page.click('[data-testid="add-component"]');
  // ... assertions
});
```

---

## Development Tools

### Code Quality

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **ESLint** | 9.x | Linting | Configurable, plugin ecosystem |
| **Prettier** | 3.x | Formatting | Consistent code style |
| **TypeScript ESLint** | Latest | TS Linting | Type-aware linting |

### Development Environment

| Technology | Version | Purpose | Rationale |
|-------------|---------|---------|-----------|
| **Node.js** | 20+ | Runtime | Latest LTS, native ESM |
| **pnpm** | 8.x | Package Manager | Workspace support |
| **Docker** | Latest | Containerization | Consistent environments |

---

## Deployment Targets

**Principle #1: the entire CMS deploys as ONE edge worker.** `npx @frontbase/compiler deploy` packages the engine, product-compatible API, data proxy, and static assets into a single deployment.

### Edge Platforms (Single-Worker)

| Platform | Status | Bindings Used | Rationale |
|----------|--------|---------------|-----------|
| **Cloudflare Workers** | ✅ Primary | Static Assets, D1, KV, R2, Queues, Hyperdrive | Largest edge network; free tier hosts the full CMS |
| **Deno Deploy** | ✅ Secondary | Deno KV, Turso | Native TypeScript alternative |

**Worker size budget**: engine < 70 KB min+gzip; worker script (engine + console + proxy) < 400 KB; builder SPA and `sw.js` served as static assets (excluded from script limits). Hard limit: 1 MB gzip (CF free) / 10 MB (paid).

### The Third "Platform": the Browser Service Worker

The engine also deploys **into every visitor's browser** as the eSSR service worker (< 150 KB min+gzip incl. components), enabling zero-latency navigation, private-page local rendering, and offline mode. Fallback-by-design: browsers without SW support always render from the edge.

### Self-Hosted / Development

| Platform | Status | Capabilities | Rationale |
|----------|--------|--------------|-----------|
| **Node.js / Docker** | ✅ Supported | `frontbase simulate`; container hosting of the same worker code | Local development & enterprise on-prem |

---

## State Management Strategy

### Component State Variables

```typescript
// Component-level state (useState)
export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count}
    </button>
  );
}

// Form state (React Hook Form + Zod)
export function ContactForm() {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(ContactFormSchema),
  });

  return <form onSubmit={handleSubmit(onSubmit)}>...</form>;
}

// Global state (Zustand)
interface BuilderStore {
  pages: Page[];
  selectedPage: string;
  selectedComponent: string | null;
  setSelectedComponent: (id: string | null) => void;
}

const useBuilderStore = create<BuilderStore>((set) => ({
  pages: [],
  selectedPage: '',
  selectedComponent: null,
  setSelectedComponent: (id) => set({ selectedComponent: id }),
}));

// Server state (TanStack Query)
const { data: pages } = useQuery({
  queryKey: ['pages'],
  queryFn: () => api.pages.list(),
});
```

### Component Props & Schema

```typescript
// 1. Define Zod schema
export const HeroSchema = z.object({
  title: z.string().describe('Hero title text'),
  subtitle: z.string().optional().describe('Supporting subtitle'),
  ctaText: z.string().default('Get Started').describe('Button label'),
  themeColor: z.enum(['emerald', 'indigo', 'slate']).default('emerald'),
});

// 2. Generate TypeScript type
type HeroProps = z.infer<typeof HeroSchema>;

// 3. Use in component
export function Hero({ title, subtitle, ctaText, themeColor }: HeroProps) {
  return (
    <section className={`bg-${themeColor}-50`}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      <button>{ctaText}</button>
    </section>
  );
}

// 4. Export for manifest generation
Hero.schema = HeroSchema;
```

---

## Agent-Friendly Choices

### Why This Stack is Good for AI Agents

| Decision | Agent Benefit |
|----------|---------------|
| **Explicit Zod Schemas** | Clear contract, type inference |
| **Zustand** | Simple functions, no boilerplate |
| **React Router v6** | Declarative, easy to understand |
| **Vite** | Standard tool, high training data |
| **TypeScript** | Type safety, better code completion |
| **Tailwind CSS** | Predictable utility classes |
| **SWC** | Fast compilation, standard patterns |

### Stack Criteria for Agent-Friendly Design

1. **Explicit over Implicit**: Clear contracts, no magic
2. **Standard Patterns**: High training data volume
3. **Type Safety**: TypeScript + Zod for validation
4. **Simple APIs**: Minimal boilerplate, clear naming
5. **Deterministic Outputs**: Same inputs → same outputs

---

## Version Requirements

### Minimum Required Versions

```json
{
  "node": ">=20.0.0",
  "pnpm": ">=8.0.0",
  "typescript": ">=5.3.0",
  "react": ">=18.3.0",
  "vite": ">=5.0.0"
}
```

### Development Environment

```bash
# Check versions
node --version    # v20.x
pnpm --version    # 8.x
docker --version # 20.x+
```

---

## Upgrade Strategy

### Regular Updates

| Technology | Update Frequency | Strategy |
|-------------|------------------|----------|
| React | Annual (major) | Wait for ecosystem stability |
| TypeScript | Quarterly | Incremental adoption |
| Vite | Quarterly | Fast adoption |
| Hono | As needed | Feature-driven |
| Supabase | Monthly | Continuous monitoring |

### LTS vs Current

- **Node.js**: Follow LTS schedule
- **React**: Use latest stable
- **TypeScript**: Use latest stable
- **Others**: Use latest compatible versions

---

## Document Metadata

**Version**: 2.0
**Status**: Current (Chimera)
**Owner**: Architecture Team
**Next Review**: Quarterly or when major stack changes are considered

**Change Log**:
- 2026-06-29: Initial stack documentation created
- 2026-07-06: Chimera update — Hono/JSX renderer for all published pages; React confined to builder shell; SW runtime, SQLite WASM, Drizzle, single-worker deployment targets; FastAPI removed from framework scope
