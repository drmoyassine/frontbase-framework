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
constraint ([docs/unclosable-postgres-mysql-parity.md](../unclosable-postgres-mysql-parity.md)) —
sqlite on a volume is the design, not a compromise. (Datasources your pages
query — Supabase, Neon, HTTP-flavored libsql — connect exactly as on Workers.)

## Prerequisites

- Docker (any recent Docker Desktop / Engine), **or** Node ≥ 20 for bare metal.
- A product checkout for the console artifacts (posture B — the product SPA
  bundles and hydration vendor are never committed):

  ```bash
  pnpm install
  pnpm run fetch:console -- --product-dir ../Frontbase-
  ```

  This stages `examples/cf-full/console-dist/` (hash-matched to the committed
  `CONSOLE_PIN`) and `examples/cf-full/public/react/hydrate.vendor.js`. The
  Docker build runs `scripts/docker-gate.mjs` FIRST and fails fast with the
  remedy if either is missing — a missing vendor would otherwise silently skip
  `patch-hydrate.mjs` and ship dead client hydration.

## Run with Docker

```bash
cp .env.example .env        # repo root, next to docker-compose.yml — SESSION_SECRET is required
docker compose up -d --build
docker compose ps           # wait for (healthy)
```

Open `http://127.0.0.1:8787/frontbase-admin`. To skip the browser setup flow,
set `ADMIN_EMAIL` + `ADMIN_PASSWORD` in `.env` — the first administrator is
seeded at boot (idempotent; changing the values later does nothing).

All configuration is runtime environment (see `.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | **yes** | Signs sessions AND derives the at-rest cipher for secret variables — see rotation below. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_DB_URL` | no | Default `file:/data/app.db`. Keep it on `/data` (the volume). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_ROLE` | no | First-admin seed at boot; idempotent |
| `SETUP_TOKEN` / `SETUP_EXPIRES_AT` | no | Browser setup flow (alternative to seeding) |
| `FRONTBASE_PORT` | no | Host port (container always listens on 8787) |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` / `STORAGE_ENDPOINT` / `STORAGE_REGION` | no | S3-compatible file storage |
| `PORT` / `HOST` | no | Container-internal listen address (defaults 8787 / 0.0.0.0) |

Nothing secret is ever baked into the image; the build context
(`.dockerignore`) excludes `.dev.vars`, `.env`, and `*.secret`.

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
- **Upgrades:** `git pull` → `pnpm run fetch:console` (if the pin moved) →
  `docker compose up -d --build`. Migrations apply automatically at boot.
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

## Troubleshooting

- **Build fails at `docker-gate.mjs`** — run `pnpm run fetch:console` from a
  product checkout (see Prerequisites).
- **Context upload errors on Windows (OneDrive paths)** — cloud-sync
  placeholders can break the context; build from a local (non-synced) clone.
- **`libsql` native module errors** — the runtime stage installs per-platform
  optional dependencies; build on the architecture you deploy (no multi-arch
  `buildx --platform a,b` without configuring pnpm `supportedArchitectures`).
- **First boot is slow to go healthy** — cold volume runs all migrations;
  `start_period=30s` covers it, extend on slow disks.

## Future: FastAPI A/B parity stack (not built)

A longer-term goal (2026-08-21): a parallel compose that stands up the
product's own stack — FastAPI backend (pip), product edge, console, postgres/
redis — **next to** this container for side-by-side differential testing as the
framework moves toward being the contract source. The framework's Hono app
implements its own full API, so the two stacks are peers (two ports), never a
frontend/backend pair. Intentionally out of scope for now.
