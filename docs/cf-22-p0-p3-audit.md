# CF-22 P0–P3 End-to-End Audit and Recovery Plan

**Audit date:** 2026-07-15
**Scope:** product `Frontbase-` plus framework `frontbase-framework`
**Verdict:** **CF-22 is not complete.** The product console artifact is integrated locally, but the contract, behavioral implementation, browser acceptance, deployment proof, and permanent drift controls do not yet satisfy the parent plan.

This audit is authoritative over phase-delivery summaries where they conflict. The older reports remain useful as a history of what was built and claimed at each phase.

## 1. Executive status

| Phase | Delivery claim | Audited status | Reason |
|---|---|---|---|
| P0 | Delivered; all gates green | **Historically delivered; current maintenance gate red** | The original commits established the contract pipeline, but the current product source no longer matches its committed OpenAPI artifacts. `export_openapi.py --check` reports 11 changes in both community and full specs. |
| P1 | 284-op derived compat spec and drift gate | **Partial** | The vendored contract actually has 286 operations. Two `OPTIONS` operations were ignored until this audit. More importantly, the framework spec is copied from the product spec and annotated from a registry; it is not derived from handler definitions, so the gate cannot prove handler request/response conformance. |
| P2 | 284/284 real handlers; functional contract complete | **Route/shape registry complete; behavior incomplete; security blocker** | Many Wave 2–5 handlers are empty-state or success-shaped placeholders. Required per-tag fuzz, exact-product-client behavior tests, provider tests, and auth mutation proofs are absent. API keys are stored in plaintext in a field named `key_hash` and can be revealed repeatedly. |
| P3 | Delivered; CI green | **Locally integrated; acceptance incomplete and blocked by P0–P2** | Static Assets, routing, pin validation, setup hardening, and smoke are implemented locally. The 11-area Playwright suite, real Cloudflare test, scheduled cross-repo drift, retirement, and owner sign-off are still open. The console and contract are also pinned to different product commits. |

## 2. Contract and artifact lineage

| Artifact | Current pin / count | Audit result |
|---|---|---|
| Product current committed community spec | 286 operations, including two `OPTIONS` operations | Stale against current product source (`export_openapi.py --check` is red). |
| Framework vendored contract | `afe9e03a087155448de323cc1b0a48f8b6503fa4`; 286 operations | Older than the console artifact and current product source. |
| Product console artifact | `bf1ac54152906cade057d4d8c14f667a5c456b9a` | Built from a different product revision than the API contract. |
| Framework emitted spec after this audit | 286 operations: 285 registry-implemented plus engine-owned `GET /` | The two missing `OPTIONS` operations are now counted and explicitly routed. |

Comparing the framework spec to the currently committed product community spec produces **251 divergent operations** (285 implemented, one engine-owned stub, zero missing). Because the product spec is itself stale, this is not yet a clean migration worklist; it is decisive evidence that the console and API contract cannot be called synchronized.

Required invariant going forward: **one reviewed product commit must pin both the community contract/client and the console bundle.** A deploy must fail when those two pins differ.

## 3. Findings

### Critical — API-key secret handling contradicts the report

`packages/backend/src/compat/routes/edge-misc.ts` generates a raw `fbk_*` key, stores that raw key in `edge_api_keys.key_hash`, and returns the same value from `GET /api/edge-api-keys/{key_id}/reveal` on every request. This contradicts the P2 report's “reveal-once semantics” claim.

Impact:

- database disclosure yields usable API keys;
- any authenticated party able to call reveal can retrieve a key repeatedly;
- there is no one-time reveal state or secret-at-rest protection.

Required fix: store only a verifier hash for authentication. If recoverability is a product requirement, store a separately authenticated-encrypted ciphertext and enforce an atomic, audited, one-time reveal transition. Add a migration for existing rows and never reinterpret existing plaintext as a hash.

### High — P2 “implemented” means registered, not functional

Representative contradictions against the P2 plan and report:

- database connect persists only `{ connected: true }`; introspection returns empty data rather than using a datasource adapter;
- storage upload/provider flows and several edge-database operations return empty or “not configured” results without implementing the promised backing services;
- action rollback always reports no previous version and test-node returns `success: true` with `result: null`;
- forgot-password sends no reset token, while reset-password reports success without validating a token or changing a password;
- blocklist, WAF, bot-protection, and related audit/security changes are not persisted;
- edge engine health always reports healthy, while logs, inspector, deployment, domains, rotation, and provider actions are largely fixed responses;
- GPU, Agent chat, and MCP routes are catalogs/empty responses rather than the provider-backed behavior described by P2.

Graceful degradation is valid only for a genuinely unconfigured external provider, with an explicit capability state and a test against the product's unconfigured behavior. It is not equivalent to implementing the operation. The current binary `x-implemented` flag hides this distinction.

### High — P1 drift gate does not validate handlers

`buildFrameworkSpec()` clones paths, operations, and schemas from the vendored product document, then sets `x-implemented` from a manual registry. Consequently:

- a handler can accept the wrong body, omit validation, or return the wrong runtime shape while the emitted spec stays green;
- a registry entry can exist without a meaningful handler implementation;
- the mutation proof detects edits to emitted JSON, not divergence introduced in handler code.

Only the original `variables` proof tag visibly parses selected responses with vendored Zod. P1 therefore delivered a useful endpoint inventory and schema snapshot, but not the route-derived conformance guarantee described in the parent plan.

### High — cross-phase drift and stale product artifacts

The framework console is pinned to product `bf1ac54…`, while the contract is pinned to `afe9e03…`. The current product contract staleness check is also red. A visually current console may therefore call request/response shapes that the older compat layer never implemented.

There is no scheduled cross-repository job to detect this automatically. Current framework CI compares only against its already-vendored snapshot.

### High — behavioral and browser acceptance coverage is missing

The backend test command contains compat suites for variables, the auth guard, Wave 1a, Wave 1b, and the document comparator. It has no dedicated Wave 2–5 exact-client behavior matrix, per-tag fuzz suite, or comprehensive auth-adjacent mutation set.

P3 still lacks the parent plan's 11 Playwright nav-area tests, real data round trips, screenshots, a real Cloudflare deployment test, and owner field sign-off. The in-process smoke is valuable integration coverage but cannot establish functional or visual parity.

### Medium — tenant filtering exists, but isolation is not proven end to end

Reviewed compat SQL and stores generally pass `c.get('tenant')` and include `tenant_slug` in reads/writes. No direct cross-tenant query defect was confirmed in this audit. However:

- most Wave 2–5 routes have no two-tenant test;
- the existing authz suite covers the legacy console surface, not all compat operations;
- provider IDs, resource IDs, bulk operations, reveals, and nested routes need adversarial tenant-A/tenant-B coverage;
- the single-tenant deployment assumption must not become an excuse to remove store-level tenant predicates.

Tenant isolation is therefore **not proven**, rather than proven broken.

### Medium — report counts and status language were internally inconsistent

The parent plan says 286 community operations; P1/P2 reports used 284 because all method enumerators omitted `OPTIONS`. P3 then used 283 plus engine-owned root. This audit adds `OPTIONS` to the method model, stubs, emitter, comparator, mutation test, registry, and explicit auth routes. The reconciled vendored count is now **286 = 285 compat-routed + engine-owned `GET /`**.

## 4. Changes made during the audit

- Added first-class `OPTIONS` support to the compat contract machinery and explicit login/signup preflight handlers.
- Regenerated `framework.openapi.json`; the vendored result is 285 implemented plus one engine-owned root operation, with zero missing/divergent against the vendored contract.
- Corrected the parent and phase reports with audited statuses, cross-links, and reconciled counts.
- Retained and documented the P3 Static Assets, artifact validation, setup-token hardening, and master-admin corrections made during the implementation review.

The API-key flaw and the broader P2 behavioral backlog are intentionally not papered over in this report: they require migrations, product decisions, and dedicated tests before P2 can be reclosed.

## 5. Recovery plan

### Gate 0 — establish one source revision (blocking all later acceptance)

1. In the product repo, regenerate and commit community/full OpenAPI plus generated client from current source until every P0 staleness and type gate is green.
2. Choose that exact product commit for both `PRODUCT_COMMIT` and `CONSOLE_PIN`.
3. Re-vendor the contract/Zod, rebuild the console, and fail validation when the pins differ.
4. Review the resulting operation/schema diff as an intentional migration, not an automatic overwrite.

Exit: product contract is current, pins match, both repos' contract checks are green.

### Gate 1 — repair P1 conformance semantics

1. Generate request/parameter/response validators from the vendored OpenAPI and wrap every compat handler, or migrate routes to a compatible route-definition system that emits its own spec.
2. Build the framework OpenAPI from those registered route definitions; stop cloning the product operations into the emitted document.
3. Add a runtime route sweep for every method/path, including `OPTIONS`, and negative/fuzz cases for required fields, invalid types, path/query parameters, status codes, and response bodies.
4. Change status metadata from binary `x-implemented` to at least `stub`, `shape-only`, `functional`, and `external-disabled`.
5. Make handler mutations—not only JSON mutations—turn CI red.

Exit: changing a handler's accepted request, response, auth placement, or route registration fails a gate.

### Gate 2 — security and tenant isolation before P2 feature work

1. Fix API-key storage/reveal with an additive migration, one-time audited reveal, revocation, and tenant-A/tenant-B regression tests.
2. Implement real reset tokens with expiry, single use, password change, session invalidation, and non-enumerating responses.
3. Persist and enforce blocklist/WAF/bot settings where the framework claims support; otherwise mark them explicitly unsupported and keep them out of “functional” counts.
4. Add a generated two-tenant matrix covering every identifier-bearing compat route, bulk operation, nested resource, secret reveal, and provider action.

Exit: no plaintext recoverable key material, auth mutation gates pass, and tenant-B cannot observe or mutate tenant-A resources.

### Gate 3 — complete P2 by behavior, wave by wave

Reopen Waves 2–5. For each operation, require the exact product-client call, meaningful state/provider effect, persisted round trip, response validation, failure-path coverage, and cleanup. Credential-gated provider tests may skip only with an explicit notice; the operation must remain `external-disabled`, not `functional`, until a live gate has passed.

Suggested order: Authentication/security → Storage/data → Actions → Edge lifecycle/inspector → Agent/MCP. Maintain a machine-generated backlog by implementation status and tag.

Exit: all in-scope operations are `functional`, or are explicitly owner-approved descopes recorded in the report; P2 exit criteria are actually green.

### Gate 4 — finish P3 acceptance and cutover

1. Add the 11-area Playwright suite against `wrangler dev`, using real create/list/update/delete flows and failure screenshots.
2. Run the same acceptance subset against a fresh Cloudflare deployment and verify secure cookie flags and Static Assets cache behavior.
3. Add scheduled cross-repo drift using an explicit product repository/ref and credential; alert on source contract staleness, pin mismatch, endpoint/schema drift, or stale console hash.
4. Obtain owner visual/functional sign-off, then retire the legacy SPA according to D5.

Exit: 11/11 browser acceptance, fresh-deploy proof, matching committed pins, scheduled drift green, legacy redirect/retirement complete, owner sign-off recorded.

## 6. Closure rule

Do not mark a phase complete from route count, response shape, or smoke count alone:

- **P0 complete:** current source artifacts and generated client are deterministic and current.
- **P1 complete:** handler-derived contract and runtime validation detect real code drift.
- **P2 complete:** product-client behavior, security, persistence/provider effects, and tenant isolation are tested.
- **P3 complete:** real browser/deployment parity, permanent drift, cutover, and owner sign-off are complete.

## 7. Verification recorded by this audit

| Check | Result |
|---|---|
| Product OpenAPI hygiene | **PASS:** 341/341 success responses typed; zero gaps |
| Product OpenAPI staleness | **FAIL (expected blocker):** community and full artifacts each differ from current source by 11 changes |
| Framework TypeScript check | **PASS** |
| Framework emitted-spec staleness | **PASS** after `OPTIONS` correction |
| Framework vs vendored contract | **PASS:** 285 registry-implemented, one engine-owned root, zero missing/divergent |
| Framework vs current product committed contract | **FAIL (expected blocker):** 251 divergent operations |
| Backend suite | **PASS:** all configured suites green; credential-gated live suites skip with notice |
| cf-full integration smoke | **PASS:** 21/21, including setup-only product-console handoff and secure first-admin claim exchange; worker 233.8 KB gzip |
| Console artifact validation | **PASS** for the current `bf1ac54…` artifact; this does not resolve its mismatch with the contract pin |
| Diff whitespace check | **PASS** |
