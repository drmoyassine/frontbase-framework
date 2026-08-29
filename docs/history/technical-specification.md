# Frontbase Framework: Technical Specification (Chimera)

**Version**: 2.0
**Status**: Draft — updated for the Chimera (Universal eSSR) architecture
**Last Updated**: 2026-07-06

---

## Overview

This document provides the technical specification for implementing the Frontbase Framework Evolution under the **Chimera architecture** ([CHIMERA-ARCHITECTURE.md](../ARCHITECTURE.md) is canonical): detailed component designs, compiler/CLI specifications, the engine runtime (DataProvider DI, Edge Data Proxy, service-worker host), and agent integration points.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component System Specification](#component-system-specification)
3. [Build Pipeline](#build-pipeline)
4. [CLI Tooling](#cli-tooling)
5. [Runtime Specification](#runtime-specification)
6. [Agent Integration](#agent-integration)

---

## Architecture Overview

### System Diagram

```mermaid
graph TB
    subgraph "Development"
        A[Isomorphic JSX Component] -->|@frontbase/compiler| B[Vite Plugin / AST Compiler]
        B --> C[TypeScript Types]
        B --> D[Component Manifest / Zod]
        B --> E[Engine Component]
        B --> Q[Registered Queries]
        B --> W["sw.js (versioned engine bundle)"]
    end

    subgraph "Runtime — One Engine, Three Environments"
        E --> H["Edge Worker (first load / SEO)"]
        W --> S["Browser Service Worker (navigation / offline)"]
        W --> P["Builder Canvas SW (WYSIWYG preview)"]
        Q --> X["Edge Data Proxy (/api/data)"]
        S --> X
    end

    subgraph "Tools"
        L[CLI check/lint/simulate/deploy] --> B
        M[Agent Tools] --> L
    end
```

### Component Relationships

```
@frontbase/edge-core (The Chimera Engine)
├── Unified single-worker Hono router
├── eSSR renderer (isomorphic JSX → HTML string, LiquidJS filters)
├── DataProvider DI contract (+ built-in proxyProvider)
├── Workflows engine (provider interfaces + in-memory defaults)
├── Client behaviors runtime (~10 KB)
└── SW lifecycle primitives (versioning, manifest revalidation, data cache)

@frontbase/compiler (devDependency)
├── AST parsing → engine components
├── Schema extraction (Zod) → manifests
├── Query registrar → registered queries
├── SW bundle emitter → versioned sw.js
├── Type generation
└── CLI bin (init/check/lint/simulate/deploy)

@frontbase/ui-components
├── Isomorphic page components (engine JSX — no React)
├── Behavior scripts (client interactivity)
└── Auth primitives (engine-rendered forms + client SDK adapters)

@frontbase/builder
├── React shell (canvas chrome, layers, property panels)
├── Local SQLite WASM draft DB (+ localDraftProvider)
├── Canvas↔SW preview bridge
├── Visual Workflow Flows
└── Sync mapping editor

@frontbase/edge-infra
├── Direct DataProviders (D1, Turso, Postgres/Hyperdrive, SQLite)
├── Edge Data Proxy sub-router
├── Caches, Queues, Storage
├── Vault encryption + edge auth gates
└── Data sync adapters

@frontbase/backend
├── Console API Hono sub-router (/api/console — same worker)
├── Drizzle schemas & migrations
└── Publish pipeline (manifest version → sw.js bump → cache purge)
```

---

## Component System Specification

### Component Manifest Format

```typescript
interface ComponentManifest {
  // Metadata
  name: string;
  displayName: string;
  category: ComponentCategory;
  description?: string;
  version: string;
  author?: string;

  // Schema references
  schema: {
    zod: string;           // Path to Zod schema
    types: string;         // Path to generated types
    props: string;         // Path to props interface
  };

  // UI Configuration
  ui: {
    icon: string;          // Icon identifier
    color?: string;        // Accent color
    size?: 'small' | 'medium' | 'large';
  };

  // Property configuration
  properties: PropertySchema;

  // Style configuration
  styles?: StyleSchema;

  // Event configuration
  events?: EventSchema;

  // Examples
  examples?: ComponentExample[];

  // Dependencies
  dependencies?: {
    components?: string[];  // Required child components
    packages?: string[];   // Required npm packages
  };
}

type ComponentCategory =
  | 'basic'
  | 'form'
  | 'layout'
  | 'data'
  | 'landing'
  | 'advanced';
```

### Property Schema Definition

```typescript
interface PropertySchema {
  general?: PropertyFieldConfig[];
  options?: PropertyFieldConfig[];
  actions?: PropertyFieldConfig[];
  advanced?: PropertyFieldConfig[];
  styles?: StyleFieldConfig[];
}

interface PropertyFieldConfig {
  // Basic configuration
  type: FieldType;
  name: string;
  label: string;
  description?: string;

  // Value constraints
  default?: any;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;

  // Options for select/radio
  options?: SelectOption[];

  // Display configuration
  placeholder?: string;
  showIf?: ShowCondition;
  disabledIf?: ShowCondition;

  // Special handling
  syntaxContext?: 'input' | 'output';
  secret?: boolean;  // For sensitive values (API keys, etc.)
}

type FieldType =
  | 'text'
  | 'input'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'switch'
  | 'boolean'
  | 'color'
  | 'icon'
  | 'date'
  | 'file'
  | 'code'
  | 'json';

interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  disabled?: boolean;
}

interface ShowCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'empty';
  value: any;
}
```

### Component Package Structure

```
packages/@frontbase/example-component/
├── package.json
├── README.md
├── src/
│   ├── ExampleComponent.tsx       # Main component
│   ├── ExampleComponent.schema.ts  # Zod schema
│   ├── ExampleComponent.types.ts   # Generated types
│   └── index.ts
├── dist/
│   ├── manifest.json              # Generated manifest (+ registered queries)
│   ├── engine.js                  # Isomorphic engine component (renders everywhere)
│   ├── behaviors.js               # Optional client behavior script
│   └── types.d.ts                 # Type definitions
└── docs/
    └── example-component.md
```

### Component Package Metadata

```json
{
  "name": "@frontbase/example-component",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/types.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types.d.ts",
      "import": "./dist/index.js"
    },
    "./engine": "./dist/engine.js",
    "./behaviors": "./dist/behaviors.js",
    "./schema": "./src/ExampleComponent.schema.ts"
  },
  "frontbase": {
    "component": "ExampleComponent",
    "category": "basic",
    "schema": "./dist/manifest.json",
    "icon": "box"
  },
  "peerDependencies": {
    "@frontbase/edge-core": "^1.0.0"
  }
}
```

---

## Build Pipeline

### Vite Plugin Architecture

```typescript
// packages/compiler/src/vite/index.ts
import { Plugin } from 'vite';
import { createFilter } from '@rollup/pluginutils';
import { Compiler } from '../ast/compiler';

export interface FrontbasePluginOptions {
  include?: string[];
  exclude?: string[];
  manifest?: boolean;   // component manifests + registered queries
  engine?: boolean;     // isomorphic engine components (one per source component)
  swBundle?: boolean;   // versioned sw.js emission
}

export function frontbasePlugin(
  options: FrontbasePluginOptions = {}
): Plugin {
  const filter = createFilter(
    options.include || ['**/*.tsx'],
    options.exclude || ['**/node_modules/**']
  );

  const compiler = new Compiler({
    generateManifest: options.manifest ?? true,
    generateEngine: options.engine ?? true,
    emitSwBundle: options.swBundle ?? true,
  });

  return {
    name: 'vite-plugin-frontbase',

    // Transform TSX files
    transform(code, id) {
      if (!filter(id)) return null;

      const result = compiler.transform(code, id);
      if (!result) return null;

      return {
        code: result.code,
        map: result.map,
      };
    },

    // Generate manifests after build
    buildEnd() {
      if (options.manifest) {
        compiler.generateManifests();
      }
    },

    // HMR support
    handleHotUpdate({ file, server }) {
      if (filter(file)) {
        server.moduleGraph.invalidateAll();
      }
    },
  };
}
```

### Compiler Core Architecture

```typescript
// packages/compiler/src/ast/compiler.ts
export class Compiler {
  private options: CompilerOptions;
  private schemaExtractor: SchemaExtractor;
  private codeGenerator: CodeGenerator;
  private typeGenerator: TypeGenerator;

  constructor(options: CompilerOptions) {
    this.options = options;
    this.schemaExtractor = new SchemaExtractor();
    this.codeGenerator = new CodeGenerator(options);
    this.typeGenerator = new TypeGenerator();
  }

  transform(code: string, id: string): TransformResult | null {
    // 1. Parse AST
    const ast = this.parse(code);

    // 2. Extract schema
    const schema = this.schemaExtractor.extract(ast, id);

    // 3. Generate code
    const generatedCode = this.codeGenerator.generate(ast, schema);

    // 4. Generate types if schema found
    if (schema) {
      this.typeGenerator.generate(schema, id);
    }

    return {
      code: generatedCode,
      map: null,
      schema,
    };
  }

  generateManifests(): void {
    // Collect all component manifests
    // Write to dist/manifests/
  }

  private parse(code: string): ASTNode {
    // Use swc or recast for parsing
    return swc.parseSync(code, {
      syntax: 'typescript',
      tsx: true,
    });
  }
}
```

### Schema Extraction

```typescript
// packages/compiler/src/ast/schemaExtractor.ts
export class SchemaExtractor {
  extract(ast: ASTNode, id: string): ComponentSchema | null {
    // Look for ComponentSchema export
    const schemaExport = this.findExport(ast, 'Schema');

    if (!schemaExport) return null;

    // Parse Zod schema
    const zodSchema = this.parseZodSchema(schemaExport);

    // Convert to ComponentSchema
    return {
      name: this.getComponentName(ast),
      properties: zodSchema.shape,
      required: zodSchema._def.requiredKeys,
    };
  }

  private parseZodSchema(node: ASTNode): ZodTypeDef {
    // Parse Zod schema AST
    // Extract property definitions
    // Handle refinements, transforms, etc.
  }
}
```

### Code Generation

```typescript
// packages/compiler/src/ast/codeGenerator.ts
// Chimera: ONE engine component per source component — no server/client split.
export class CodeGenerator {
  constructor(private options: CompilerOptions) {}

  generate(ast: ASTNode, schema: ComponentSchema | null): GeneratedComponent {
    return {
      engine: this.generateEngineComponent(ast, schema),   // renders on edge, in SW, in builder preview
      behaviors: this.extractBehaviors(ast),               // optional client interactivity script
      queries: this.registerQueries(ast, schema),          // named data bindings for the Edge Data Proxy
    };
  }

  private generateEngineComponent(ast: ASTNode, schema: ComponentSchema | null): string {
    // Compile JSX to an isomorphic engine render function (JSX → HTML string)
    // Resolve LiquidJS filters for dynamic props
    // Reject browser-only APIs (window/document) with actionable diagnostics
  }

  private extractBehaviors(ast: ASTNode): string | null {
    // Emit declarative data-fb-* behavior bindings for the client behaviors runtime
    // (toggle, tabs, modal, form submit, workflow trigger)
  }

  private registerQueries(ast: ASTNode, schema: ComponentSchema | null): RegisteredQuery[] {
    // Compile data bindings → { queryId, statement, paramSchema (Zod), tenantScope }
    // Written into the site manifest; the Edge Data Proxy accepts ONLY these
  }
}
```

---

## CLI Tooling

The `@frontbase/compiler` package bundles all command-line operations designed to bridge developer/agent code to the visual workspace.

### Core Use Cases & Commands

1. **Project Scaffolding (`init`)**
   - *Description*: Initializes directory scopes and targets.
   - *Example*: `npx @frontbase/compiler init my-app --pure` (creates pure Next-style node) or `--full` (adds local DB migrations, schema Sync dashboards, and vault services).

2. **Schema Auto-Extraction (`extract`)**
   - *Description*: Parses Zod properties in `.tsx` components and generates layouts manifest configurations.
   - *Example Component*:
     ```tsx
     export const Schema = z.object({ title: z.string().default('Hello') });
     ```
   - *Action*: Compiler runs AST scan and extracts properties directly for the visual page builder editor interface.

3. **Compiler Checks (`check` / `lint`)**
   - *Description*: Runs schema-conformance checks and reports diagnostic JSON outputs designed for AI coding agents.
   - *Example*: `npx @frontbase/compiler check --json`

4. **Runtime Simulator (`simulate`)**
   - *Description*: Starts a local Hono HTTP server running `@frontbase/edge-core` to test routes, SSR rendering speed, and dynamic workflow queues locally.
   - *Example*: `npx @frontbase/compiler simulate --port 3000`

### CLI Architecture

```typescript
// packages/compiler/src/cli/index.ts
import { Command } from 'commander';
import { checkCommand } from './commands/check';
import { lintCommand } from './commands/lint';
import { simulateCommand } from './commands/simulate';
import { initCommand } from './commands/init';
import { addComponentCommand } from './commands/add-component';

const program = new Command();

program
  .name('frontbase')
  .description('Frontbase Framework CLI')
  .version('1.0.0');

program.addCommand(checkCommand);
program.addCommand(lintCommand);
program.addCommand(simulateCommand);
program.addCommand(initCommand);
program.addCommand(addComponentCommand);

export default program;
```

### Check Command

```typescript
// packages/compiler/src/cli/commands/check.ts
export const checkCommand = new Command('check')
  .description('Check component schema compatibility')
  .argument('[path]', 'Path to check', '.')
  .option('--fix', 'Automatically fix issues')
  .option('--json', 'Output JSON format')
  .action(async (path, options) => {
    const checker = new ComponentChecker(path);

    const results = await checker.check();

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      checker.printResults(results);
    }

    if (options.fix && results.hasErrors) {
      await checker.fix();
    }
  });
```

### Component Checker

```typescript
// packages/compiler/src/cli/checker/ComponentChecker.ts
export class ComponentChecker {
  constructor(private path: string) {}

  async check(): Promise<CheckResults> {
    const results: CheckResults = {
      components: [],
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
    };

    // 1. Scan for component files
    const components = await this.scanComponents();

    // 2. Check each component
    for (const component of components) {
      const result = await this.checkComponent(component);
      results.components.push(result);
      results.total++;

      if (result.status === 'passed') {
        results.passed++;
      } else if (result.status === 'failed') {
        results.failed++;
      } else {
        results.warnings++;
      }
    }

    // 3. Check manifest compatibility
    await this.checkManifests(results);

    return results;
  }

  private async checkComponent(file: string): Promise<ComponentCheckResult> {
    const issues: Issue[] = [];

    // 1. Check for schema export
    if (!await this.hasSchemaExport(file)) {
      issues.push({
        type: 'error',
        code: 'MISSING_SCHEMA',
        message: 'Component missing Schema export',
        file,
        line: 0,
      });
    }

    // 2. Check TypeScript compilation
    const tsResult = await this.checkTypeScript(file);
    if (!tsResult.success) {
      issues.push(...tsResult.errors);
    }

    // 3. Check component registration
    if (!await this.isRegistered(file)) {
      issues.push({
        type: 'warning',
        code: 'NOT_REGISTERED',
        message: 'Component not registered in componentRegistry',
        file,
        line: 0,
      });
    }

    return {
      component: this.getComponentName(file),
      file,
      status: issues.length === 0 ? 'passed' : 'failed',
      issues,
    };
  }
}
```

### Lint Command

```typescript
// packages/compiler/src/cli/commands/lint.ts
export const lintCommand = new Command('lint')
  .description('Lint component code')
  .argument('[path]', 'Path to lint', '.')
  .option('--fix', 'Automatically fix issues')
  .option('--rules <rules>', 'Comma-separated rules to run')
  .action(async (path, options) => {
    const linter = new ComponentLinter(path, {
      fix: options.fix,
      rules: options.rules?.split(','),
    });

    const results = await linter.lint();
    linter.printResults(results);
  });
```

### Simulate Command

```typescript
// packages/compiler/src/cli/commands/simulate.ts
export const simulateCommand = new Command('simulate')
  .description('Simulate edge runtime locally')
  .option('--port <port>', 'Port to run on', '3000')
  .option('--ssr', 'Test SSR rendering')
  .option('--workflow', 'Test workflow execution')
  .action(async (options) => {
    const simulator = new RuntimeSimulator({
      port: parseInt(options.port),
      testSSR: options.ssr,
      testWorkflows: options.workflow,
    });

    await simulator.start();

    console.log(`Simulator running on http://localhost:${options.port}`);
    console.log('Press Ctrl+C to stop');
  });
```

---

## Runtime Specification

### Unified Router

```typescript
// packages/edge-core/src/router/unified.ts — the ONE deployed worker
import { Hono } from 'hono';

export function createUnifiedRouter(env: FrontbaseEnv) {
  const app = new Hono();

  // Priority 0: Dev file-system routes (development only)
  if (ENV.DEV) app.route('/dev', devFileRouter);

  // Priority 1: Engine SW bundle + static assets
  app.get('/sw.js', serveEngineBundle);          // versioned by content hash
  app.get('/assets/*', serveStatic);

  // Priority 2: Builder & console SPA shell (React, design-time)
  app.get('/app/*', spaShellRoute);

  // Priority 3: Console API (@frontbase/backend — same worker)
  app.route('/api/console', consoleRouter);

  // Priority 4: Edge Data Proxy (registered queries only)
  app.route('/api/data', dataProxyRouter);

  // Priority 5: Workflows (webhooks, queue consumers)
  app.route('/workflows', workflowRouter);

  // Priority 6: Published pages — public eSSR catch-all
  app.get('*', essrRenderHandler);

  return app;
}
```

### eSSR Renderer (The Engine)

The same renderer executes in all three environments. It is environment-blind: all data access goes through the injected `DataProvider`.

```typescript
// packages/edge-core/src/essr/renderer.ts
export class ESSRRenderer {
  constructor(
    private registry: EngineComponentRegistry,
    private liquid: LiquidEngine,
  ) {}

  async render(page: PageManifest, ctx: RenderContext): Promise<string> {
    // 1. Load layout tree from the site manifest
    const tree = page.layout;

    // 2. Resolve data bindings via the injected DataProvider (registered queries)
    const data = await this.resolveBindings(tree, ctx.data);

    // 3. Render tree to HTML string (engine JSX, LiquidJS filters)
    const html = await this.renderTree(tree, { ...ctx, data });

    // 4. Append behaviors runtime + SW registration script (edge path only)
    return this.htmlDocument(html, page, ctx.environment);
  }

  private async resolveBindings(tree: LayoutTree, data: DataProvider) {
    // Collect registered queryIds from the tree, execute via provider,
    // memoize per-render. Identical logic on edge, SW, and builder preview.
  }
}
```

### DataProvider Contract (Dependency Injection)

```typescript
// packages/edge-core/src/data/provider.ts
export interface DataProvider {
  /** Execute a registered query by ID with Zod-validated params. NEVER raw SQL. */
  query<T = unknown>(queryId: string, params?: Record<string, unknown>): Promise<T[]>;
}

// The three injections:
// 1. Edge worker:       directProvider(env)         — @frontbase/edge-infra, edge secrets
// 2. Service worker:    proxyProvider('/api/data')  — @frontbase/edge-core built-in, HTTP to proxy
// 3. Builder canvas:    localDraftProvider(sqlite)  — @frontbase/builder, SQLite WASM drafts
```

### Edge Data Proxy

```typescript
// packages/edge-infra/src/proxy/router.ts
export function createDataProxyRouter(env: FrontbaseEnv) {
  const proxy = new Hono();

  proxy.post('/:queryId', async (c) => {
    const { queryId } = c.req.param();

    // 1. Session/JWT validation (edge auth gates)
    const session = await verifySession(c, env);

    // 2. Query must be registered in the published site manifest
    const query = env.manifest.queries[queryId];
    if (!query) return c.json({ error: 'unknown_query' }, 404);

    // 3. Zod parameter validation
    const params = query.paramSchema.parse(await c.req.json());

    // 4. Tenant scoping + execution with edge-held secrets
    const rows = await executeRegistered(query, params, session.tenantId, env.secrets);

    // 5. Cache headers honor the query's TTL (SW IndexedDB cache respects these)
    return c.json(rows, 200, { 'Cache-Control': `max-age=${query.ttl ?? 0}` });
  });

  return proxy;
}
```

### Service Worker Host

```typescript
// Emitted by @frontbase/compiler into sw.js (versioned by content hash)
import { createEngine, proxyProvider } from '@frontbase/edge-core';

const engine = createEngine({
  manifest: SITE_MANIFEST,            // baked in at build/publish time
  data: proxyProvider('/api/data'),   // no secrets, no SQL — queryIds only
});

self.addEventListener('fetch', (event) => {
  if (isNavigation(event.request) && engine.canRender(event.request)) {
    event.respondWith(engine.renderResponse(event.request)); // local eSSR, <5ms p50
  }
  // else: fall through to network (edge renders — fallback-by-design)
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Manifest revalidation: stale-while-revalidate on every navigation (CHM-1)
```

### Workflow Decoupling & Dependency Injection

To keep `@frontbase/edge-core` free of third-party package dependencies (like Redis, Postgres, or QStash), the core workflow engine uses Dependency Injection (Inversion of Control).

#### 1. Provider Interfaces (Defined in `@frontbase/edge-core`)
The core package defines abstract interfaces for execution durability:

```typescript
// packages/edge-core/src/workflow/providers.ts
export interface WorkflowQueueProvider {
  enqueue(taskId: string, payload: any, delaySeconds?: number): Promise<void>;
  ack(taskId: string): Promise<void>;
}

export interface WorkflowStateProvider {
  saveCheckpoint(workflowId: string, stepId: string, state: any): Promise<void>;
  getCheckpoint(workflowId: string): Promise<Record<string, any> | null>;
  acquireLock(lockKey: string, ttlMs: number): Promise<boolean>;
  releaseLock(lockKey: string): Promise<void>;
}
```

#### 2. Default In-Memory Providers (Fallback in `@frontbase/edge-core`)
If no external adapters are connected, the core fallback runs non-durable memory arrays:

```typescript
// packages/edge-core/src/workflow/memoryProviders.ts
export class MemoryQueueProvider implements WorkflowQueueProvider {
  private queue: Array<{ id: string; payload: any }> = [];
  async enqueue(id: string, payload: any) {
    this.queue.push({ id, payload });
    setTimeout(() => this.process(id), 0); // Non-durable execution loop
  }
  async ack(id: string) {
    this.queue = this.queue.filter(q => q.id !== id);
  }
}
```

#### 3. Concrete Adapters (Implemented in `@frontbase/edge-infra`)
When persistence is required, `@frontbase/edge-infra` injects concrete Cloudflare KV, Redis, or QStash adapters:

```typescript
// packages/edge-infra/src/queue/QStashProvider.ts
import { Client } from '@upstash/qstash';
import { WorkflowQueueProvider } from '@frontbase/edge-core';

export class QStashProvider implements WorkflowQueueProvider {
  private client = new Client({ token: process.env.QSTASH_TOKEN! });
  async enqueue(taskId: string, payload: any, delay?: number) {
    await this.client.publishJSON({
      url: `https://your-domain.com/workflows/execute?taskId=${taskId}`,
      body: payload,
      delay,
    });
  }
  async ack(taskId: string) {
    // QStash handles retries and scheduling automatically
  }
}
```

---

## Agent Integration

### Agent-Friendly Output Format

```typescript
// packages/compiler/src/cli/agent/AgentFormatter.ts
export class AgentFormatter {
  formatCheckResults(results: CheckResults): AgentOutput {
    return {
      version: '1.0',
      type: 'check-results',
      timestamp: new Date().toISOString(),
      success: results.failed === 0,
      summary: {
        total: results.total,
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings,
      },
      issues: this.extractIssues(results),
      recommendations: this.generateRecommendations(results),
    };
  }

  private extractIssues(results: CheckResults): AgentIssue[] {
    const issues: AgentIssue[] = [];

    for (const component of results.components) {
      for (const issue of component.issues) {
        issues.push({
          file: component.file,
          line: issue.line,
          code: issue.code,
          message: issue.message,
          severity: issue.type,
          fixable: this.isFixable(issue.code),
          fix: this.getFix(issue.code),
        });
      }
    }

    return issues.sort((a, b) => {
      const severity = { error: 0, warning: 1 };
      return severity[a.severity] - severity[b.severity];
    });
  }

  private generateRecommendations(results: CheckResults): string[] {
    const recommendations: string[] = [];

    // Analyze patterns in issues
    const missingSchemas = results.components.filter(c =>
      c.issues.some(i => i.code === 'MISSING_SCHEMA')
    );

    if (missingSchemas.length > 0) {
      recommendations.push(
        `${missingSchemas.length} components missing schemas. ` +
        'Run `frontbase add-component --schema <name>` to generate.'
      );
    }

    return recommendations;
  }
}
```

### Agent-Specific Error Messages

```typescript
// packages/compiler/src/cli/agent/AgentErrorHandler.ts
export class AgentErrorHandler {
  handleError(error: Error, context: ErrorContext): AgentErrorResponse {
    const categorized = this.categorizeError(error);

    return {
      success: false,
      error: {
        type: categorized.type,
        code: categorized.code,
        message: this.formatForAgent(error, categorized),
        context: {
          file: context.file,
          line: context.line,
          component: context.component,
        },
        suggestions: this.getSuggestions(categorized),
        documentation: this.getDocumentationLink(categorized.code),
      },
    };
  }

  private formatForAgent(error: Error, category: ErrorCategory): string {
    // Provide actionable, machine-readable error messages
    // Avoid ambiguous language
    // Include exact steps to fix
  }

  private getSuggestions(category: ErrorCategory): string[] {
    // Provide fix suggestions that agents can execute
    // Include exact commands or code changes
  }
}
```

---

## Appendix A: Configuration Files

### Vite Configuration

```typescript
import { defineConfig } from 'vite';
import { frontbasePlugin } from '@frontbase/compiler/vite';

export default defineConfig({
  plugins: [
    frontbasePlugin({
      manifest: true,        // emit component manifests + registered queries
      engine: true,          // compile isomorphic engine components
      swBundle: true,        // emit versioned sw.js (engine + site manifest)
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
      '@frontbase/*': '/packages/@frontbase/*',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'frontbase-engine': ['@frontbase/edge-core'],
          // React chunks exist only in the @frontbase/builder shell build,
          // never in published-page or worker bundles.
        },
      },
    },
  },
});
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "moduleResolution": "bundler",
    "paths": {
      "@/*": ["./src/*"],
      "@frontbase/*": ["./packages/@frontbase/*"]
    },
    "plugins": [
      { "name": "@frontbase/typescript-plugin" }
    ]
  },
  "include": ["src", "packages"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Automated Framework Integration & /frontbase-builder Mount Route

To support seamless integration inside pre-existing mature codebases, the framework provides automated setup tooling and a decoupled mounting route for the visual CMS dashboard.

### 1. The `@frontbase/compiler integrate` Automation Workflow
Running the command `npx @frontbase/compiler integrate` executes the following AST writing and dependency analysis steps:
1. **Dependency Sync**: Auto-detects package manager (npm, pnpm, or bun), updates `package.json` to include core packages (`@frontbase/edge-core`, `@frontbase/ui-components`, and `@frontbase/compiler` as dev dependency), and runs install.
2. **Vite Plugin Injection**: Reads the client's `vite.config.ts`, parses the AST, and injects `frontbasePlugin()` into the plugin pipeline.
3. **AI Zod Schema Generator**: Running `npx @frontbase/compiler auto-schema ./src/components` scans all TSX component prop types (e.g. TypeScript interfaces) and uses an LLM wrapper to automatically append type-compliant `export const Schema = z.object(...)` declarations.

### 2. Mounting the `/frontbase-builder` Route
To expose the visual page editor, workflow manager, and database sync dashboard visually inside the existing application, the developer imports `@frontbase/builder` and mounts it on a dedicated route `/frontbase-builder`.

#### React Client SPA Routing
In the client-side router (e.g., React Router v6), the builder canvas is rendered under the `/frontbase-builder` nested prefix:

```typescript
// src/routes.tsx
import { Route, Routes } from 'react-router-dom';
import { BuilderWorkspace } from '@frontbase/builder';
import { Layout } from './components/Layout';

export function AppRoutes() {
  return (
    <Routes>
      {/* Existing application routes */}
      <Route path="/" element={<Home />} />
      
      {/* Nested visual CMS workspace */}
      <Route path="/frontbase-builder/*" element={
        <Layout>
          <BuilderWorkspace 
            apiBaseUrl="/api/console" 
            config={{
              enableWorkflows: true,
              enableDataSync: true
            }}
          />
        </Layout>
      } />
    </Routes>
  );
}
```

#### Hono Edge Routing Fallback
On the Edge Server (serving both the SPA builder and dynamic SSR pages), Hono serves the builder assets at `/frontbase-builder` while routing all other dynamic CMS routes as fallback SSR paths:

```typescript
// services/edge/src/router/unified.ts
import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers'; // or node/deno equivalents
import { ssrRenderHandler } from '@frontbase/edge-core';

const app = new Hono();

// 1. Serve Visual Builder Panel Shell and static assets
app.get('/frontbase-builder/*', serveStatic({ root: './dist/builder' }));

// 2. Existing application APIs
app.route('/api/custom-service', customApiRouter);

// 3. Fallback Route: Dynamically serve published CMS pages from the database
app.get('*', ssrRenderHandler);

export default app;
```

---

## Document Metadata

**Version**: 2.0
**Status**: Draft (Chimera)
**Owner**: Architecture Team
**Review Date**: 2026-07-15

**Change Log**:
- 2026-06-29: Initial specification created
- 2026-07-06: Chimera update — single-worker unified router, eSSR renderer spec, DataProvider DI contract, Edge Data Proxy spec, SW host spec; code generator emits engine components + behaviors + registered queries (no server/client split, no React hydration)
