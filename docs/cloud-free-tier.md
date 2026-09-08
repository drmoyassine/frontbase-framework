# Cloud multi-tenant free tier (`app.<zone>`)

**Status**: Implemented 2026-08-29; paid Supabase Cloud launch not yet verified · **Scope**: free tier only · **Deploy**: `pnpm run deploy:cf-full -- --mode cloud --base-domain <zone>`

The framework's single worker also runs the managed cloud: public self-serve signup,
site building in the console, publishing, and each site live at `<slug>.frontbase.dev`.
It is one shared worker — signup provisions database rows only (tenant + owner
+ `free` plan + homepage), and the serving worker resolves the tenant from the **Host
header prefix alone**. No second process: the same single-worker architecture that
serves self-host serves the cloud.

> Paid launch requirements now follow [A-26](history/DECISIONS.md#decision-a-26-paid-cloud-launch-from-the-framework-with-supabase) and [CLOUD-LAUNCH.md](CLOUD-LAUNCH.md). This page describes the existing free-tier baseline.

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
deploys with the `--var` pair, and attaches the app Custom Domain plus tenant wildcard route. `--dry-run` builds
and gates without calling Cloudflare.

Secrets (stdin only — never argv, never logs; names only in output):

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | session key (auto-generated on fresh deploys) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed the platform admin (both required together) |
| `ADMIN_ROLE` | default `master_admin` — the only role that sees `/api/admin/*` |
| `RESEND_API_KEY` | password-reset email delivery; absent → resets stay non-enumerating no-ops |

## App domain and tenant wildcard route

The deploy helper attaches `app.<zone>` as a Workers Custom Domain. For tenant
hosts it first verifies an existing proxied wildcard A/AAAA/CNAME DNS record,
then creates `*.<zone>/*` as a Workers route pointing to this worker. An existing
identical route is reused. A conflicting worker route or no-worker exclusion is
reported, never overwritten. The token additionally needs **DNS Read**.

Prepare wildcard DNS explicitly in the operator account. DNS records are never
created or overwritten by this helper. Missing DNS, insufficient permissions or
route conflicts produce an actionable failure; an app-host attach may already
have succeeded. Resolve the reported condition and retry. Verify app and two
fresh tenant hostnames over HTTPS after deployment, including unknown-tenant 404s.

Cloudflare [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
do not support wildcards. [Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
require proxied DNS. The previous plan-dependent wildcard Custom Domain claim was
incorrect; an HTTP-double test cannot prove live DNS, routing or TLS.
## Host model

| Host | Behavior |
|---|---|
| `app.<zone>` | the platform: signup + the `/admin` cloud console; `/` 302s to `/admin` |
| `<slug>.<zone>` | that tenant's published site; admin surfaces (incl. `/admin`) 404 |
| unregistered slug | **404 workspace-not-found** — unregistered slugs are never served (deliberate hardening; negatives are never cached) |
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
actually resolves against (the `/api/admin/plans*` router is re-namespaced onto it);
per-tenant plan rows still take precedence for a tenant that has one. Tenants
read their own plan at `GET /api/tenants/me/plan`.

## What this phase does not include

Per-tenant engines · managed/BYO custom domains · per-tenant workers · Stripe billing ·
`remove_branding` enforcement · email verification · captcha · usage metering beyond the
counts above · admin impersonation · hard tenant delete/data export · per-plan rate-limit
quotas. All planned follow-on work.

The cloud console's agent-analytics/credit/addons widgets call the `admin_agents_*` op
family, which is a framework stub — in the cloud build those widgets show error states.
Nothing else depends on them.

## Abuse surface (honest limits)

Signup, login, and forgot-password are rate limited (a D1-backed fixed-window
counter keyed on `CF-Connecting-IP`, falling back to left-most `X-Forwarded-For` —
spoofable, so the limit degrades to best effort). There is **no email verification and
no captcha** in this phase; rate limiting is the only abuse control. Counts are not
metering — there is no ledger or cron, and shared D1 capacity is the operator's concern.
