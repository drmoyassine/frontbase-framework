# CF-22 P3 — Serve the Product Console from the Framework Worker

**Date:** 2026-07-15 · **Status:** ⚠️ LOCALLY INTEGRATED, ACCEPTANCE INCOMPLETE (P0–P2 dependencies and P3 field gates remain open)
**Repo:** framework `frontbase-framework` (`examples/cf-full`)
**Parent:** [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) §5c

> P3 integrates the product's REAL community console SPA with the framework's
> compat API surface in the cf-full worker. The worker now serves the product's
> built `/frontbase-admin/*` SPA, authenticates against the compat login route,
> and routes 285 compat operations plus the engine-owned root operation — in a
> single `wrangler deploy`.

> **End-to-end dependency warning:** P3 cannot close while P0's current contract
> artifacts are stale, the console (`bf1ac54…`) and contract (`afe9e03…`) pins
> differ, and P2 remains behaviorally/security incomplete. See
> [`cf-22-p0-p3-audit.md`](./cf-22-p0-p3-audit.md).

---

## 1. Headline

| Metric | Result |
|---|---|
| Console bundle | Product community SPA, fetched at build time (`fetch-console.mjs`) |
| API surface | 285 compat ops + engine-owned `GET /` + existing `/api/console/*` |
| Auth | `fb_session` JWT cookie via `/api/auth/login` → `/api/auth/me` (product shape) |
| SPA path | `/frontbase-admin` + `/frontbase-admin/*` (BrowserRouter basename) |
| Legacy redirect | `/console` → 301 → `/frontbase-admin` |
| Worker size | 233.8 KB gzip (PASS, < 1 MB limit; SPAs served as assets) |
| Smoke | **21/21** (eSSR + SW + assets/cache + setup-only handoff + secure first-admin setup + compat auth + pages CRUD + security guard) |
| Backend suite | **30/30** |

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
3. Compat app (285 registry-implemented product operations + `/health` + scoped guard)
4. Engine (published pages, `/sw.js`, `/api/console/*`)

### D2 — Console bundle acquisition (posture B: deploy-time fetch)

- `scripts/fetch-console.mjs`: builds the product's community SPA
  (`vite build --mode community` from a local product checkout) and copies
  `dist/` → `examples/cf-full/console-dist/`, writing a `CONSOLE_PIN`
  (product commit + JS sha256).
- `console-dist/` is gitignored except deterministic `CONSOLE_PIN` and `.assetsignore` — the framework repo stays
  clean of the commercial artifact. **Posture B confirmed:** switchable to
  fully-open (posture A) by un-ignoring the directory — one commit.
- The artifact is staged beneath `console-dist/frontbase-admin/` so its physical
  layout matches the product's `/frontbase-admin/*` Vite base. Wrangler Static
  Assets serves exact JS/CSS/image matches before the Worker; unmatched API,
  eSSR, service-worker, and SPA-navigation requests fall through to the Worker.
- `examples/cf-full/src/console-shell.ts` + `build.mjs` console-shell plugin:
  reads `console-dist/frontbase-admin/index.html` at build time and inlines it as the SPA shell
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

### D4 — Integration smoke (21/21; not the parent D4 Playwright suite)

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
cf-full smoke (21/21):
  ✅ eSSR root / SW / console redirect / SPA shell + fallback
  ✅ compat Meta health (unauth)
  ✅ compat auth login + me + security guard (RULE 2)
  ✅ compat pages CRUD round-trip
  ✅ old console health + me (parallel run)

backend suite: 30/30
drift gate: 285 implemented / 1 stubbed (GET / owned by engine) / 0 missing / 0 divergent
worker size: 233.8 KB gzip (< 1 MB limit)
```

---

### 4.1 Field finding: setup accidentally exposed the retired dashboard

The first real deployment revealed that two SPAs were reachable:

- `/frontbase-admin/*` served the pinned product community console (the CF-22 target).
- `/setup#/dashboard` and `/setup#/login` were routes inside the framework's old
  admin SPA, because P3 staged that entire SPA merely to reuse its setup screen.

This made a community deployment look multi-tenant immediately after first-admin
creation: the setup component logged in and navigated to its own legacy dashboard,
whose master-admin navigation included Tenants and Plans. Manually opening
`/frontbase-admin` reached the correct product console. The deployment was not
running the product cloud edition; the wrong post-setup SPA remained reachable.

The cleanup is deliberately limited to the browser artifact:

1. `@frontbase/admin-console` now emits a setup-only entry. It imports no legacy
   layout, login, dashboard, Tenants, Plans, or CRUD pages.
2. Setup authenticates through `/api/auth/login` and hard-navigates to
   `/frontbase-admin/dashboard` on success (or `/frontbase-admin/login` if the
   automatic login unexpectedly fails after account creation).
3. Once an admin exists, the Worker redirects `/setup` to
   `/frontbase-admin/dashboard` before loading the setup asset. Old hash bookmarks
   therefore cannot resurrect the retired UI.
4. The artifact gate fails if the staged setup JavaScript contains legacy Admin
   Tools/Tenants/Plans markers, and the Worker smoke verifies the redirect.

No backend route was removed in this cleanup. `/api/*` remains the product console
surface. `/api/console/setup/*` remains the first-run control plane. Other
`/api/console/*` routes remain temporarily for the documented parallel-run/API
retirement phase; their presence no longer creates a second deployed dashboard.

## 5. Remaining acceptance work

1. **E2E (Playwright) — blocking the original P3 exit criteria.** D4 in the spec
   calls for 11 specs (one per nav area) against a real `wrangler dev`. The smoke
   proves routing, artifact presence, auth, and one CRUD chain; it does not prove
   that every rendered product area works with the compat response shapes.
2. **Real deployment E2E.** Add an acceptance check against `wrangler dev` that
   loads a hashed JS/CSS asset and completes browser login/navigation. The smoke
   now verifies that the HTML references a real staged bundle, but it does not
   emulate Cloudflare's asset router.
3. **Re-sync when the product ships new endpoints.** `pnpm contracts:sync` →
   `contracts:emit` → `contracts:diff` surfaces new ops as stubs; implement them
   to close the burn-down.
4. **Product `op_responses.py` refactor.** The parallel session's schema refactor
   will change the vendored spec; re-vendor + adjust the compat handlers to match
   the new shapes.

---

## 6. Parent-spec reconciliation

This section is authoritative over the original implementer recap. A checked
implementation item is not the same as a completed P3 exit criterion.

| Parent item | Current state | Evidence / remaining gate |
|---|---|---|
| D1 Static Assets | ✅ Implemented after audit | `ASSETS` binding, `run_worker_first = true`, Worker-owned routing, immutable hashed assets, `index.html: no-cache` |
| D2 artifact pipeline | ✅ Implemented after audit | Product `npm run build:community`; base-path, pin format, file list, and aggregate SHA-256 validation; stale artifact cleanup; CI pin-format gate |
| D3 auth + first run | ✅ Implemented after audit | `fb_session`; master-admin default for seeded product admin; fresh no-admin deploys generate a 30-minute `/setup#/setup?claim=…` capability link; the setup-only UI removes the claim, exchanges it for a 15-minute HttpOnly setup cookie, creates the admin, signs in through `/api/auth/login`, and leaves for `/frontbase-admin/dashboard`; setup then locks permanently |
| D4 Playwright 11 areas | ❌ Open / blocking | No `test:e2e`, 11-area suite, screenshots job, or real-data browser proof yet |
| D5 cutover + retirement | ⚠️ Partial | `/console` redirects and the setup artifact is setup-only, so the product console is the sole reachable dashboard. Legacy `/api/console/*` retirement remains gated on endpoint-consumer proof and D4 + real-CF sign-off. |
| D6 scheduled drift | ❌ Open / blocking | Current CI detects drift against the vendored contract, but no scheduled job can re-vendor from the product repository without an explicit repository/ref and CI credential |
| Exit 1 real fresh deploy | ❌ Not evidenced | Wrangler packaging is green; a fresh deployed login/render was not performed in this audit |
| Exit 2 Playwright 11/11 | ❌ Not met | See D4 |
| Exit 3 size + caching | ✅ Locally verified | Worker remains below 1 MB gzip; hashed assets receive one-year immutable caching |
| Exit 4 committed pins | ⚠️ Pending commit | Console and contract pins exist and validate; the audit changes are not a commit by themselves |
| Exit 5 redirect + retirement | ⚠️ Partial by design | UI redirect/cutover is live and duplicate dashboard routes are gone; legacy API retirement is gated on D4, consumer mapping, and field sign-off |
| Exit 6 owner sign-off | ❌ Not met | Must be supplied by the owner after the real deployment field test |

Therefore the implementer statement “CF-22 P3 — delivered” and the aggregate
“CF-22 in full” conclusion were premature. The routing work was real, but smoke
21/21 and contract conformance do not substitute for the P3 browser, deployment,
drift-schedule, and owner-acceptance criteria in the parent plan.
