# Cloud multi-tenant free tier (`app.<zone>`)

**Status**: Shipped (A-25, 2026-08-29) · **Scope**: free tier only · **Deploy**: `pnpm run deploy:cf-full -- --mode cloud --base-domain <zone>`

The framework's single worker also runs the managed cloud: public self-serve signup,
site building in the console, publishing, and each site live at `<slug>.frontbase.dev`.
It is one shared community worker — signup provisions database rows only (tenant + owner
+ `free` plan + homepage), and the serving worker resolves the tenant from the **Host
header prefix alone**. The product's two-worker+VPS split collapses into the A-13
single-worker architecture.

## Opting in — and staying out

Cloud mode activates on two environment values, delivered at deploy time via
`wrangler deploy --var` (non-secret, argv-safe):

| Value | Meaning |
|---|---|
| `FRONTBASE_DEPLOYMENT_MODE=cloud` | enables tenancy: host resolution, signup, `/admin`, plan gates, rate limiting |
| `FRONTBASE_BASE_DOMAIN=<zone>` | the zone tenant hosts are served under (e.g. `frontbase.dev`) |

They are **never written to wrangler.toml**. That file is committed and shared — a mode
var baked into it would flip every self-host reusing the file into cloud boot. Unset
means self-host, byte-identical: the unmodified self-host smoke proves it every run.

## Deploy

```bash
export RESEND_API_KEY=...            # password-reset email — env only, never a CLI flag
export CLOUDFLARE_API_TOKEN=...      # Custom Domains attach (Zone Read, Workers Scripts
export CLOUDFLARE_ACCOUNT_ID=...     #   Edit, Workers Routes Edit)
pnpm run deploy:cf-full -- --mode cloud --base-domain frontbase.dev \
  --app-name frontbase-cloud --admin-email owner@example.com --admin-password '…'
```

The command stages **both** console builds (self-host `/frontbase-admin` + cloud
`/admin`), gates the deploy on both artifacts, provisions D1, pushes secrets stdin-only,
deploys with the `--var` pair, and attaches the two Custom Domains. `--dry-run` builds
and gates without calling Cloudflare.

Secrets (stdin only — never argv, never logs; names only in output):

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | session key (auto-generated on fresh deploys) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed the platform admin (both required together) |
| `ADMIN_ROLE` | default `master_admin` — the only role that sees `/api/admin/*` |
| `RESEND_API_KEY` | password-reset email delivery; absent → resets stay non-enumerating no-ops |

## Custom Domains (the wildcard)

After deploy, the script attaches `app.<zone>` + `*.<zone>` as Workers Custom Domains
through the CF API (`attachWorkerDomains` — idempotent upsert; re-running the deploy is
safe). The API token travels only in the Authorization header.

**If attach is refused or creds are absent** (the token may lack scopes; wildcards can
depend on the zone plan): attach both hostnames as Workers Custom Domains in the
Cloudflare dashboard — for wildcards some plans need a zone route plus a proxied wildcard
DNS record. The worker itself is live on its workers.dev origin either way. Also expect a
first-visit certificate-provisioning window for a never-before-seen slug.

## Host model

| Host | Behavior |
|---|---|
| `app.<zone>` | the platform: signup + the `/admin` cloud console; `/` 302s to `/admin` |
| `<slug>.<zone>` | that tenant's published site; admin surfaces (incl. `/admin`) 404 |
| unregistered slug | **404 workspace-not-found** — unregistered slugs are never served (a deliberate fix beyond product fidelity; negatives are never cached) |
| reserved labels (`www`, `api`, `status`, …) | 404 |
| apex / foreign hosts | apex 302s to the app host; foreign hosts are not ours |

`/admin` on a tenant host is a 404 **by design**: a login form on someone else's domain
is a phishing surface. Sessions are scoped to the host tenant — a member of tenant A,
logged in on their own host, is anonymous on tenant B (this closes a real cross-tenant
hole in private-page gating). Datasource enrichment resolves from the host tenant only.

## Plans & limits

The `free` catalog is seeded **at cloud boot** into the existing `plans` table under the
`_global` namespace — never by migration (self-host's "no plan ⇒ unlimited" contract
must not change). `tenants.plan` is a soft FK onto that catalog.

| Limit | Free value | Exceeded |
|---|---|---|
| `pages` | 10 | 402 `limit_exceeded` at publish |
| `deploys_monthly` | 50 | 402 at publish (calendar-month Published rows — an approximation, not metering) |
| `team_members` | 1 | 402 at invite |
| `edge_engines` | 0 | 402 at engine create/deploy |
| `private_pages` / `api_access` | false | 403 at the flip / at API-key create |

`-1` means unlimited, null limits are inert, and `master_admin` bypasses every gate.
The platform admin's Plans manager edits the `_global` catalog — the rows enforcement
actually resolves against (`adminPlansTenant` re-namespaces the `/api/admin/plans*`
router); per-tenant plan rows still take precedence for a tenant that has one. Tenants
read their own plan at `GET /api/tenants/me/plan`.

## What this phase does not include

Per-tenant engines · managed/BYO custom domains · per-tenant workers · Stripe billing ·
`remove_branding` enforcement · email verification · captcha · usage metering beyond the
counts above · admin impersonation · hard tenant delete/data export · per-plan rate-limit
quotas. All Phase-5 machinery.

The cloud console's agent-analytics/credit/addons widgets call the `admin_agents_*` op
family, which is a framework stub — in the cloud build those widgets show error states.
Nothing else depends on them.

## Abuse surface (honest limits)

Signup, login, and forgot-password are rate limited (CF-16: a D1-backed fixed-window
counter keyed on `CF-Connecting-IP`, falling back to left-most `X-Forwarded-For` —
spoofable, so the limit degrades to best effort). There is **no email verification and
no captcha** in this phase; rate limiting is the only abuse control. Counts are not
metering — there is no ledger or cron, and shared D1 capacity is the operator's concern.
