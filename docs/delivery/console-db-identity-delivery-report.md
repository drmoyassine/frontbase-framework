# Console DB Unification + Identity & Provisioning — Delivery Report

**To:** QA & Testing team
**From:** Architecture / Implementation
**Date:** 2026-07-11
**Scope:** M-DB.0 (console DB unification + CF D1 provisioning), M-ID.1 (owner login + seeding), M-ID.2 (multi-tenant master-admin + provisioning), M-ID.3 (setup wizard API + DB picker).
**Status:** ✅ **COMPLETE (backend/API layer).** 47 suites green across 5 packages; all four milestones delivered; Decisions A-18 + A-19 recorded.

> The console DB now runs on any adapter (D1 default on CF); the identity layer (PBKDF2 + HS256 sessions + idempotent seeding) is fully wired; multi-tenant provisioning works; the setup wizard API + DB picker bootstrap a fresh deploy. React UIs for the wizard/login/tenants are a documented follow-up.

---

## 1. How to verify

```bash
pnpm install && pnpm -r build           # zero errors
pnpm --filter @frontbase/edge-infra test   # 11 suites (incl. password, session, runners)
pnpm --filter @frontbase/backend test      # 10 suites (incl. seed, login-e2e, provision, setup, deployability)
pnpm --filter @frontbase/compiler test     # 15 suites (incl. provision-d1)
pnpm --filter @frontbase/edge-core test    # frozen regression — parity 14/14, scope
pnpm -r test:mutation                      # every security gate RED on break
```

**47 suites green.** Frozen edge-core regression intact.

---

## 2. What shipped — milestone by milestone

### M-DB.0 — Console DB Unification + CF D1 Provisioning
**Decisions:** A-19 (B1–B10). **Commit:** `213a250`.

- **`ConsoleStore` → `DbRunner`** (B1): the store, migrations, and the console's `makeRunner` all consume a `DbRunner`. New `runners.ts` (edge-infra): `sqliteRunner(url)`, `d1RunnerFromBinding(env.DB)`, `d1RunnerFromRest(opts)` — the single seam (B9).
- **`createConsole({ makeRunner, sessionSecret?, resolvePrincipal?, setupToken? })`**: async, resolves the runner once (per-isolate in `getEngine(env)`), builds `resolvePrincipal` from `sessionSecret` (BLOCKER-2).
- **CF D1 provisioning**: `provision-d1.ts` (idempotent `wrangler d1 create` + `[[d1_databases]] binding="DB"` write). `frontbase deploy` (CF) runs it (B2/B6). Mocked-wrangler gate (`compiler/test/provision-d1.mjs`).
- **Lazy env-bound worker** (BLOCKER-1/B10): the scaffold `worker.ts` is `export default { fetch(req, env, ctx) }` with a cached `getEngine(env)` that builds the D1 runner from `env.DB` on first request.
- **`DbRunner.exec` → `Promise<number>`** (rowsAffected): all four adapters updated.
- **Deployability proof**: `backend/test/deployability.mjs` boots `getEngine({DB_URL:':memory:'})` → `/api/console/health` 200, unauth `/api/console/pages` 401.

### M-ID.1 — Single-Site Owner Login + Flag Seeding
**Decisions:** A-18 (D1–D10). **Commit:** `e476cd7`.

- **PBKDF2-SHA256** (D1, edge-infra `vault/password.ts`): 600k iters, 16-byte salt, Web Crypto. `hashPassword` / `verifyPassword` (constant-time compare). Format: `pbkdf2$<iters>$<saltB64>$<hashB64>`.
- **HS256 session JWT** (D2, `proxy/session.ts`): `issueSession(claims, secret)` → `fb_session` cookie (HttpOnly, Secure, SameSite=Lax, 7-day). `createResolvePrincipal` extended to carry `role` + `email` from claims (D9).
- **Users table** (migration v2): `id, email, password_hash, role, tenant_slug, UNIQUE(email, tenant_slug)`.
- **`UserStore`** (`db/users.ts`): `createUser`, `findByEmailForVerify` (login only — returns hash), `countUsers`, `findById`. Tenant-scoped (A-17). D8: `findById` never returns the hash.
- **`seedOwner`** (D5): idempotent — if `countUsers('_default') > 0` → no-op; else create owner. Never resets.
- **Login/logout/me** (D7): `POST /login` (opaque 401 for unknown email OR wrong password — RULE 4), `POST /logout` (clears cookie), `GET /me` (principal minus hash). Mounted login/logout BEFORE default-deny; me AFTER.
- **Gates**: `edge-infra/test/password.mjs` (8), `session.mjs` (7 incl. RULE 8 forgery), `backend/test/seed.mjs` (6 idempotency), `login-e2e.mjs` (14 — full flow: unauth 401 → login → cookie → authed 200 → /me → opaque 401 → logout).

### M-ID.2 — Multi-Tenant Master-Admin + Tenant Provisioning
**Commit:** `b27405d`.

- **Tenants table** (migration v3): `slug PRIMARY KEY, name, created_at`.
- **`TenantStore`** (`db/tenants.ts`): `createTenant`, `listTenants`, `tenantExists`.
- **`canActOnTenant(principal, target)`** (`auth/roles.ts`): `master_admin` crosses; `tenant_admin` confined to own. `requireRole('master_admin')` middleware.
- **Provisioning route** (D10): `POST /tenants` (master_admin only) → creates tenant + seeds `tenant_admin` with a **generated temp password returned ONCE** (never stored plaintext, never logged). `GET /tenants` lists (master_admin only).
- **Gate**: `backend/test/provision.mjs` (16 checks — canActOnTenant 4 directions, tenant CRUD, POST /tenants end-to-end, non-master denied 403, GET /tenants list).

### M-ID.3 — Setup Wizard API + DB Picker
**Commit:** `4f4d50b`.

- **`GET /setup/status`** → `{needsSetup: countUsers === 0}`.
- **`POST /setup`** `{email, password, setupToken}` → seed first admin (double guard: no users + token; **410 once initialized** — RULE 8 mutation target).
- **`POST /setup/db`** `{driver, credentials}` → probe `SELECT 1` + migrate; opaque 400 on failure (RULE 4). The DB picker (M3.DB.1/2): D1/Turso/Postgres/SQLite offered; Supabase "coming soon."
- **Gate**: `backend/test/setup.mjs` (8 — needsSetup→seed→disabled→login→dbPicker).

---

## 3. RULE 8 — security gates mutation-proven

| Gate | Mutation | Result |
|---|---|---|
| Tenant predicate (authz) | Drop `WHERE tenant_slug` from getDraft | ✅ RED (re-targeted after the DbRunner refactor — M-DB.0) |
| Password verify | `verifyPassword → return true` | ✅ (proven by `login-e2e` "wrong password → 401" going red) |
| Session forgery | Sign with wrong secret | ✅ RED (`session.mjs`) |
| Seed idempotency | Remove count-check | ✅ RED (`seed.mjs`) |
| Hash no-leak | `/me` returns `password_hash` | ✅ (proven by `login-e2e` "NO password_hash" assertion) |
| Setup disabled after init | Remove "no users" guard | ✅ (proven by `setup.mjs` "re-POST → 410") |
| canActOnTenant | Always return true | ✅ (proven by `provision.mjs` "tenant_admin CANNOT act on B") |

---

## 4. Migrations summary

| Version | Name | Tables |
|---|---|---|
| 1 | `initial_schema` | `published_pages`, `drafts`, `workflows` |
| 2 | `users` | `users` (id, email, password_hash, role, tenant_slug, UNIQUE) |
| 3 | `tenants` | `tenants` (slug PK, name, created_at) |

All migrations run via `DbRunner.exec` (portable SQL). Apply → rollback → re-apply converges (proven on SQLite, the CI reference per A-17).

---

## 5. Honest scope notes

1. **React UIs (M-ID.3 wizard/login/tenants/DbStep)** — the API layer + the DB picker are fully functional and tested. The React components (`SetupWizard.tsx`, `LoginScreen.tsx`, `TenantsPanel.tsx`, `DbStep.tsx`) are a documented follow-up: the backend API they call is proven (setup/login/provision/DB-picker gates). The no-leak gate for the builder SPA extends to these when added.
2. **Live CF provisioning (D1 create + secret put + deploy)** — `provision-d1.ts` + the deploy flags are fully implemented with mocked-wrangler gates. The live `wrangler d1 create` / `wrangler secret put` / `wrangler deploy` are the user's manual step (consistent with all prior phases). The artifact + local boot proof (`deployability.mjs`) passes.
3. **D1/cloud live tests** — credential-gated (A-17). SQLite authoritative; the parameterized runner gate proves D1 via a mock binding; the live D1 REST gate runs when `D1_*` env is present.
4. **Deploy seed flags** (`--admin-email/--admin-password` → `wrangler secret put`) — the deploy command wires the flags, but the `deploy-seed.mjs` gate (ID.1.7) is a pending follow-up (the scaffold worker reads `ADMIN_EMAIL/ADMIN_PASSWORD` env secrets; the wrangler-secret-put logic is in deploy.ts).
5. **`sessionSecret` auto-generation** — deploy generates a 32-byte `SESSION_SECRET`; the worker reads it from env. The generation is in deploy.ts (not separately gated yet).

---

## 6. Package surface added this sprint

| Package | New exports |
|---|---|
| edge-infra | `sqliteRunner`, `libsqlRunner`, `d1RunnerFromBinding`, `d1RunnerFromRest`, `hashPassword`, `verifyPassword`, `timingSafeEqual`, `issueSession` |
| backend | `UserStore`, `TenantStore`, `seedOwner`, `authRoutes`, `meRoute`, `tenantsRoutes`, `setupRoutes`, `requireRole`, `canActOnTenant` (+ `CreateConsoleDeps` extended: `makeRunner`, `sessionSecret`, `setupToken`) |
| compiler | `provisionD1`, `hasD1Binding`, `parseDatabaseId` |

Decisions **A-18** (Identity) and **A-19** (Console DB Unification) recorded in `docs/DECISIONS.md`.

---

## 7. Follow-up backlog

- **React UIs**: SetupWizard, LoginScreen, TenantsPanel, DbStep (the APIs they call are proven).
- **Deploy seed gate** (`deploy-seed.mjs`): proves `wrangler secret put` calls + no-argv leak.
- ~~**Auth mutation harness entries**~~ — **DONE (2026-07-11).** The `test:mutation` harness now formally proves every new auth/DB security gate goes RED on break: password-verify, session-forgery (edge-infra, 6/6), seed-idempotency, hash-no-leak, canActOnTenant, and the setup post-init lock (backend, 7/7). 18 mutation proofs total across 5 packages.
- **Supabase adapter**: port from the product repo behind the M-DB.0 seam (one adapter, flip "coming soon" → enabled). *Reclassification noted: Supabase is a proven port (`SupabaseRestProvider` exists in the product repo), not greenfield — the exact file list awaits the port-parity audit.*
- **Live `wrangler deploy`** to a `*.workers.dev` URL + SW-handover click-test (the user's manual step).

---

## Post-delivery security review (2026-07-11)

A source-level review (not the test claims) found **5 real defects — 2 critical**, and fixed each with a regression test. Green suites had masked them: the tests asserted the *vulnerable* behavior worked.

| # | Severity | Defect | Fix |
|---|---|---|---|
| CRIT-1 | 🔴 | Login hardwired to `_default` store → master_admin (`_root`) + every tenant_admin could **never log in** (multi-tenant half non-functional) | `findByEmailAnyTenant` — cross-tenant email lookup, verify, issue session with matched tenant_slug |
| CRIT-2 | 🔴 | `/setup` took the seeded `role` from the request body → anon first-run caller could mint themselves `master_admin` | role fixed server-side from deploy config (`seedRole`/`ADMIN_ROLE`); body ignored |
| CRIT-3 | 🔴 | `POST /setup/db` had no auth + no post-init lock → anon could swap a **live** console's database | `/setup` + `/setup/db` first-run-only (410) + `SETUP_TOKEN` required; fail closed if token unset |
| MED-4 | 🟡 | Empty/degenerate tenant slug from a name with no alphanumerics | reject empty/reserved slugs → 400 |
| MED-5 | 🟡 | Login returned before any hash on unknown email → user-enumeration by timing | always verify against a dummy hash |

All fixed (commit `91f7ab3`); `setup.mjs` rewritten to assert the secure semantics + each CRIT vector; `provision.mjs` adds the cross-tenant login proof. **The meta-lesson (RULE 8): a green test is not evidence when it asserts the wrong behavior.**

---

**All backend/edge-infra suites green across 5 packages. Frozen edge-core regression intact (parity 14/14, scope). Mutation harness 18/18 RED-on-break. Every golden rule holds.**
