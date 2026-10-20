# Admin Console & Single-Worker Deploy

## Production API (`@frontbase/backend`)

The admin console is served at `/frontbase-admin` and calls the
`/api/*` surface from `createCompatApp()`. Protected routes
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
provisions **Cloudflare** — D1, wrangler secrets, the setup link.
`--target vercel` / `--target deno` dispatch to the per-host scripts
(`pnpm run deploy:vercel` / `pnpm run deploy:deno`) with shared secret transport and host-specific options
— secrets over stdin, exit code propagated — from inside this repo; outside it
they refuse honestly. The hosts' provisioning itself stays script-owned
(see [Deploying to other hosts](#deploying-to-other-hosts-vercel-deno-deploy)).

```bash
npx @frontbase/compiler deploy --dry-run   # compose + routing smoke + size budget
npx @frontbase/compiler deploy             # wrangler deploy (Cloudflare provisioning)
```

**The composition boundary (RULE 1):** the served `/sw.js` is the
execute-stripped browser projection — it contains no server secret and no
edge-infra driver. The worker's server code lives only in the fetch handler.
Worker budget: < 1 MB min+gzip (measured ~489 KB).

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
   to `wrangler secret put` over **stdin**.

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

The same full-CMS app ships on four hosts from `examples/cf-full`. Each
non-CF deploy runs the same gauntlet before any host call: the cf-full build,
the staged-console validator, and the per-host artifact gate
([`scripts/verify-host-artifact.mjs`](../../scripts/verify-host-artifact.mjs)
— bundle invariants (web libsql client pinned, no `node:` imports on Edge,
Vercel Node `default.fetch` export, `Deno.serve`), the config contract, and the staged
statics — judged on the post-build tree, so stale bytes can't be blessed).

```bash
pnpm run deploy:vercel -- --project <my-app-name> --scope <team_ID> --first-install
pnpm run deploy:vercel -- --project <my-app-name> --scope <team_ID> --redeploy
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
| `SESSION_SECRET` | Vercel: generated only with `--first-install`; omitted on `--redeploy` to preserve the host value. Explicit replacement requires `--rotate-session-secret`. Deno retains its existing generation behavior. |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | optional admin seeding for first install (else a one-time setup link is printed); omit on Vercel redeploy |

`:memory:`/`file:` are refused on the edge hosts (isolates share no memory and
expose no writable filesystem); Docker keeps the `file:` default. A
half-configured set fails the deploy naming the exact missing variable.
Precedence, the fail-loud rule, and the SQLite-dialect limit (see
[docs/known-limitation-postgres-mysql.md](../known-limitation-postgres-mysql.md))
are unit-proven in
[`examples/cf-full/test/state-db.mjs`](../../examples/cf-full/test/state-db.mjs).

Live verification for both hosts runs in the dispatch-only workflows
(`vercel-fresh-deploy.yml`, `deno-fresh-deploy.yml`) — scratch-named projects,
browser acceptance against the deployed URL, `always()` teardown.

### Vercel deployment intent and target safety

Non-dry-run Vercel deployment requires an exact project name, `--scope <team_ID>` (or `VERCEL_TEAM_ID`) and exactly one of `--first-install` / `--redeploy`. The script verifies linked and live public project metadata before environment writes. Set `VERCEL_DEPLOY_INTENT=first-install` or `redeploy` when invoking through the compiler's host dispatcher; its direct flag forwarding has not yet been expanded for these host-specific switches.

Redeploy does not generate, fetch or overwrite an absent local session secret, and refuses setup/admin initialization values. To deliberately rotate a supplied session secret, additionally pass `--rotate-session-secret` to the direct script; existing sessions will be invalidated. Environment updates use CLI `--force --sensitive` with stdin rather than deleting variables first. This is not a transactional multi-variable update; failures stop deployment and require review.

[Current implementation receipt](../plans/frontbase-deployment-profiles-p0-p1-20261020.md) distinguishes the verified disposable CF API journey, local Vercel checks and outstanding live Vercel/Bindings/button acceptance.

### Local pre-deployment Bindings review

After `pnpm -r build`, run `pnpm run deploy:setup -- --target cloudflare` (or `vercel`). Open the private loopback link from your terminal. The local screen uses the shared profile contract without an initialized application database. It validates provider choices and keeps credentials in memory for the session; it does not provision or deploy unless execution is explicitly enabled. The link/listener expires in 15 minutes. [Verified boundary and next integration](../plans/frontbase-deployment-bootstrap-20261020.md).

To enable the verified new-Worker/new-D1 Cloudflare path, use:

```sh
pnpm run deploy:setup -- --target cloudflare --environment preview --deploy --app-name my-new-frontbase --account-id YOUR_CLOUDFLARE_ACCOUNT_ID
```

This first executor requires a fresh Worker and `<worker>-db` D1, with optional bindings disabled. It refuses existing resources and repeat attempts. The private first-admin link is printed in the terminal. [Exact verification and remaining scope](../plans/frontbase-deployment-handoff-20261020.md).


## Native KV in reviewed Cloudflare setup

The explicit `deploy:setup -- --target cloudflare --deploy --app-name NAME --account-id ACCOUNT_ID` flow defaults to a new named D1 and optional new KV cache. KV can be disabled in the local Bindings review. It uses the `FRONTBASE_KV` binding, the existing tenant-scoped service resolver, and logical TTLs for short cache entries. Explicit cache environment configuration and adopted defaults retain precedence. This launcher refuses existing resources and unsupported bindings; native R2 and reuse/redeploy are still pending. [Exact live acceptance and limits](../plans/frontbase-deployment-native-kv-20261020.md).
