# Frontbase

Frontbase is an open-source, edge-native platform for building and deploying AI-powered apps with no code — a visual builder whose published sites, admin console, and API all ship as **one deployable worker**.

**Universal SSR** — one Hono engine, three render environments, byte-identical output. No hydration mismatches. No server/client render drift. No separate backend to stand up. Public pages render server-side (edge or service worker) from the *same* engine that runs the visual builder's canvas. The worker measures **488.8 KB min+gzip** (Cloudflare free-tier limit: 1 MB); the admin console is served through Workers Static Assets.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

> **Status**: actively developed (pre-1.0). The admin console, the hydration runtime, the admin API, the four-host deploy matrix, and the managed-cloud free tier are all maintained in this repository — no code is fetched from outside at build or run time.

---

## Why Frontbase

Most stacks split building from serving: a builder app here, an API server there, a rendering layer stitched on top — and preview, server, and browser each drift their own way. Frontbase collapses all of it:

- **Build and publish in one sitting** — design pages on a live drag-and-drop canvas, hit publish, and the site is served from the same worker (self-host, or managed cloud at `<slug>.frontbase.dev`).
- **One artifact, no backend to stand up** — the console API, auth, pages, automations, and the rendering engine deploy together. Zero infrastructure beyond the worker and its state DB.
- **One engine, everywhere** — edge (SEO/first load), browser service worker (offline-capable, near-zero-latency repeat navigation), and the builder canvas (exact WYSIWYG preview) all run the same renderer on the same component set. Byte-identical output is enforced by the [golden corpus](golden-corpus/README.md), not asserted.
- **Security is the architecture, not a plugin** — every console route is default-deny authenticated, API keys are stored hashed with a one-time encrypted reveal, password capabilities are expiring and single-use, cloud tenants are host-scoped (a session from tenant A is anonymous on tenant B), and cloud auth endpoints are rate limited. The isolation and failure paths are pinned by a mutation harness that proves every gate goes red when broken.

## What's in the admin console

Every nav area is implemented end-to-end, not a placeholder:

| Area | What it does |
|---|---|
| **Pages** | WYSIWYG drag/drop canvas — live component rendering, not just a layer list — with draft/publish |
| **Automations** | A real React Flow visual workflow editor. Executions are durable: they survive isolate eviction via a recovery sweep + idempotent completion, with an optional QStash redelivery path |
| **Data Studio** | Connect SQLite / D1 / Turso / Supabase / Postgres datasources, browse tables, run read-only queries |
| **Edge Resources** | Provision real Cloudflare D1 / KV / Queues / Vectorize, and Supabase Postgres schemas, directly from the console |
| **File Storage** | R2/S3-compatible upload (base64 JSON or multipart) and presigned URLs |
| **Plans** | Tiered limits (e.g. pages/users) enforced server-side, not just displayed |
| **Users / Tenants** | Multi-tenant provisioning, role management, secret variables encrypted at rest |

## Quick start (self-host on Cloudflare)

```bash
git clone <this-repo>
cd frontbase-framework
pnpm install
pnpm build
```

Build the console from its in-repo source (`packages/console`), then deploy the full example CMS to your Cloudflare account:

```bash
pnpm console:build
wrangler login
pnpm run deploy:cf-full -- --app-name <my_app_name>
```

That command provisions D1, generates a short-lived first-admin capability, deploys the Worker, and prints a secure `/setup#/setup?claim=…` link. Opening the link removes the claim from browser history and shows the email/password setup form. The link expires after 30 minutes and setup locks permanently after the first administrator is created.

If the link expires before setup is completed, rotate it on the same deployment:

```bash
pnpm run deploy:cf-full -- --app-name <my_app_name> --setup-link
```

To skip browser setup, seed the administrator during deployment:

```bash
pnpm run deploy:cf-full -- \
  --app-name <my_app_name> \
  --admin-email owner@example.com \
  --admin-password 'a real password'
```

`--interactive` remains available when terminal credential prompts are preferred.

**Dry run** (build + size-budget check, no Cloudflare calls):

```bash
pnpm run deploy:cf-full -- --dry-run
```

Full reference: [docs/guides/console-and-deploy.md](docs/guides/console-and-deploy.md).

## Deploy to four hosts

The same CMS deploys to four hosts. `frontbase deploy` provisions Cloudflare only — the other hosts use their own scripts, which build, gate, and drive the host CLI:

```bash
# Vercel Edge — static matrix in vercel.json, function owns state routes
vercel login   # or set VERCEL_TOKEN
pnpm run deploy:vercel -- --project <my_app_name>

# Deno Deploy — self-contained deno-dist/ tree via deployctl
export DENO_DEPLOY_TOKEN=...
pnpm run deploy:deno -- --project <my_app_name>
```

**Docker**: a single container (SQLite volume, Redis optional) — see [docs/guides/self-host-docker.md](docs/guides/self-host-docker.md).

The Vercel/Deno scripts read secrets from the environment (or stdin JSON with `--secrets-json`) — never from argv — and refuse to deploy without exactly one complete state-db set:

| Variable(s) | Meaning |
|---|---|
| `SESSION_SECRET` | HS256 session key (auto-generated when absent) |
| `APP_DB_URL` [+ `APP_DB_AUTH_TOKEN`] | Turso/self-hosted sqld (`libsql://` or `https://`) — the practical edge-host state DB |
| `APP_DB_D1_ACCOUNT_ID` + `APP_DB_D1_DATABASE_ID` + `CLOUDFLARE_API_TOKEN` | D1 over REST — Cloudflare's D1 from any host |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | seed the first admin (instead of a setup link) |

On Cloudflare, none of these are required — the D1 binding is the default. On Vercel/Deno, a half-configured set fails the deploy naming the missing variable. Precedence and the honest SQLite-dialect limit: [docs/guides/self-host-docker.md](docs/guides/self-host-docker.md).

## Cloud multi-tenant hosting

The same worker also runs the managed cloud: public self-serve signup, site building in the console, and each site live at `<slug>.frontbase.dev`. Opt in via the deploy mode — self-host behavior is byte-identical when it's unset:

```bash
export RESEND_API_KEY=...            # password-reset email (env only, never a CLI flag)
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...   # Custom Domains attach
pnpm run deploy:cf-full -- --mode cloud --base-domain frontbase.dev \
  --app-name frontbase-cloud --admin-email owner@example.com --admin-password '…'
```

That stages both console builds (self-host + cloud `/admin`), boots the worker in cloud mode via `wrangler deploy --var` (never wrangler.toml), attaches `app.<zone>` + `*.<zone>` as Workers Custom Domains, and gates the deploy on both console artifacts. Free tier only: counts/flags are gated by the `_global` plan catalog; per-tenant engines, custom domains, and billing are future phases. Full contract, honest limits, and the dashboard fallback: [docs/cloud-free-tier.md](docs/cloud-free-tier.md).

## Architecture

Canonical spec: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · stack detail: [docs/STACK.md](docs/STACK.md).

One Hono engine (`@frontbase/edge-core`), three render environments — edge, service worker, builder canvas — with a unified priority router, SSR renderer, and DataProvider DI. Published pages ship zero React. Bundle facts (measured by `deploy:cf-full -- --dry-run`):

| Artifact | Size (min+gzip) | Limit |
|---|---|---|
| Worker (engine + console API + auth + pages) | 488.8 KB | 1 MB (Cloudflare free) |
| inlined `/sw.js` | 108.3 KB | — |
| Vercel edge bundle | 489.2 KB | 4 MB |

Three non-negotiable principles:

1. **Single-edge deployment** — the whole CMS, including the admin console, ships as one worker; the console's hashed bundles are served as static assets and never enter the script budget.
2. **Universal SSR** — one engine, three hosts, byte-identical output. No React on published pages; no hydration drift.
3. **RULE 1 (no-leak)** — server code (drivers, secrets, auth) never enters a browser bundle. Enforced by a no-leak gate + mutation proof in every package with a browser-facing build.

## Packages

| Package | Role |
|---|---|
| [`@frontbase/edge-core`](packages/edge-core) | The engine — unified priority router, SSR renderer, DataProvider DI, workflow engine, client behaviors runtime, SW primitives |
| [`@frontbase/compiler`](packages/compiler) | Zod schema extraction → manifests/types, query registrar, SW bundle emitter, CLI (`init`/`check`/`lint`/`simulate`/`deploy`) |
| [`@frontbase/ui-components`](packages/ui-components) | The single set of isomorphic page components (no React on published pages) |
| [`@frontbase/edge-infra`](packages/edge-infra) | Concrete DataProviders (SQLite/D1/Turso/Supabase/Postgres), Edge Data Proxy auth, cache/queue/vault, CF + Supabase resource provisioning. Server-only |
| [`@frontbase/backend`](packages/backend) | The in-worker tenant-scoped `/api/*` admin API plus retained first-run setup/health routes. Server-only |
| [`@frontbase/builder`](packages/builder) | The visual canvas primitives — drag/drop model, preview↔published parity. Browser-only; never imports server code |
| [`@frontbase/console`](packages/console) | The admin console SPA — self-host build at `/frontbase-admin`, cloud build at `/admin` |
| [`@frontbase/hydrate`](packages/hydrate) | The client hydration runtime for published pages |
| [`@frontbase/admin-console`](packages/admin-console) | The setup-only React SPA served at `/setup`. Browser-only |

## Documentation

**Start here**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the engine, the three render environments, and the size budgets.

| Doc | What it covers |
|---|---|
| [docs/guides/console-and-deploy.md](docs/guides/console-and-deploy.md) | Deploying the full CMS (flags, secrets, setup wizard) |
| [docs/guides/self-host-docker.md](docs/guides/self-host-docker.md) | The single-container Docker path |
| [docs/guides/cli.md](docs/guides/cli.md) | The `@frontbase/compiler` CLI |
| [docs/cloud-free-tier.md](docs/cloud-free-tier.md) | The managed-cloud mode: opt-in, plans, limits |
| [docs/testing-plan.md](docs/testing-plan.md) | Automated / credential-gated / manual test tiers |
| [docs/PACKAGE-STRUCTURE.md](docs/PACKAGE-STRUCTURE.md) | Package boundaries and dependency rules |
| [golden-corpus/README.md](golden-corpus/README.md) | The byte-identical rendering regression corpus |
| [docs/guides/authoring-components.md](docs/guides/authoring-components.md) · [docs/guides/agent-authoring.md](docs/guides/agent-authoring.md) | Writing page components; agent-oriented authoring |
| [docs/guides/infra-providers.md](docs/guides/infra-providers.md) · [docs/guides/supabase-setup.md](docs/guides/supabase-setup.md) | Infra providers; Supabase provisioning |
| [docs/history/README.md](docs/history/README.md) | Project history — decision log, milestones, delivery reports |

## Development

```bash
pnpm install
pnpm build           # builds all packages
pnpm check           # typechecks all packages
pnpm test            # full workspace test suite (the console package's vitest suite is excluded from this run)
pnpm test:mutation   # mutation-proof gates — proves the security/correctness checks actually fire RED on break
pnpm console:build   # stage the console artifact(s)
pnpm console:check   # validate the staged console artifact
```

See [docs/testing-plan.md](docs/testing-plan.md) for the automated / credential-gated / manual test tiers.

**Windows + OneDrive checkouts**: OneDrive holds transient handles on directories mid-sync, so `pnpm console:build`'s staged wipe can die with `EPERM` (the script retries with backoff, but a stale `wrangler dev` from an earlier session can pin `examples/cf-full/console-dist` for good). If the stage fails: kill leftover `workerd.exe` / `wrangler dev` processes, then re-run the build.

## Honest limits

What the framework does **not** yet do (tracked, not hidden): per-tenant edge engines, managed/BYO custom domains, and Stripe billing are future phases; the redemption-code system (e.g. for marketplace launches) is planned but not built; the cloud console's agent-analytics widgets degrade to error states (their `admin_agents_*` API ops are stubs); plan limits are enforced counts, not usage metering.

## License

[Apache-2.0](LICENSE) for all packages in this repository.
