# Console API & Single-Worker Deploy

## Console API (`@frontbase/backend`)

Mounted at `/api/console` via `createEngine({ console })`. **Default-DENY**: every
route except `/health` requires an authenticated principal (RULE 2). Drizzle is
the single persistence source of truth (A-13); every tenant table has a
`tenant` column and composite PK; all CRUD is tenant-scoped. Errors are opaque
(RULE 4).

```ts
import { createConsole } from '@frontbase/backend';
import { createResolvePrincipal } from '@frontbase/edge-infra';
const console = createConsole({
    resolvePrincipal: createResolvePrincipal({ jwtSecret: process.env.JWT_SECRET }),
    dbUrl: process.env.DB_URL,
    queries,
});
const engine = createEngine({ manifest, data, environment: 'edge', console });
```

Routes: `GET /pages`, `GET/PUT /drafts/:slug`, `POST /publish/:slug`, `DELETE /pages/:slug`,
`GET /health`. **Publish** validates the draft → assembles the `SiteManifest`
(reusing `@frontbase/compiler`) → emits the **execute-stripped browser
projection** (RULE 1) → bumps the content-hash version → purges the cache.

## Builder (`@frontbase/builder`)

React SPA (peer `react`). NEVER imports `@frontbase/edge-infra` — it talks to the
console over HTTP and renders drafts through the same `@frontbase/edge-core`
engine (preview HTML == published HTML). `localDraftProvider` is a `DataProvider`;
property panels are generated from a compiler `ComponentManifest`.

## Deploy (`frontbase deploy`)

Composes engine + console + proxy + builder SW into one CF Worker.

```bash
npx @frontbase/compiler deploy --dry-run   # compose + routing smoke + size budget
npx @frontbase/compiler deploy             # wrangler deploy (primary)
npx @frontbase/compiler deploy --target deno
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
