# Legacy `/api/console/*` consumer map and retirement record

**Production target:** `examples/cf-full`  
**Retirement rule:** retain health and first-run setup; return explicit
`410 Gone` for every other legacy path and HTTP method.

## Executable consumers

| Consumer/artifact | Observed route(s) | Production disposition |
|---|---|---|
| Pinned product console at `/frontbase-admin` | No `/api/console` string in the staged JS/HTML; it calls product-compatible `/api/*` routes | No legacy dependency |
| Setup-only `@frontbase/admin-console` source and staged `/frontbase-setup/spa.js` | `/api/console/setup`, `/setup/status`, `/setup/claim` only | Retained |
| Playwright local server readiness | `GET /api/console/health` | Retained |
| Deployment/fresh-boot smoke | health, setup claim/setup, retirement matrix | Retained calls stay live; all matrix legacy calls assert `410` |
| Browser acceptance | health, setup status, and retired root/auth/pages/unknown paths | Explicit `200`/`410` assertions |
| `examples/cf-full` production worker | Mounts `createConsole({ retireLegacyApi: true })` through the real `createEngine()` `/api/console` mount | Health/setup are registered first; catch-all returns `410` |

The setup package previously still contained unreferenced dashboard, builder,
automation, storage, tenant, user, and auth modules that called the legacy API.
Those dead source consumers and their unused dependencies were removed. Its API
client is now constrained to the `/api/console/setup` base rather than the
broader `/api/console` base.

## Reusable and historical references

- Backend unit tests continue to call non-retired `createConsole()` directly.
  This preserves backward-compatible library coverage and is not the production
  `examples/cf-full` mount.
- The compiler's older standalone scaffold template also uses the reusable
  console mode. It does not stage or serve the CF-22 product console and is not
  the `examples/cf-full` production target. It is recorded here so it cannot be
  mistaken for a hidden product-console dependency.
- Historical architecture, sprint, audit, and delivery reports describe the
  pre-CF-22 console. They are retained as historical records, not current
  deployment instructions.
- Current deployment documentation (`README.md`, `docs/STACK.md`,
  `docs/PACKAGE-STRUCTURE.md`, `docs/guides/console-and-deploy.md`, and the
  cf-full README) now describes the retired production surface.

No test-only production routes are injected. The smoke suite creates the real
`createCmsEngine()` composition; the backend retirement test uses the real
`createEngine()` mount point.

## Endpoint disposition

| Route family | Production result |
|---|---|
| `GET /api/console/health` | `200 OK`, unauthenticated liveness |
| `GET /api/console/setup/status` | `200 OK` |
| `POST /api/console/setup/claim` | Retained capability exchange |
| `POST /api/console/setup` | Retained, capability-gated, single-winner first-admin creation |
| `POST /api/console/setup/db` | Retained, capability-gated, first-run only |
| `/api/console` and `/api/console/` | `410 Gone` |
| Legacy auth, pages, drafts, publish, projects, data, storage, resources, plans, settings, variables, tenants, and users | `410 Gone` |
| Any unknown `/api/console/*` path or method | `410 Gone` |

## Verification inventory

- `packages/backend/test/console-retirement.mjs`: real engine mount; retained
  health/setup; retired root/login/pages/write/unknown routes; explicit response.
- `examples/cf-full/src/smoke.ts`: full production composition, including the
  compat-before-engine order; retained setup/health and a multi-method `410`
  matrix.
- `examples/cf-full/e2e/console.spec.ts`: real Worker/browser gate for retained
  and retired paths.
- `packages/admin-console/test/no-leak.mjs`: setup bundle remains browser-safe
  and contains no retired dashboard UI.

