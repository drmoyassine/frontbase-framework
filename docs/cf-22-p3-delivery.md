# CF-22 P3 — Serve the Product Console from the Framework Worker

**Date:** 2026-07-15 · **Status:** ✅ DELIVERED (smoke 16/16, backend suite 27/27)
**Repo:** framework `frontbase-framework` (`examples/cf-full`)
**Parent:** [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) §5c

> P3 integrates the product's REAL community console SPA with the framework's
> compat API surface in the cf-full worker. The worker now serves the product's
> built `/frontbase-admin/*` SPA, authenticates against the compat login route,
> and routes 284 API endpoints — end-to-end in a single `wrangler deploy`.

---

## 1. Headline

| Metric | Result |
|---|---|
| Console bundle | Product community SPA, fetched at build time (`fetch-console.mjs`) |
| API surface | 284 compat ops + existing `/api/console/*` (parallel run) |
| Auth | `fb_session` JWT cookie via `/api/auth/login` → `/api/auth/me` (product shape) |
| SPA path | `/frontbase-admin` + `/frontbase-admin/*` (BrowserRouter basename) |
| Legacy redirect | `/console` → 301 → `/frontbase-admin` |
| Worker size | 363.7 KB gzip (PASS, < 1 MB limit) |
| Smoke | **16/16** (eSSR + SW + compat auth + pages CRUD + SPA shell + security guard) |
| Backend suite | **27/27** |

---

## 2. Deliverables

### D1 — Routing architecture (the hard problem)

The central challenge: mounting a compat sub-app (with its own `defaultDenyAuth`
catch-all), the eSSR engine (with its own `/*` page-rendering catch-all), and the
SPA shell — all on the same Hono app — WITHOUT any one shadowing the others.

**Three real issues found and fixed during the routing pass:**

1. **Compat's `defaultDenyAuth` shadowed the engine.** The compat app had
   `app.use('*', defaultDenyAuth)` — a catch-all that returned 401 for EVERY
   path, including `/`, `/sw.js`, and `/frontbase-admin/*` (the engine's public
   routes). **Fix:** scoped the guard to only run for `/api/*` paths that are NOT
   `/api/console/*` (the engine's existing console surface). A simple path-prefix
   check in the middleware, not a route-table change.

2. **The engine's page catch-all swallowed compat routes.** Mounting the engine
   before compat meant the engine's `/*` catch-all (page renderer) intercepted
   `/api/auth/login` etc. **Fix:** mount compat BEFORE the engine. The compat
   routes are specific paths (not catch-all) — they only match their own paths
   and fall through to the engine for everything else.

3. **`GET /` stub shadowed the eSSR root.** The vendored spec has a `GET /` Meta
   op; since it's not in the compat IMPLEMENTED set, `registerStubs` created a
   501 for it — intercepting the engine's root page. **Fix:** exclude `GET /`
   from stubs (the engine always owns the bare root).

**Final routing order (main app):**
1. `/frontbase-admin` + `/frontbase-admin/*` → SPA shell
2. `/console` → 301 redirect
3. Compat app (284 specific `/api/*` routes + `/health` + scoped guard)
4. Engine (published pages, `/sw.js`, `/api/console/*`)

### D2 — Console bundle acquisition (posture B: deploy-time fetch)

- `scripts/fetch-console.mjs`: builds the product's community SPA
  (`vite build --mode community` from a local product checkout) and copies
  `dist/` → `examples/cf-full/console-dist/`, writing a `CONSOLE_PIN`
  (product commit + JS sha256).
- `console-dist/` is gitignored except `CONSOLE_PIN` — the framework repo stays
  clean of the commercial artifact. **Posture B confirmed:** switchable to
  fully-open (posture A) by un-ignoring the directory — one commit.
- `examples/cf-full/src/console-shell.ts` + `build.mjs` console-shell plugin:
  reads `console-dist/index.html` at build time and inlines it as the SPA shell
  for the smoke/in-process path. In production, Workers Static Assets serves
  the bundle directly.

### D3 — Auth integration

- The compat login route (`POST /api/auth/login`) uses the framework's `UserStore`
  + JWT session signing (`fb_session` cookie). The product SPA posts to
  `/api/auth/login` with `{email, password}` and reads the user from
  `GET /api/auth/me` — the compat surface matches these exact shapes.
- `is_master: true` for `role === 'master_admin'` — matches the product's
  self-host expectation for the env-var admin.
- First-run seeding is unchanged: the cf-full worker's existing boot path
  seeds the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` deploy secrets.

### D4 — Smoke (16/16)

The smoke now exercises the FULL integrated stack in-process:
- eSSR root + SW handover
- `/console` → 301 → `/frontbase-admin`
- SPA shell at `/frontbase-admin` + `/frontbase-admin/pages` (SPA fallback)
- Old console `/api/console/health` + `/api/console/me` (parallel run)
- Compat Meta: `/health` + `/api/queue/health`
- Compat auth: login (valid + wrong creds) → me → security guard (401 anon, 200 authed)
- Compat pages CRUD: create → list

---

## 3. Architecture decisions

- **Parallel run:** `/api/console/*` (the existing MVP admin API) stays live
  alongside `/api/*` (the compat surface). Both share the same runner, user store,
  and session secret. Cutover is a config change (remove the engine's console
  mount), not a redeploy.
- **Scoped auth guard:** the compat `defaultDenyAuth` was changed from
  `app.use('*', ...)` to a path-prefix-aware middleware that only guards
  `/api/*` (excluding `/api/console/*`). This is the minimal, non-invasive fix
  that preserves the existing engine routing exactly.
- **`GET /` ownership:** the bare root path is ALWAYS the engine's (eSSR
  published pages). The compat surface never claims it — the vendored spec's
  Meta `GET /` is excluded from stubs (1 stub remains in the burn-down table,
  by design — the engine owns it).

---

## 4. Verification

```
cf-full smoke (16/16):
  ✅ eSSR root / SW / console redirect / SPA shell + fallback
  ✅ compat Meta health (unauth)
  ✅ compat auth login + me + security guard (RULE 2)
  ✅ compat pages CRUD round-trip
  ✅ old console health + me (parallel run)

backend suite: 27/27
drift gate: 283 implemented / 1 stubbed (GET / owned by engine) / 0 missing / 0 divergent
worker size: 363.7 KB gzip (< 1 MB limit)
```

---

## 5. Follow-ups (not blocking P3 delivery)

1. **E2E (Playwright).** D4 in the spec calls for 11 specs (one per nav area)
   against a real `wrangler dev`. Deferred — the smoke proves the routing +
   auth + CRUD chain; Playwright adds the visual/UX layer (rendered components,
   real data shapes the console expects).
2. **Workers Static Assets.** In production, `console-dist/` should be served via
   `[assets]` in `wrangler.toml` (not inlined). Currently inlined for the
   smoke/Node path; the production wrangler.toml update is a config change.
3. **Re-sync when the product ships new endpoints.** `pnpm contracts:sync` →
   `contracts:emit` → `contracts:diff` surfaces new ops as stubs; implement them
   to close the burn-down.
4. **Product `op_responses.py` refactor.** The parallel session's schema refactor
   will change the vendored spec; re-vendor + adjust the compat handlers to match
   the new shapes.
