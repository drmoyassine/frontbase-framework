# Frontbase Framework

The **Chimera (Universal eSSR)** framework — one Hono engine that renders every page in three environments (cloud edge, browser service worker, builder canvas), a compiler that turns Zod schemas into manifests/types/registered queries, and a complete CMS with an admin console that deploys as **one Cloudflare Worker**.

> **Status**: Phases 0–2 complete. The CF-18 admin-console track (3a→3b→3c + two follow-up sprints) has reached **full product parity** — every deviation and follow-up closed, only Stripe billing deferred. See [docs/MILESTONES.md](docs/MILESTONES.md) and [docs/phase-3-consolidated-delivery.md](docs/phase-3-consolidated-delivery.md) for the authoritative state.

## What this is

A single-worker CMS: public pages render via eSSR (edge or service worker, byte-identical output), and an admin console (`/console`) manages everything — pages (with a WYSIWYG drag/drop canvas), automations (a React Flow workflow editor with real durable execution), datasources, storage, edge resources, plans, users, and tenants. All of it — engine, console API, admin SPA — bundles into one `dist/worker.mjs` and deploys with a single command.

## Packages

| Package | Role |
|---|---|
| [`@frontbase/edge-core`](packages/edge-core) | The Chimera Engine — unified priority router, eSSR renderer, DataProvider DI, workflow engine, client behaviors runtime, SW primitives |
| [`@frontbase/compiler`](packages/compiler) | Zod schema extraction → manifests/types, query registrar, SW bundle emitter, CLI (`init`/`check`/`lint`/`simulate`/`deploy`) |
| [`@frontbase/ui-components`](packages/ui-components) | The single set of isomorphic page components (no React on published pages) |
| [`@frontbase/edge-infra`](packages/edge-infra) | Concrete DataProviders (SQLite/D1/Turso/Supabase/Postgres), Edge Data Proxy auth, cache/queue/vault, CF + Supabase resource provisioning. Server-only |
| [`@frontbase/backend`](packages/backend) | The in-worker console API — pages/drafts/publish, automations, datasources, storage, edge resources, plans, users, tenants. Default-deny auth, Drizzle persistence. Server-only |
| [`@frontbase/builder`](packages/builder) | The visual canvas primitives — drag/drop model, preview↔published parity. Browser-only; never imports server code |
| [`@frontbase/admin-console`](packages/admin-console) | The React SPA served at `/console` — WYSIWYG page builder, React Flow automations editor, Data Studio, storage, edge resources, plans, users, tenants. Browser-only |

## Quick start

```bash
pnpm install
pnpm build
pnpm test              # full workspace suite (all packages)
pnpm test:mutation      # proves the security/correctness gates fire RED on break
```

Scaffold and run a project:

```bash
npx @frontbase/compiler init my-app --full
cd my-app && pnpm install && pnpm build
npx @frontbase/compiler deploy --dry-run     # compose + smoke + size budget, no deploy
```

Deploy the full example CMS to Cloudflare in one command:

```bash
cd examples/cf-full
npx @frontbase/compiler deploy --interactive
#   → checks wrangler login (runs `wrangler login` if needed)
#   → provisions D1 (or bind an existing one: --d1-database-id <id>)
#   → prompts for admin email + a masked password
#   → wrangler deploy, secrets pushed over stdin (never argv)
```

Or fully non-interactive, for CI/scripting:

```bash
npx @frontbase/compiler deploy \
  --admin-email owner@example.com \
  --admin-password 'a real password' \
  --d1-database-id <existing-d1-uuid>
```

See [docs/guides/console-and-deploy.md](docs/guides/console-and-deploy.md) for the full deploy reference, and [docs/testing-plan.md](docs/testing-plan.md) for the automated/credential-gated/manual test tiers.

## Architecture

Canonical spec: [docs/CHIMERA-ARCHITECTURE.md](docs/CHIMERA-ARCHITECTURE.md). Roadmap: [docs/MILESTONES.md](docs/MILESTONES.md). Decision log: [docs/DECISIONS.md](docs/DECISIONS.md) (this repo exists per **A-15**). Admin-console delivery ledger: [docs/phase-3-consolidated-delivery.md](docs/phase-3-consolidated-delivery.md).

Three non-negotiable principles:

1. **Single-edge deployment** — the whole CMS, including the admin console, ships as one worker (currently ~390 KB gzip, well under the 1 MB Cloudflare free-tier limit). Zero infrastructure to stand up.
2. **Universal eSSR** — one engine, three hosts, byte-identical output. No React on published pages; no hydration drift.
3. **RULE 1 (no-leak)** — server code (drivers, secrets, auth) never enters a browser bundle. Enforced by a no-leak gate + mutation proof in every package that has a browser-facing build.

## What's in the admin console

Every nav area is implemented, not a placeholder:

- **Pages** — WYSIWYG drag/drop canvas (live component rendering, not just a layer list) + draft/publish
- **Automations** — a real React Flow visual editor; workflows execute durably (survive isolate eviction via a recovery sweep + idempotent completion, with an optional QStash redelivery path)
- **Data Studio** — connect SQLite/D1/Turso/Supabase/Postgres datasources, browse tables, run read-only queries
- **Edge Resources** — provision real Cloudflare D1/KV/Queues/Vectorize, and Supabase Postgres schemas, from the console
- **File Storage** — R2/S3-compatible upload (base64 JSON or multipart) and presigned URLs
- **Plans** — tiered limits (e.g. pages/users) enforced server-side, not just displayed
- **Users / Tenants** — multi-tenant provisioning, role management, secret variables encrypted at rest

Full deviations/follow-ups ledger (what's shipped, what's deferred, and why): [docs/phase-3-consolidated-delivery.md](docs/phase-3-consolidated-delivery.md).

## Development

```bash
pnpm install
pnpm build     # builds all packages
pnpm check     # typechecks all packages
pnpm test      # full workspace test suite
pnpm test:mutation   # mutation-proof gates (RED-on-break)
```

Extraction source: the production renderer in the private Frontbase product repo. Parity is enforced by the [golden corpus](golden-corpus/README.md) — byte-identical HTML against snapshots of the production renderer, including the real Frontbase homepage validated in Phase 0 (spike evidence: `docs/spike/README.md`, `docs/spike-cf/README.md`; spike *code* remains in the product repo).

## License

[Apache-2.0](LICENSE) for all packages in this repository.
