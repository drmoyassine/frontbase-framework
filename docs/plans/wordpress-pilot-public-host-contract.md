# P2c public host integration contract

**2026-10-07 — host dispatch and captured document metadata implemented; activation remains closed.** Implements [T1](wordpress-pilot-roadmap.md), retaining six packages, existing engine and private reviewed capture. [Parallel-session ownership](wordpress-pilot-parallel-handoff.md) keeps critical design and final verification here. The historical trace/design below precedes the current host wiring. No actual pilot activation or deployment is claimed.

**Current wiring:** the CMS factory calls `renderReviewedSitePublication` after compat/infrastructure handlers and before the legacy engine. Null means inactive only; active missing/unavailable returns terminal 404/503 with no-store/noindex. GET/HEAD use captured manifest, canonical origin/path and language; request-scoped explicit empty favicon bypasses both document and Navbar mutable lookups without changing engine-global configuration. No captured favicon field exists yet. The host supplies its existing network-only SW and registers `/sw.js` so older installations can update. Actual previously-controlled browser transition remains unproven; VM lifecycle proof is narrower. Activation API/controls remain closed.

The isolated host smoke verifies inactive legacy compatibility, active legacy decoy suppression, captured canonical versus spoofed request origin, HEAD, admin/API/status/SW endpoints, update/rollback and Cloud owner isolation. Host mutation3/3 and engine scope mutation2/2 passed/restored; remaining final verification is recorded in the audit. These are isolated fixtures, not review or activation of the real pilot candidate.

## Trace and current risks

[Reviewed reader](../../packages/backend/src/compat/site-publication-serving.ts) already resolves an exact owner-bound active artifact and review. It returns inactive, missing, unavailable or resolved; no HTTP behavior is attached.

[Engine](../../packages/edge-core/src/engine.ts) currently treats an empty published-page callback as permission to use `manifest.pages[path]`. It uses its constructor's manifest/data provider for context/query identity and can enrich layouts from mutable datasources. Supplying only the captured page to that callback is insufficient: it loses capture identity and permits fallback.

[CMS host](../../examples/cf-full/src/worker.ts) mounts administrative/static/API routes before its final engine. Cloud tenant middleware gates registered host owners; self-host legacy serving starts at `_root` and permits a cross-owner fallback. Boot admin roles may belong to `_root` or `_default`. Therefore `_root` cannot be presumed to own the pilot's configured capture, and the authenticated visitor must never select the site's owner.

[Node adapter](../../examples/cf-full/src/node.ts) uses the same CMS factory. Integrating that factory can cover both local Node and the CF host without a second renderer, subject to adapter-specific verification. Do not claim other host parity from this trace alone.

A read-only local SQLite query on October 7 confirms the pilot configuration is owned by `_root`, revision 4, with no active publication pointer. Only owner/key/revision metadata was printed; no settings values or credentials were exposed. This validates the current pilot binding, not arbitrary self-host installations. Any explicit future owner option must match admin authoring ownership and preserve existing bootstrap behavior.

## Required owner and request binding

1. Resolve a trusted deployment/site owner before reading publication state. Cloud tenant sites use their already gated host owner. App/control hosts do not become customer sites. Existing foreign-origin operator behavior must be accounted for explicitly in tests.
2. Self-host publication uses one fixed server-side owner binding matching the existing project's configuration/settings owner. Validate the local configuration owner and existing boot/setup contracts before choosing the smallest configuration seam. No scan across owners, first matching artifact, query parameter, cookie or visitor principal may choose it. Preserve existing installations with no active publication through an explicit legacy policy; do not migrate ownership implicitly.
3. Read the active pointer/artifact/review once for this request. Pass the resulting capture identity through rendering and response construction; do not reread latest canonical rows, configuration, templates or active pointer midway through response generation.
4. Restrict handling to public site routes at the host's final page-dispatch boundary. Admin, API, auth/callback, builder, setup, static assets and engine infrastructure must retain their existing handlers. HEAD follows the same version/status/header selection as GET with no body. Unsupported methods do not activate or render a site.

## HTTP outcome contract

| Reader result | Required host action |
|---|---|
| inactive | Deliberately continue existing legacy behavior for that authorized host only; absence is not a search across site owners |
| missing | Terminal 404 for the active reviewed site's route space; never baked or mutable-page fallback |
| unavailable | Terminal opaque 503/no-store, noindex; no captured/private detail, stack, owner or database diagnostic in response |
| resolved | Render the captured page using its captured version through the existing engine; never legacy enrichment or mutable query execution |

The reader currently collapses invalid supported-query input into unavailable. Before wiring, choose and test a distinct client-error result or deliberately document that behavior; do not advertise 400 semantics without implementing it. Oversized/duplicate/unknown query input must remain refused. Capture path safety and reserved route protection remain authoritative.

## One engine, captured manifest and response

Preferred bounded integration approach: the host consumes the explicit reader result before the final legacy engine, and renders a resolved page through `createEngine` with a request-scoped manifest whose version is the returned captured version and whose page is the already projected captured page. Its query registry is empty because projection has executed the fixed captured queries. No mutable `enrichLayout` or legacy page resolver is supplied. This reuses the existing renderer; it does not add another renderer or a second application-state store. Validate this approach against performance, engine-global overrides and hydration before accepting the wiring.

Do not inject private review evidence, artifact internals or credentials into the manifest/browser. Never make browser query endpoints accept arbitrary capture IDs to obtain private candidates. Response identity can expose a public capture hash/generation when serving that active public version; neither is authorization.

Start with no-store response behavior and no publication cache claim. A projected page's version/cache key already binds owner, capture, path and normalized parameters; an eventual cache must preserve those dimensions, bypass private/control requests and prove update/rollback behavior. Artifact cache identity alone does not implement purge, TTL or memory budgets.

Service-worker handling is a separate blocking integration gate. The current [full-CMS entry](../../examples/cf-full/src/sw.ts) uses [attachServiceWorker](../../packages/edge-core/src/sw.ts), whose fetch listener intentionally does not intercept: current source is network-only, although its introductory comment still describes older local rendering. An older installed worker may still intercept. Omitting registration on new HTML is insufficient for that browser. Prove the update/network-only transition, including an already-controlled browser, before exposing activation; managed requests must not return old demo content or mix generations. Do not claim offline support from server rendering.

## SEO and complete route acceptance

Captured titles/descriptions and original paths must drive HTML and canonicals. Host-derived origins must be validated against deployment identity, not arbitrary forwarded headers. Canonical/indexing/robots/sitemap behavior must use the same active version; private previews stay noindex. A sitemap may list only reviewed captured routes eligible for public indexing. Article original publication dates and semantics remain distinct from correction/review/capture times.

The current slice omits complete home/informational/city/pathway support. Activating it would make other site paths missing; therefore it is staging-only until a reviewed route inventory accounts for all required production paths. Production cutover requires full URL reconciliation, never a broad legacy fallback for gaps.

## Acceptance and implementation sequence

1. Confirm fixed self-host owner selection against the actual local saved configuration and setup/boot behavior; document the selected seam before patching host code.
2. Add response-boundary fixtures proving explicit inactive versus missing/unavailable behavior with a baked/mutable decoy page present. Test two owners, corrupt/unreviewed targets, unknown paths, malicious parameters and no private output.
3. Connect the host at the final public-page dispatch boundary. Prove admin/API/static/health behavior unchanged, Node and CF assembly, GET/HEAD, and one-pointer read under a concurrent update. Keep activation API and legacy Directory publishing closed.
4. Implement/prove captured HTTP metadata and SW/cache transition with old controlled browsers. Retain no-store until cache evidence justifies changing it.
5. Only after those gates, expose the reviewed activation/rollback wrapper with expected-generation and lost-response recovery; then perform the owner-reviewed staging slice and update/rollback tests. No real candidate activation is part of this design increment.

Primary verification includes workspace check/build, focused response/host/runtime tests, existing auth/tenant/no-leak/security mutation gates as affected, and honest conformance accounting. Coordinate source-mutating tests and generated builds with the parallel session. The nine existing unreachable conformance fixtures remain failures until resolved or explicitly dispositioned under release governance.

**Final bounded host verification:** workspace check/build, host smoke, publication24/24, host3/3, engine2/2, parity15/15, directory42/42, security/database-security, tenant175/175 and SW no-leak passed; mutations restored. Strict conformance retains nine unreachable failures. Broad CMS smoke retains eight S3 loopback-fixture/security-contract failures, diagnosed without weakening the unchanged guard. [Review and exact limits](wordpress-pilot-t2-review.md). Sequential lock released; activation, older controlled-browser transition and deployed cache/SEO acceptance remain open.
