# Identity & Provisioning Sprint Plan — Owner Login, Multi-Tenant Admin, Setup Wizard (M-ID.1–M-ID.3)

**Audience:** a junior implementer agent. **Every decision is pre-made below — do not invent alternatives.** If something is genuinely undecidable from this plan, STOP and write it into `docs/plans/identity-blockers.md`; do not guess.
**Status:** Ready to execute. Phases 0–2 done; Phase 3 M3.0+M3.1 done. This adds the **identity layer** the framework is missing (it can *verify* a session but cannot *create* one — no users table, no login, no seeding).
**Repo:** `frontbase-framework`. **Packages touched:** `@frontbase/backend` (users, login, seeding, provisioning), `@frontbase/edge-infra` (session issuance + PBKDF2, reusing its Web-Crypto module), `@frontbase/compiler` (deploy flags), `@frontbase/builder` (M-ID.3 UI). No new packages (A-14: six is fixed).
**Author:** Architecture, 2026-07-10.

---

## 0. Read this first (orientation — 30 min, DO NOT SKIP)

The framework already **validates** a login but cannot **issue** one. Your job is the missing half. The good news: `createResolvePrincipal` in `edge-infra/src/proxy/auth.ts` already reads and verifies a **signed JWT session cookie** — you only add the users table, password hashing, the `/login` route that *sets* that cookie, and first-run seeding. It slots into existing seams.

**Read, in order, before writing code:**
1. `packages/edge-infra/src/proxy/auth.ts` — `createResolvePrincipal(cfg)`. The `jwtSecret` + `jwtCookie` path (lines ~101+) is what your login must produce a valid cookie for. **This is the contract you issue against.**
2. `packages/edge-infra/src/vault/crypto.ts` — the Web-Crypto (`crypto.subtle`) module. PBKDF2 goes here (RULE 7: no `node:crypto`).
3. `packages/backend/src/db/migrations.ts` — the `Migration` interface (`version/name/up/down`) + `migrateUp`. **The users/tenants tables are new append-only migrations — NEVER edit migration version 1.**
4. `packages/backend/src/index.ts` — `createConsole(deps)`; the `app.use('*', defaultDenyAuth(...))` line. **Login/logout/setup must mount BEFORE that line** (they can't require being logged in).
5. `packages/backend/src/mw/auth.ts` — `defaultDenyAuth`. Note it requires `principal.user` AND `principal.tenant`. In single-site mode the owner's session carries `tenant_slug: '_default'`, so it passes cleanly — **no change to this guard for M-ID.1.**
6. `docs/plans/phase2-cms-sprint.md` §GOLDEN RULES (1–7) and `docs/plans/phase3-agent-experience-sprint.md` §RULE 8. **All apply. This is auth code — RULE 8 is mandatory on every gate.**

**The product repo (read-only reference; A-15 §5 — never import):** `../Frontbase-/services/edge/src/middleware/auth.ts` and `routes/auth.ts` for the login/session shapes; `../Frontbase-/fastapi-backend/app/services/agent_quota.py` era used `_default` tenant — mirror that constant.

---

## DECISIONS ALREADY MADE (the junior makes none of these)

| # | Decision | Value — use exactly this |
|---|---|---|
| D1 | Password hashing | **PBKDF2-SHA256 via `crypto.subtle`**, 600,000 iterations, 16-byte random salt. Stored string format: `pbkdf2$<iters>$<saltB64>$<hashB64>`. No bcrypt/argon (native deps, not edge-safe). |
| D2 | Session token | An **HS256 JWT** signed with `SESSION_SECRET`, set as an **HttpOnly, Secure, SameSite=Lax** cookie named **`fb_session`**. Claims: `{ sub: userId, email, role, tenant_slug, exp }`, 7-day expiry. `createResolvePrincipal({ jwtSecret: SESSION_SECRET, jwtCookie: 'fb_session' })`. |
| D3 | Single-site tenant | Constant **`_default`** everywhere. The seeded owner's session carries `tenant_slug: '_default'`. No tenant concept surfaces to a self-host user. |
| D4 | Roles | `owner` (single-site, M-ID.1). `master_admin` + `tenant_admin` (multi-tenant, M-ID.2). Role travels in the JWT claim → read as `principal.user.role` in backend middleware. |
| D5 | Seeding trigger | On worker boot: if the `users` table is empty AND `ADMIN_EMAIL` + `ADMIN_PASSWORD` env secrets are present, seed the owner. **Idempotent** — never seeds twice, never resets an existing password. |
| D6 | Deploy seeding | `frontbase deploy --admin-email <e> --admin-password <p>` runs `wrangler secret put ADMIN_EMAIL/ADMIN_PASSWORD/SESSION_SECRET` (SESSION_SECRET auto-generated: 32 random bytes, base64). Secrets are encrypted at rest in Cloudflare — never written to code/git/wrangler.toml. |
| D7 | Login/logout/me routes | `POST /api/console/login {email,password}` → set cookie, 200 `{user:{id,email,role}}`. `POST /api/console/logout` → clear cookie. `GET /api/console/me` → current principal (authed). **login/logout mount OUTSIDE default-deny; me is INSIDE.** |
| D8 | Never leak the hash | No endpoint EVER returns `password_hash`. `/me` and login responses return `{id,email,role}` only. (RULE 4 + a no-leak gate.) |
| D9 | edge-core is FROZEN | Do not change `Principal`/`UserContext`. `role` rides in the JWT and the `user` object (structural excess property — allowed). The backend reads `principal.user.role`. |
| D10 | Tenant provisioning (M-ID.2) | Only `master_admin` may create tenants. Creating a tenant seeds its `tenant_admin` with a caller-supplied email + a generated temporary password returned ONCE in the response (never stored plaintext, never logged). |

---

## GOLDEN RULES — 1–7 (Phase 2) + RULE 8 (Phase 3) all apply. This is auth code; treat every gate as security-critical.

Recap: (1) no server code in browser bundles + no-leak tests; (2) authenticated + tenant-scoped, deny-by-default + isolation tests; (3) no shared refs; (4) opaque client errors; (5) end-to-end scaffold builds; (6) single-owner types (alias edge-core); (7) extraction discipline (Web Crypto, no cross-repo imports, zod 3.25, ESM `.js`); **(8) every security/isolation/no-leak/auth gate ships a MUTATION proof — break the guarantee, confirm the gate goes RED, restore.**

**Auth-specific RULE 8 mutations you MUST prove go red (per milestone):**
- Password verify: replace `verifyPassword` body with `return true` → login gate RED.
- Constant-time compare: (documented; timing not unit-testable — note it, don't fake it).
- Seed idempotency: call `seedOwner` twice → a mutation that removes the "user exists?" check makes a "one owner only" assertion RED.
- Session forgery: sign a JWT with the WRONG secret → `resolvePrincipal` must reject (401). Mutation: skip signature verify → gate RED.
- Hash no-leak: mutation making `/me` return `password_hash` → a no-leak assertion RED.
- Cross-tenant (M-ID.2): `tenant_admin` of A touching B → 403. Mutation dropping the role/tenant check → RED. (Reuse the `authz.mjs` shared-DB pattern — one DB, tenant predicate is the only separator.)

**Escape hatch:** a missing seam in a frozen package → `docs/plans/identity-blockers.md` with the exact call you needed.

**Record the decision:** add **Decision A-18 (Identity & Provisioning Layer)** to `docs/DECISIONS.md` summarizing D1–D10 before M-ID.1 closes.

---

## Definition of Done (whole sprint)

A self-hoster runs `frontbase deploy --admin-email me@x.com --admin-password ...`; on first boot the owner is seeded; they log in at `/api/console/login`, get an `fb_session` cookie, and reach the builder/workflows — the public never can (M-ID.1). A master-admin can provision tenants, each with its own admin who logs in identically and is isolated to their tenant (M-ID.2). A browser setup wizard replaces the deploy flags for non-CLI users, and a tenant-management UI exposes provisioning visually (M-ID.3). Every auth gate is mutation-proven.

---

# Milestone M-ID.1 — Single-Site Owner Login + Flag Seeding

**Goal:** a self-hosted single site with a WordPress-style owner backdoor. **Target: Week 1.** This is the foundation both other milestones build on.

### File map
```
packages/edge-infra/src/
├── vault/password.ts          # NEW — PBKDF2 hash + verify (Web Crypto; D1)
└── proxy/session.ts           # NEW — issueSession(claims, secret) → JWT string (D2); reuses auth.ts's JWT verify
packages/backend/src/
├── db/
│   ├── migrations.ts          # EDIT — append migration v2: users table (D4 schema below)
│   └── users.ts               # NEW — UserStore: createUser, findByEmail, countUsers (tenant-scoped; RULE 3 copies)
├── auth/
│   ├── seed.ts                # NEW — seedOwner(store, {email,password,now}) idempotent (D5)
│   └── routes.ts              # NEW — login / logout / me (D7)
└── index.ts                   # EDIT — mount login/logout BEFORE default-deny; me AFTER; call seedOwner at boot
packages/compiler/src/cli/
└── deploy.ts                  # EDIT — --admin-email/--admin-password flags → wrangler secret put (D6)
```

### users table (migration v2 — append; never edit v1)
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  tenant_slug TEXT NOT NULL DEFAULT '_default',
  created_at TEXT NOT NULL,
  UNIQUE (email, tenant_slug)
)
```
`down`: `DROP TABLE IF EXISTS users`.

### Step-by-step
**ID.1.1 — Password module (`vault/password.ts`, D1).** `hashPassword(plain) → 'pbkdf2$600000$<salt>$<hash>'` and `verifyPassword(plain, stored) → boolean`. Use `crypto.subtle.importKey('raw', ..., 'PBKDF2')` + `deriveBits({name:'PBKDF2', salt, iterations:600000, hash:'SHA-256'}, key, 256)`. Compare with the existing `timingSafeEqual`. Gate `edge-infra/test/password.mjs`: hash→verify round-trip true; wrong password false; two hashes of the same password differ (random salt); malformed stored string → false (no throw).

**ID.1.2 — Session issuance (`proxy/session.ts`, D2).** `issueSession({sub,email,role,tenant_slug}, secret, now) → JWT`. HS256 via `crypto.subtle.sign('HMAC',...)`, base64url, `exp = now + 7d`. Gate `edge-infra/test/session.mjs` + **RULE 8**: a session issued with secret S is accepted by `createResolvePrincipal({jwtSecret:S,jwtCookie:'fb_session'})` (round-trip); a session signed with a DIFFERENT secret is REJECTED (forgery → null principal).

**ID.1.3 — UserStore (`db/users.ts`).** `createUser({email,passwordHash,role,tenantSlug})`, `findByEmail(email, tenantSlug)`, `countUsers(tenantSlug)`. Tenant-scoped SQL (every query `WHERE tenant_slug = ?` — A-17). RULE 3: return copies; **never select `password_hash` into a value that leaves the store except for verify** (findByEmail returns it for login verify only). Gate `backend/test/users.mjs`.

**ID.1.4 — Seeding (`auth/seed.ts`, D5).** `seedOwner(userStore, {email,password,now})`: if `countUsers('_default') > 0` → no-op (return `{seeded:false}`); else create `{role:'owner', tenant_slug:'_default'}` with `hashPassword(password)`. Idempotent. Gate `backend/test/seed.mjs` + **RULE 8**: seeding twice yields ONE owner; a mutation removing the count-check makes the "exactly one owner" assertion RED.

**ID.1.5 — Login/logout/me (`auth/routes.ts`, D7).** `POST /login`: `findByEmail` → `verifyPassword` → on success `issueSession` + `Set-Cookie: fb_session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`, return `{user:{id,email,role}}`; on failure opaque `401 {error:'invalid_credentials'}` (RULE 4 — same response for unknown email vs wrong password). `POST /logout`: clear cookie. `GET /me`: return `principal.user` minus hash (D8). Gate `backend/test/login.mjs`.

**ID.1.6 — Wire into `createConsole` (`index.ts`). ⚠️ DEPENDS ON M-DB.0 — do that first.** By this point `createConsole` already takes `{ makeRunner, sessionSecret? }` (from M-DB.0's BLOCKER-1/2 fixes). Mount `login`/`logout` BEFORE `app.use('*', defaultDenyAuth)`; mount `me` AFTER. Build `resolvePrincipal` from `createResolvePrincipal({jwtSecret: deps.sessionSecret, jwtCookie:'fb_session'})` if the caller didn't pass one. **`migrateUp(runner)` + `seedOwner` run LAZILY inside the worker's `getEngine(env)` (M-DB.0 BLOCKER-4) — NOT at `createConsole` construction — because `env.DB` only exists per-request on CF.** Guard with a module-scoped `initialized` flag (once per isolate) + `seedOwner`'s own idempotency. `seed` params (`{email,password,role}`) come from `env.ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_ROLE`. Gate: existing `console.mjs`/`authz.mjs` stay green; new `backend/test/login-e2e.mjs` proves: unauth `/pages` → 401; `POST /login` (seeded creds) → cookie; same cookie on `/pages` → 200.

**ID.1.7 — Deploy flags (`deploy.ts`, D6).** Add `--admin-email`, `--admin-password` to the deploy command. When present (and not `--dry-run`): generate `SESSION_SECRET` (32 rand bytes b64), run `wrangler secret put ADMIN_EMAIL/ADMIN_PASSWORD/SESSION_SECRET` (echo the values via stdin, never argv — they'd leak in process lists). Update the scaffold `worker.ts` to read these env secrets and pass `{ sessionSecret, seed:{email,password} }` to `createConsole`. Gate `compiler/test/deploy-seed.mjs`: the deploy command, in a dry-run+mocked-wrangler mode, issues the three `secret put` calls with the right names and never puts a secret on the argv.

### M-ID.1 acceptance gates
- [ ] `edge-infra`: password round-trip + session round-trip/forgery (RULE 8) green.
- [ ] `backend`: users, seed (idempotent, RULE 8), login (opaque failure), login-e2e (unauth→401, login→cookie→200) green.
- [ ] Hash never leaves any endpoint (no-leak gate; RULE 8 mutation red).
- [ ] `deploy --admin-email/--admin-password` seeds via wrangler secrets (never on argv).
- [ ] Frozen edge-core + all prior suites still green; `pnpm -r test:mutation` still 5/5 + the new auth mutations.
- [ ] **A-18 recorded in DECISIONS.md.**

---

# Milestone M-ID.2 — Multi-Tenant Master-Admin + Tenant Provisioning

**Goal:** a master-admin deployment that provisions tenants, each with an isolated admin. **Target: Week 2.** Depends on M-ID.1 (reuses password/session/users wholesale).

### File map
```
packages/backend/src/
├── db/
│   ├── migrations.ts          # EDIT — append v3: tenants table
│   └── tenants.ts             # NEW — TenantStore: createTenant, listTenants, tenantExists
├── auth/
│   ├── seed.ts                # EDIT — seedMasterAdmin (role 'master_admin', tenant_slug '_root')
│   └── roles.ts               # NEW — requireRole('master_admin') middleware; canActOnTenant(principal, tenant)
└── routes/
    └── tenants.ts             # NEW — POST/GET /api/console/tenants (master_admin only; D10)
```

### tenants table (migration v3)
```sql
CREATE TABLE IF NOT EXISTS tenants (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

### Decisions specific to M-ID.2 (still no junior choices)
- Master-admin: `role='master_admin'`, `tenant_slug='_root'`. Seeded exactly like the owner but via `ADMIN_ROLE=master_admin` env (D5 extended). A deployment is single-site if the seeded role is `owner`, multi-tenant if `master_admin`.
- `canActOnTenant(principal, targetTenant)`: `true` if `role==='master_admin'` (any tenant) OR `principal.tenant === targetTenant`. Everything tenant-scoped routes through this.
- Provisioning `POST /api/console/tenants {name, adminEmail}`: master_admin only → create tenant row + seed a `tenant_admin` user for it with a **generated temp password**, returned ONCE in the response body, never stored plaintext, never logged (D10).

### Step-by-step
**ID.2.1 — TenantStore + migration v3.** `createTenant({slug,name})`, `listTenants()`, `tenantExists(slug)`. Gate `backend/test/tenants-store.mjs`.

**ID.2.2 — Roles (`auth/roles.ts`).** `requireRole(role)` middleware (reads `principal.user.role`, else 403). `canActOnTenant`. Gate `backend/test/roles.mjs`.

**ID.2.3 — seedMasterAdmin (`seed.ts`).** Mirror `seedOwner` with role/tenant per above; idempotent. Extend the boot seeding to pick role from `ADMIN_ROLE` (default `owner`).

**ID.2.4 — Provisioning route (`routes/tenants.ts`, D10).** `POST /tenants` behind `requireRole('master_admin')`: create tenant, generate temp password (16 rand bytes b64), seed its `tenant_admin`, return `{tenant, admin:{email, tempPassword}}` ONCE. `GET /tenants` lists (master_admin only). Gate `backend/test/provision.mjs`.

**ID.2.5 — Cross-tenant isolation (RULE 8, the headline).** `backend/test/tenant-isolation.mjs` — reuse `authz.mjs`'s ONE-shared-DB pattern: master_admin provisions tenant-A and tenant-B; A's `tenant_admin` can CRUD A's pages, gets 403 on B's; master_admin can act on both. **Mutation:** drop the `canActOnTenant` check → an A-admin reaching B goes from 403 to 200 → gate RED. This test MUST exist before the milestone closes.

### M-ID.2 acceptance gates
- [ ] Master-admin seeded by role; provisioning creates tenant + isolated admin; temp password returned once, never stored/logged.
- [ ] **Cross-tenant isolation gate green + mutation-proven (RULE 8).**
- [ ] `tenant_admin` confined to its tenant; `master_admin` cross-tenant; both via `canActOnTenant`.
- [ ] All prior suites + mutation harness green.

---

# Milestone M-ID.3 — Browser Setup Wizard + Tenant-Management UI

**Goal:** a WordPress-style first-run wizard (no CLI needed) + a visual tenant-management screen. **Target: Weeks 3–4.** Depends on M-ID.2.

### Step-by-step
**ID.3.1 — Setup wizard API (`backend/routes/setup.ts`).** `GET /api/console/setup/status` → `{needsSetup: countUsers === 0}`. `POST /api/console/setup {email,password,setupToken}` → only if no users exist AND `setupToken === SETUP_TOKEN` (a deploy secret) → seed owner (or master_admin per `ADMIN_ROLE`) → 200. Once a user exists, both return `410 already_initialized`. Mounts OUTSIDE default-deny. **RULE 8:** a mutation removing the "no users exist" guard lets setup re-run and overwrite the owner → a "setup disabled after init" assertion goes RED.

**ID.3.2 — Wizard UI (`builder/src/setup/SetupWizard.tsx`).** A React screen served at `/setup` (browser SPA route) when `needsSetup`. Email + password + setupToken fields → `POST /setup` → redirect to the builder. RULE 1: browser code, no edge-infra import; extend `builder/test/no-leak.mjs` to the setup entry.

**ID.3.3 — Login UI (`builder/src/auth/LoginScreen.tsx`).** The `/login` screen the builder shows when unauthenticated. Posts to `/api/console/login`, relies on the `fb_session` cookie thereafter.

**ID.3.4 — Tenant-management UI (`builder/src/tenants/TenantsPanel.tsx`).** master_admin-only screens: list tenants, create tenant (calls `POST /tenants`), show the one-time temp password on creation. Gate: a component test that the panel renders the provisioning form and surfaces the temp password once.

**ID.3.5 — Wizard e2e (RULE 5).** `builder`/`backend` e2e: fresh DB → `setup/status` needsSetup → `POST /setup` with token → owner seeded → login works → `setup/status` now false → second `POST /setup` → 410.

### M-ID.3 acceptance gates
- [ ] Setup wizard seeds the first admin in-browser; disabled after init (RULE 8 mutation red).
- [ ] Login + tenant-management UIs functional; builder no-leak still green (RULE 1).
- [ ] Wizard e2e (RULE 5) green.
- [ ] Phase/identity delivery report; mutation harness green including all new auth gates.

---

## Sequencing, risks & guardrails

**Order:** M-ID.1 → M-ID.2 → M-ID.3. Within M-ID.1: password → session → users → seed → routes → wire → deploy (each gated before the next). Do NOT start M-ID.2 until M-ID.1's mutation gates are green — the whole identity layer rests on M-ID.1.

**Top risks (each with its guardrail):**
1. *Auth that looks right but isn't* → RULE 8: mutation-prove password-verify, session-forgery, seed-idempotency, cross-tenant, hash-no-leak. A green auth test is not evidence until it goes red on break.
2. *Secrets leaking* → never on argv (D6, process-list leak), never in git/wrangler.toml, never in a response/log (D8/D10). A no-leak gate on `/me` + provisioning.
3. *Changing frozen edge-core* → D9: role rides the JWT; don't touch `Principal`. If you think you must, file a blocker.
4. *node:crypto creeping in* → D1/D2 use `crypto.subtle` only (RULE 7); a browser-target build must still succeed where relevant.
5. *Setup wizard re-runnable* → the "no users exist" + `SETUP_TOKEN` double guard, mutation-proven (ID.3.1).
6. *Timing attacks on login* → constant-time compare (documented; note it's not unit-assertable — don't fake a timing test).

**Every milestone ends the same way:** gates green → `pnpm -r build && pnpm -r test` green → **all frozen suites still green (regression)** → `pnpm -r test:mutation` green **including the new auth mutations** → commit with the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer → push → tick MILESTONES.

## Quick reference
```bash
pnpm -r build && pnpm -r test
pnpm -r test:mutation                 # auth gates MUST go red on break
# new gates this sprint:
#   edge-infra/test/{password,session}.mjs
#   backend/test/{users,seed,login,login-e2e,tenants-store,roles,provision,tenant-isolation,setup}.mjs
#   compiler/test/deploy-seed.mjs
#   builder/test/setup-e2e.mjs
```
