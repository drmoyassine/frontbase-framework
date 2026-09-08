# Frontbase Cloud paid launch

**Updated:** 2026-09-08
**Status:** Deployed staging signup, login and session journey verified; paid checkout, webhook and operations acceptance remain open.
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
| Billing UI/API | [billing routes](../packages/backend/src/compat/routes/billing.ts), v22 billing tables and existing console client | Basic and Pro catalog mappings restored; checkout, portal, signed webhook, idempotency, cancellation and failed-payment behavior pass deterministic tests. Live controlled payment and webhook endpoint registration remain open |
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
| CL-1 | Supabase PostgreSQL app-state adapter and deployment wiring; edge-infra, backend stores/migrations, cf-full state-db | Cloudflare Hyperdrive resource | Fresh initialization and idempotent rerun pass on live Supabase; parameter binding, transactions, advisory migration lock and rollback-only two-tenant isolation pass; Worker binding pending | Implementation complete; deployment pending |
| CL-2 | Supabase tenant auth; backend identity/provisioning, console auth client, engine principal resolver | Deployed CL-1 | Adapter and compensation tests pass; live Supabase admin-create/password-sign-in/delete smoke passes; deployed signup/login/reset and browser session proof pending | Implementation complete; deployed journey pending |
| CL-3 | Existing catalog import and entitlement audit; backend plans + operator tooling | Read-only existing Stripe and Supabase catalogs | Free/Basic/Pro names, limits and live price mappings preserved. Basic and Pro are launch products. Edge Compute Engine is excluded until its entitlement exists | Complete for initial paid beta |
| CL-4 | Stripe checkout, portal and webhook lifecycle; backend + console | Deployed CL-1/2/3 | Server-selected approved price, tenant-bound checkout/portal, raw signature verification, durable deduplication, subscription activation/deletion and failed-payment behavior pass tests; live endpoint, reordered renewal/recovery and controlled transaction pending | Implementation complete; live proof pending |
| CL-5 | Tenant hostname deployment; compiler + deploy guide | Cloudflare zone/token/proxied DNS | Local endpoint/ownership tests plus actual app and two tenant HTTPS hosts, unknown tenant 404 | Local fix implemented; live proof pending |
| CL-6 | Complete deployed customer journey; cf-full Playwright + Cloud smoke | CL-1 through CL-5 | Two fresh customers; Supabase identity; Stripe test checkout; upgrade; data connection; build/edit/save/publish; published page and authenticated API isolation; reset email; customer portal cancellation | Not run |
| CL-7 | Operations and paid beta release | CL-6 | Secret configuration; Supabase backup/restore drill; rollback rehearsal; error monitoring; support/contact; owner reviews exact running edition; then live-mode billing and production deployment with named resources | Not ready |

Custom domains, dedicated engines, branding removal, agent credits and other catalog benefits must be compared to actual plan contents at CL-3. They are not silently dropped, silently promised, or bundled into an unrestricted parity sprint.

## Staging credentials

Local file created for the owner: `C:\Users\PC\AppData\Local\Frontbase\cloud-staging.env` (outside OneDrive and Git). Fill fields locally. No secret values belong in this document or chat. It holds Supabase project/API/database settings, Stripe test keys, Cloudflare account/zone/token, staging hostname/worker, operator account and local catalog export path. Leave webhook secret blank until the staging endpoint is registered.

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

The deployed signup/login path is operational. The next executable task is the controlled paid journey: register the Stripe webhook on the deployed Worker, create one temporary customer through checkout, verify entitlement and cancellation/failure lifecycle, then run browser and operational gates. Source changes and launch records remain uncommitted. No production charge has been made and temporary signup records were removed.

Changed tracked files in this session: `README.md`, `docs/cloud-free-tier.md`, `docs/history/DECISIONS.md`, `docs/history/MILESTONES.md`, `docs/history/PUBLIC-RELEASE-STRATEGY.md`, `docs/history/PUBLIC-RELEASE-AUDIT.md`, `packages/compiler/src/cli/cloud-domains.ts`, `packages/compiler/test/cloud-domains.mjs`, `scripts/deploy.mjs`. New repository file: `docs/CLOUD-LAUNCH.md`. Local credential template outside repository: `%LOCALAPPDATA%/Frontbase/cloud-staging.env`. No lockfile change. Domain fix is verified locally and awaits credential-gated remote proof; CL-1/2/3/4 remain open.
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
