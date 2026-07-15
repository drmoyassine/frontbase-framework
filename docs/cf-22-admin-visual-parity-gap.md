# CF-22 — Admin Console 100% Visual + Functional Parity

**Single source of truth for CF-22.** This document supersedes and replaces all
prior CF-22 status/delivery/audit/incident docs (see [§11 Document history](#11-document-history)).
Where any older note conflicts with this file, this file controls.

- **Date:** 2026-07-14 (created) · **Updated:** 2026-07-16 (v6 — consolidated single source of truth)
- **Status:** 🟡 **IN PROGRESS — NOT COMPLETE.** The contract pipeline and the
  route/shape coverage exist and the console is locally integrated, but **behavior,
  security, cross-repo pin sync, and real-deploy/owner acceptance are open.** Do not
  represent CF-22 as delivered.
- **Owner scope constraint:** parity targets the **self-host / single-tenant /
  community edition** only. Cloud-only surfaces (tenants directory, plans manager,
  billing, SuperTokens/signup/invite, agent quota) are out of scope.
- **Console-artifact posture (decided):** **(B) deploy-time fetch from the product
  repo** — the framework repo stays clean of the commercial console bundle
  (Apache-2.0-safe). Reversible to (A) fully-open later by un-ignoring the artifact
  directory (one commit).

---

## 0. TL;DR — where CF-22 actually stands

| Phase | What it is | Honest status |
|---|---|---|
| **P0** | Product repo emits a committed, typed OpenAPI contract + generated client | ⚠️ **Pipeline works; committed artifact currently lags source.** The product `contracts/openapi.{full,community}.json` are regenerated-but-uncommitted (`git status` dirty). Re-run + commit to green. |
| **P1** | Framework emits its own spec + drift gate vs the vendored product contract | ⚠️ **Inventory gate, not conformance gate.** The emitted spec is *cloned* from the product doc and stamped by a manual registry — it proves an endpoint is *registered*, not that its handler accepts/returns the right shapes. Only the `variables` tag is Zod-validated. |
| **P2** | 285 compat handlers implementing the community contract | ⚠️ **Route/shape coverage complete; behavior + security incomplete.** Many Wave 2–5 handlers are empty-state/success-shaped placeholders. **One 🔴 CRITICAL security defect (plaintext API keys) and one 🔴 HIGH defect (no-op password reset).** No Wave 2–5 behavior tests, no tenant-isolation matrix, no auth mutation proofs beyond the guard split. |
| **P3** | Serve the product console from the cf-full worker | ⚠️ **Locally integrated; acceptance open.** Routing/auth/static-assets/setup-hardening are real and smoke-green (21/21). No Playwright, no real-CF deploy proof, console/contract pins mismatch, no owner sign-off. A field incident (two dashboards) was found and remediated. |

**Current machine-verified facts (2026-07-16):**
- Framework drift gate: **285 implemented / 1 stubbed (`GET /`, engine-owned) / 0 missing / 0 divergent** vs the *vendored* contract (`PASS`).
- Vendored community contract: **286 ops / 202 schemas / 31 tags** (the 286 includes 2 `OPTIONS` ops the early P1/P2 counts omitted; hence the historical 284).
- Framework backend suite + cf-full smoke (21/21): green. Worker 233.8 KB gzip (< 1 MB).
- **Pin mismatch:** `PRODUCT_COMMIT = afe9e03…` (contract) ≠ `CONSOLE_PIN.commit = bf1ac54…` (console bundle). Different product revisions.

The path to done is [§8 Recovery plan (Gates 0–4)](#8-recovery-plan--the-authoritative-worklist).

---

## 1. Why this exists — CF-18's "FULL PARITY" measured the wrong axis

CF-18 was marked "FULL PARITY" but measured **functional-area coverage** — all 11
sidebar nav areas had *a* working UI over real framework routes. It never measured
**visual/UX depth**. The CF-18 Phase-1 plan said so explicitly (*"MVP pages are
simpler than the product's — by design"*), but once CF-18 was stamped done, no
tracked item carried the admission forward. The gap was known at design time, then
lost in the bookkeeping. CF-22 re-opens it. The first real-world deploy
(`pnpm run deploy:cf-full`) confirmed the field verdict: the deployed console
"looks super poor" next to a product deployment.

## 2. The numbers (why it looked poor)

Both consoles share the **same shell** (the framework `Layout.tsx` ports the
product's `UnifiedShell`; theme tokens are byte-for-byte the product's HSL vars).
**The sidebar matched; everything behind it didn't.**

| Dimension | Framework `@frontbase/admin-console` (pre-CF-22) | Product `Frontbase-` console |
|---|---|---|
| Total SPA source | ~2,200 lines (30 files) | 413 tsx files; dashboard+admin ≈ 11,500 lines |
| UI primitives | 6 hand-rolled, zero Radix | 52 shadcn/ui primitives |
| Data layer | raw `useEffect`/`useState` | TanStack Query v5 (+ persist) |
| Feedback | inline text errors | sonner toasts + confirm dialogs |
| Dark mode | `.dark` vars exist, never set | `next-themes` toggle |
| Builder | 295-line embedded canvas | dedicated 110-tsx-file studio |
| Bundle | 184.78 KB gz | 1.18 MB gz main chunk |

Per nav area the old framework page was 5×–22× thinner than the product panel.
(Cloud-only absences — TenantsDirectory, PlansManager — are out of scope.)

> **Note (v5/v6):** the "framework `@frontbase/admin-console`" column describes the
> **pre-CF-22 UI, now retired.** CF-22's whole point is to stop shipping that thin
> rewrite and serve the *product's own* console instead. See [§7 The field incident](#7-the-field-incident-two-dashboards).

## 3. Root cause

CF-18 chose (correctly, for MVP speed) "port the shell, rewrite the pages" because
product pages were coupled to ~80 FastAPI endpoints the framework lacked. Phases 2–3
grew the framework *backend* to functional parity but kept the thin rewritten
*frontends*. Result: parity of capability, not of experience.

## 4. Strategy — why we serve the product's real console, not a copy

The real choice is **fork vs share**, not "port vs rewrite." Any strategy that
copies product UI source into the framework creates a fork: complete on copy day,
silently decaying after — no completeness guarantee, no drift story, and (for a
wholesale copy) two divergent 400-file trees dragging in cloud-only coupling.

**What unlocks the better strategy (verified in the product repo):**
1. FastAPI emits OpenAPI for free (~30+ routers).
2. The frontend already has a centralized API seam (`src/services/*`).
3. **The community console already exists as a build configuration of the product**
   (`isCloud()` edition gating + self-host env-var admin mode) — nothing to "port."
4. Built product SPA is 1.18 MB gz → exceeds the inline-worker budget → Workers
   Static Assets (already the documented path).

**Decision: contract-first, artifact-reuse.** The framework backend becomes a
drop-in for the community-edition FastAPI contract, and the worker serves the
product's **built** console bundle. Visual parity is 100% by construction (same
compiled frontend); completeness is machine-checked (spec diff); drift is an
automated alarm, not human memory. Source-level shared-package extraction (option C)
needs the same contract work anyway — deferred until it earns its cost.

**The load-bearing risk this strategy trades for:** "the same compiled frontend"
only yields real parity if the compat backend returns the **shapes and behaviors**
the console actually consumes. That is exactly where CF-22 is currently incomplete
(§5 P1/P2). Contract-shape conformance ≠ behavioral conformance.

---

## 5. Phase design + current status

The plan is P0 (product contract) → P1 (framework gate) → P2 (implement 286 ops) →
P3 (serve console + acceptance). The design intent per phase is below; each carries
its **honest current status** and links to the [§8 recovery gate](#8-recovery-plan--the-authoritative-worklist)
that closes it.

### P0 — Product-repo pre-pass · ⚠️ pipeline works; artifact uncommitted
**Intent:** the product's FastAPI backend emits a committed, deterministic, fully
typed OpenAPI contract + a generated typed client — the source of truth everything
downstream consumes.

**Delivered (product repo `32b689b` + `70df2d6`):** 341/341 ops typed (was ~70);
unique operationIds; derived `x-edition` tags; committed
`contracts/openapi.{full,community}.json` (286 community + 55 cloud-only, 202
community schemas, 31 tags); untyped-response ratchet; `@hey-api/openapi-ts`
generated client (`src/client/`); `.github/workflows/contracts.yml` (staleness +
hygiene + client-staleness + tsc). Two real bugs fixed en route: non-deterministic
export (9 duplicate pydantic class names → `PYTHONHASHSEED`) and a would-500
`AuditLog.id` int-vs-UUID typing. Pinned `fastapi==0.139.0` (the fastapi version is
part of contract determinism).

**Current gap (→ Gate 0):** `contracts/openapi.{full,community}.json` in the product
repo are **regenerated-but-uncommitted** — the pipeline is green (`export --check`
prints no "stale" error) but the working tree is dirty, so a fresh clone would build
a spec that differs from HEAD. Commit the regenerated artifacts, and pin the same
product commit for both the contract and the console bundle.

*Deferred (not blocking):* the 18 remaining product-side `src/services/*` → generated-client migrations (product task #111).

### P1 — Framework contract + drift gate · ⚠️ inventory gate, not conformance gate
**Intent:** the framework emits its OWN OpenAPI spec for the compat surface and CI
diffs it against the vendored product contract, so a missing/divergent endpoint is
machine-detected forever. Ship the machinery + one fully-conformant proof tag.

**Delivered (`d1213ed`):** contract vendoring (`packages/backend/contracts/`, pinned
via `PRODUCT_COMMIT` + `scripts/sync-contract.mjs`); the compat sub-app
(`packages/backend/src/compat/`) with table-driven stubs; deterministic
`framework.openapi.json` emitter; the `contract-diff.mjs` gate (native Node — the npm
`oasdiff` package is a placeholder); the `variables` proof tag (6 ops, Zod-validated);
a RULE-8 mutation proof. **Deviation:** `@hono/zod-openapi` needs zod v4; the
framework is zod 3, so the documented fallback was taken (plain Hono + vendored zod
for validation + vendored JSON-Schema for emission).

**Current gap (→ Gate 1):** `buildFrameworkSpec()` **clones** the paths/operations/
schemas from the vendored product document and stamps a manual `x-implemented`
boolean from the registry (`packages/backend/src/compat/spec.ts`). Consequently a
handler can accept the wrong body, skip validation, or return the wrong runtime
shape while the emitted spec stays green — the gate proves an endpoint is
*registered*, not *conformant*. The mutation proof catches edits to emitted JSON,
not divergence in handler code. Only `variables` visibly parses responses with
vendored Zod. Also: the binary `x-implemented` flag conflates "real handler" with
"graceful placeholder."

### P2 — Implement the 286-op community contract · ⚠️ shape coverage complete; behavior + security incomplete
**Intent:** drive the drift-gate burn-down to zero, wave by wave, where **done per op
= shape-conformant + behavior test against the product client's exact call +
persisted/provider round-trip + failure-path + (credential-gated) live gate**.

**Delivered (`fb1b625` → `d5e21cd` → `36b47ff` → `948b109`, + review `adb6e0d`):**
285 compat handlers across all 31 tags on the `/api/*` surface (the 286th op,
`GET /`, is engine-owned). Migrations v7–v11 add 9 tables. Reusable pattern: most
edge/agent tags map onto `Phase2Store.edgeResources(kind)` CRUD or return the
product's "not configured" ack shapes. A P1/P2 review (`adb6e0d`) already fixed a
**RULE-2 auth regression** (10 authed ops — `/api/auth/me` + 9 `/api/auth/security/*` —
were reachable by anonymous callers; split into unauth-before-guard +
authed-after-guard, locked by `test/compat-auth-guard.mjs`) and a schema.ts drift
(4 Wave-4/5 tables missing from the Drizzle source-of-truth).

**Current gaps (→ Gates 2 & 3):**

- 🔴 **CRITICAL — plaintext API keys.** `compat/routes/edge-misc.ts` generates a raw
  `fbk_*` key, stores it verbatim in `edge_api_keys.key_hash`, and
  `GET /api/edge-api-keys/{key_id}/reveal` returns it on **every** call. DB
  disclosure yields usable keys; any authed caller can re-reveal indefinitely. The
  P2 report's "reveal-once semantics" claim was **false**. Fix: store only a
  verifier hash (or separately-encrypted ciphertext with an atomic, audited,
  one-time reveal), add a migration, never reinterpret existing plaintext as a hash.
- 🔴 **HIGH — no-op password reset.** `POST /api/auth/reset-password` returns
  `success: true` unconditionally; it validates no token and changes no password.
  `forgot-password` issues no token. Fix: real reset tokens (expiry, single-use,
  password change, session invalidation, non-enumerating responses) — or mark the
  ops explicitly unsupported and remove them from any "functional" count.
- 🟠 **HIGH — "implemented" = registered, not functional.** Representative
  placeholders: `database/connect` persists only `{connected:true}` and introspection
  returns empty; storage upload/provider flows return empty/"not configured"; action
  `rollback` always reports no previous version and `test-node` returns
  `{success:true, result:null}`; blocklist/WAF/bot-protection settings aren't
  persisted; edge health always "healthy"; GPU/agent-chat/MCP are catalogs/empty
  responses. Graceful degradation is valid *only* for a genuinely unconfigured
  external provider, with an explicit capability state and a test against the
  product's real unconfigured behavior — it is not the same as implementing the op.
- 🟠 **HIGH — no behavior/tenant/mutation test coverage for Waves 2–5.** Present
  compat suites: `variables`, `auth-guard`, `wave1`, `wave1b`. Missing: exact-client
  behavior matrices for Waves 2–5, per-tag fuzz, an adversarial two-tenant matrix
  (tenant-A must not read/mutate tenant-B across every identifier-bearing route,
  bulk op, nested resource, and secret reveal), and auth-adjacent mutation proofs.
  Tenant isolation is **not proven** (not proven broken either — stores do pass
  `tenant_slug`).

### P3 — Serve the real console + acceptance · ⚠️ locally integrated; acceptance open
**Intent:** a fresh `deploy:cf-full` serves the product's actual community console
from the worker, authenticated against the framework backend, with Playwright E2E
per nav area and owner field-test sign-off.

**Delivered (`e8e8652` + `6816275`):**
- **Routing (the hard part):** compat sub-app mounted before the engine so its
  specific `/api/*` paths match first and fall through to the engine catch-all;
  the compat guard scoped to `/api/*` (excluding `/api/console/*`) so it no longer
  401s `/`, `/sw.js`, `/frontbase-admin/*`; `GET /` excluded from stubs (engine owns
  the root). Final order: `/frontbase-admin[/*]` (SPA) → `/console`→301 → compat
  `/api/*` + `/health` → engine (pages, `/sw.js`, `/api/console/*`).
- **Static Assets (D2):** `scripts/fetch-console.mjs` builds the product
  `vite build --mode community` from a local checkout → `console-dist/`, writing
  `CONSOLE_PIN` (commit + sha256). `console-dist/` gitignored except the pin;
  `[assets]` with `run_worker_first = true`; hashed assets immutable-cached,
  `index.html` no-cache.
- **Auth (D3):** compat login issues `fb_session`; SPA reads `/api/auth/me`
  (`is_master:true` for master_admin). Cookie name is server-internal — kept as
  `fb_session`, shapes are what matter.
- **Verification:** cf-full smoke **21/21**, backend suite green, worker 233.8 KB gz.

**Current gaps (→ Gate 4):**
- ❌ **No Playwright** (11-area nav suite with real create/list/update/delete +
  screenshots) — the parent D4 exit criterion. The in-process smoke proves routing +
  auth + one CRUD chain; it does not prove every rendered area works with the compat
  response shapes.
- ❌ **No real-Cloudflare deploy proof** (a fresh `wrangler` deploy with browser
  login/render + secure-cookie/asset-cache verification).
- ⚠️ **Pin mismatch:** console (`bf1ac54…`) and contract (`afe9e03…`) are built from
  different product commits (→ Gate 0).
- ❌ **No scheduled cross-repo drift** (re-vendor from the product repo on a
  schedule; current CI only compares against the already-vendored snapshot).
- ⚠️ **Legacy `/api/console/*` retirement** gated on an endpoint-consumer map + the
  E2E suite (do not remove by name/association).
- ❌ **No owner field-test sign-off.**

---

## 6. Console-artifact posture (decided: B)

Serving the product's built console from the Apache-2.0 framework worker means
distributing the (compiled) commercial console.
- **(A) Open** — the community console is deliberately open; it *is* the community edition. **Forever.**
- **(B) Deploy-time fetch / private artifact (CHOSEN, DEFAULT)** — the framework repo
  stays clean; `console-dist/` is gitignored except `CONSOLE_PIN`; the deploy fetches
  the bundle. **Reversible to (A) by un-ignoring the directory — one commit.**

P0–P2 are identical under either. (B) is the current implementation.

---

## 7. The field incident — two dashboards (remediated)

**What happened (2026-07-16):** the first real Cloudflare deploy exposed **two SPAs**.
P3 had staged the *entire* legacy `@frontbase/admin-console` build merely to reuse its
first-admin setup screen. After setup, the setup component's `HashRouter` navigated to
`/setup#/dashboard` — the **retired** framework dashboard, whose master-admin sidebar
showed Tenants and Plans. This made a *community* deploy look multi-tenant. The correct
product console was reachable separately at `/frontbase-admin/dashboard`.

**Not a data/isolation breach:** the deployment used its own D1; no product cloud
backend was present; the setup claim stayed in the URL fragment, was removed from
history, and was exchanged for a scoped HttpOnly setup cookie as designed.

**Remediated (`6816275`):** the admin-console now emits a **setup-only** entry (no
legacy layout/login/dashboard/Tenants/Plans routes, no `HashRouter`); setup
authenticates via `/api/auth/login` and hard-navigates to `/frontbase-admin/dashboard`;
the worker 302-redirects initialized `/setup` requests to the product dashboard (old
hash bookmarks can't resurrect the retired UI); an artifact gate fails if the setup JS
contains legacy Admin-Tools/Tenants/Plans markers; worker smoke covers the redirect.
No backend route was removed. The product console at `/frontbase-admin` is now the sole
reachable dashboard.

**Contributing factors (lessons):** parallel-run `/api/console/*` made the retained
legacy SPA look operational rather than fail fast; the smoke proved `/setup` *rendered*
but not the post-setup *destination*; no artifact-content gate asserted the setup JS
excluded dashboard routes; the master_admin role legitimately needed for product admin
also lit up cloud-like legacy nav.

---

## 8. Recovery plan — the authoritative worklist

Sequential gates. **Do not mark a phase complete from route count, response shape, or
smoke count alone.** Each gate has a machine-checkable exit.

### Gate 0 — one source revision (blocks all later acceptance)
1. In the product repo: regenerate + **commit** community/full OpenAPI + generated
   client until every P0 staleness/type gate is green on a clean tree.
2. Pick that exact product commit for **both** `PRODUCT_COMMIT` (contract) and
   `CONSOLE_PIN` (console bundle).
3. Re-vendor contract/Zod (`sync-contract.mjs`), rebuild the console
   (`fetch-console.mjs`), and **fail the deploy when the two pins differ.**
4. Review the resulting op/schema diff as an intentional migration.
- **Exit:** product contract committed + current; both pins equal; both repos' contract checks green on clean trees.

### Gate 1 — repair P1 conformance semantics
1. Generate request/param/response validators from the vendored OpenAPI and wrap
   every compat handler (or move to a route-definition system that emits its own
   spec). Build `framework.openapi.json` from the *registered route definitions*,
   not by cloning the product doc.
2. Add a runtime route sweep for every method/path (incl. `OPTIONS`) with negative/
   fuzz cases (required fields, wrong types, path/query params, status codes, bodies).
3. Replace binary `x-implemented` with `stub | shape-only | functional | external-disabled`.
4. Make **handler** mutations (not just JSON edits) turn CI red.
- **Exit:** changing a handler's accepted request, response, auth placement, or registration fails a gate.

### Gate 2 — security + tenant isolation (before more P2 feature work)
1. Fix API-key storage/reveal (verifier hash or encrypted ciphertext; atomic audited
   one-time reveal; revocation; additive migration; never reinterpret plaintext).
2. Real password-reset tokens (expiry, single-use, password change, session
   invalidation, non-enumerating).
3. Persist + enforce blocklist/WAF/bot settings where support is claimed — else mark
   `external-disabled` and drop from "functional" counts.
4. Generated two-tenant matrix over every identifier-bearing compat route, bulk op,
   nested resource, secret reveal, and provider action.
- **Exit:** no recoverable plaintext key material; auth mutation gates pass; tenant-B cannot observe/mutate tenant-A resources.

### Gate 3 — complete P2 by behavior, wave by wave
Reopen Waves 2–5. Per op: exact product-client call, meaningful state/provider
effect, persisted round-trip, response validation, failure-path coverage, cleanup.
Credential-gated provider tests may skip with notice; the op stays `external-disabled`
(not `functional`) until a live gate passes. Suggested order: **Authentication/security
→ Storage/data → Actions → Edge lifecycle/inspector → Agent/MCP.**
- **Exit:** every in-scope op is `functional` or an owner-approved, recorded descope; P2 exit criteria actually green.

### Gate 4 — finish P3 acceptance + cutover
1. 11-area Playwright suite against `wrangler dev` with real CRUD + failure screenshots.
2. Same subset against a fresh Cloudflare deploy; verify secure cookie flags + asset caching.
3. Scheduled cross-repo drift (explicit product repo/ref + credential): alert on
   source-contract staleness, pin mismatch, endpoint/schema drift, stale console hash.
4. Owner visual/functional sign-off, then retire the legacy SPA + `/api/console/*`
   per the endpoint-consumer map (retain `/api/console/setup/*`; add explicit
   404/410 retirement assertions).
- **Exit:** 11/11 browser acceptance; fresh-deploy proof; matching committed pins; scheduled drift green; redirect/retirement complete; **owner sign-off recorded.**

### Closure rule
- **P0 complete:** current source artifacts + generated client deterministic and committed.
- **P1 complete:** handler-derived contract + runtime validation detect real code drift.
- **P2 complete:** product-client behavior, security, persistence/provider effects, and tenant isolation are tested.
- **P3 complete:** real browser/deploy parity, permanent drift, cutover, and owner sign-off.
- **CF-22 complete:** the original complaint ("looks super poor") is falsifiable against the same console the product ships — signed off by the owner on a fresh deploy.

---

## 9. Key implementation facts (do not rediscover)

- **Self-host SPA base path:** `basename="/frontbase-admin"` (`src/lib/edition.ts:28`), NOT `/console`.
- **Cookies:** product self-host uses `frontbase_session`; the framework issues `fb_session`. The SPA reads neither (HttpOnly) — only login success + browser replay matter. Kept `fb_session`; shapes are the contract.
- **Compat mount:** `/api/*` (product paths), a sibling of the legacy `/api/console/*` (parallel-run) and the engine catch-all. Compat guard scoped to `/api/*` excl. `/api/console/*`.
- **`GET /`** is always the engine's (eSSR pages) — excluded from compat stubs (the 1 stub in the gate table, by design).
- **Op count:** vendored community = **286** (incl. 2 `OPTIONS`); the historical "284" omitted `OPTIONS`. Framework emits 285 compat-routed + engine-owned `GET /`.
- **Migrations added by CF-22:** v7 `template_variables`, v8 `themes`+`security_events`, v9 `compat_pages`+`compat_page_versions`, v10 `auth_forms`, v11 `edge_api_keys`+`edge_agent_profiles_compat`+`mcp_servers`+`agent_skills`.
- **`@hono/zod-openapi` blocked** on zod v4 (framework is zod 3) → plain Hono + vendored zod. **`oasdiff` npm package is a placeholder** → native-Node `contract-diff.mjs`.
- **fastapi pinned `==0.139.0`** in the product repo — its version changes the emitted spec, so it is part of contract determinism.
- **One-command bumps:** contract = `sync-contract.mjs` + commit pin; console = `fetch-console.mjs` + commit pin.

## 10. Non-goals

- Cloud edition: tenants directory, plans manager, billing (F8b deferred), SuperTokens/signup/invite, agent chat/quota.
- A `--multi-tenant` deploy flag — a real multi-tenant deployment needs the full cloud contract + tenant-isolation acceptance, out of scope.
- Deleting legacy `/api/console/*` routes by name/association — only after the consumer map + browser suite prove them unused.
- Source-level shared console package (option C) — revisit post-launch only if artifact reuse proves insufficient.

## 11. Document history

This file is the **sole** CF-22 status/plan document. The following were folded in and
should be treated as superseded (retained in git history only):

| Former doc | What it was | Where it lives now |
|---|---|---|
| `cf-22-p0-delivery.md` | P0 delivery report | §5 P0 + §9 |
| `cf-22-p1-delivery.md` | P1 delivery report | §5 P1 + §9 |
| `cf-22-p2-wave1-delivery.md` | P2 Wave 1a report | §5 P2 |
| `cf-22-p2-complete-delivery.md` | "P2 complete" report (premature) | §5 P2 + §8 Gates 2–3 |
| `cf-22-p3-delivery.md` | P3 report (self-corrected to "acceptance incomplete") | §5 P3 + §8 Gate 4 |
| `cf-22-setup-console-cutover-incident.md` | field incident report | §7 |
| `cf-22-p0-p3-audit.md` | independent end-to-end audit | §0, §5 statuses, §8 recovery plan |

**Verdict of the consolidation:** the audit's findings were independently
re-verified against the code (plaintext API keys, no-op password reset, pin
mismatch, inventory-not-conformance gate — all confirmed; the P0 "staleness red"
finding is now more precisely "regenerated-but-uncommitted"). CF-22 is **not
complete**; §8 is the path to done.
