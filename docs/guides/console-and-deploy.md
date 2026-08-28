# Product Console & Single-Worker Deploy

## Production API (`@frontbase/backend`)

The product community console is served at `/frontbase-admin` and calls the
product-compatible `/api/*` surface from `createCompatApp()`. Protected routes
are **default-DENY** and tenant-scoped. Drizzle remains the single persistence
source of truth and errors remain opaque.

Production still mounts a small router at `/api/console`, created with
`retireLegacyApi: true`. It retains `GET /health` for liveness and `/setup`
plus `/setup/*` for first-admin bootstrap. Every other path and method returns
`410 Gone`.

```ts
import { createConsole } from '@frontbase/backend';
const console = await createConsole({
    makeRunner,
    sessionSecret,
    setupToken,
    retireLegacyApi: true,
});
const engine = createEngine({ manifest, data, environment: 'edge', console });
```

The non-retired `createConsole()` mode remains available to backend package
tests and older embedders for backward compatibility. The deployable
`examples/cf-full` target does not enable it.

## Builder (`@frontbase/builder`)

React SPA (peer `react`). NEVER imports `@frontbase/edge-infra` — it talks to the
console over HTTP and renders drafts through the same `@frontbase/edge-core`
engine (preview HTML == published HTML). `localDraftProvider` is a `DataProvider`;
property panels are generated from a compiler `ComponentManifest`.

## Deploy (`frontbase deploy`)

Composes engine + console + proxy + builder SW into one CF Worker. The CLI
provisions **Cloudflare only** (A-24) — D1, wrangler secrets, the setup link.
`--target vercel` / `--target deno` are accepted but REFUSE with the supported
script path (`pnpm run deploy:vercel` / `pnpm run deploy:deno`); the other
hosts' provisioning is script-owned (see [Deploying to other hosts](#deploying-to-other-hosts-vercel-deno-deploy)).

```bash
npx @frontbase/compiler deploy --dry-run   # compose + routing smoke + size budget
npx @frontbase/compiler deploy             # wrangler deploy (Cloudflare provisioning)
```

**The composition boundary (RULE 1):** the served `/sw.js` is the
execute-stripped browser projection — it contains no server secret and no
edge-infra driver. The worker's server code lives only in the fetch handler.
Worker budget: < 400 KB min+gzip (measured ~55 KB).

### One-command deploy (login + D1 + admin seed + deploy)

For a brand-new deploy, three things normally happen manually: logging into
wrangler, creating a D1 database, and setting the `ADMIN_EMAIL`/`ADMIN_PASSWORD`
secrets. `deploy` can do all of it in one invocation:

```bash
# Non-interactive — every value supplied as a flag (scriptable/CI-friendly):
npx @frontbase/compiler deploy \
  --admin-email owner@example.com \
  --admin-password 'a real password' \
  --d1-database-id <existing-d1-uuid>   # optional — omit to create a new D1

# Interactive — prompts for login (if needed) + admin email/password:
npx @frontbase/compiler deploy --interactive
```

**`--d1-database-id <id>`** binds to an **existing** D1 database instead of
running `wrangler d1 create` — useful when the database was already created
(dashboard, a prior deploy, `wrangler d1 create` run separately). If
`wrangler.toml` already declares a `[[d1_databases]]` binding, that existing
binding always wins — the flag is ignored rather than silently rebinding the
project to a different database.

**`--interactive`** does three things before deploying:
1. Runs `wrangler whoami`; if not authenticated, runs `wrangler login` (opens a
   browser, blocks until you finish the OAuth flow).
2. Prompts for the admin email (validated) and password (masked — nothing
   echoes to the terminal, min 8 characters), re-prompting on invalid input.
3. Calls the same deploy path as the non-interactive flags above — the
   credentials never touch argv, an env var, or shell history; they're pushed
   to `wrangler secret put` over **stdin** (CF-19).

`--interactive` and `--admin-email`/`--admin-password` are mutually exclusive
in intent — if you pass both, the interactively-prompted values win (the flags
are overwritten after the prompt).

### Deploying `examples/cf-full` specifically

`frontbase deploy`'s `--dry-run` path (and thus `--dry-run` in general) calls
`composeWorker()`, which builds a project from `src/sw.ts` + `src/worker.ts`
directly with esbuild. `examples/cf-full` doesn't fit that shape — its own
`build.mjs` inlines two virtual modules (`virtual:sw-bundle`, `virtual:spa-bundle`,
carrying the service worker and the admin console SPA respectively) that
`composeWorker()` doesn't know about, so running `frontbase deploy --dry-run`
directly inside `examples/cf-full` will fail.

The **live** deploy path (no `--dry-run`) never calls `composeWorker()` — it only
requires `src/sw.ts` + `src/worker.ts` to exist and `wrangler.toml`'s `main` to
point at an already-built `dist/worker.mjs`. That means cf-full's own build step
is fully compatible with live deploy — it just needs to run first. A root-level
script does exactly that, reusing the same `deployCommand()`/`interactive.ts`
logic documented above without duplicating it:

```bash
# From the repo root:
pnpm run deploy:cf-full -- --interactive
pnpm run deploy:cf-full -- --admin-email owner@example.com --admin-password 'a real password'
pnpm run deploy:cf-full -- --dry-run   # build + size-budget check only, no wrangler calls
```

(`pnpm run`, not bare `pnpm deploy:cf-full` — pnpm reserves the top-level
`deploy` verb for its own workspace-package publishing feature, so the script
is named `deploy:cf-full` and invoked via `pnpm run` to avoid any ambiguity.)

Source: [`scripts/deploy.mjs`](../../scripts/deploy.mjs).

### Deploying to other hosts (Vercel, Deno Deploy)

A-24 ships the same full-CMS app on four hosts from `examples/cf-full`. Each
non-CF deploy runs the same gauntlet before any host call: the cf-full build,
the staged-console validator, and the per-host artifact gate
([`scripts/verify-host-artifact.mjs`](../../scripts/verify-host-artifact.mjs)
— bundle invariants (web libsql client pinned, no `node:` imports on Edge,
edge-runtime directive, `Deno.serve`), the config contract, and the staged
statics — judged on the post-build tree, so stale bytes can't be blessed).

```bash
pnpm run deploy:vercel -- --project <my_app_name>            # vercel.json + api/cms.mjs + console-dist CDN tree
pnpm run deploy:vercel -- --project <my_app_name> --dry-run  # build + gates only — no host calls
pnpm run deploy:deno   -- --project <my_app_name>            # deno-dist/ (deno.mjs + deno.json + console-dist) via deployctl
pnpm run deploy:deno   -- --project <my_app_name> --dry-run
```

**Secrets** come from the environment (or stdin JSON via `--secrets-json`) —
never argv. Both scripts require exactly one complete state-db set and validate
it through the same resolver the deployed edge entry uses at boot:

| Variable(s) | State DB |
|---|---|
| `APP_DB_URL` [+ `APP_DB_AUTH_TOKEN`] | Turso / self-hosted sqld (`libsql://` or `https://`) |
| `APP_DB_D1_ACCOUNT_ID` + `APP_DB_D1_DATABASE_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare D1 over REST — D1 from any host |
| `SESSION_SECRET` | always required (generated when absent) |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | optional admin seeding (else a one-time setup link is printed) |

`:memory:`/`file:` are refused on the edge hosts (isolates share no memory and
expose no writable filesystem); Docker keeps the `file:` default. A
half-configured set fails the deploy naming the exact missing variable.
Precedence, the fail-loud rule, and the SQLite-dialect limit are decision
[A-24](../DECISIONS.md); the resolver contract is unit-proven in
[`examples/cf-full/test/state-db.mjs`](../../examples/cf-full/test/state-db.mjs).

Live verification for both hosts runs in the dispatch-only workflows
(`vercel-fresh-deploy.yml`, `deno-fresh-deploy.yml`) — scratch-named projects,
browser acceptance against the deployed URL, `always()` teardown.
