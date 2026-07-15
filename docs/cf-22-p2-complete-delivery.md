# CF-22 P2 — Community Contract Implementation: COMPLETE

**Date:** 2026-07-15 · **Status:** ✅ COMPLETE — **284/284 ops implemented, 0 stubs**
**Repo:** framework `frontbase-framework` (`packages/backend/src/compat`)
**Parent:** [`cf-22-admin-visual-parity-gap.md`](./cf-22-admin-visual-parity-gap.md) §5b

> P2 drove the P1 drift gate's burn-down from 278 stubbed to **zero** — every
> community-contract op (284 across 31 tags) now has a real framework handler on
> the compat surface. The console's entire community API is backed by the framework.

---

## 1. Headline

| Metric | P1 start | P2 Wave 1a | P2 Wave 1b | P2 Waves 2+3 | **P2 COMPLETE** |
|---|---|---|---|---|---|
| Implemented | 6 | 29 | 70 | 153 | **284** |
| Stubbed | 278 | 255 | 214 | 131 | **0** |
| Drift gate | PASS | PASS | PASS | PASS | **PASS** |
| Tags green | 1 | 6 | 9 | 15 | **31** |
| Suite markers | 22 | 23 | 26 | 26 | **26** |

The burn-down table that was P2's worklist is now empty. Every product endpoint
has a framework handler; every response is shape-conformant to the vendored spec.

---

## 2. What shipped (by wave)

### Wave 1a (23 ops) — console-core small tags
Meta(3), settings(12), Themes(3), project(3), security-events(2).
Report: [`cf-22-p2-wave1-delivery.md`](./cf-22-p2-wave1-delivery.md).

### Wave 1b (41 ops) — Builder Studio + Data Studio
- **pages(17):** id-keyed store (migration v9) with CRUD, versions, rollback,
  soft-delete/restore, community publish (worker IS the engine), homepage, public-slug.
- **database(10):** connection state + graceful empty introspection.
- **rls(14):** graceful policy acks + local metadata CRUD.

### Waves 2+3 (83 ops) — Storage, Automations, Auth
- **storage(23):** buckets/files via Phase2Store; graceful netlify/vercel.
- **edge-databases(10):** CRUD via edgeResources; graceful test/discover.
- **Auth Forms(7):** `auth_forms` table (migration v10), CRUD + primary.
- **Workflows(1):** graceful email ack.
- **Actions(24):** drafts CRUD + publish + executions via Phase2Store; static
  routes before params; test creates real execution row.
- **Authentication(18):** login via UserStore+JWT (cross-tenant, constant-time);
  me/security graceful; signup/invite community acks.

### Waves 4+5 (131 ops) — Edge domain + Workspace Agent
- **Edge Engines(33) + Engine Inspector(8) + edge-agent-profiles(4):** CRUD via
  Phase2Store edgeResources('engine'); inspector + management ops graceful
  (self-engine model); agent profiles under the engines path.
- **edge-providers(18):** CRUD via edgeResources('provider'); workspace-agent-token,
  discover, test, turso-databases graceful.
- **edge-caches(7) + edge-queues(7) + edge-vectors(7):** generic CRUD parameterized
  by prefix/kind via edgeResources.
- **edge-api-keys(5):** `edge_api_keys` table (migration v11), reveal-once semantics.
- **edge-gpu(7):** catalog/schemas static; CRUD via edgeResources('gpu').
- **Cloudflare Deploy(4) + Inspector(3) + Deno(1):** all graceful "not configured."
- **agent-integrations(15):** `mcp_servers` + `agent_skills` (migration v11),
  full CRUD + agent-catalogue.
- **Agent MCP(6):** graceful (no MCP server proxy).
- **Agent(3):** chat graceful; credits community shape (no quota).
- **Agent Settings(3):** KeyValueStore-backed.

---

## 3. Architecture decisions

- **Phase2Store reuse:** storage, edge-databases, edge resources (engines/providers/
  caches/queues/vectors), and automations all reuse the existing Phase2Store
  (edgeResources kind-filtered). No duplicate storage for config-record domains.
- **Product-shaped stores:** pages (id-keyed with versions, migration v9) and
  template variables (migration v7) have their own tables — their shapes are too
  different from the framework's slug-keyed published_pages / key-value variables.
- **Graceful community defaults:** many product ops require external services
  (Supabase, Redis, LLM provider, email, Cloudflare API) the community worker
  doesn't configure. These return the product's own "not configured" ack shapes
  (verified against the vendored spec) — the console degrades to an error card or
  empty state, never a blank page or a crash.
- **Auth:** login reuses the framework's UserStore + JWT session signing (cross-
  tenant CRIT-1, MED-5 constant-time). The compat app's `createCompatApp` was
  extended with optional `sessionSecret` + `userStoreFor`.

---

## 4. Verification

```
contracts:check (staleness) ......... framework.openapi.json up to date
contracts:emit determinism ......... byte-identical
contracts:diff (drift gate) ........ 284 implemented, 0 stubbed, 0 missing, 0 divergent — PASS
backend suite ...................... 26 markers PASS (4 live suites SKIP no creds)
pnpm -r build ...................... all packages incl. cf-full (435.9 KB SPA)
```

The contract-diff mutation proof was updated: since all ops are implemented (no
stubs), it corrupts an implemented op's schema (not a stub's) and confirms the gate
detects the divergence.

---

## 5. Migration inventory

| Version | Name | Tables |
|---|---|---|
| v7 | template_variables | `template_variables` |
| v8 | themes_and_security_events | `themes`, `security_events` |
| v9 | compat_pages | `compat_pages`, `compat_page_versions` |
| v10 | auth_forms | `auth_forms` |
| v11 | edge_agent_tables | `edge_api_keys`, `edge_agent_profiles_compat`, `mcp_servers`, `agent_skills` |

---

## 6. Post-delivery review (2026-07-15) — 2 issues found + fixed

A fresh-eye review of the P1/P2 reports vs the implementation (the P0 discipline
that catches what the drift gate can't — the gate only sees *shape*, not auth or
runtime behavior) found **two real issues**, both fixed with a regression test:

1. **RULE-2 auth regression (security).** `registerAuthCompatRoutes` mounted the
   ENTIRE Authentication tag — including the 10 authenticated ops (`/api/auth/me`
   + the 9 `/api/auth/security/*` endpoints) — BEFORE `defaultDenyAuth`. An
   **anonymous** caller could read/modify the IP blocklist, toggle the WAF, and
   read audit logs. Split into `registerAuthCompatUnauthRoutes` (login/logout/
   signup/forgot/reset/invite/accept/check-slug, before the guard) and
   `registerAuthCompatAuthedRoutes` (me + security, AFTER the guard). Verified:
   all 10 authed ops now 401 for anon; login still bypasses the guard + issues a
   cookie; full param-less-GET anon sweep shows 0 leaks. Locked by
   `test/compat-auth-guard.mjs` (4/4).
2. **schema.ts drift (A-13).** The 4 Wave-4/5 tables (`edge_api_keys`,
   `mcp_servers`, `agent_skills`, `edge_agent_profiles_compat`) existed in
   migration v11 but were missing from `schema.ts` (the documented single source
   of truth). The migration test only checks convergence, not schema.ts parity,
   so it passed despite the drift. Added all four to `schema.ts`.

Post-fix: full 27-marker suite green, drift gate PASS, spec unchanged (the auth
split doesn't alter the emitted contract).

## 7. What's next: P3 (approach decided — deploy-time UI fetch)

P3 (#109) mounts `createCompatApp()` at `/api` in the cf-full worker and serves
the product's **built community console bundle**. **Decision (owner, 2026-07-15):**
the console artifact is fetched from the **product repo at deploy time** (Option
B — private release / build-time fetch), keeping the framework repo clean and
Apache-2.0-safe; switchable to fully-open (Option A) later with one change.

### P3 build order & follow-ups
1. **Mount reconciliation.** The cf-full worker already mounts `/api/console/*`
   (the existing MVP admin API) + the engine catch-all. `createCompatApp` serves
   the product's `/api/*` paths — these OVERLAP the engine's `/api/*` Edge Data
   Proxy. Decide precedence: compat `/api/*` must be matched BEFORE the engine
   catch-all, and NOT shadow `/api/console/*` (keep both until the SPA cuts over).
2. **createCompatApp deps wiring.** Pass `sessionSecret` (SESSION_SECRET) +
   `userStoreFor` so the auth surface is live (else login 501s). The runner is
   the same env-bound D1 as the console. Migrations v7–v11 must run on boot
   (extend the cf-full boot migration call — currently runs the console set).
3. **Console bundle fetch.** `examples/cf-full/build.mjs` (or the deploy script)
   fetches the product's `VITE_DEPLOYMENT_MODE=community` build output from a
   pinned product release/artifact; serve via Workers Static Assets (`[assets]`)
   — the 1.18 MB bundle exceeds the inline-worker budget (confirmed P0/W3).
4. **Auth cookie contract.** The compat login issues `fb_session` (HttpOnly).
   Confirm the product community SPA reads auth from `/api/auth/me` (cookie-based)
   — it does in self-host mode (no Bearer). No SPA change needed.
5. **Single-tenant pin.** The compat surface resolves ONE tenant. cf-full's
   `resolvePrincipal` already yields a single-tenant principal; confirm it maps
   to the compat stores' tenant.
6. **E2E smoke.** A Playwright happy-path per nav area against the deployed
   worker becomes the permanent parity smoke (planned in §5c).

### Known runtime gaps to carry into P3 (graceful-by-design, not bugs)
Many Wave 2–5 ops return the product's **"not configured"** shapes because the
community worker has no external service wired: RLS/datasource introspection
(no Supabase), storage providers (netlify/vercel/upload — no R2 bytes yet),
edge provisioning (no CF API token at runtime), agent chat/MCP (no LLM provider),
email send. These match what the product FastAPI returns when the same services
are absent, so the console degrades to empty states / error cards — **verify each
against the real product UI during P3 E2E** and file any shape mismatches as P3
follow-ups (the drift gate guarantees the schema matches; only live UX can
confirm the *value* shapes the console expects).
