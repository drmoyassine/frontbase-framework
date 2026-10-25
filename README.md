# Frontbase

[Current Developer Preview release plan](docs/plans/frontbase-public-release-finalization-20261024.md): latest visual binding, @ mapping, frontend editing and [editable institution/program detail pages with galleries and distinct navigation](docs/plans/detail-gallery-layout-20261025.md) are accepted on staging. Remaining work is release-candidate integration and qualification, public-source clean installation, supported-provider/reset evidence, clean-room documentation and versioned distribution. CF-22 is retired; no general-availability claim is made.

[2026-10-22 framework acceptance](docs/plans/frontbase-acceptance-closeout-20261022.md) adds strict local seven-package consumers, interactive list localization and real D1/Turso recovery. The bounded acceptance task is closed after the staging credential/query repair and clean availability observation. Broader public-release gates remain open; this is Developer Preview preparation.

Frontbase is an open-source, edge-native platform for building and deploying AI-powered apps with no code — a visual builder whose published sites, admin console, and API all ship as **one deployable worker**.

**Universal SSR** — one Hono engine shared by edge execution and the visual builder's canvas. Published pages render server-side; the current service worker leaves navigations to the server. The admin console is served as static assets alongside the API. See the [dated build evidence](docs/plans/wordpress-pilot-artifact-check-delivery.md) for current working-tree measurements rather than a fixed release-size claim.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

> **Status**: actively developed (pre-1.0). The admin console, hydration runtime, admin API and host adapters live in this repository. Builds install declared registry dependencies; they do not fetch a separate proprietary console bundle. Host support and managed-cloud functionality remain bounded by their linked acceptance evidence.

The accepted first public-edition scope is **Frontbase Framework Developer Preview**. Release preparation is in progress; package publication, clean self-host installation, security and operations gates remain open. Cloudflare is the leading deployment path; other hosts have evidence-specific support boundaries. [Current release evidence and ordered backlog](docs/history/PUBLIC-RELEASE-R0-2026-10-21.md) distinguish the library framework, application artifacts and unfinished template/migration work. Full console scaffolding and general host/provider parity are not release claims. [Bounded Vercel profile acceptance](docs/plans/frontbase-deployment-vercel-live-20261020.md) now includes actual isolated Turso-backed preview and production page publication on the Node runtime; [Fresh-state managed CLI setup/redeploy](docs/plans/frontbase-deployment-vercel-fresh-20261020.md) is also verified. [Native deployment evidence](docs/plans/frontbase-deployment-closeout-20261021.md) includes clean Cloudflare publication, native upgrades and Vercel native import followed by a verified cold-start repair. Default-main integration, a fresh Vercel clone from the final repair, first-project preview and broader provider coverage remain separate gates.

The owner-approved framework extension `@frontbase/translation` is in development as a standalone edge-native AI translation engine. The current package contains foundations, a protected revision lifecycle, immutable translation-input history and durable local-provider jobs through injected SQLite adapters. The server-side HTTP bridge reuses Frontbase’s existing Supabase/PostgREST client and narrow transactional RPCs; [bounded delivery evidence](docs/plans/frontbase-translation-http-20261017.md) records actual HTTPS concurrency, leases and rollback alongside isolated package/local-host checks. [Storage settings](docs/plans/frontbase-translation-storage-20261017.md) now select an existing content or separate datasource through owned server credentials and read-only HTTP checks. [T1 implementation and staging evidence](docs/plans/frontbase-translation-ai-t1-20261017.md) adds shared HTTP AI invocation and reference-only provider settings without calling a model. [A local accounting foundation](docs/plans/frontbase-translation-accounting-foundation-20261017.md) adds atomic SQLite reference allowance/attempt behavior; [HTTP accounting parity](docs/plans/frontbase-translation-accounting-http-20261017.md) is verified on disposable local PostgreSQL/PostgREST; [bounded internal host request policy](docs/plans/frontbase-translation-host-allowance-20261017.md) is locally verified; [bounded cancellation/reconciliation](docs/plans/frontbase-translation-allowance-reconciliation-20261018.md) is also locally verified; [reviewed page-text batches](docs/plans/frontbase-translation-reviewed-batches-20261018.md) now have bounded local backend/API acceptance with execution disabled by default. [Native Settings batch review/progress](docs/plans/frontbase-translation-review-ui-20261018.md) now has bounded local UI/API acceptance; execution remains disabled by default. [Selected menu/live-field inputs](docs/plans/frontbase-translation-menu-live-inputs-20261018.md) now have bounded local acceptance through that same flow. Initial live selection is an explicit table/key/text column; [Bounded saved-view selection](docs/plans/frontbase-translation-saved-view-inputs-20261018.md) now reuses Data Inspector filter contracts and source freshness checks. [Native review staging delivery](docs/plans/frontbase-translation-review-staging-20261018.md) verifies that bounded UI/API with generation disabled and settings/drafts preserved. Other source schemas/adapters, unsupported predicate transports, unattended delivery, monetary guarantees, broader AI-service acceptance, additional persistence adapters and general visual locale publication remain pending. It is not published to npm. [Package boundary and evidence](docs/plans/frontbase-translation-package-20261016.md) records the new seventh library candidate and its separate release gates.

---

[OpenRouter translation integration](docs/plans/frontbase-translation-openrouter-20261018.md) has bounded local and USA staging verification alongside OpenAI through the existing HTTP adapter and owned Connected Accounts. Free-model routing controls do not replace reviewed batch approval or request accounting; [A bounded real-provider pilot](docs/plans/frontbase-translation-first-pilot-20261019.md) saved two Arabic drafts; its original uncertain request remains recorded and its obsolete unsent job has since been cancelled under the owner’s continuation. Broader provider/model acceptance remains open. [Saved Default page locale preview/manual editing](docs/plans/frontbase-translation-visual-preview-20261019.md) has bounded staging evidence. [Complete Arabic Homepage publication](docs/plans/frontbase-homepage-arabic-publication-20261019.md) now has actual 85/85-field staging evidence with native reviewed preview/publication, RTL and working English/Arabic header links. Remaining copy was authored as manual revisions without new provider calls. General page/version/history, live localized querying and migration remain open in [the active plan](docs/plans/frontbase-ai-native-translation-implementation-20261016.md).

## Why Frontbase

Most stacks split building from serving: a builder app here, an API server there, a rendering layer stitched on top — and preview, server, and browser each drift their own way. Frontbase collapses all of it:

- **Build and publish in one sitting** — design pages on a live drag-and-drop canvas, hit publish, and the site is served from the same worker (self-host, or managed cloud at `<slug>.frontbase.dev`).
- **One artifact, no backend to stand up** — the console API, auth, pages, automations, and the rendering engine deploy together. Zero infrastructure beyond the worker and its state DB.
- **One shared engine** — server rendering and the builder canvas share the renderer and component contracts, with client hydration for interactions. Current service-worker navigation stays on the server; offline public navigation is not a release claim. Shared rendering is checked by the [golden corpus](golden-corpus/README.md).
- **Security is the architecture, not a plugin** — every console route is default-deny authenticated, API keys are stored hashed with a one-time encrypted reveal, password capabilities are expiring and single-use, cloud tenants are host-scoped (a session from tenant A is anonymous on tenant B), and cloud auth endpoints are rate limited. The isolation and failure paths are pinned by a mutation harness that proves every gate goes red when broken.

## What's in the admin console

The console exposes the following areas. Availability depends on the supported
host, configured adapters and capability checks; navigation presence is not proof
that every action is supported.

| Area | What it does |
|---|---|
| **Pages** | WYSIWYG drag/drop canvas — live component rendering, not just a layer list — with draft/publish |
| **Automations** | Visual authoring with local graph/selected-node tests, persisted history and versions. The implemented subset is manual triggers, HTTP requests, agent turns, safe JSON transforms and HTTP responses. Unsupported node families, remote publication and interactive-test cancellation are explicitly refused. Production recovery and optional queue redelivery reuse the same executor; interrupted interactive tests are never replayed as production graphs |
| **Data Studio** | Connect SQLite / D1 / Turso / Supabase / Postgres datasources, browse tables, run read-only queries |
| **Edge Resources** | Inspect and configure owned provider resources. Managed deployment tooling has separately qualified CF/Vercel paths; unsupported legacy in-app engine deployment and engine transfer are refused |
| **File Storage** | R2/S3-compatible upload (base64 JSON or multipart) and presigned URLs |
| **Plans** | Tiered limits (e.g. pages/users) enforced server-side, not just displayed |
| **Users / Tenants** | Multi-tenant provisioning, role management, secret variables encrypted at rest |

Owners and administrators can also [edit frontend plain text](docs/guides/frontend-text-editing.md)
in the current language, stage several fields and save or cancel the page's
changes together. Structure, styles and bindings remain in the visual builder.
See [supported workflow authoring](docs/guides/workflow-authoring.md) for the
implemented execution boundary and [reset delivery](docs/guides/password-reset-delivery.md)
for optional self-host mail configuration.

## Quick start (self-host on Cloudflare)

Build prerequisites: Node.js 22.19+ and pnpm 10.15.1. The Vercel application
targets Node 22 Functions; it is not a Vercel Edge deployment. See the
[deployment support matrix](docs/guides/deployment-support-matrix.md) for evidence
and provider boundaries, [contributing](CONTRIBUTING.md) for verification commands,
and [security policy](SECURITY.md) for reporting and secret custody.
The [Developer Preview support policy](docs/guides/developer-preview-support.md)
defines runtime, recovery and distribution boundaries.

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

[Reviewed Cloudflare deployment lifecycle](docs/plans/frontbase-deployment-managed-lifecycle-20261020.md) supports new managed D1/optional KV/private R2 installations, exact-binding redeployment and bounded completed-upload recovery through the local setup launcher. [Shared pre-/post-deploy editor and native storage affordances](docs/plans/frontbase-deployment-shared-bindings-20261020.md) are verified for bounded managed CF use; the running app reviews/downloads proposals and does not apply them. Controlled Cloudflare binding changes, state migration, native button acceptance and broader provider coverage remain separate gates. [Operation-bound Vercel recovery](docs/plans/frontbase-deployment-vercel-reconciliation-20261021.md) verifies known completed uploads without replaying remote writes. [Bounded Vercel cache/vector/queue changes](docs/plans/frontbase-deployment-optional-bindings-20261021.md) now have local lifecycle/security verification. Actual isolated Vercel preview/production and unchanged production redeployment now pass through the existing HTTP state runner ([receipt](docs/plans/frontbase-deployment-vercel-live-20261020.md)). [Commands and limits](docs/guides/console-and-deploy.md#managed-cloudflare-redeployment-and-recovery).

## One-click deploy

[Current CF/Vercel support matrix](docs/guides/deployment-support-matrix.md) records verified native upgrades, provider boundaries and remaining clean-install gates.

These links open the host's clone/project flow. Signed-in native inspection confirms these root-source links load main, which does not yet contain the isolated deployment branch’s portable setup. Exact fresh button journeys remain incomplete; use the reviewed CLI flow until native acceptance is recorded. [Native source/provider findings and live rollback evidence](docs/plans/frontbase-deployment-provider-failure-20261021.md). Run `pnpm test:deployment-buttons` to check the committed button/config contract, or `node scripts/deployment-buttons.mjs --ref <named-test-tag>` for explicit test-source links. This preflight does not prove provider-side cloning or provisioning. The workspace build compiles the console and engine from source:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdrmoyassine%2Ffrontbase-framework&project-name=frontbase-cms&root-directory=examples%2Fcf-full&env=ADMIN_EMAIL%2CADMIN_PASSWORD&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22tursocloud%22%2C%22productSlug%22%3A%22database%22%2C%22protocol%22%3A%22storage%22%2C%22allowConnectExistingProduct%22%3Atrue%7D%5D)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fdrmoyassine%2Ffrontbase-framework)
[![Deploy on Deno](https://deno.com/button)](https://console.deno.com/new?clone=https%3A%2F%2Fgithub.com%2Fdrmoyassine%2Ffrontbase-framework&app_directory=examples%2Fcf-full&install=pnpm%20install&build=pnpm%20-r%20build)

`SESSION_SECRET` is never prompted: when the env var is absent the engine generates a strong secret on first boot and persists it in the state DB, so every isolate agrees (setting it explicitly overrides — rotation caveat applies). `ADMIN_EMAIL` / `ADMIN_PASSWORD` seed the first administrator at boot (idempotent — existing users are never reseeded); a browser setup flow additionally requires a private, unexpired SETUP_TOKEN/SETUP_EXPIRES_AT capability. The reviewed CLI generates that capability; the native buttons have not yet proved this handoff.

**Vercel** — Root Directory is preset to `examples/cf-full` (the workspace install runs at the repo root; the build is the package's own `node build.mjs`), and creation prompts for `ADMIN_EMAIL` / `ADMIN_PASSWORD` — fill them to seed the first admin. Do not assume an empty value enables secure setup without a setup capability. The button requests a Turso Marketplace database through the `tursocloud/database` product. Review the provider plan and connection before deploying; terms and resource creation remain provider steps. Existing connected Turso credentials are discovered by the HTTP state adapter. Other compatible state providers can be selected through the reviewed local binding setup flow. Fresh native clone acceptance remains open; a repaired isolated native deployment has verified page publication.

**Cloudflare** — build/deploy commands are pre-filled from the root `package.json` (`pnpm -r build`, then `wrangler deploy --config wrangler.toml --experimental-auto-create=false`), using the portable root configuration with complete replaceable D1/KV fields and inert placeholder IDs. Automatic duplicate provisioning is disabled. A corrected native Git test now verifies runtime boot, exact D1/KV and setup lock after manual resource repair. Fresh placeholder handoff and the default main-source button remain separate acceptance gates. The flow prompts for `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the repo's `.env.example` — fill them to seed the first admin; leaving them empty also requires a valid private setup capability. `SESSION_SECRET` is deliberately not prompted (self-generates at boot). Requires a **public** repo. To seed an admin later instead: **Workers & Pages → your Worker → Settings → Variables and Secrets → add the two (type: Secret) → Deploy**, then log in at `/frontbase-admin`.

**Deno** — `app_directory` is preset to `examples/cf-full`; install/build come from the package's `deno.json`, and the entrypoint is the committed `deno-entry.mjs` shim (a build output can't be validated pre-build — the shim exists in the clone and imports the built `deno-dist/deno.mjs` after it). Deno's button has no env prompt: set `ADMIN_EMAIL` / `ADMIN_PASSWORD` plus one complete state-db set (Deno Deploy has no D1 binding — Turso is the practical choice) in the project's environment variables, then trigger a new deployment.

Prefer the CLI, or want the gated flow (size budgets, staged-console checks, generated setup links)? Use the per-host scripts below — they deploy the same artifact with secrets over stdin instead of host dashboards.

## Local deployment configuration review

After building the workspace, `pnpm run deploy:setup -- --target cloudflare` (or `vercel`) opens a private, database-independent local configuration flow. It reuses the deployment profile contract and validates bindings. An explicit [new Worker/new D1 Cloudflare execution mode](docs/plans/frontbase-deployment-handoff-20261020.md) is verified; [native KV create/bind and real app cache use](docs/plans/frontbase-deployment-native-kv-20261020.md) are also verified on a disposable host. [Optional private native R2 upload/download](docs/plans/frontbase-deployment-native-r2-20261020.md) is verified with tenant-scoped expiring access URLs and bounded transfers. Managed CF reuse/redeploy is verified. Vercel now supports explicit team/project/environment execution with connected Turso selection through the same review. Exported nonsecret proposals can be imported with `--manifest PATH`; Vercel cache/vector/queue changes and optional [selected-bucket S3 wiring](docs/plans/frontbase-deployment-s3-storage-20261021.md) are supported through reviewed redeployment with explicit disable semantics; other binding changes and native button acceptance remain open. Fresh-state managed CLI setup/redeploy now pass, with a first-project preview refusal ([live Vercel evidence](docs/plans/frontbase-deployment-vercel-live-20261020.md)). [Verified setup boundary and remaining integration](docs/plans/frontbase-deployment-bootstrap-20261020.md).

## Deploy to four hosts

The same CMS deploys to four hosts. `frontbase deploy` provisions Cloudflare; `--target vercel` / `--target deno` dispatch to the per-host scripts below (from inside this repo) with the same flags — secrets over stdin, exit code propagated. The scripts build, gate, and drive the host CLI:

```bash
# Vercel Node — static matrix in vercel.json, function owns state routes
vercel login   # or set VERCEL_TOKEN
pnpm run deploy:vercel -- --project <my-app-name> --scope <team_ID> --first-install

# Later Vercel deployment: use --redeploy instead of --first-install.
# Keep SESSION_SECRET unset locally to preserve the existing host value.

# Deno Deploy — self-contained deno-dist/ tree via deployctl
export DENO_DEPLOY_TOKEN=...
pnpm run deploy:deno -- --project <my_app_name>
```

**Docker**: a single container (SQLite volume, Redis optional) — see [docs/guides/self-host-docker.md](docs/guides/self-host-docker.md).

The Vercel/Deno scripts read secrets from the environment (or stdin JSON with `--secrets-json`) — never from argv — and refuse to deploy without exactly one complete state-db set:

| Variable(s) | Meaning |
|---|---|
| `SESSION_SECRET` | HS256 session key — auto-generated and persisted in the state DB when absent |
| `APP_DB_URL` [+ `APP_DB_AUTH_TOKEN`] | Turso/self-hosted sqld (`libsql://` or `https://`) — the practical edge-host state DB |
| `APP_DB_D1_ACCOUNT_ID` + `APP_DB_D1_DATABASE_ID` + `CLOUDFLARE_API_TOKEN` | D1 over REST — Cloudflare's D1 from any host |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | seed the first admin (instead of a setup link) |

On Cloudflare, none of these are required — the D1 binding is the default. On Vercel/Deno, a half-configured set fails the deploy naming the missing variable. Precedence and the honest SQLite-dialect limit: [docs/guides/self-host-docker.md](docs/guides/self-host-docker.md).

## Cloud multi-tenant hosting

> Paid Cloud launch with Supabase database/auth and Stripe is in preparation, not released. See [launch status and gates](docs/CLOUD-LAUNCH.md) and [operations readiness](docs/CLOUD-OPERATIONS.md).

The same worker also runs the managed cloud: public self-serve signup, site building in the console, and each site live at `<slug>.frontbase.dev`. Opt in via the deploy mode — self-host behavior is byte-identical when it's unset:

```bash
export RESEND_API_KEY=...            # password-reset email (env only, never a CLI flag)
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...   # Custom Domains attach
pnpm run deploy:cf-full -- --mode cloud --base-domain frontbase.dev \
  --app-name frontbase-cloud --admin-email owner@example.com --admin-password '…'
```

That stages both console builds (self-host + cloud `/admin`), boots the worker in cloud mode via `wrangler deploy --var` (never wrangler.toml), attaches `app.<zone>` as a Custom Domain and `*.<zone>/*` as a Workers route over existing proxied wildcard DNS, and gates the deploy on both console artifacts. Supabase/Hyperdrive application state, Supabase Auth and Stripe billing are implemented, with paid launch acceptance still open. Platform and public tenant traffic use separate Workers. Dedicated engines and unsupported add-ons are excluded from current launch claims. Stripe test staging requires sandbox Basic/Pro price mappings; see the [journey and staging guide](examples/cf-full/e2e/cloud/README.md). Full contract, honest limits, and the dashboard fallback: [docs/cloud-free-tier.md](docs/cloud-free-tier.md).

## Architecture

Canonical spec: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · stack detail: [docs/STACK.md](docs/STACK.md).

One Hono engine (`@frontbase/edge-core`) with a unified priority router, SSR renderer, and DataProvider DI. Published pages ship zero React. Current service-worker lifecycle behavior does not intercept public navigation. Bundle measurements are recorded by `pnpm -r build` in [dated delivery evidence](docs/plans/wordpress-pilot-artifact-check-delivery.md); those local artifacts are not released versions.

| Artifact | Measurement basis |
|---|---|
| Worker (engine + console API + auth + pages) | Minified bundle, gzip level9, byte count divided by1024 (KiB); repository budget1MiB |
| Inlined `/sw.js` | Build log reports source length separately, not its individual gzip contribution |
| Vercel Node / Deno function bundles | Local build and host-smoke evidence; intended-host acceptance remains separate |

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
