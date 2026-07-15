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
POST /api/auth/login       product-compatible login → fb_session cookie
GET  /api/auth/me          product-compatible current user
GET  /api/console/health   public
POST /api/console/login    email + password → fb_session cookie
GET  /api/console/me        401 without the cookie (default-deny)
POST /api/console/publish/:slug  … the rest of the console (login-gated)
```

## What deploys

`build.mjs` pre-bundles the workspace packages into `dist/worker.mjs`
(about **233 KB gzip**, under CF's 1 MB limit), with the service-worker bundle
inlined and `wrangler.toml` set to `no_bundle = true`. The product console stays
outside the Worker under `console-dist/frontbase-admin/` and Wrangler uploads it
through the `ASSETS` binding. The request path is pure Web-standard (Web Crypto for
PBKDF2 + the HS256 session JWT; the D1 binding for storage) — **no** `nodejs_compat`.

Optional AI / Postgres / queue SDKs are dynamic-imported behind feature executors
a basic D1 CMS never invokes; they're mapped to a throwing stub so the artifact is
self-contained and using one of those features fails with a clear message.

## Prove it before you deploy

```bash
pnpm --filter @frontbase/example-cf-full smoke
```

Boots the **same** worker in-process over an in-memory SQLite runner (only the D1
binding is swapped) and exercises the public pages, the SW handover, and the full
login gate: default-deny → login → authenticated `/me` → wrong-password 401 →
idempotent re-seed.

## Deploy (your machine — needs a Cloudflare account)

```bash
# 0. Fetch the product console and build the artifact
pnpm run fetch:console -- --product-dir ../Frontbase-
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
curl -i https://<your-worker>.workers.dev/api/console/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'
# → 200 + Set-Cookie: fb_session=…
```

The product console itself uses `/api/auth/login` and is available at
`https://<your-worker>.workers.dev/frontbase-admin`.
