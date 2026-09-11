# Frontbase Cloud paid launch

**Updated:** 2026-09-11
**Status:** Deployed signup/login, community-edge topology and checkout/portal APIs verified; CL-0–CL-5 code-verified complete (2026-09-11 gate refresh). Live paid checkout completion, the deployed browser journey (CL-6) and operations acceptance (CL-7) remain open.
**Owner direction:** [A-26](history/DECISIONS.md#decision-a-26-paid-cloud-launch-from-the-framework-with-supabase).
**Recommended release label:** Frontbase Cloud paid beta, only after the gates below pass. Framework npm/public release remains a separate developer-preview candidate under R0-R4.

## Confirmed requirements

Launch from this framework repository; do not return to FastAPI. Supabase Cloud owns application PostgreSQL state and tenant authentication. Reuse the existing Stripe account and plan catalog. There is no existing customer data to migrate. Keep the one-engine model and six reusable package boundaries. The original product is read-only implementation evidence. CF-22 is not reopened as a general parity sprint.

No new paid plan, price, entitlement, or fallback identity provider is approved by inference. The catalog must be inspected before selecting which paid capabilities need implementation. Billing and Supabase are now launch requirements; A-25's free-tier-only scope no longer defines launch.

## Evidence and gaps

| Area | Observed evidence | Launch implication |
|---|---|---|
| Existing framework Cloud | [Cloud tests](../packages/backend/test/cloud-signup.mjs), [host isolation](../packages/backend/test/cloud-serving.mjs), [plan gates](../packages/backend/test/cloud-plan-gates.mjs); all six focused Cloud suites pass locally on SQLite | Useful baseline; does not prove the requested Supabase/Stripe path |
| Application storage | [PostgreSQL state adapter](../packages/edge-infra/src/providers/postgres-state.ts), [state resolver](../examples/cf-full/src/state-db.ts), and migrations through v22 | Deployed through Cloudflare Hyperdrive in `frontbase_cloud`; live migration/idempotency and two-tenant rollback isolation pass |
| PostgreSQL transport | `postgresStateRunner` now uses a short-lived `pg.Client` per query/transaction, letting Hyperdrive own global pooling | Fixes Worker-local pool timeouts. Local edge-infra gates and deployed auth/signup queries pass |
| Tenant identity | [Supabase Cloud Auth adapter](../packages/backend/src/compat/supabase-cloud-auth.ts) and framework auth/provisioning routes | Three deployed signup → password login → authenticated-session cycles passed 200/200/200. Each created free tenant, owner and published homepage; test identities and rows were removed |
| Billing UI/API | [billing routes](../packages/backend/src/compat/routes/billing.ts), v22 billing tables and existing console client | Basic/Pro checkout requests and customer portal URLs return live Stripe hosts; signed webhook lifecycle is transactional and idempotent. Covers activation, payment failure, recovery and cancellation. Unsupported add-ons are rejected rather than silently sold |
| Product reference | Original `Frontbase-/fastapi-backend/app/routers/billing.py`, `app/services/stripe_provider.py`, `app/auth/providers/supabase.py`, `app/auth/tenant_provisioning.py`, `app/database/config.py` inspected | Useful contracts, not permission for blind copying. Reference Stripe handler lacks durable event deduplication; subscription update focuses on add-ons and omits payment-failure lifecycle. Supabase verifier assumes HS256 and disables audience checking |
| Host routing | [cloud-domains.ts](../packages/compiler/src/cli/cloud-domains.ts), [tests](../packages/compiler/test/cloud-domains.mjs) | Fixed locally: app uses Custom Domain; wildcard uses Workers route over existing proxied DNS. No DNS mutation or takeover of conflicting routes. Live TLS/hostname proof remains open |
| Browser journey | [Playwright config](../examples/cf-full/e2e/playwright.config.ts) and [composed Cloud smoke](../examples/cf-full/src/smoke-cloud.ts) exist | Test signup, verified identity, checkout, entitlement update, edit/save/publish, reload, public tenant page on real staging. Existing manual-only wording in testing-plan.md is stale: Playwright exists |
| Recovery/operations | [deployment script](../scripts/deploy.mjs), [testing plan](testing-plan.md), current workflows | No Supabase restore/rollback proof or paid-Cloud staging acceptance established in this session |
| Public packages | Six reusable package manifests plus three SPA/runtime packages exist; root/console/hydrate private; reusable versions mostly 0.0.0, builder 0.1.0; workspace peers remain | External tarball install and registry/version ownership remain R0/R1 work; not a hosted-product deployment prerequisite |
| Other hosts | Node/Docker, Vercel, Deno entry points and build outputs exist | Build success is not live provider support proof. No additional host launch promise is made |

## Ordered launch backlog

| Order | Work / owner surface | Dependencies | Acceptance evidence | Status |
|---|---|---|---|---|
| CL-0 | Record scope and establish build/Cloud baseline; history + this document | Owner choices | A-26; exact baseline checks below | Complete |
| CL-1 | Supabase PostgreSQL app-state adapter and deployment wiring; edge-infra, backend stores/migrations, cf-full state-db | Cloudflare Hyperdrive resource | Fresh initialization and idempotent rerun pass on live Supabase; parameter binding, transactions, advisory migration lock and rollback-only two-tenant isolation pass; Worker binding pending | Code-verified complete (2026-09-11); Hyperdrive binding deployed 2026-09-08. Residue: the rollback-only two-tenant isolation proof is a recorded live run, not a committed repeatable script |
| CL-2 | Supabase tenant auth; backend identity/provisioning, console auth client, engine principal resolver | Deployed CL-1 | Adapter and compensation tests pass; live Supabase admin-create/password-sign-in/delete smoke passes; deployed signup/login/reset and browser session proof pending | Code-verified complete (2026-09-11); three live signup→login→session cycles passed 2026-09-08. Residue: no Playwright browser-session spec exists yet |
| CL-3 | Existing catalog import and entitlement audit; backend plans + operator tooling | Read-only existing Stripe and Supabase catalogs | Free/Basic/Pro names, limits and live price mappings preserved. Basic and Pro are launch products. Edge Compute Engine is excluded until its entitlement exists | Complete for initial paid beta. Known cleanup: the master-admin Add-ons tab calls endpoints that no longer exist (dead UI); `FRONTBASE_PLAN_CATALOG_PATH` is an operator-local reference, read by no code |
| CL-4 | Stripe checkout, portal and webhook lifecycle; backend + console | Deployed CL-1/2/3 | Server-selected approved price, tenant-bound checkout/portal, raw signature verification, durable deduplication, subscription activation/deletion and failed-payment behavior pass tests; live endpoint, reordered renewal/recovery and controlled transaction pending | Implementation complete; live proof pending. 2026-09-11: deterministic coverage extended (anonymous access, live-key guard); live secret keys now require `FRONTBASE_STRIPE_LIVE_MODE=1` (A-27) |
| CL-5 | Tenant hostname deployment; compiler + deploy guide | Cloudflare zone/token/proxied DNS | Local endpoint/ownership tests plus actual app and two tenant HTTPS hosts, unknown tenant 404 | Local fix implemented; 13 compiler tests pin the split topology. 2026-09-11 probe: `*.frontbase.dev` resolves over TLS and 404s an unknown slug — wildcard appears live; worker attribution and a known-tenant positive test remain open |
| CL-6 | Complete deployed customer journey; cf-full Playwright + Cloud smoke | CL-1 through CL-5 | Two fresh customers; Supabase identity; Stripe test checkout; upgrade; data connection; build/edit/save/publish; published page and authenticated API isolation; reset email; customer portal cancellation | Not run — and the journey specs do not exist yet: `examples/cf-full/e2e/` covers only the console shell (areas, page CRUD, cookies, logout) |
| CL-7 | Operations and paid beta release | CL-6 | Secret configuration; Supabase backup/restore drill; rollback rehearsal; error monitoring; support/contact; owner reviews exact running edition; then live-mode billing and production deployment with named resources | Not ready — no drill/monitoring/support artifacts exist in the repo |
| CL-8 | Community engine wizard parity (deferred) | CL-7 | The Cloud master-only Community card creates a real shared Worker, marks it `is_shared`, configures the public wildcard, exposes it read-only to tenants, and enforces engine quotas without allowing tenant deletion | Accepted gap |

Custom domains, dedicated engines, branding removal, agent credits and other catalog benefits must be compared to actual plan contents at CL-3. They are not silently dropped, silently promised, or bundled into an unrestricted parity sprint.

## 2026-09-09 community topology and billing progress

* `public-community-engine` now runs the deployed framework artifact with the staging Hyperdrive binding and cloud variables. The framework helper is `pnpm run deploy:community-edge -- --base-domain frontbase.dev`; wildcard routing remains separate from `app.frontbase.dev` and must only be claimed after proxied wildcard DNS exists.
* Domain attachment tests pin the split topology: `app.<zone>` attaches to the platform Worker, while `*.<zone>/*` belongs to `public-community-engine`. The helper still refuses to overwrite another Worker's route or create DNS.
* A dedicated live Stripe endpoint is enabled for `https://app.frontbase.dev/api/billing/webhooks/stripe`, covering checkout completion, subscription creation/update/deletion, payment failure, and successful recovery payment. Its signing secret is stored only as a Worker secret.
* A temporary live signup created a customer and returned valid `checkout.stripe.com` and `billing.stripe.com` URLs without completing payment. Focused deterministic tests cover checkout/portal creation, activation, payment failure, recovery, cancellation, idempotency, malformed payload rejection and unsupported add-on rejection. The temporary tenant was removed.

## 2026-09-11 code-level hardening and gate refresh (A-27)

Code review of the CL backlog against the actual tree confirmed CL-0–CL-5 implementation-complete and surfaced four gaps, three of which are now closed in code (A-27 in `docs/history/DECISIONS.md`):

1. **`/api/plans/public` was default-denied** (anonymous callers received 401 — confirmed live): the pricing catalog is now exempted from the compat default-deny guard (`packages/backend/src/compat/app.ts`); checkout/portal stay denied. Pinned in `cloud-billing.mjs` with a real principal resolver.
2. **Session JWTs carried no `iss`/`aud`** and the verifier checked only `exp`: `issueSession` now stamps `iss: frontbase` / `aud: frontbase-session`, and the backend default verifier pins both (fail closed). Pre-pinning cookies invalidate once — acceptable pre-launch. Self-host verification of third-party tokens (permissive mode) is preserved. Pinned in `edge-infra/test/session.mjs`.
3. **Live Stripe price IDs were protected only by documentation**: `assertStripeKeyMode` now refuses to boot billing with a live secret key unless `FRONTBASE_STRIPE_LIVE_MODE=1` — enforced at worker boot (`examples/cf-full/src/worker.ts`), mirrored in `scripts/deploy.mjs` preflight, forwarded by the compiler deploy CLI as a `--var`. Pinned in `cloud-billing.mjs`.
4. **Doc staleness** (this refresh): the CL Status column lagged the code, and the earlier "source changes remain uncommitted" handoff was stale — all session work is committed through `fe74692` (2026-09-11).

Gate refresh (all green, 2026-09-11): `postgres-state`, `supabase-cloud-auth`, `cloud-supabase-auth`, `cloud-billing`, `supabase-provisioning`, `cloud-signup`, `cloud-serving`, `cloud-plan-gates`, `cloud-rate-limit`, `tenant-host`, `admin-tenants`, `login-e2e`, `authz`, `compat-behavior-auth`, edge-infra `session`/`proxy-auth`, compiler `cloud-domains` (13 tests); `pnpm -r check`; `pnpm -r build`; backend mutation harness **23/23 RED-on-break** (closes the "mutation final rerun NOT RUN" item from 2026-09-08 — the cloud gates are mutation-proven).

Live probes (2026-09-11): `https://app.frontbase.dev/` serves the Frontbase app; `*.frontbase.dev` wildcard resolves over TLS and returns 404 for an unknown slug (responder not attributable from outside — needs a known-tenant positive test or CF-API check); `/api/plans/public` returned 401 anonymous (now exempted in code, not yet deployed). NOT RUN: live checkout payment, deployed browser journey, database restore, deployment of these changes. Note: the cf-full Playwright suite cannot boot under local `wrangler dev` since the committed wrangler.toml gained the Hyperdrive binding — wrangler demands `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (a local Postgres) to emulate it; the browser journey therefore runs against a deployed URL or CI, not a bare local dev.

## 2026-09-11 CI/CD repairs — contracts workflow and Vercel git deploys

Both recurring failure emails traced to `7e57e97` (2026-09-08), the first commit that carried the cloud wiring:

1. **`contracts` workflow red since 2026-09-08 — `smoke:cloud` failed 3/27.** The three `/admin` cloud-console checks failed because the disk ASSETS shim (`examples/cf-full/src/assets-disk.ts`) mapped paths 1:1 and 404'd directories, while `7e57e97`'s "cloud admin asset lookup" fix made `adminShell` request `/admin/` — correct for the real Static Assets binding (which serves the directory index), broken on the shim (Node/Deno entries + in-process smokes). Fix: the shim now resolves `<dir>/index.html` for directory paths, completing the binding contract it documents; `smoke-host`'s contradictory "404 for a directory" check now pins the real contract both ways (index present → 200 html; absent → 404).
2. **The workflow's browser step could not boot after the smoke fix**: `wrangler dev` refuses to start a Hyperdrive binding without a local Postgres emulation string, and the state-db resolver's Hyperdrive-first precedence made local dev hang connecting to it. Two fixes: the resolver now honors `HYPERDRIVE` **only in cloud mode** (`FRONTBASE_DEPLOYMENT_MODE=cloud`) — a self-host reusing the committed wrangler.toml (or any `wrangler dev`) keeps its own state plane instead of silently adopting the cloud deployment's binding — and the workflow's browser step exports a placeholder `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` that satisfies wrangler's startup check and is never dialed (self-host e2e runs on D1).
3. **Vercel production git deploys failed every push** ("project or build error"): the linked `cf-full` project has no build command while `outputDirectory` points at `console-dist`, a gitignored staged artifact — a fresh clone has nothing to deploy. `examples/cf-full/vercel.json` now declares `"buildCommand": "node build.mjs"` (the self-healing build: workspace packages → console staging → all edge/Node/Deno/Vercel artifacts). One dashboard check remains owner-side: the project's Root Directory must be `examples/cf-full` for that vercel.json to apply; the next push to main is the proof.

Verification (all green, 2026-09-11): the contracts workflow steps reproduced locally in order — `console:build`, `console:check`, `smoke`, `console:build -- --cloud`, `smoke:cloud` (27/27), `smoke:host`, `test:state-db` (incl. new cloud-gate cases), `test:vercel-config`, `console-pin`, e2e (15/15 in Chromium against `wrangler dev`); fresh-state proof (`console-dist`/`dist` deleted → `node build.mjs` self-heals and passes); `pnpm -r check`; `pnpm -r build`.

## Staging credentials

Local file created for the owner: `C:\Users\PC\AppData\Local\Frontbase\cloud-staging.env` (outside OneDrive and Git). Fill fields locally. No secret values belong in this document or chat. It holds Supabase project/API/database settings, Stripe test keys, Cloudflare account/zone/token, staging hostname/worker, operator account and local catalog export path. Leave webhook secret blank until the staging endpoint is registered. Since A-27 (2026-09-11), a live `STRIPE_SECRET_KEY` additionally requires `FRONTBASE_STRIPE_LIVE_MODE=1` in the deploy environment — the deploy fails fast without it.

The deploy script reads the required Supabase and Stripe values from its process environment, fails before deployment when they are absent, and sends values to Wrangler over stdin. The local file remains operator input and is not sourced as shell code by repository code. Inspect only required fields, redact secret-bearing output, and keep runtime credentials out of static assets.

## Verification record

- Initial sandbox reads failed with access denied (including Git objects). Read-only elevated Git status succeeded: framework initially clean; original product had unfamiliar untracked OneDrive conflict copies, left untouched.
- Initial `pnpm -r check`: failed because installed TypeScript modules were missing.
- `CI=true pnpm install --frozen-lockfile`: PASS; lockfile unchanged, dependencies restored. pnpm reported ignored dependency build scripts; actual subsequent build succeeded.
- `pnpm -r build`: PASS before the domain change. Worker 488.8 KB gzip reported by the repository's build gate. These are local build measurements, not a current provider pricing/limit promise.
- `pnpm -r check`: PASS after dependency restoration.
- Live Supabase PostgreSQL: connection PASS; migrations v1-v22 applied in isolated `frontbase_cloud`; idempotent rerun PASS; rollback-only two-tenant isolation smoke PASS with zero residue.
- Live Supabase Auth: temporary admin-created user, password sign-in and deletion PASS with zero retained test identity.
- Paid Cloud focused suites: PostgreSQL state adapter, Supabase Cloud Auth/provisioning and Stripe billing lifecycle PASS. Free/Basic/Pro catalog rows are seeded; live Stripe catalog was read only and no payment object or charge was created.
- `node packages/backend/test/<suite>.mjs`, for `tenant-host`, `cloud-serving`, `cloud-signup`, `admin-tenants`, `cloud-plan-gates`, `cloud-rate-limit`: all PASS. These use the existing local SQLite path. Expected injected signup failure prints an error while rollback assertions pass.
- `pnpm --filter @frontbase/compiler build` + `node packages/compiler/test/cloud-domains.mjs`: PASS, 13 domain tests. Final `pnpm --filter @frontbase/compiler test`: PASS; `pnpm --filter @frontbase/compiler test:mutation`: PASS (3/3 gates detect injected failures); final `pnpm -r check` and `pnpm -r build`: PASS; `node --check scripts/deploy.mjs` and `git diff --check`: PASS.
- 2026-09-08: `app.frontbase.dev` and `/admin` deploy PASS. Admin login, `/api/auth/me`, and `/api/plans/public` return 200 after replacing the Worker-local PostgreSQL pool with Hyperdrive-compatible per-request clients. Three signup → login → session cycles returned 200; DB checks confirmed free plan, owner, and published homepage with zero orphans. Full `pnpm -r check` and `pnpm -r build`: PASS; clean Worker is 493.6 KB gzip.
- NOT RUN: live Stripe checkout/portal/webhook against the new Worker, browser journey, database restore, external package install, and the backend mutation final rerun. Tenant wildcard is intentionally excluded for now because it belongs to a separate community engine/Worker.

## Current handoff

*(Refreshed 2026-09-11 — the previous handoff's "source changes remain uncommitted" claim was stale; all prior session work is committed through `fe74692`.)*

The deployed signup/login path is operational and CL-0–CL-5 are code-verified complete. The next executable task is unchanged: the controlled paid journey — complete one temporary customer checkout on the deployed Worker, verify entitlement and cancellation/failure lifecycle, then write and run the CL-6 journey specs (they do not exist yet; `examples/cf-full/e2e/` covers only the console shell), then CL-7 operational gates. The 2026-09-11 hardening changes (A-27) are uncommitted in the working tree and not yet deployed; the next cloud deploy must set `FRONTBASE_STRIPE_LIVE_MODE=1` to keep the live key booting. No production charge has been made and temporary signup records were removed.
## Credential preflight continuation — 2026-09-06

Owner supplied the local credentials and explicitly chose to retain the live-mode Stripe key. It was used only for read-only catalog discovery; no Checkout Session, subscription, invoice, webhook endpoint or charge was created. Test-mode payment proof remains unavailable; deterministic local billing tests can proceed, but live payment acceptance needs a deliberate controlled transaction later.

- Discovered the Studygram Inc. Cloudflare account and frontbase.dev zone; populated the missing IDs in the local credentials file without exposing credentials.
- Selected the currently unused local Worker name `frontbase-cloud-staging`; no Worker was created.
- Normalized Supabase URL from its `/rest/v1/` endpoint to the project origin. `/auth/v1/settings` now succeeds; email auth is enabled and signup is enabled. This is an availability check, not a full login/database proof.
- Supabase database URL names a PostgreSQL session-pooler endpoint on port 5432. Connection/migration verification remains CL-1 work.
- Exported all three active Stripe prices into `%LOCALAPPDATA%/Frontbase/stripe-catalog-reference.json` and populated FRONTBASE_PLAN_CATALOG_PATH. Monthly USD prices: Basic $1.99 (slug basic), Pro $29 (slug pro), Edge Compute Engine $10 (no product slug observed). This is a PRICE reference, not proof of plan entitlement limits. Preserve live price IDs for live mode; never use them with test keys.
- STRIPE_PUBLISHABLE_KEY is unnecessary for a server-created hosted Checkout Session URL redirect; leave blank unless a client-side Stripe integration is introduced.
- FRONTBASE_STAGING_BASE_DOMAIN remains unset. Candidate `staging.frontbase.dev` needs verified DNS and certificates for its app/tenant subdomains; never assume the zone's first-level wildcard certificate covers them. The configured Cloudflare token returns HTTP 403 for both DNS record reads and SSL certificate-pack reads. Add zone-scoped DNS Read and SSL and Certificates Read permissions before completing hostname selection. Existing production workers are untouched.

Only the external local configuration/reference export and this evidence record changed in this continuation. Existing source diffs remain uncommitted. No new runtime implementation is claimed and no code tests were repeated for these configuration/document-only operations.
