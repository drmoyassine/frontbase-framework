# Self-Hosting Without Cloudflare (Docker / Node)

The deployable CMS in `examples/cf-full` runs as a **single backendless
container** — the exact same Hono engine the Cloudflare Worker runs, mounted by
`src/node.ts` with three host swaps and nothing else:

| Concern | Cloudflare Worker | Node / Docker |
|---|---|---|
| App database | D1 binding | `sqliteRunner` over a `file:` URL (default `/data/app.db` on a volume) |
| Console + static assets | Workers Static Assets binding | Disk-backed ASSETS shim over `console-dist/` (same binding contract, ETag/304 included) |
| Background tasks | `ctx.waitUntil` | Fire-and-forget dispatcher (failures logged, never crash the process) |

Schema migrations self-apply at every boot (`migrateUp`), the homepage template
seeds once, and `ADMIN_*` seeds are idempotent — existing users are never
reseeded, so restarts are safe.

There is no second process, no Python, no Redis: **backendless by design**.
Generic Postgres/MySQL as the *app* database remains a documented unclosable
constraint ([docs/known-limitation-postgres-mysql.md](../known-limitation-postgres-mysql.md)) —
sqlite on a volume is the design, not a compromise. (Datasources your pages
query — Supabase, Neon, HTTP-flavored libsql — connect exactly as on Workers.)

## Prerequisites

- Docker (any recent Docker Desktop / Engine), **or** Node ≥ 22.19 for bare metal.
  Use the pinned pnpm10.15.1. The Docker image uses the maintained Node22 line.
- Nothing pre-built: the console + hydration artifacts are staged from this
  repo's own source (`packages/console` + `packages/hydrate` — never committed)
  **inside the image build**, so a clean checkout (git archive, CI, a VPS)
  builds as-is.

`pnpm -r build` → examples/cf-full's `build.mjs` stages
`examples/cf-full/console-dist/` (self-healing a missing stage on a fresh
clone) and copies the hydration bundle from `packages/hydrate/dist` to
`console-dist/react/`. After the build, `scripts/docker-gate.mjs` verifies the
staged tree — shell ↔ bundles agreement + hydration present — the same check
`scripts/deploy.mjs` runs post-build, so the image cannot ship a shell
pointing at 404s or dead client hydration. Pre-building locally
(`pnpm console:build && pnpm --filter @frontbase/example-cf-full build`) is
optional warm-up; the one case it still matters is refreshing a stale local
stage after `git pull` (see Upgrades).

## Run with Docker

```bash
cp .env.example .env        # repo root, next to docker-compose.yml (optional — SESSION_SECRET is recommended)
docker compose up -d --build
docker compose ps           # wait for (healthy)
```

Open `http://127.0.0.1:8787/frontbase-admin`. To skip the browser setup flow,
set `ADMIN_EMAIL` + `ADMIN_PASSWORD` in `.env` — the first administrator is
seeded at boot (idempotent; changing the values later does nothing).

All configuration is runtime environment (see `.env.example`):

Optional reset email requires an existing Resend key, an accepted sender and
`FRONTBASE_PUBLIC_ORIGIN` set to the canonical HTTPS origin. Compose forwards
these variables; [reset delivery](password-reset-delivery.md) documents the
correct self-host console link, opaque failure behavior and receipt check.
Do not infer a successful mail delivery from a forgot-password200 response.

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | recommended | Signs sessions AND derives the at-rest cipher for secret variables — see rotation below. When unset, a strong secret is generated on first boot and **persisted in the state DB** (`settings['_system']`), so sessions survive restarts; setting it explicitly keeps the at-rest cipher out of the database. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_DB_URL` | no | Default `file:/data/app.db`. Keep it on `/data` (the volume). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ROLE` | no | First-admin seed at boot; idempotent |
| `SETUP_TOKEN` / `SETUP_EXPIRES_AT` | no | Browser setup flow (alternative to seeding) |
| `FRONTBASE_PORT` | no | Host port (container always listens on 8787) |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` / `STORAGE_ENDPOINT` / `STORAGE_REGION` | no | S3-compatible file storage |
| `PORT` / `HOST` | no | Container-internal listen address (defaults 8787 / 0.0.0.0) |

Nothing secret is ever baked into the image; the build context
(`.dockerignore`) excludes `.dev.vars`, `.env`, and `*.secret`.

### Choose the app database

The state DB is pluggable on every host, resolved from the environment with a
fixed precedence (`APP_DB_URL` → D1-over-REST trio → host default). On Docker
the default is the volume-backed SQLite file; you can move it without touching
the container layout:

| Set this | State DB |
|---|---|
| *(nothing)* | **`file:/data/app.db`** — the Docker default, on the persisted volume |
| `APP_DB_URL=:memory:` | In-memory SQLite (ephemeral — testing only) |
| `APP_DB_URL=file:/data/app.db` | Same as the default (explicit) |
| `APP_DB_URL=libsql://…` + `APP_DB_AUTH_TOKEN` | Turso / self-hosted sqld over HRANA — the DB now lives outside the container |
| `APP_DB_D1_ACCOUNT_ID` + `APP_DB_D1_DATABASE_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare D1 over REST — D1 without Cloudflare-hosting the worker |

A HALF-configured set fails at boot naming the exact missing variable — never a
silent fallback. The system card (Edge Resources → Databases) always names the
RESOLVED backend, and `APP_DB_AUTH_TOKEN` (when you set one) never appears in
any label, card, or error message. Dialect limit: the app-DB menu is
SQLite-family — Postgres/MySQL app DBs remain the
[documented unclosable gap](../known-limitation-postgres-mysql.md).

## Run bare-metal (no Docker)

```bash
pnpm -F @frontbase/example-cf-full build
cd examples/cf-full
APP_DB_URL=file:./local.db PORT=8788 \
SESSION_SECRET=<hex> ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='<pw>' \
node dist/node.mjs
```

(`start:node` npm script wraps the last line.) The same artifact the container
runs — useful for quick iteration without a rebuild.

## Health, persistence, operations

- **Health probes:** `GET /health` runs a real `SELECT 1` against the app
  database (the image HEALTHCHECK uses it). `GET /api/console/health` is a
  static liveness 200. Do **not** use `/api/queue/health` — it reports
  `unhealthy` by design.
- **Persistence:** one sqlite file on the named volume `frontbase-data`
  (`/data/app.db`). Back up by stopping the container and copying the file —
  sqlite's single-file property makes this trivial. `docker compose down`
  keeps the volume; `down -v` destroys it.
- **Upgrades:** `git pull` → `pnpm install` → `pnpm console:build && pnpm
  --filter @frontbase/example-cf-full build` → `docker compose up -d --build`.
  Migrations apply automatically at boot.
- **Behind a reverse proxy:** the engine builds URLs from the request URL; pass
  `Host` through (nginx `proxy_set_header Host $host;`). `X-Forwarded-*` is not
  trusted by default — terminate TLS at the proxy and proxy plain HTTP, or host
  the container port directly.

### SESSION_SECRET rotation

Rotating `SESSION_SECRET` invalidates every session cookie **and** the at-rest
encryption of stored secret variables (the cipher is derived from it,
`packages/backend/src/index.ts`). After a rotation, sessions re-login and
previously stored secrets must be re-entered. Treat it as a break-glass
operation, not routine.

A boot-generated secret (no `SESSION_SECRET` set) is never rotated by the
system — it persists in the state DB and is reused verbatim. Setting an
explicit `SESSION_SECRET` later replaces it, with exactly the rotation
caveats above.

## Troubleshooting

- **Build fails at `docker-gate.mjs`** — the `pnpm -r build` step above it
  failed to stage a complete console artifact (this should be near-impossible:
  that step validates its own staging). Reproduce locally with `pnpm install
  && pnpm -r build`; if a stale local stage is the cause, `pnpm console:build`
  refreshes it.
- **Context upload errors on Windows (OneDrive paths)** — cloud-sync
  placeholders can break the context; build from a local (non-synced) clone.
- **`libsql` native module errors** — the runtime stage installs per-platform
  optional dependencies; build on the architecture you deploy (no multi-arch
  `buildx --platform a,b` without configuring pnpm `supportedArchitectures`).
- **First boot is slow to go healthy** — cold volume runs all migrations;
  `start_period=30s` covers it, extend on slow disks.

## Opt-in hosted setup (implementation preview, 2026-10-26)

The Node/Docker entry can start the shared Bindings wizard before opening an application database. Ordinary startup remains unchanged unless `FRONTBASE_BOOTSTRAP=1` is explicitly set. This mode is for a new installation, not changing the state database of an installed app.

Set these runtime variables through the operator's private environment file or secret manager:

- `FRONTBASE_BOOTSTRAP=1`.
- `FRONTBASE_PUBLIC_ORIGIN=https://your-host.example`: exact public origin. Terminate TLS at your reverse proxy and preserve its Host header. The app does not trust forwarded-host headers.
- `FRONTBASE_BOOTSTRAP_DIRECTORY=/data/bootstrap`: private directory on the persistent mounted volume, writable by the container's node user.
- `FRONTBASE_INSTALLATION_ID`: a fresh UUID, retained across restarts.
- `FRONTBASE_BOOTSTRAP_TOKEN`: a securely generated 32–256 character owner capability.
- `FRONTBASE_BOOTSTRAP_EXPIRES_AT`: a short-lived ISO timestamp.

Do not supply ADMIN_EMAIL/ADMIN_PASSWORD or an existing configured database for this flow. The image's default `file:/data/app.db` is allowed only when that file does not exist. An existing runtime configuration takes precedence on restart; an unavailable database never reopens setup.

Open `/frontbase-bootstrap/`, unlock with the owner capability, select adapters and enter their credentials, review, then apply. Docker defaults to SQLite on the mounted volume; the shared dropdowns also expose compatible HTTP providers such as Turso/libSQL and Upstash. External state must be empty. Application state lives at `/data/bootstrap/application.db` for the SQLite choice. Successful activation opens the existing administrator form, including password confirmation. No administrator password is collected by the bindings wizard.

The volume contains private `runtime.json` (0600 on Linux), the durable operation journal and, for SQLite, the application database. Back up and protect this volume as credential-bearing application state. Retain the bootstrap mode, installation ID, public origin and directory when restarting this installation. The owner capability can expire after activation. Changing volume/identity does not migrate data.

A failed or interrupted activation is recorded as uncertain and never automatically dispatched again. Preserve the volume; inspect/recover the recorded operation before any new attempt. A malformed/partial runtime file or failed configured startup fails closed. The initial administrator handoff capability is in the private runtime configuration if the browser response is lost; it expires after one hour. There is no new automatic credential-reset mechanism in this preview.

Acceptance covers the actual bundled Node server and a non-root Linux Docker container: no initial database, protected owner exchange, shared form assets, SQLite activation, existing setup handoff, private file permissions, mounted-volume restart and closed bootstrap. Existing Node login/create/publish/restart acceptance also passes. The test simulates TLS termination with the configured HTTPS origin; an external reverse-proxy/browser deployment and live external-provider credentials are not covered. Cloudflare/Vercel hosted executors and native-button replacement remain pending.
