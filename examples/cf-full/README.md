# Full CMS on one Cloudflare Worker (`cf-full`)

The Frontbase CMS — the eSSR engine (`@frontbase/edge-core`), the
login-gated admin console (`@frontbase/backend`), and a Cloudflare **D1** binding
(`@frontbase/edge-infra`) — deployed as one Worker plus Workers Static Assets.

Contrast [`cf-worker`](../cf-worker), which is the renderer only. This one has
identity, storage, and the console API.

```
GET  /                     public page, server-rendered on the edge
GET  /about                public page
GET  /sw.js                the browser engine (service-worker handover)
GET  /frontbase-admin      product community console
GET  /setup                first-admin setup only; initialized apps redirect to /frontbase-admin/dashboard
POST /api/auth/login       product-compatible login → frontbase_session cookie
GET  /api/auth/me          product-compatible current user
GET  /api/console/health   public
GET  /api/console/setup/*  retained first-run initialization surface
ANY  /api/console/*        410 Gone for every other legacy route
```

## What deploys

`build.mjs` pre-bundles the workspace packages into `dist/worker.mjs`
(about **233 KB gzip**, under CF's 1 MB limit), with the service-worker bundle
inlined and `wrangler.toml` set to `no_bundle = true`. The product console stays
outside the Worker under `console-dist/frontbase-admin/` and Wrangler uploads it
through the `ASSETS` binding. The request path is pure Web-standard (Web Crypto for
PBKDF2 + the HS256 session JWT; the D1 binding for storage) — **no** `nodejs_compat`.

Optional AI / queue / object-store SDKs are dynamic-imported behind feature
executors a basic D1 CMS never invokes; they're mapped to a throwing stub so the
artifact is self-contained and using one of those features fails with a clear
message. `@neondatabase/serverless` is bundled for real — the console's
edge-database connect/schema flows (Supabase/Neon Postgres) invoke it at runtime.

## Prove it before you deploy

```bash
pnpm --filter @frontbase/example-cf-full smoke
```

Boots the **same** worker in-process over an in-memory SQLite runner (only the D1
binding is swapped) and exercises the public pages, the SW handover, and the full
login gate: default-deny → login → authenticated `/me` → wrong-password 401 →
idempotent re-seed.

## Self-host (Docker, no Cloudflare)

The same engine also runs as one backendless Node container — sqlite file on a
volume, console from disk, no sidecars. The `Dockerfile` and
`docker-compose.yml` live at the **repo root** (the build needs the whole
workspace), so from the repo root:

```bash
pnpm console:build                                # stage the console from packages/console source (once)
pnpm --filter @frontbase/example-cf-full build    # stage the hydration bundle (console-dist/react) for the Docker gate
cp .env.example .env                              # set SESSION_SECRET (+ optional ADMIN_* seeds)
docker compose up -d --build                      # http://127.0.0.1:8787/frontbase-admin
```

Bare metal works too: `pnpm --filter @frontbase/example-cf-full build` then
`SESSION_SECRET=… node dist/node.mjs` (npm script `start:node`).
Full reference: [docs/guides/self-host-docker.md](../../docs/guides/self-host-docker.md).

## Deploy (your machine — needs a Cloudflare account)

```bash
# 0. Stage the console (from packages/console source) and build the artifact
pnpm console:build
pnpm --filter @frontbase/example-cf-full build

cd examples/cf-full
wrangler login

# 1. Create the D1 database and paste the printed database_id into wrangler.toml
wrangler d1 create frontbase-full-cms

# 2. Apply the schema to D1 (the worker also migrates idempotently on first boot)
#    — optional; first request will run migrations too.

# 3. Set secrets (NEVER put these in wrangler.toml or git) when deploying manually
wrangler secret put SESSION_SECRET     # 32+ random bytes, base64
wrangler secret put ADMIN_EMAIL        # seed the first product master admin…
wrangler secret put ADMIN_PASSWORD     # …idempotent, only if users table is empty
# Browser setup also needs SETUP_TOKEN + SETUP_EXPIRES_AT. Prefer the CLI below,
# which generates both safely and prints the one-time setup link.

# 4. Ship
wrangler deploy
```

Or let the CLI do steps 1 + 3 + 4 for you. A fresh deployment without seeded
credentials automatically prints a secure setup link that expires after 30 minutes:

```bash
pnpm run deploy:cf-full -- --app-name my-app
```

The link uses a URL fragment, which is removed immediately by the setup page and
never reaches Worker URL logs or referrers. It is exchanged for a 15-minute,
`HttpOnly; SameSite=Strict` setup cookie. After account creation the setup app
signs in at `/api/auth/login` and navigates to `/frontbase-admin/dashboard`.
The setup asset contains no legacy dashboard routes. If the link expires before use:

```bash
pnpm run deploy:cf-full -- --app-name my-app --setup-link
```

To bypass the browser wizard, seed the administrator during deployment:

```bash
pnpm run deploy:cf-full -- --app-name my-app \
  --admin-email you@example.com --admin-password '…'
```

Then log in:

```bash
curl -i https://<your-worker>.workers.dev/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'
# → 200 + Set-Cookie: frontbase_session=…
```

The product console itself uses `/api/auth/login` and is available at
`https://<your-worker>.workers.dev/frontbase-admin`.

---

## Deploy matrix (A-24): the same app on four hosts

This example is the deploy-matrix home. One Hono app, per-host entries in
`src/`, a pluggable SQLite-family state DB resolved by
[`src/state-db.ts`](src/state-db.ts):

| Host | Entry | Statics | Default state DB | Deploy |
|---|---|---|---|---|
| Cloudflare | `src/worker.ts` → `dist/worker.mjs` | Workers Static Assets | **D1 binding** | `pnpm run deploy:cf-full` (root) |
| Node/Docker | `src/node.ts` → `dist/node.mjs` | `src/assets-disk.ts` over `console-dist/` | **`file:/data/app.db`** | `docker compose up -d --build` |
| Vercel Edge | `src/vercel.ts` → `dist/vercel.mjs` ≡ `api/cms.mjs` | `vercel.json` CDN matrix | **Turso** (or D1-over-REST) | `pnpm run deploy:vercel -- --project <name>` |
| Deno Deploy | `src/deno.ts` → `deno-dist/deno.mjs` | disk shim over `deno-dist/console-dist/` | **Turso** (or D1-over-REST) | `pnpm run deploy:deno -- --project <name>` |

State-db precedence on every host: `APP_DB_URL` (Turso/`:memory:`/`file:`) → the
D1-over-REST trio (`APP_DB_D1_ACCOUNT_ID` + `APP_DB_D1_DATABASE_ID` +
`CLOUDFLARE_API_TOKEN`) → host default. A half-configured set fails at boot
naming the missing variable; credentials never appear on any system card or
error. The menu is SQLite-family by design — see A-24 in
[`docs/DECISIONS.md`](../../docs/DECISIONS.md).

### Route ownership (what the function owns vs. the static layer)

Function-owned on EVERY host (needs state or is a redirect): `/` and `/<slug>`
eSSR, `/api/*`, `/static/assets/:filename` (KV branding assets),
`/frontbase-admin` + SPA fallbacks (the `needsSetup` 302 must run server-side),
`/setup`, `/frontbase-setup/spa.js`, `/sw.js`, `/builder/client.js`, `/console`
(301). Static-owned: `/frontbase-admin/assets/*` (hashed, immutable),
`/static/react/*` (hydration bundle), `/static/icon.png`. On Cloudflare the
ASSETS binding serves them; on Vercel `vercel.json`'s rewrite phases translate
engine-emitted URLs onto the CDN tree; on Deno/Docker the disk shim serves them
from the deployed `console-dist/`.

### `deno-dist/` layout

The Deno deploy root is self-contained (deployctl ships this tree):
`deno.mjs` (byte-identical to `dist/deno.mjs`), `deno.json`
(`compilerOptions.lib: ["deno.window", "esnext"]`), and a fresh `console-dist/`
copy including the root `icon.png`. It is gitignored and rebuilt by
`node build.mjs`; the artifact gate
([`scripts/verify-host-artifact.mjs`](../../scripts/verify-host-artifact.mjs))
asserts the staged entry ≡ the dist entry before any deploy.
