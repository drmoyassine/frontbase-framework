# Frontbase Framework

Frontbase is preparing for public release as a **self-hostable, AI/agent-oriented, edge-native app-builder and framework**. Its Chimera architecture uses one rendering engine across the edge, browser service worker, and builder preview, with schema-driven authoring and no required hosted control plane.

The public release is not yet declared complete. See [Public Release Strategy](docs/PUBLIC-RELEASE-STRATEGY.md) for rollout gates and [Milestones](docs/MILESTONES.md) for implementation status.

**Chimera (Universal eSSR)** — one Hono engine, three render environments, byte-identical output, and a CMS whose Worker and Static Assets deploy together to Cloudflare.

No hydration mismatches. No server/client render drift. No separate backend to stand up. Public pages render server-side (edge or service worker) from the *same* engine that runs your visual builder canvas. The Worker is about 233 KB gzip; the product console is deployed through Workers Static Assets.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

> **Status**: CF-22 is consolidated into this repo (2026-08-28, decisions A-22/A-23): the admin console, the page-hydration bundle, and the product-compatible API surface (334-op contract) are all framework-owned source — nothing is fetched from a product repo. The remaining open gate is real-deploy/owner acceptance. Runbook: [docs/cf-22-handover.md](docs/cf-22-handover.md); historical parity analysis: [docs/cf-22-admin-visual-parity-gap.md](docs/cf-22-admin-visual-parity-gap.md).

---

## Why Frontbase

Most "edge-first" frameworks still ship two different rendering paths — one for the server, one for hydration — and stitch them together at the seams. Chimera doesn't: **one engine** renders pages identically whether it's running on Cloudflare's edge, inside a browser service worker (offline-capable, near-zero-latency repeat navigation), or inside the visual builder's live preview. The same manifest, the same components, the same output, byte-for-byte.

On top of that engine sits the CMS API and product community console, served from `/frontbase-admin` in the same Cloudflare deployment as your public site.

## Quick start

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

That command provisions D1, generates a short-lived first-admin capability,
deploys the Worker, and prints a secure `/setup#/setup?claim=…` link. Opening the link
removes the claim from browser history and shows the familiar email/password
setup form. The link expires after 30 minutes and setup locks permanently after
the first administrator is created. Successful setup signs in through the product
auth surface and leaves the setup app for `/frontbase-admin/dashboard`; `/setup`
cannot expose a second dashboard or login screen.

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

### Deploying to Vercel or Deno Deploy (A-24)

The same CMS deploys to four hosts. `frontbase deploy` provisions Cloudflare only —
the other hosts use their own scripts, which build, gate, and drive the host CLI:

```bash
# Vercel Edge — static matrix in vercel.json, function owns state routes
vercel login   # or set VERCEL_TOKEN
pnpm run deploy:vercel -- --project <my_app_name>

# Deno Deploy — self-contained deno-dist/ tree via deployctl
export DENO_DEPLOY_TOKEN=...
pnpm run deploy:deno -- --project <my_app_name>
```

Both scripts read secrets from the environment (or stdin JSON with `--secrets-json`) —
never from argv — and refuse to deploy without exactly one complete state-db set:

| Variable(s) | Meaning |
|---|---|
| `SESSION_SECRET` | HS256 session key (auto-generated when absent) |
| `APP_DB_URL` [+ `APP_DB_AUTH_TOKEN`] | Turso/self-hosted sqld (`libsql://` or `https://`) — the practical edge-host state DB |
| `APP_DB_D1_ACCOUNT_ID` + `APP_DB_D1_DATABASE_ID` + `CLOUDFLARE_API_TOKEN` | D1 over REST — Cloudflare's D1 from any host |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | seed the first admin (instead of a setup link) |

On Cloudflare, none of these are required — the D1 binding is the default. On Vercel/Deno,
a half-configured set fails the deploy naming the missing variable. Precedence and the
honest SQLite-dialect limit: [docs/DECISIONS.md](docs/DECISIONS.md) (A-24).

### Starting your own project

```bash
npx @frontbase/compiler init my-app --full
cd my-app && pnpm install && pnpm build
npx @frontbase/compiler deploy --interactive
```

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

Full deviations/follow-ups ledger — what shipped, what's deferred, and why: [docs/phase-3-consolidated-delivery.md](docs/phase-3-consolidated-delivery.md).

## Packages

| Package | Role |
|---|---|
| [`@frontbase/edge-core`](packages/edge-core) | The Chimera Engine — unified priority router, eSSR renderer, DataProvider DI, workflow engine, client behaviors runtime, SW primitives |
| [`@frontbase/compiler`](packages/compiler) | Zod schema extraction → manifests/types, query registrar, SW bundle emitter, CLI (`init`/`check`/`lint`/`simulate`/`deploy`) |
| [`@frontbase/ui-components`](packages/ui-components) | The single set of isomorphic page components (no React on published pages) |
| [`@frontbase/edge-infra`](packages/edge-infra) | Concrete DataProviders (SQLite/D1/Turso/Supabase/Postgres), Edge Data Proxy auth, cache/queue/vault, CF + Supabase resource provisioning. Server-only |
| [`@frontbase/backend`](packages/backend) | The in-worker product-compatible `/api/*` backend plus retained first-run setup/health routes. The legacy `/api/console/*` application is reusable for package tests but retired in production. Server-only |
| [`@frontbase/builder`](packages/builder) | The visual canvas primitives — drag/drop model, preview↔published parity. Browser-only; never imports server code |
| [`@frontbase/admin-console`](packages/admin-console) | The setup-only React SPA served at `/setup`; the separately pinned product console is served at `/frontbase-admin`. Browser-only |

## Architecture

Canonical spec: [docs/CHIMERA-ARCHITECTURE.md](docs/CHIMERA-ARCHITECTURE.md). Roadmap: [docs/MILESTONES.md](docs/MILESTONES.md). Decision log: [docs/DECISIONS.md](docs/DECISIONS.md) (this repo exists per **A-15**).

Three non-negotiable principles:

1. **Single-edge deployment** — the whole CMS, including the admin console, ships as one worker (currently ~390 KB gzip, well under the 1 MB Cloudflare free-tier limit). Zero infrastructure to stand up.
2. **Universal eSSR** — one engine, three hosts, byte-identical output. No React on published pages; no hydration drift.
3. **RULE 1 (no-leak)** — server code (drivers, secrets, auth) never enters a browser bundle. Enforced by a no-leak gate + mutation proof in every package with a browser-facing build.

## Development

```bash
pnpm install
pnpm build           # builds all packages
pnpm check            # typechecks all packages
pnpm test             # full workspace test suite
pnpm test:mutation    # mutation-proof gates — proves the security/correctness checks actually fire RED on break
```

See [docs/testing-plan.md](docs/testing-plan.md) for the automated / credential-gated / manual test tiers.

Extraction source: the production renderer in the private Frontbase product repo. Parity is enforced by the [golden corpus](golden-corpus/README.md) — byte-identical HTML against snapshots of the production renderer, including the real Frontbase homepage validated in Phase 0 (spike evidence: `docs/spike/README.md`, `docs/spike-cf/README.md`; spike *code* remains in the product repo).

## License

[Apache-2.0](LICENSE) for all packages in this repository.
