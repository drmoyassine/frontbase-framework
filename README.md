# Frontbase Framework

**Chimera (Universal eSSR)** — one Hono engine, three render environments, byte-identical output, and a complete CMS with an admin console that deploys as **a single Cloudflare Worker**.

No hydration mismatches. No server/client render drift. No separate backend to stand up. Public pages render server-side (edge or service worker) from the *same* engine that runs your visual builder canvas — and the entire CMS, including the React admin console, ships in one `~390 KB` gzip artifact.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

> **Status**: Phases 0–2 complete. The admin console has reached **full product parity** — every tracked deviation and follow-up closed; only Stripe billing is deferred. Authoritative state: [docs/MILESTONES.md](docs/MILESTONES.md) · [docs/phase-3-consolidated-delivery.md](docs/phase-3-consolidated-delivery.md).

---

## Why Frontbase

Most "edge-first" frameworks still ship two different rendering paths — one for the server, one for hydration — and stitch them together at the seams. Chimera doesn't: **one engine** renders pages identically whether it's running on Cloudflare's edge, inside a browser service worker (offline-capable, near-zero-latency repeat navigation), or inside the visual builder's live preview. The same manifest, the same components, the same output, byte-for-byte.

On top of that engine sits a **complete CMS** — pages, a WYSIWYG drag/drop builder, a visual workflow automation editor (with durable, crash-safe execution), a multi-database Data Studio, file storage, tenant/plan management — all served from `/console` in the same worker as your public site. No separate admin app to host, no separate database to provision by hand.

## Quick start

```bash
git clone <this-repo>
cd frontbase-framework
pnpm install
pnpm build
```

Deploy the full example CMS (engine + console API + admin SPA, all inlined into one worker) to your own Cloudflare account:

```bash
pnpm run deploy:cf-full -- --interactive
```

That single command:
1. checks `wrangler` login and runs `wrangler login` for you if needed,
2. provisions a D1 database (or binds an existing one with `--d1-database-id <id>`),
3. prompts for an admin email + a masked password (nothing echoes to the terminal),
4. runs `wrangler deploy` and pushes the admin secrets over stdin — **never argv, never shell history**.

Visit your worker's URL, then `/console` to log in.

**Non-interactive** (CI/scripting-friendly):

```bash
pnpm run deploy:cf-full -- \
  --admin-email owner@example.com \
  --admin-password 'a real password' \
  --d1-database-id <existing-d1-uuid>
```

**Dry run** (build + size-budget check, no Cloudflare calls):

```bash
pnpm run deploy:cf-full -- --dry-run
```

Full reference: [docs/guides/console-and-deploy.md](docs/guides/console-and-deploy.md).

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
| [`@frontbase/backend`](packages/backend) | The in-worker console API — pages/drafts/publish, automations, datasources, storage, edge resources, plans, users, tenants. Default-deny auth, Drizzle persistence. Server-only |
| [`@frontbase/builder`](packages/builder) | The visual canvas primitives — drag/drop model, preview↔published parity. Browser-only; never imports server code |
| [`@frontbase/admin-console`](packages/admin-console) | The React SPA served at `/console` — WYSIWYG page builder, React Flow automations editor, Data Studio, storage, edge resources, plans, users, tenants. Browser-only |

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
