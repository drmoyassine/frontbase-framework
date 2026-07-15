# CF-22 Incident Report — Legacy Console Exposed by First-Admin Setup

**Incident date:** 2026-07-16
**Status:** Remediated and behavior validated; follow-up acceptance and API retirement remain open
**Affected deployment:** `cf-full` on Cloudflare Workers
**Severity:** High functional/UX impact; no confirmed data loss, cross-tenant access, or credential disclosure
**Related work:** CF-22 P3 console cutover and secure first-admin onboarding

## Executive summary

After the first administrator was created through the secure setup link, the
browser remained under `/setup` and navigated to `/setup#/dashboard`. That screen
was the framework's retired pre-CF-22 admin SPA and included master-admin Tenants
and Plans navigation. Logging out stayed in the same artifact at `/setup#/login`.

The intended CF-22 console was separately available at
`/frontbase-admin/dashboard`. Opening `/frontbase-admin`, logging in with the same
administrator, and navigating the product console produced the expected community
self-host experience.

This created the appearance that the default deployment command had deployed the
multi-tenant product edition. It had not. The Worker was serving two browser SPAs:
the correct pinned product community console and the old framework console that
had been retained wholesale only to reuse its setup screen.

The remediation converts the retained artifact into a setup-only SPA, authenticates
the new administrator through the product-compatible auth endpoint, and leaves
`/setup` for `/frontbase-admin/dashboard`. The Worker also redirects initialized
visits to `/setup` before loading the setup asset. Artifact and Worker smoke checks
now prevent the retired dashboard from reappearing.

## User-visible impact

- The first post-deploy experience landed in the wrong dashboard.
- A community single-tenant deployment appeared to expose multi-tenant Tenants and
  Plans administration.
- The old dashboard was materially less complete than the product console, making
  CF-22 visual parity appear unsuccessful.
- Logout from the wrong dashboard returned to a second login screen under `/setup`.
- Administrators could unknowingly continue using legacy `/api/console/*` workflows
  instead of the CF-22 `/api/*` compatibility surface.

No evidence was found that this caused cross-tenant data access. The affected
deployment used its own D1 database, and the product cloud backend was not present.
The setup claim remained in the URL fragment, was removed from browser history,
and was exchanged for the scoped HttpOnly setup cookie as designed.

## Detection

The issue was found during the first real Cloudflare deployment and reported with
two screenshots:

1. `/setup#/dashboard` showed the older framework dashboard with Admin Tools,
   Tenants, and Plans.
2. `/frontbase-admin/dashboard` showed the intended product community console.

The contrast established that this was not a styling difference inside one SPA.
The address bar and independent login/logout behavior proved that two routers and
two browser artifacts were reachable.

## Technical findings

### Two browser applications were deployed

| Surface | Artifact | Intended role | State before remediation |
|---|---|---|---|
| `/frontbase-admin/*` | Pinned product `build:community` bundle | Sole CF-22 admin console | Correct |
| `/setup` + hash routes | `@frontbase/admin-console` bundle staged as `/frontbase-setup/spa.js` | First-admin setup only | Incorrectly contained the full legacy console |

The setup artifact still used `HashRouter` and registered `/dashboard`, `/login`,
`/tenants`, `/plans`, and the other old dashboard routes. After account creation,
the setup component called its legacy login action and used
`navigate('/dashboard')`. Because the router lived inside the `/setup` document,
that became `/setup#/dashboard`.

The seeded administrator has the `master_admin` role. The legacy sidebar used that
role to display Tenants and Plans, which made the wrong SPA look like a deliberate
multi-tenant deployment.

### Two API namespaces remain, but they were not the direct routing cause

P3 intentionally retained the old console API during parallel run:

| Namespace | Consumer / purpose | Current decision |
|---|---|---|
| `/api/*` | Product community console at `/frontbase-admin` | Retain; this is the CF-22 target surface |
| `/api/console/setup/*` | Secure first-admin status, claim exchange, and account creation | Retain until setup is moved behind a dedicated stable namespace |
| Other `/api/console/*` | Legacy parallel-run services | Do not remove without endpoint-consumer proof |

Therefore the incident included a duplicate UI and a parallel service layer, but
the wrong post-setup dashboard was caused by the setup artifact and its internal
navigation. Removing endpoints blindly would not have fixed that routing bug and
could have broken the correct product console or setup control plane.

## Root cause

P3 reused the entire legacy admin-console build to obtain one setup page. The build
and Worker routing treated that artifact as a setup dependency, but its entry point
still imported and exposed the complete old dashboard. Successful setup navigated
within that artifact instead of crossing the application boundary to the pinned
product console.

## Contributing factors

- The P3 cutover deliberately kept `/api/console/*` in parallel, which made the
  retained full legacy SPA appear operational rather than fail immediately.
- The integration smoke verified that `/setup` rendered, but did not prove the
  browser destination after first-admin creation.
- No artifact-content gate asserted that the setup JavaScript excluded legacy
  dashboard routes and labels.
- The master-admin role was correctly needed for product administration but also
  activated cloud-like navigation in the legacy UI.
- D5 UI retirement was described as pending stabilization, allowing the obsolete
  browser surface to remain reachable after the product console cutover.

## Corrective actions completed

1. Replaced the deployed legacy console entry with a setup-only `App` that imports
   only setup status and the setup screen.
2. Removed `HashRouter` from the setup entry. URL fragments now carry only the
   one-time claim; the artifact has no dashboard or login routes.
3. Changed successful setup to authenticate through `/api/auth/login` and use a
   full navigation to `/frontbase-admin/dashboard`.
4. Added a safe fallback to `/frontbase-admin/login` if automatic login fails after
   the account has already been created and setup has locked.
5. Changed the Worker so initialized requests to `/setup` return a `302` to
   `/frontbase-admin/dashboard`. Old `#/dashboard` and `#/login` bookmarks cannot
   reload the retired UI.
6. Added an artifact gate proving the setup JavaScript excludes Admin Tools,
   Tenants Table, Subscription Plans, `#/dashboard`, and `#/login` markers.
7. Added Worker smoke coverage for the initialized setup redirect and the
   setup-only artifact handoff.
8. Preserved `/api/*`, `/api/console/setup/*`, and the remaining parallel-run API
   routes pending a consumer audit.

## Current state

- The product community console at `/frontbase-admin` is the sole reachable
  dashboard.
- Fresh deployments still receive the short-lived fragment capability link and
  WordPress-style first-admin form.
- Successful setup creates the administrator, establishes the normal product
  session cookie, and lands at `/frontbase-admin/dashboard`.
- Initialized `/setup` requests redirect server-side to the product dashboard.
- The legacy dashboard source files remain in the repository temporarily, but they
  are not reachable from or included in the emitted setup bundle.
- Legacy API routes remain available only as a deliberate parallel-run state; no
  endpoint retirement was performed during this incident response.

## Verification evidence

- `@frontbase/admin-console` TypeScript check: pass.
- Browser/server no-leak and setup-artifact test: pass.
- Admin-console mutation proof: pass, 1/1 gate proven red when violated.
- `cf-full` integration smoke: pass, 21/21 checks.
- Secure setup claim exchange and concurrent first-admin guard: pass in backend
  setup tests from this recovery set.
- Worker bundle: 233.8 KB gzip, below the 1 MB limit.
- Repository whitespace/error check: `git diff --check` pass.
- The owner confirmed the corrected behavior before this incident was closed.

## Recommended next work session

The next session should complete these steps in order:

1. **Browser acceptance tests.** Add Playwright coverage for fresh setup, automatic
   product login, logout, refresh/session restoration, stale `/setup` bookmarks,
   and all 11 `/frontbase-admin` navigation areas.
2. **Endpoint-consumer map.** Record every endpoint called by the emitted product
   console and by first-admin setup, including method, path, response shape, auth
   rule, and owning test.
3. **Evidence-based legacy API retirement.** Retain `/api/console/setup/*`; remove or
   deprecate other `/api/console/*` routes only after the consumer map and browser
   suite prove they are unused. Add explicit `404`/`410` retirement assertions.
4. **Close functional gaps.** Fix every response-shape, persistence, authorization,
   tenant-isolation, or provider failure found by the browser and endpoint audits.
5. **Reviewable delivery.** Split follow-up work into focused commits, rerun the
   complete affected verification matrix, and update the P3 delivery and P0–P3
   audit reports with browser evidence and the final API-retirement decision.

## Non-goals and deferred decisions

- This incident does not introduce a `--multi-tenant` deployment flag. The CF-22
  Worker implements the community contract; a real private multi-tenant deployment
  requires the complete cloud contract and tenant-isolation acceptance tests.
- This incident does not delete legacy service routes based only on their names or
  association with the old UI.
- This incident does not declare CF-22 complete. The parent browser, real-deployment,
  scheduled drift, API-retirement, and owner-acceptance gates remain authoritative.
