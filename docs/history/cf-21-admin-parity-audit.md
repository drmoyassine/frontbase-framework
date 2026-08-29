# CF-21 — Admin Console Parity Audit (product → framework)

**Date:** 2026-07-12 · **Status:** COMPLETE
**Scope:** map the Frontbase *product* admin console (repo `Frontbase-`) against the
*framework* (`frontbase-framework`) to produce the authoritative "what's missing"
input for CF-18 (the React admin UIs). Produced by three parallel read-only auditors.

---

## 1. Headline: the coverage matrix

For each sidebar nav item in the product dashboard (image 4), does the **framework
backend** have support?

| Nav item | Framework backend | Notes |
|---|---|---|
| Dashboard | **PARTIAL** | `/me` only — no stats/metrics endpoint |
| Builder Studio (canvas) | **YES** | `/drafts/*` + `@frontbase/builder` Canvas (reusable lib) |
| Pages / Drafts / Publish | **YES** | full CRUD (`routes/pages.ts`, `routes/publish.ts`) |
| Data Studio (datasources) | **NO** | no datasource endpoints; queries are compiler-managed only |
| App Users | **NO** | internal `UserStore` only — no list/invite/CRUD endpoints |
| File Storage | **NO** | no table, no endpoints |
| Automations | **NO** | `workflows` table exists (`db/schema.ts:30`) but **no routes** |
| Edge Resources | **NO** | no endpoints (engines/db/cache/queue/vector) |
| Settings | **NO** | no config endpoints |
| Variables | **NO** | — |
| Tenants | **PARTIAL** | list/create only (`routes/tenants.ts`); no update/delete |
| Auth / Login | **YES** | login/logout/me/setup + `fb_session` JWT |

**Result: ~3.5 of 11 areas have framework backend support.** ~70% of the product's
admin surface has **no framework backend yet**. CF-18 ("build the React UIs") is
therefore not a pure frontend port — matching image 4 also requires growing the
framework backend for the missing domains.

---

## 2. Product frontend (image 4) — `Frontbase-/src` (413 tsx files)

**Stack:** React Router v6 · shadcn/ui (Radix) · Tailwind + CSS-var theming ·
Zustand (persisted) · TanStack Query v5 · Axios. Light/dark via `next-themes`.

**Route table (excerpt — full table in §2 of agent output):**
`/dashboard`, `/pages`, `/data-studio` (+`/datasources`), `/users`, `/storage`,
`/automations`(+`/:id`), `/edge`, `/settings`, `/builder/:pageId`, `/variables`,
`/admin/tenants`, `/admin/plans`, `/login`, `/signup`, `/forgot-password`,
`/reset-password`, `/accept-invite`, `/embed/auth/:formId`.

**State:** `useAuthStore`, `useDashboardStore`, `useBuilderStore`, `useActionsStore`
+ slices (`createPageSlice`, `createProjectSlice`, …).

**API client:** two Axios instances — main (relative URLs, `withCredentials`, Bearer
in cloud mode, `X-Project-Id` header) + dbsync (`${API_URL}/api/sync`). Services:
`pages-api`, `database-api`, `usersApi`, `rls-api`, `tenantAdminApi`, `datasources`.

---

## 3. Product backend — `Frontbase-/fastapi-backend` (Python, ~16 domains, ~80 endpoints)

**Domains:** auth · pages(+versions, +publish-to-engine) · datasources(+table
schema/data CRUD) · views · edge-engines(+deploy) · edge-resources ×5
(providers/databases/caches/queues/vectors) · storage(+buckets/upload) ·
actions/automations(+executions) · projects · settings · tenants · variables ·
agent(chat) · cloudflare(deploy).

**Auth:** dual-mode — env-var master admin (cookie `frontbase_session`, 7d, in-mem)
OR SuperTokens (cloud). `TenantContext` dependency guards routes; `is_master` bypass.

**Models:** Page, Project, Datasource, EdgeEngine, EdgeDatabase, StorageProvider,
AutomationDraft, Tenant (+ fields cataloged in agent output).

**Envelope:** success `{success, data, message}` · error `{detail}` · lists are raw
arrays · paginated `{data, total, limit, offset}`.

---

## 4. Framework current surface — `frontbase-framework`

**`/api/console` endpoints (12):** health · setup(+db) · login/logout · me ·
pages (list/get/delete) · drafts (get/put) · publish · tenants (list/create).

**Auth contract (the seam a UI must satisfy):** PBKDF2-SHA256 100k · HS256 JWT cookie
`fb_session` (claims `sub,email,role,tenant_slug,exp,iat`, 7d) · `resolvePrincipal`
· default-deny · roles `master_admin`/`tenant_admin`/`owner`.

**`@frontbase/builder`:** React **component library** (Canvas, BuilderWorkspace,
draft providers) — reusable, NOT a SPA, never imports edge-infra. This *is* the
"Builder Studio" canvas and ports directly.

**`@frontbase/ui-components`:** effectively empty placeholder (exports one const);
for eSSR page rendering, not admin. Not reusable here.

**Hosting slot:** no `packages/admin`. The `cf-full` example's `/console` (Hono
sub-router mounted ahead of the engine catch-all, `worker.ts:83`) is the proven
mount pattern for a SPA. A real admin = new package `packages/admin-console`,
bundled to static assets, served at `/console`.

---

## 5. The adapter seams (product UI → framework)

A direct port crosses four seams:
1. **Stack** — carry shadcn/Tailwind/Zustand/TanStack/RRv6/Axios (fine, all portable).
2. **Auth** — replace SuperTokens/Supabase dual-mode with `fb_session` cookie flow.
3. **Envelope** — product expects `{success,data}` / `{detail}`; framework returns
   opaque `{error:'code'}` (RULE 4). Either adapt the client or relax the framework
   envelope for the console (design decision).
4. **Route shapes** — product FastAPI paths (`/api/pages/{id}/publish/{engine}`)
   vs framework (`/api/console/publish/:slug`). Per-endpoint rewrite.

---

## 6. Recommendation: phased CF-18

The gap is too large for one shot. Recommended phasing:
- **Phase 1 — MVP console** (new `packages/admin-console`): shell (sidebar, topbar,
  branding) + Login + Dashboard + Pages/Drafts/Publish + Tenants, over the
  **existing** framework backends. Adapter for auth + envelope. Reuse `@frontbase/builder`
  for the canvas. Delivers a real image-4-style console for the parts that work.
- **Phase 2+ — grow backends per feature**: Data Studio, App Users, Automations,
  Edge Resources, Storage, Settings, Variables — each = new framework routes + UI.
  Priority-ordered; each shippable independently.

Decision needed: MVP-first (Phase 1 now) vs. full-parity (all phases committed) vs.
product-React-wholesale + shim (fast visual parity, carries debt).
