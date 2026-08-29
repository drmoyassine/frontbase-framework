# CF-22 — Admin Console 100% Visual + Functional Parity

> **🗄️ PIN-ERA MECHANISMS SUPERSEDED 2026-08-28 (A-22, then A-23).** The console
> below is described as it was when written: built from the product repo,
> vendored at a `CONSOLE_PIN`. Both pin-era mechanisms are retired — the console
> source lives in this workspace (`packages/console`, A-22; stage with
> `pnpm console:build`), and consolidation A-23 (same day) inverted the
> contract (framework-owned, pins/sync/drift retired) and consolidated the
> hydration bundle source (`packages/hydrate`; no more `fetch:hydrate` /
> `patch-hydrate`). The body is preserved as the historical record of the
> pin-era design; every pin/sync/drift reference below is retired machinery.

> **🛑 WORK PAUSED 2026-08-06 (owner decision) — reactive only.**
> Automated/proactive framework↔product parity work was stopped; CF-22 will only be revisited to fix regressions the owner personally hits. The remaining gap (the ~34 VIOLATES / 5 UNREACHABLE in the live conformance gate, plus the 2026-07-29 differential run) is **accepted last-mile residue**, not an active target — the live gate is informational only.
> The detailed "IN PROGRESS" status below is the **pre-pause engineering state**, preserved for context and future resumption. *(Banner added 2026-08-07.)*

**Single source of truth for CF-22.** This document supersedes and replaces all
prior CF-22 status/delivery/audit/incident docs (see [§11 Document history](#11-document-history)).
Where any older note conflicts with this file, this file controls.

> **Picking this up cold?** Read [`cf-22-handover.md`](./cf-22-handover.md) first — a
> one-page map (commands, traps, next task) that points back here for the detail.
>
> **Implementing the rest?** [`cf-22-closure-plan.md`](./cf-22-closure-plan.md) is the
> executable plan for everything still open, with the definition of done.

- **Date:** 2026-07-14 (created) · **Updated:** 2026-07-28 (v13 — /api/sync surface made visible; closure plan written)
- **Status:** 🟡 **IN PROGRESS — NOT COMPLETE.** The contract pipeline, the derived
  spec, and response conformance are green and gated; the console is locally integrated.
  **Gates 1c, 2, and 3 are locally closed; real-deploy/browser/owner acceptance
  (Gate 4) remains open.** Response conformance, runtime-derived behavior,
  contract-negative validation, API-key/reset security, and generated tenant
  isolation now run together. Do not represent CF-22 as fully delivered before Gate 4.
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
| **P0** | Product repo emits a committed, typed OpenAPI contract + generated client | ✅ **Green (Gate 0).** The "artifact lags source" reading was a CRLF false positive: `core.autocrlf` rewrote the generated JSON on checkout, so byte-comparing gates saw phantom edits (`--numstat` showed 0 changed lines). Fixed by pinning those paths to LF in `.gitattributes` (product `e79abee`). |
| **P1** | Framework emits its own spec + drift gate vs the vendored product contract | ✅ **Closed.** `x-implemented` is route-derived; every response validates; all operations carry a runtime-derived, fingerprint-gated behavior status; all typed inputs are in the negative sweep. The gates now derive their op counts from the contract rather than hardcoding them. |
| **P2** | 334 operations implementing the community contract | ⚠️ **163 functional; 171 not.** `48 stub / 113 external-disabled / 10 shape-only`. The owner's bar is **100% functional parity** — `external-disabled` is a work item, not an outcome. The earlier "closed" reading counted external-disabled as acceptable AND measured against a 286-op denominator that excluded `/api/sync` entirely. `163 functional / 10 deliberate protocol/catalog shape-only / 113 explicit external-disabled / 0 stub`. API keys are hashed plus one-time encrypted reveal; password reset is expiring, single-use, mutates credentials, and invalidates sessions; 139/139 identifier-bearing operations pass the two-tenant matrix. External-provider operations remain excluded from the functional count until live credentials exist. |
| **P3** | Serve the product console from the cf-full worker | ⚠️ **Deployed and browser-verified; one surface missing.** A live CF deploy plus a 15-case Playwright suite pass, but the console's `/api/sync/*` datasource API is unimplemented (§7a). Routing/auth/static-assets/setup-hardening are real and smoke-green (23 checks). Pins agree and are gated (Gate 0). **Still open:** owner sign-off, scheduled cross-repo drift, legacy `/api/console/*` retirement, and §7a. A field incident (two dashboards) was found and remediated. |

**Current machine-verified facts (2026-07-28, framework `40c2afa` / product `7fbc0b9`):**
- **Response conformance: `CONFORMS 286 / VIOLATES 0 / UNREACHABLE 0 / NO_SCHEMA 0 / STUB 48`.** Every implemented op validates; the 48 are the unimplemented `/api/sync` surface.
- Framework drift gate: **286 implemented / 48 stubbed / 0 missing / 0 divergent**. `GET /` is served as JSON under explicit content negotiation, preserving the eSSR page for browser requests.
- **Browser acceptance: 15/15** (Playwright, Chromium, real Worker on workerd). It found two 404s every in-process gate had missed — the console calls paths without the trailing slash the contract declares, which FastAPI 307s and the framework did not.
- Full runtime-derived behavior gate: **163 functional / 10 shape-only / 113 external-disabled / 0 stub** across all 286 operations, fingerprint-gated by `behavior.summary.json`. The focused auth/security artifact is **19 functional / 3 shape-only**.
- Negative/fuzz gate: **334/334 audited**; 183 operations reject 187 generated malformed path/query/JSON/multipart cases; 151 have no falsifiable typed input.
- Tenant matrix: **175/175 identifier-bearing operations isolated**, snapshotting all 26 tenant-scoped tables per operation.
- Vendored community contract: **334 ops** — 286 main app + **48 from the `/api/sync` mounted sub-app**, which the exporter walked for the first time in product `7fbc0b9`. See §7a.
- Framework backend suite (including response + auth/security behavior gates): green
  locally. Last cf-full smoke: **23/23 green**. Worker **238.3 KB gzip** (< 1 MB).
  Migrations are at **v14** (API-key ciphertext, password-reset capabilities,
  session generations, and immutable security audit events).
- **Pins agree:** `PRODUCT_COMMIT` = `CONSOLE_PIN.commit` = `7fbc0b9…`. Disagreement is a hard gate error, and provenance is verified by CONTENT (`CONTRACT_SHA256` + a sync-time check against `git show <commit>:<path>`), not just by matching pin strings.
- Last remote **CI green** (`30299868508` on `229d48b`), covering `pnpm -r build` unfiltered, the cf-full smoke suite, the console-split guarantees, and the pre-fixture conformance gate.

**What is measured vs what is not** — the honest denominator:

| Bucket | Count | Meaning |
|---|---:|---|
| `CONFORMS` | 286 | Returned a documented 2xx and its named, inline, text, or bodyless contract validated. |
| `VIOLATES` | 0 | Returned a documented 2xx that did **not** validate. Gated at zero. |
| `UNREACHABLE` | 0 | Enabled in-scope compat ops with a documented response that the probe could not reach. Gated at zero. |
| `NO_SCHEMA` | 0 | Every response now has a usable generated validator/schema or an explicit bodyless contract. Gated at zero. |
| `EXTERNAL_DISABLED` | 0 | Community-local signup and one-time invite acceptance now have real persisted behavior. |
| `STUB` | 48 | Declared, auto-stubbed at 501, **not implemented** — the `/api/sync` surface (§7a). Pinned in `behavior.summary.json` so it cannot grow and must reach 0. |

**Behaviour ledger — the parity denominator.** Conformance measures shape; this measures
whether an operation *does* anything:

| Status | Count | Under the 100%-parity bar |
|---|---:|---|
| `functional` | 163 | Done |
| `external-disabled` | 113 | **Work item.** Mostly unwired integrations, not impossible ones — storage maps onto the existing `s3StorageProvider`, database/RLS onto `datasourceRunner`. |
| `shape-only` | 10 | **Work item.** Correct shape, no effect. |
| `stub` | 48 | **Work item.** No handler at all. |

**171 of 334 (51%) are not yet functional.** The plan and cost are in
[`cf-22-closure-plan.md`](./cf-22-closure-plan.md) — roughly 6–9 weeks.

⚠️ **`functional` is not the same as "at parity".** The classifier marks an op functional
when it executes at least one meaningful SQL statement. A handler that persists the wrong
thing, defaults differently, or paginates differently still scores functional — so the
163 already counted are unverified against the product. Nothing in CF-22 has ever compared
the framework to the running product, and **291 of 332 ops declare a 4xx that no gate
validates.** Closing that is Work A3 (closure plan §1b): a differential harness that
drives both systems side by side and diffs them.

Conformance says nothing about **behaviour**: an op that returns a correctly-shaped
constant and ignores its store counts as `CONFORMS`. That distinction is Gate 1c/3.

The path to done is **[`cf-22-closure-plan.md`](./cf-22-closure-plan.md)** — the executable
plan for everything still open, with the definition of done. §8 below remains the record
of how each gate was closed.

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

### P0 — Product-repo pre-pass · ✅ green (Gate 0)
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

**Closed by Gate 0:** the apparent regenerated-but-uncommitted delta was CRLF-only,
not a source/artifact lag. `.gitattributes` now pins generated artifacts to LF, the
contract and console both pin `7fbc0b9`, and disagreement is a hard gate failure.

*Deferred (not blocking):* the 18 remaining product-side `src/services/*` → generated-client migrations (product task #111).

### P1 — Framework contract + drift gate · ✅ conformance gates green; classification incomplete
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

**Repaired (Gates 1a + 1b, `fe63b4b` + `229d48b`).** Two defects were real:

1. *The spec was cloned and the registry was unverified.* `buildFrameworkSpec()` copied
   the product document and stamped `x-implemented` from a hand-maintained Set of 285
   op keys that nothing checked against the app — so a typo'd path or an unwired handler
   would publish a spec advertising an endpoint that 404s, with every gate green.
   `routedOps(app)` now derives the set from Hono's route table; `registry.ts` is
   deleted. The emitted document is byte-identical, so the swap is behaviour-preserving,
   but **deleting one handler from source now turns the staleness gate RED** — under the
   registry that same deletion was green.
2. *Nothing validated responses.* `compat-conformance.mjs` drives the real app and parses
   every documented 2xx against the vendored Zod. It found **47 violations** the drift
   gate reported as `0 divergent` (§8 Gate 1a). Now gated at zero.

**Gate 1c is closed:** fixtures, response contracts, full-surface runtime behavior
classification, and contract-derived negative cases are all gated.
### P2 — Implement the 286-op community contract · ✅ closed for recorded community scope
**Intent:** drive the drift-gate burn-down to zero, wave by wave, where **done per op
= shape-conformant + behavior test against the product client's exact call +
persisted/provider round-trip + failure-path + (credential-gated) live gate**.

**Delivered (`fb1b625` → `d5e21cd` → `36b47ff` → `948b109`, + review `adb6e0d`):**
286 operations across all 31 tags. The `/api/*` compat surface owns product API paths;
the combined worker owns content-negotiated `GET /` alongside the eSSR homepage.
Migrations v7–v11 add 9 tables. Reusable pattern: most
edge/agent tags map onto `Phase2Store.edgeResources(kind)` CRUD or return the
product's "not configured" ack shapes. A P1/P2 review (`adb6e0d`) already fixed a
**RULE-2 auth regression** (10 authed ops — `/api/auth/me` + 9 `/api/auth/security/*` —
were reachable by anonymous callers; split into unauth-before-guard +
authed-after-guard, locked by `test/compat-auth-guard.mjs`) and a schema.ts drift
(4 Wave-4/5 tables missing from the Drizzle source-of-truth).

**Gate 2/3 closure:** the former plaintext API-key and no-op reset defects are fixed
under additive migration v14. Runtime-derived behavior now distinguishes real
state/session effects from providerless operations and static protocol/catalog
responses. Providerless handlers report an explicit limitation and remain
`external-disabled`, never `functional`. The negative sweep, generated two-tenant
matrix, and mutation harness cover Waves 1–5.
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
- **Verification:** cf-full smoke green (22 checks; 2 bundle-dependent checks report SKIPPED when the console bundles are absent — see §6a), backend suite green, worker 236.4 KB gz.

**Current gaps (→ Gate 4):**
- ❌ **No Playwright** (11-area nav suite with real create/list/update/delete +
  screenshots) — the parent D4 exit criterion. The in-process smoke proves routing +
  auth + one CRUD chain; it does not prove every rendered area works with the compat
  response shapes.
- ❌ **No real-Cloudflare deploy proof** (a fresh `wrangler` deploy with browser
  login/render + secure-cookie/asset-cache verification).
- ✅ **Pins agree:** console and contract both name `7fbc0b9…`; disagreement is gated, and provenance is verified by content.
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
  stays clean; the hashed JS/CSS bundles are gitignored; the deploy fetches them.
  **Reversible to (A) by un-ignoring the directory — one commit.**

P0–P2 are identical under either. (B) is the current implementation.

### 6a. The artifact is split — shell committed, bundles not (`b39eb97`)

Posture B was first implemented as "gitignore all of `console-dist/` except
`CONSOLE_PIN`". That withheld more than it needed to and **made the deployable Worker
unbuildable in CI**: `examples/cf-full/build.mjs` demanded the artifact, `fetch:console`
can only produce it from a local product checkout, so `pnpm -r build` could not succeed
in a fresh clone. The contracts workflow was red from 2026-07-15 to 2026-07-27 for this
reason alone — no code defect. Do not "fix" a recurrence by excluding cf-full from CI.

The Worker bundle embeds exactly one file from the artifact: `index.html` (1.7 KB of
meta tags plus references to hashed filenames `CONSOLE_PIN` already commits). The
proprietary JS/CSS is served by Static Assets and never enters the bundle. So:

| Artifact part | Committed? | Why |
|---|---|---|
| `frontbase-admin/index.html` (shell) | ✅ yes | no product code; the Worker bundle needs it |
| `frontbase-admin/assets/*.{js,css}` | ❌ no | the actual console — posture B's subject |
| `CONSOLE_PIN` | ✅ yes | ties the two together |

**Validation is three cumulative levels** (`scripts/console-pin.mjs`), each requiring
only inputs it can have:

| Level | Checks | Used by |
|---|---|---|
| `pin` | pin shape + agreement with `contracts/PRODUCT_COMMIT` | CI format gate |
| `shell` | + shell present, base path, asset refs matching the pin **both directions** | build |
| `deploy` | + real bundle bytes present and hash-matched | `scripts/deploy.mjs` |

Because the shell is committed and its bundles are not, they could drift apart silently
— hence the exact two-way reference match. A shell that outlives its bundles is a hard
error. `CONSOLE_PIN` gained `cssBundles`, and `sha256` now covers CSS as well as JS.

Guarantees are proven, not assumed, in `examples/cf-full/test/console-pin.mjs`: a bare
checkout builds; a bare checkout **cannot deploy**; drift, wrong base path, and tampered
bytes all go RED. CI additionally runs the cf-full smoke suite (21 checks against the
real worker in-process) — coverage it never had. The two checks that read bundle bytes
report `SKIPPED` loudly there and run on the deploy path.

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

## 7a. The `/api/sync/*` surface is missing from the contract (found 2026-07-28)

**The 286-op denominator was never the whole product API.** A live Cloudflare deploy
surfaced a 404 the browser suite had allow-listed:

```
GET https://<worker>.workers.dev/api/sync/datasources/  →  404
```

That endpoint is **real and served by the product**. `/api/sync/*` is a FastAPI
**sub-application** (`app/services/sync/main.py`, `sync_app`) mounted at `/api/sync`,
carrying roughly **47 operations** across four routers:

| Router | Ops |
|---|---:|
| `datasources/` (crud, data, schema, relationships, testing, migration, views, sheets, wordpress) | 33 |
| `views.py` | 8 |
| `wordpress.py` | 3 |
| `settings.py` | 3 |

Because it is a mounted sub-app, its routes never appear in the **main** app's exported
OpenAPI. `export_openapi.py` walks the main app, so the contract has always described
341 full / 286 community ops **excluding this surface entirely**. Every CF-22 gate
inherited that blind spot: the contract could not describe what it never saw, so the
framework never implemented it, and no conformance, drift, negative, or tenant gate
could notice.

**Impact is not peripheral.** 22 console source files call `/api/sync` — the Builder's
data-binding, data tables, form field settings, and the datasource selector. Data
Studio and any page bound to a datasource depend on it.

**Why this was initially misdiagnosed.** The endpoint was checked against
`openapi.full.json` (341 ops), found absent, and concluded to be dead client code that
the product would 404 identically. That check was insufficient: absence from the
exported spec proves nothing about a mounted sub-app. The product serves it; the
framework does not.

**Status:** open. The browser suite documents the gap with an explicit assertion
(test 15) rather than silently masking it, so it appears in every report and fails the
day the surface is implemented. It does **not** block the rest of Gate 4.

**Before closing CF-22, decide:** implement `/api/sync/*` on framework primitives
(a real datasource layer, not shape-only), or record it as an explicit, owner-approved
descope with the console areas that degrade named.

---

## 8. Recovery plan — the authoritative worklist

Sequential gates. **Do not mark a phase complete from route count, response shape, or
smoke count alone.** Each gate has a machine-checkable exit.

### Gate 0 — one source revision · ✅ **CLOSED 2026-07-27** (`bc99055`, `b39eb97`, product `e79abee`)
1. ✅ Product contract green on a clean tree — the staleness signal was a CRLF artifact, fixed via `.gitattributes` (see §0).
2. ✅ Both pins now name `bf1ac54`. The contract had been vendored from `afe9e03`, **16 commits behind** the console.
3. ✅ Pin disagreement is a hard error in `validateConsoleArtifact` (level `pin`), enforced in CI and on deploy; proven RED by mutation.
4. ✅ Delta reviewed: **0 ops added or removed, 67 retyped 2xx responses, +54 schemas** — the product's `op_responses.py` refactor replacing loose dict returns.

**What the delta review found, and why it matters.** Probing live handler responses
against the newly vendored Zod caught **4 of 30 param-less GETs violating the contract**
(`/api/actions/drafts` missing `total`; `/api/agent/settings` missing its `settings`
wrapper; `/api/auth-forms/` and `/api/database/connections/` missing `success`). All
four were real breakage the console would hit — and the drift gate reported
`0 divergent` throughout, because at that point it cloned the contract and compared it to itself (repaired in Gate 1b).
Fixed; probe now 30/30. This is direct empirical confirmation of the P1 finding.

- **Residual (hand to Gate 1):** the probe covered only param-less GETs. The other ~37
  retyped operations (POST/PUT, param routes) are **unmeasured**; true divergence is ≥4.
- **Also closed here:** the console artifact split (§6a) — CI can build the deployable
  worker again, and cf-full smoke now runs in CI.

### Gate 1a — response conformance burn-down · ✅ **CLOSED 2026-07-27** (`17f8ca1`, `fe63b4b`)

Gate 0's probe covered 30 param-less GETs. Extending it to all 286 ops — synthesizing
request bodies from the contract's own schemas, harvesting ids from real POSTs so param
routes reach their handlers — put the true number at **47**, not 4.

They were four repeated mistakes, not 47 unrelated ones: `success` as a boolean where
the contract types it as the list of ids a batch op processed; create/update returning
`{id, name}` instead of the full resource; test results omitting the required `message`;
collections returning bare arrays where an object is required. Each family had been
independently re-invented per tag during P2, which is how they independently drifted.
They now share one definition in `compat/routes/edge-shapes.ts`.

Two defects beyond response shaping:
- **Migration v13** — `workflows` had no `created_at` column at all, yet
  `WorkflowDraftResponse` requires it. The Builder's draft list was being served a field
  that did not exist. Backfilled from `updated_at`; set on insert only.
- `POST /api/actions/drafts/{id}/test` returned status `running`, not in the contract enum.

- **Exit met:** `VIOLATES 0`; `test/compat-conformance.mjs --gate` runs in the backend
  suite and in CI; proven RED by mutating a single response field.
- **At Gate 1a closure, measured 156/286 (55%).** `UNREACHABLE 45` was *not* a
  pass, and `NO_SCHEMA 85` still lacked a usable validator. Both later closed in
  Gate 1c; see the current §0 buckets.

### Gate 1b — handler-derived spec · ✅ **CLOSED 2026-07-27** (`229d48b`)

`framework.openapi.json` is now built from the app's **registered routes**, not by
cloning the product document with a hand-maintained flag.

`x-implemented` came from a Set of 285 op keys that nothing verified against the app.
Listing an op there suppressed its 501 stub *and* stamped the spec as implementing it —
so a typo'd path, a wrong param name, or a handler that was never wired would publish a
spec advertising an endpoint that 404s in production, with every gate green.
`routedOps(app)` reads Hono's route table instead; `registry.ts` is deleted.

- **Exit met:** the emitted document is byte-identical (behaviour-preserving), but
  **deleting one handler from source turns the staleness gate RED**. Under the registry
  that same deletion was green. Gate: `test/routed-ops.mjs` (7 cases).
- **Found while building it:** the conformance probe had been under-measuring. The ~20
  `/api/auth/*` ops register only when `sessionSecret` + `userStoreFor` are supplied, and
  the probe supplied neither — the entire auth surface, login included, was silently
  skipped while the run reported clean. Coverage 156→169, `UNREACHABLE` 45→32.
- **A trap in the change itself:** a 501 stub is a Hono route too, so deriving from a
  *finished* app counts stubs as implemented. Latent today (the configured app registers
  zero stubs) but would activate on the next re-vendor. The set is captured pre-stub and
  `implementedOps()` throws rather than guessing.

### Gate 1c — close the measurement gap · **CLOSED LOCALLY 2026-07-28**

Gate 1a proved shapes; Gate 1b proved registration. Neither proves the handler *does*
anything. Three items, in order:

1. ✅ **Fixtures for the 32 `UNREACHABLE` ops — CLOSED 2026-07-27.** The probe now
   creates a fresh real resource chain per operation instead of sharing a collection-level
   "last id" pool, seeds a real login principal, supplies required query parameters, and
   synthesizes pattern-conformant bodies. Result: `UNREACHABLE 32 → 0`,
   `CONFORMS 169 → 198`. It exposed four hidden response defects, all fixed and gated:
   action PATCH returned an ack instead of a draft, two auth-form GETs omitted the
   required envelope, and page rollback omitted `preRollbackVersionId`. Action-version
   detail also changed from an unconditional 404 to the version representation the
   community store actually exposes. Community-local signup/invite behavior and the
   content-negotiated JSON root subsequently closed the final two `EXTERNAL_DISABLED`
   and one `STUB` buckets.
2. ✅ **Round-trip classification, derived not declared.** Replace binary `x-implemented`
   with `stub | shape-only | functional | external-disabled`. **Do not hand-annotate
   this** — a hand-maintained status table is exactly the artifact Gate 1b deleted, with
   the same failure mode. Derive it: an op is `functional` when a write is observable in
   a subsequent read, `shape-only` when its response is invariant under state,
   `external-disabled` when it requires an unconfigured provider. This needs the
   fixtures from (1), which is why they come first. All 286 operations are now
   classified and fingerprint-gated at `163 functional / 10 shape-only /
   113 external-disabled / 0 stub`.
3. ✅ **Negative/fuzz sweep** — every method/path incl. `OPTIONS`, with wrong types,
   missing required fields, and bad path/query params, asserting status codes rather
   than just success bodies.

- **Exit:** `UNREACHABLE 0`; every op carries a *derived* status; changing a handler's
  accepted request, response, auth placement, or registration fails a gate.
- **Note:** item 2 produces the same evidence Gate 3 needs, so Gates 1c and 3 should be
  executed as one pass rather than two (see *Sequencing* below).

### The `NO_SCHEMA 85` — ✅ **CLOSED 2026-07-28**

The product audit added named pass-through response models to 52 variable JSON-object
operations, corrected four non-JSON declarations (CSV + three SSE streams), and made
the two CORS preflights explicitly bodyless. The remaining legitimate inline arrays
and union are validated through generated operation-level Zod validators. The
framework probe now validates named and inline JSON, text media types, and zero-byte
bodyless responses; it also avoids component-name lookup failures such as
`PrivacySettings-Output`. Result: `NO_SCHEMA 85 → 0`, `CONFORMS 198 → 283`.
The complete per-operation disposition is recorded in
[`cf-22-no-schema-audit.md`](./cf-22-no-schema-audit.md).

### Gate 2 — security + tenant isolation · **CLOSED LOCALLY 2026-07-28**
1. ✅ Fix API-key storage/reveal (verifier hash or encrypted ciphertext; atomic audited
   one-time reveal; revocation; additive migration; never reinterpret plaintext).
2. ✅ Real password-reset tokens (expiry, single-use, password change, session
   invalidation, non-enumerating).
3. ✅ Persist blocklist/WAF/bot settings and expose their effects through reads,
   metrics, and audit logs. Closed by the auth/security behavioral wave.
4. ✅ Generated two-tenant matrix over every identifier-bearing compat route, bulk op,
   nested resource, secret reveal, and provider action.
- **Exit:** no recoverable plaintext key material; auth mutation gates pass; tenant-B cannot observe/mutate tenant-A resources.

### Gate 3 — complete P2 by behavior, wave by wave · **CLOSED FOR COMMUNITY SCOPE 2026-07-28**
Reopen Waves 2–5. Per op: exact product-client call, meaningful state/provider
effect, persisted round-trip, response validation, failure-path coverage, cleanup.
Credential-gated provider tests may skip with notice; the op stays `external-disabled`
(not `functional`) until a live gate passes. Suggested order: **Authentication/security
→ Storage/data → Actions → Edge lifecycle/inspector → Agent/MCP.**
- **Exit:** met locally. The 10 shape-only operations are protocol/catalog/health/policy
  responses with no stateful behavior by design. The 113 credential/provider-dependent
  operations are explicitly `external-disabled`, never counted as functional, and must
  move to `functional` only when a live credentialed gate exists.

### Gate 4 — finish P3 acceptance + cutover
1. 11-area Playwright suite against `wrangler dev` with real CRUD + failure screenshots.
2. Same subset against a fresh Cloudflare deploy; verify secure cookie flags + asset caching.
3. Scheduled cross-repo drift (explicit product repo/ref + credential): alert on
   source-contract staleness, pin mismatch, endpoint/schema drift, stale console hash.
4. Owner visual/functional sign-off, then retire the legacy SPA + `/api/console/*`
   per the endpoint-consumer map (retain `/api/console/setup/*`; add explicit
   404/410 retirement assertions).
- **Exit:** 11/11 browser acceptance; fresh-deploy proof; matching committed pins; scheduled drift green; redirect/retirement complete; **owner sign-off recorded.**

### Sequencing (revised 2026-07-27)

Original order was 0 → 1 → 2 → 3 → 4, with the owner electing to defer Gate 2. Two
things changed that:

- **Gates 1c and 3 collapse into one pass.** Classifying an op as `functional` requires
  proving a write is observable in a read — which *is* Gate 3's behavioural test. Running
  them separately means building the same fixtures and round-trips twice.
- **Gate 2 is closed locally.** API-key verification/reveal, reset capabilities,
  session invalidation, generated tenant isolation, and their mutation proofs now
  ship in the same gate runner.

Working order is now **Gate 4**. Gates 1c, 2, and 3 are closed locally.

### Closure rule
- **P0 complete:** current source artifacts + generated client deterministic and committed.
- **P1 complete:** handler-derived contract, response validation, behavior fingerprint,
  and negative/fuzz validation detect real drift.
- **P2 complete:** product-client behavior, security, persistence/provider effects, and tenant isolation are tested.
- **P3 complete:** real browser/deploy parity, permanent drift, cutover, and owner sign-off.
- **CF-22 complete:** the original complaint ("looks super poor") is falsifiable against the same console the product ships — signed off by the owner on a fresh deploy.

---

## 9. Key implementation facts (do not rediscover)

- **Self-host SPA base path:** `basename="/frontbase-admin"` (`src/lib/edition.ts:28`), NOT `/console`.
- **Cookies:** product self-host uses `frontbase_session`; the framework issues `fb_session`. The SPA reads neither (HttpOnly) — only login success + browser replay matter. Kept `fb_session`; shapes are the contract.
- **Compat mount:** `/api/*` (product paths), a sibling of the legacy `/api/console/*` (parallel-run) and the engine catch-all. Compat guard scoped to `/api/*` excl. `/api/console/*`.
- **`GET /`** is dual-purpose at the combined-worker boundary: explicit
  `Accept: application/json` receives `RootStatus`; normal browser navigation falls
  through to the eSSR page. Standalone/spec mode registers the equivalent JSON route.
- **Op count:** vendored community = **286** (incl. 2 `OPTIONS`); the historical "284" omitted `OPTIONS`. Framework emits all 286 as implemented.
- **Migrations added by CF-22:** v7 `template_variables`, v8 `themes`+`security_events`, v9 `compat_pages`+`compat_page_versions`, v10 `auth_forms`, v11 `edge_api_keys`+`edge_agent_profiles_compat`+`mcp_servers`+`agent_skills`, v13 `workflows.created_at`, and v14 API-key reveal/reset/session/audit security state.
- **`x-implemented` is derived, never declared.** `routedOps(app)` reads Hono's route table; `implementedOps(app)` returns the set captured *before* stubs. **A 501 stub is a Hono route too** — deriving from a finished app reports the whole contract as implemented, so the capture order matters and `implementedOps` throws rather than guessing.
- **The auth surface is config-dependent.** The ~20 `/api/auth/*` ops register only when `sessionSecret` + `userStoreFor` are supplied. Any probe or emitter that omits them silently measures a smaller surface while reporting clean — this actually happened to the conformance probe.
- **Shared response shapes live in `compat/routes/edge-shapes.ts`** (`batchResult`, `testResult`, `serializeEdgeResource`, `serializeEngine`). Each family had been re-invented per tag, which is how five tags independently drifted from the contract.
- **Batch ops:** the contract types `success` as the **list of ids processed**, not a boolean.
- **`@hono/zod-openapi` blocked** on zod v4 (framework is zod 3) → plain Hono + vendored zod. **`oasdiff` npm package is a placeholder** → native-Node `contract-diff.mjs`.
- **fastapi pinned `==0.139.0`** in the product repo — its version changes the emitted spec, so it is part of contract determinism.
- **One-command bumps:** contract = `sync-contract.mjs` + commit pin; console = `fetch-console.mjs` + commit pin.

## 10. Non-goals

- Cloud edition: tenants directory, plans manager, billing (F8b deferred), SuperTokens/signup/invite, agent chat/quota.
- A `--multi-tenant` deploy flag — a real multi-tenant deployment needs the full cloud contract + tenant-isolation acceptance, out of scope.
- Deleting legacy `/api/console/*` routes by name/association — only after the consumer map + browser suite prove them unused.
- Source-level shared console package (option C) — revisit post-launch only if artifact reuse proves insufficient.

> **2026-08-29 addendum (A-25 supersedes the first two non-goals).** The framework shipped
> its own cloud multi-tenant free tier (`docs/DECISIONS.md` A-25, `docs/cloud-free-tier.md`),
> built framework-first rather than by porting the product's cloud edition: host-tenant
> serving, self-serve signup, `/api/admin/tenants*`, a tenants directory + plans manager in
> the new `/admin` cloud console build, and a `_global` plan catalog with enforcement. Two
> non-goals above are therefore retired as written: **cloud edition** (tenants directory and
> plans manager shipped 2026-08-29; billing and agent chat/quota remain out of scope — see
> A-25's limits) and the **`--multi-tenant` flag** (the shipped equivalent is
> `deploy.mjs --mode cloud --base-domain`, with the tenant-isolation acceptance this file
> asked for delivered as the A-25 suites + mutation proofs). The remaining non-goals are
> unchanged. Phases 1–2 (A-22/A-23) also retired this file's console/contract *pin*
> machinery — the pins it describes are framework-owned now; the structural guidance above
> (x-implemented derivation, capture order, auth-surface config dependence) still holds.

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
mismatch, inventory-not-conformance gate — all confirmed). CF-22 is **not
complete**; §8 is the path to done.

**Update 2026-07-28 (v12) — Gates 1c, 2, and 3 closed locally.** The response
probe now also derives a fingerprint-gated behavioral ledger for all 286 operations:
`163 functional / 10 protocol-or-catalog shape-only / 113 explicit
external-disabled / 0 stub`. Providerless handlers no longer return optimistic
success when no provider action occurred. The contract-derived negative sweep audits
286/286 operations and exercises 157 invalid cases. API-key material is stored as a
SHA-256 verifier plus separately encrypted, atomic one-time reveal ciphertext; reset
capabilities are hashed, expiring, single-use, mutate the password, and invalidate
older sessions. The generated tenant matrix exercises 139/139 identifier-bearing
operations and snapshots all 26 tenant-scoped tables per call. The mutation harness
proves all 15 backend security/isolation/validation guarantees go red when broken.
`pnpm --filter @frontbase/backend run gate:cf22` runs the complete set. Gate 4
(browser, live Cloudflare deployment, and owner acceptance) remains open.

**Update 2026-07-28 (v11) — final response gaps closed; behavioral classification
started.** Community-local signup now creates a tenant, owner, and session. Admin
invite creation persists a one-time token; public lookup reads it; acceptance creates
the user, consumes the token atomically, and issues a session. The combined worker
content-negotiates product `RootStatus` JSON without stealing normal `/` traffic from
eSSR. The response gate is therefore `286 conform / 0 violate / 0 unreachable /
0 no-schema / 0 external-disabled / 0 stub`. The first derived behavioral artifact,
`contracts/behavior.auth.json`, is executable and CI-gated: `17 functional /
5 shape-only`. Blocklist, WAF, bot settings/metrics, and security audit logs now
round-trip real tenant-scoped state. The remaining shape-only entries are `GET /`,
two `OPTIONS` operations, and forgot/reset password; the no-op reset remains a Gate 2
security defect. Storage/data is the next behavioral wave.

**Update 2026-07-28 (v10) — `NO_SCHEMA 85` closed.** All 286 operations were
audited by response kind. The product contract now names variable JSON-object
responses, documents CSV/SSE/bodyless responses accurately, and retains legitimate
inline array/union schemas. The framework probe validates generated operation-level
Zod for named and inline JSON, validates text media types, and asserts empty bodies
for contentless success responses. Stronger coverage exposed and repaired list
envelopes, non-empty deletes/preflights, and stream media mismatches in the compat
handlers. Final local buckets: `283 conform / 0 violate / 0 unreachable / 0 no-schema /
2 external-disabled / 1 engine-owned stub`. Gate 1c(2)+Gate 3 behavioural
classification remains next.

**Update 2026-07-27 (v9) — Gate 1c(1) fixture coverage closed.** The conformance
probe now creates independent real resource chains per operation, eliminating
order-dependent id reuse. `UNREACHABLE 32 → 0` and response coverage rose
`169 → 198` while remaining at `VIOLATES 0`. Reaching those handlers exposed four
previously hidden response defects (action PATCH, two auth-form GET envelopes, page
rollback metadata) plus an unconditional action-version 404; all are repaired and
the full backend suite is green locally. The honest buckets are now
`198 conform / 0 violate / 0 unreachable / 85 no-schema / 2 external-disabled /
1 engine-owned stub`. Gate 1c(2)+Gate 3 behavioural classification is next.

**Update 2026-07-27 (later) — Gates 1a + 1b closed.** The full-surface conformance
probe put real divergence at **47**, not the 4 Gate 0 had sampled; all 47 are fixed and
the gate is wired into CI at zero. `x-implemented` is now derived from the route table
and `registry.ts` is deleted, so deleting a handler turns CI red. Two defects behind the
numbers: `workflows` had no `created_at` column despite the contract requiring one, and a
`test` op returned a status outside the contract's enum. Measured coverage is
**169/286 (59%)** — `UNREACHABLE 32` and `NO_SCHEMA 85` are recorded as unmeasured, not
as passes. Gate 1c is next and merges with Gate 3 (see §8 *Sequencing*). **Gate 2's two
security defects are still live in shipped code.**

**Update 2026-07-27 — Gate 0 closed.** Pins agree and disagreement is now gated; four
contract-divergent handlers found and fixed; the P0 "staleness" finding was a CRLF false
positive, not a real lag (§0). The console artifact was split so CI can build the
deployable worker (§6a), ending a 12-day CI outage that had no code defect behind it.
Gate 1 is next and inherits a measured blind spot: ~37 retyped operations remain
unverified. Gate 2's two security defects (plaintext `fbk_*` keys in
`compat/routes/edge-misc.ts`, no-op password reset in `compat/routes/auth-compat.ts`)
are **still live in shipped code** — the owner sequenced Gate 2 after Gates 1/3/4.
