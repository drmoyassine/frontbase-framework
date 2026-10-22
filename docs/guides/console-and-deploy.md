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

Creation requires a fresh Worker and `<worker>-db` D1; optional native KV and private R2 can be selected below. Existing resources are refused rather than adopted. The private first-admin link is printed in the terminal. [Exact verification and remaining scope](../plans/frontbase-deployment-handoff-20261020.md).


## Native KV in reviewed Cloudflare setup

The explicit `deploy:setup -- --target cloudflare --deploy --app-name NAME --account-id ACCOUNT_ID` flow defaults to a new named D1 and optional new KV cache. KV can be disabled in the local Bindings review. It uses the `FRONTBASE_KV` binding, the existing tenant-scoped service resolver, and logical TTLs for short cache entries. Explicit cache environment configuration and adopted defaults retain precedence. This launcher refuses existing resources and unsupported bindings; optional private native R2 is verified separately; managed reuse/redeploy uses the durable receipt described below. [Exact live acceptance and limits](../plans/frontbase-deployment-native-kv-20261020.md).


## Optional private native R2

In the reviewed Cloudflare setup above, enable the Storage binding and choose native R2/create to provision the derived new private bucket. No S3 credentials are needed. The File Storage API discovers a bound provider and a tenant-isolated private files bucket, reusing normal multipart uploads and object management. Signed GET/PUT links use the app origin, default to fifteen minutes and are capped at one hour. Native transfers default to 10 MiB; physical bucket management, permanent public asset URLs and large-object multipart protocols are not part of this path. [Exact actual acceptance and support boundary](../plans/frontbase-deployment-native-r2-20261020.md).

## Managed Cloudflare redeployment and recovery

New reviewed deployments now retain a versioned nonsecret journal under `.frontbase/deployments/<account>/<environment>/<worker>/deployment.json`. Keep this local identity record: it pins D1/KV IDs, the R2 name/creation timestamp, installation UUID and deployed version. It contains no provider credentials, session secret, administrator password or setup claim. The directory is Git-ignored.

From the same checkout and explicit account/name/environment, use:

```sh
pnpm run deploy:setup -- --target cloudflare --environment preview --deploy --app-name my-new-frontbase --account-id YOUR_CLOUDFLARE_ACCOUNT_ID --intent redeploy
```

The local Bindings review shows recorded resources in reuse mode. This bounded redeploy retains the same bindings; changing providers or state storage still requires a controlled migration/reconfiguration feature. The executor verifies live ownership, exact resource IDs and current version, uses the existing compiler, preserves remote variables/secrets and forbids resource creation or secret uploads. Old deployments without a managed receipt and ownership marker are not automatically enrolled.

If upload completed but its final verification failed, review the journal, then use the same command with `--intent resume`. Recovery confirms the exact recorded operation/version and resource identities without another upload. It requires a known application URL and completed known resource identities. Unknown create results, an unmarked partial Worker or a lost upload response require manual reconciliation; `resume` does not retry or adopt resources by name.

A local account/Worker lock serializes operations across worktrees and environment labels for the same OS user. A stale lock is retained after process failure: establish that the operation has ended and reconcile its receipt/provider state before removing it. Locks do not coordinate other users/machines or out-of-band dashboard operations; immediate version checks are not a provider-side compare-and-swap guarantee. Journal updates are atomic local replacements, not distributed transactions or a power-loss/backup guarantee.

[Lifecycle evidence and limitations](../plans/frontbase-deployment-managed-lifecycle-20261020.md). Shared post-deploy proposal review is described below. Controlled binding changes, migration, full button journeys and broader Vercel provider acceptance remain separate work.

## Review bindings in a running app

For a managed Cloudflare installation, open **Edge → Edge Compute → the local/system engine → Bindings** (`/frontbase-admin/edge?tab=compute`). Deployment-owner access is required. The dialog uses the same editor as local setup and displays configuration recorded by the managed deployment.

Choose providers/fields for a proposal, select **Review proposal**, then **Download plan**. Reviewing does not modify the running app. The plan contains configuration and credential references; new keys are entered only in the private local setup. State database changes are labeled as requiring a separate migration. Import an exported data-only plan into local review with `--manifest PATH`, using the same target and environment. Import does not apply changes by itself. Cloudflare managed redeploy retains recorded bindings. Vercel permits the supported cache/vector/queue changes below; state migration remains unavailable.

Older/unmanaged deployments with no trustworthy metadata show an explicit unavailable message; they are not silently enrolled. Cloud mode and non-owner/other-tenant access are refused.

In **Storage**, native R2 is marked **Deployment managed · private**. Its files can be managed normally, but its physical bucket/provider cannot be created, reconfigured or removed in this UI. Native sharing offers the supported fifteen-minute/one-hour choices. Use a supported public asset provider when permanent public URLs are required.

[Shared editor and actual acceptance](../plans/frontbase-deployment-shared-bindings-20261020.md).

## Reviewed Vercel profile execution

Build the workspace, connect a supported state database to the intended Vercel project/environment, and sign in with Vercel CLI. For a new environment in a project with an existing host deployment (the verified CLI can auto-assign a brand-new project's first deployment to production, so the guarded flow refuses an empty-history preview before writes):

```sh
pnpm run deploy:setup -- --target vercel --environment preview --deploy --project my-new-frontbase --scope team_YOUR_TEAM_ID --intent create
```

The shared review lists Turso resources connected to this exact project/environment. One eligible resource is preselected; multiple resources require an explicit selection. Marketplace terms and resource provisioning are handled by Vercel with separate user approval; this command does not silently create or upgrade a resource. Marketplace credentials stay at Vercel. Alternatively configure an implemented HTTP state adapter with its referenced keys in the private local review.

The explicit production environment is also supported. Real applications should isolate preview and production data; the disposable acceptance project intentionally shared test data. Production deployment/credential injection requires authorization for that environment. For an installation created by this managed launcher, repeat the exact project/team/environment with `--intent redeploy`. Keep `.frontbase/vercel/<team>/<environment>/<project>/deployment.json`: it is a nonsecret operation journal, not a backup or provider-side lock. Older installations without this receipt are not automatically enrolled. The original live project predates this wrapper. A separate [fresh-state CLI test](../plans/frontbase-deployment-vercel-fresh-20261020.md) now verifies real journal recovery, first-admin setup/publication and ordinary managed-command preservation. This does not certify a brand-new first-project preview.

State migration and unsupported binding changes are refused before host writes. Supported Vercel HTTP cache/vector/queue and selected-bucket S3 storage bindings may be added, replaced or disabled in the local review on a successful managed installation. Disabled bindings explicitly replace old host configuration and suppress legacy cache/queue fallback credentials; separately adopted tenant defaults retain precedence. Drain pending queue deliveries before changing its provider or disabling it. A failed/prepared journal permits only the same desired plan to be retried until reconciled; there is no automatic rollback of partial host environment writes. [Implementation and verification boundary](../plans/frontbase-deployment-optional-bindings-20261021.md). Running-app Bindings review remains proposal-only. The low-level deployment script supports explicit `--setup-link` recovery on redeploy without session-key rotation; the managed review command now exposes it as `--intent redeploy --setup-link`, requiring the existing journal and exact target. It preserves the session key and does not bypass existing-administrator setup lockout. For optional S3-compatible storage, select S3 in the local review, provide the HTTPS origin, existing bucket, region and referenced keys. The deployed Storage page shows a deployment-managed provider with a private logical files bucket, isolated by Vercel project/environment and tenant. Physical bucket management, existing-object import and permanent public assets are excluded. Explicitly disabling storage suppresses legacy STORAGE_* credentials. [Storage implementation and verification limits](../plans/frontbase-deployment-s3-storage-20261021.md); real external-provider acceptance is still credential-gated. HTTP cache/vector/queue mappings are fixture-tested; their general live-provider acceptance is separate.

[Actual preview/production, original-session/data preservation, verification and remaining work](../plans/frontbase-deployment-vercel-live-20261020.md).

The deploy script verifies the actual provider target, READY state, project and team before issuing success or a setup link. Requested flags and alias URLs alone are not proof. Brand-new projects must start with an explicitly authorized production deployment or another separately verified provider bootstrap path; a first-project preview is currently refused. Uploads use Vercel's documented tgz mode, excluding local credential files, journals, tool state and regenerated outputs while retaining source, manifests, build scripts and the canonical API entry. This does not guarantee a reliable network or replace deployment-outcome reconciliation after transport errors.

If local transport or a process fails, reconcile provider deployment history and the nonsecret journal before replaying. A stale lock is retained: establish that both its owner and the owned deploy child ended and reconcile any remote outcome before removing that exact dead lock. `--setup-link` does not provide automatic unknown-outcome recovery, a database migration, a credential export or a distributed lock. Keep its generated capability private.

## Reconcile a known Vercel deployment without replay

New managed attempts include an operation ID and reviewed-plan digest in their local receipt and deployment metadata. If upload completed but local acknowledgement failed, use the same journal and explicit target with `--intent resume --deployment https://EXACT_DEPLOYMENT.vercel.app`. Keep `--deploy` to select the managed CLI mode; resume itself performs only remote metadata reads and updates verified local bookkeeping. It accepts no proposal or setup renewal, requires exactly one matching READY canonical deployment and does not upload or change environment values. Legacy unmarked records, ambiguous operations and unknown in-flight outcomes remain manual reconciliation boundaries. [Commands, guarantees and evidence](../plans/frontbase-deployment-vercel-reconciliation-20261021.md).


## Roll back code with explicit state checks

A provider code rollback changes the deployed build/version and possibly its captured configuration; it does not restore the application database, object storage, queued work or later project environment edits. Inspect exact target/team/project/readiness and predecessor state/schema compatibility before switching. Verify the current session, saved pages and published content after the switch, and retain the original canonical candidate for restoration. An uncertain provider result requires read-only inspection before another write. Do not automatically delete resources, restore old secrets or replay jobs.

The existing managed journal remains a separate truth boundary: Vercel resume verifies recorded upload completion, not the current production alias; out-of-band CF version/deployment changes can trigger managed drift refusal. Do not overwrite the journal to force adoption. [Actual bounded Vercel rollback/restore, failure matrix and remaining native/provider gates](../plans/frontbase-deployment-provider-failure-20261021.md).
