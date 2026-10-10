# Proposed state interface and observed URL identities

**Subsequent route-policy increment:** [Preflight route repair and policy reconciliation](wordpress-pilot-route-policy-reconciliation.md) blocks builder/frontbase-setup/console routes before provider access, preserving original URLs and ordinary hyphenated names. Reproduced old 200-versus-422 failure; repaired acceptance, mutation 8/8, expanded route observations 8/8, workspace and security/tenant/conformance/SEO/host/no-leak gates pass. Next: preparation-time browser URL serialization acceptance and intended host reserved/fallback inventory. Full unpublished catalog, browser preview, state admission/recovery and all writers remain open; no M2 or release clearance. Earlier receipts below remain historical.

**Subsequent active-capture increment:** [Active-capture URL audit](wordpress-pilot-active-capture-route-audit.md) extends the existing Pages check with server-owned hash/schema-validated institution, program and article paths, directory/blog indices and capture version. Prepared/inactive and uncaptured records are excluded. Utility/route regressions, three capture controls plus pointer-drift control, UI 6/6, built-host dispatch, workspace check/build, security/tenant/no-leak pass. Next: route-policy reconciliation and host-wide inventory; full unpublished catalog, preview inspection, runtime admission/recovery and coordinated writers remain gates. No installation or migration completeness is certified. Historical receipts below retain their original scope.

**Latest integration (2026-10-10):** [Page admin audit and host proof](wordpress-pilot-page-route-audit-admin.md) supersedes earlier unwired/next-integration statements below. The authenticated endpoint and existing Pages dialog check stored owner pages only; utility 11/five controls, endpoint/four controls, UI 5/5 and isolated built-host dispatch pass. Listing/blog paths, deployed/host-wide inventory, preview browser verification, state admission/recovery and coordinated writes remain open. Next: trusted server-side catalog/capture projection and reconciled policy. Historical receipts below retain their original scope.

2026-10-10. Prerequisite design and synthetic evidence for M2, not a production capability, accepted adapter/storage architecture or installer delivery. Existing public URLs and writers are unchanged. The six packages, existing admin and one-engine model remain intact. This follows the [namespace proposal](wordpress-pilot-namespace-contract.md), [writer inventory](wordpress-pilot-namespace-writer-inventory.md) and [failure-containment evidence](wordpress-pilot-state-failure-containment.md).

**Subsequent increment:** [Read-only namespace audit](wordpress-pilot-route-namespace-audit.md) implements bounded internal inspection and extends the route diagnostic to 7/7. The newly exercised legacy tenant serving helper decodes paths and strips boundary slashes, unlike exact capture matching. The earlier exact-store findings remain true but never established host dispatch. Current next work is host dispatch/inventory proof and authenticated read-only integration, then reconciled policy; original six-group receipt below is historical evidence.

## One state boundary, separate listing connections

`packages/edge-infra/src/providers/types.ts` owns `DbRunner`: query, exec, an optional dialect and optional transaction callback. Keep that existing contract compatible. A connected listing database or an object with a transaction method does not establish application-state installation safety. An additional internal capability must be admitted by trusted host construction only after its adapter/storage acceptance gates pass. No public request, template artifact, provider-name switch, type cast or configuration boolean can grant admission.

The [compile-only shape](../../packages/edge-infra/test/state-capability-contract.ts) describes an owner-bound view:

- `forOwner` receives authenticated server context; operations cannot override it.
- `run` receives validated destination-bound intent: stable operation ID, digest, expected generation/configuration revision and intended resource IDs. Intent creation is a server validation step, not JSON casting.
- Its callback receives only parameterized query/exec, without a parent connection or nested transaction API. Existing trusted stores can consume that shape. The implementation must close it after the callback, reject escaped calls, validate exact affected counts and prevent caught SQL failures from committing.
- Results distinguish committed, refused and uncertain outcomes. Only committed results expose the value/generation. No generic clear, expiry, replay, fallback or automatic recovery method exists.
- `status` returns bounded availability information. Owner-scoped operation status additionally needs journal inspection; a resource being ready does not prove an installation committed.

The unique-symbol types are compile-time constraints only. They do not authenticate callers, enforce SQL owner predicates, protect JavaScript callers or prove lifecycle safety. Runtime admission should use a private trusted registry/object identity rather than accepting a caller-supplied branded object. This is a proposed implementation requirement, not implemented admission. The strict fixture uses the actual DbRunner type and seven expected compile failures; declaration checking of dependencies is skipped, so this is not external package-consumption proof.

Three different controls must compose without being confused:

| Control | Scope | Purpose |
| --- | --- | --- |
| Resource failure containment | Entire physical state resource | Refuse participating writers before opening a client after uncertain native cleanup/commit; survives process death |
| Owner coordination | Authenticated application owner | Serialize protected edits, configuration, claims and installation; compare generation/revision |
| Operation journal | Owner and exact operation ID/intent | Establish durable ownership/outcome; conditional restore preserves later edits |

One self-host site normally has one owner. Cloud owners remain separate, but a damaged shared physical connection/resource can require a resource-wide pause. This does not imply multi-site self-hosting. Reads from existing immutable published captures should remain available while protected writes pause.

Placement remains at the existing state runner/store construction seams, not a second admin or education-specific database engine. The raw owned-file prototype is a transaction primitive; it does not implement owner coordination or journals. Its synthetic sidecar fence is not an adopted host storage architecture. Production admission requires validated marker/storage identity, durability, alias/tamper boundaries, consistent sharing by all writers and evidence-based recovery before clearing a pause.

## Compatibility that remains to prove

The PostgreSQL runner already implements a dedicated-client transaction; migration code uses it for a database-wide advisory lock. Billing webhook code chooses `runner.transaction(apply)` when available and otherwise uses its existing direct path. Neither behavior establishes installer eligibility.

Do not replace these consumers with an owner-bound installer wrapper blindly. Billing resolves affected owners from trusted event/state processing inside its callback; migrations require a resource-wide boundary before owner records exist. First validate the common owned-transaction primitive against their existing behaviors, including duplicate webhook handling, rollback, lost COMMIT replies and migration locking. Then compose appropriate coordination at each supported writer. No new sequential fallback is allowed for installation, and no guarantee holds while an old process or supported raw store bypasses coordination. Existing billing fallback is observed here, not newly authorized or certified as safe.

Native cleanup, timeout/cancellation and exact counts require runtime acceptance independently of TypeScript. Callback SQL is trusted framework SQL; this interface is not an arbitrary SQL sandbox. Production error mapping must discard raw driver/callback secrets before an admin response. The test prototype currently is not that error boundary.

## URL evidence: identity is not a universal normalizer

The [diagnostic](../../packages/backend/test/route-identity-diagnostic.mjs) exercises actual built schemas, resolver, stores and the read-only preflight handler. All URLs/data are synthetic; no WordPress, Supabase, storage or live host was accessed.

| Existing surface | Observed behavior | Consequence |
| --- | --- | --- |
| Captured public resolver | Exact `URL.pathname` equality with originalPath/configured directory | `/College/` resolves; `/college/`, `/College`, `/%43ollege/` do not substitute for it |
| Program resolution | Uses program originalPath and institution ID relationship independently | An old program parent slug is preserved even if the institution URL differs |
| Capture collision validation | Decodes once and removes one final slash; preserves case | Encoded/slash aliases collide, although the resolver does not serve them as aliases; case variants can be distinct |
| Template preflight | Removes one boundary slash, lowercases, restricted ASCII grammar | More conservative case collision than capture; it is not the public resolver's identity policy |
| Reserved prefixes | Preflight accepts builder/frontbase-setup/console paths that capture rejects; preflight rejects health prefix that capture accepts | Destination checks are not sufficient installation or routing clearance; install remains unavailable |
| Compat/framework stores | Exact supplied slugs, separate persistence namespaces and owners | Case/slash variants and cross-store records can coexist; no automatic winner or merger is safe |
| Compat homepage | Flag-selected record, independent of literal `/` slug | Home claim and root routing need explicit joint validation |
| Request URL parsing | WHATWG removes dot segments before resolver; encoded ASCII spelling remains encoded | Stored input validation must occur before URL construction loses evidence |

`publicationPathSchema` inspects decoded characters to reject traversal, forbidden characters and reserved paths; it does not return a decoded URL. It currently accepts encoded separators and interior repeated slashes. The diagnostic records that behavior, not a security clearance or an assertion of proxy equivalence. Host/proxy/engine behavior across all supported targets remains untested here. The API trailing-slash middleware in `compat/spec.ts`/`compat/app.ts` concerns API contract redirects and must not be reused as a public URL policy.

## Proposed first route contract

Maintain two separate concepts: **the exact public spelling** to preserve and **potential conflicts** to review. A collision check may conservatively reject ambiguities without claiming the addresses are interchangeable. Do not lowercase, decode, slugify, replace parent paths or redirect an original WordPress address merely to produce a claim key.

The first shared policy should return either a validated exact identity plus conflict evidence, or a bounded unsupported/ambiguous report. Inputs carry their source kind: original public path, compat slug, framework resource and homepage binding; a leading slash is not silently stripped without that source context. Root has a fixed claim bound to the selected home resource. Resource IDs, not matching content/path strings, determine whether draft and published forms share a claim.

Before enabling installation, audit all same-owner source records, tombstones, home bindings, configured directory/blog routes and generated record URLs. Preserve originals and report cross-store, case, slash, encoded and reserved-route conflicts. Potential-conflict checks must be order-independent; invalid/oversized input refuses before mutation. The installed template's internal authoring pages and public record URLs are different sets; validating seven template pages cannot certify the full WordPress catalog.

A shared reserved-route inventory must be derived from the actual host's mounted routes and selected features, then tested against dispatch. Do not resolve current policy differences by widening public publication paths. The initial supported exact path grammar and any redirects/aliases require explicit host evidence. An ambiguous legacy path remains blocked for review rather than being rewritten. Extraction into production and mutation/conformance acceptance are the next implementation step; this document does not adopt a new URL grammar.

## Verification and remaining work

Initial standalone tsc invocation failed with TS5112 because the installed compiler requires `--ignoreConfig` for explicit files. Initial route fixture failed schema validation because list nodes used Container and detail bindings lacked their sample path. Corrected fixtures use existing component/query contracts; no production schema was relaxed.

Commands:

```powershell
pnpm --filter @frontbase/edge-infra exec tsc --ignoreConfig --strict --noEmit --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2022 test/state-capability-contract.ts
pnpm --filter @frontbase/backend exec node test/route-identity-diagnostic.mjs
```

Corrected standalone strict type fixture exits 0; seven negative constraints are enforced by `@ts-expect-error` unused-directive checking. Final route diagnostic observes 6/6 groups, exit 0. Counts describe bounded observations, including current inconsistencies, not repaired production guarantees. Workspace/regression results are recorded in the audit completion receipt.

Final workspace check/build exit 0; rebuilt diagnostic, existing preflight, captured SEO, page-change 15 groups and edge-infra no-leak pass. Whitespace and 97 local report/current-plan links resolve. Existing build warnings remain; no production mutation/conformance matrix, runtime capability/billing/migration acceptance, intended-host proxy tests or credential-gated live checks ran. The compile fixture and diagnostic remain outside production exports and test registration. Plans/audit/milestone receipts are updated; source policy and accepted release/architectural decisions are unchanged. All changes remain uncommitted, with no primary build/subprocess active.

Next executable task: specify the shared exact-path/conflict classification and read-only namespace audit, with unsupported/reserved/home/cross-store and order-independent controls; then integrate the reviewed policy with preflight/capture and verify host dispatch. In parallel scope, common transaction admission still needs existing billing/migration tests and storage/security/recovery acceptance. Only after those gates pass should coordination/journals and all protected writers be integrated. M2, fresh M3, R1–R4 and cutover remain open. No production activation, release claim, dependency adoption or CF-22 change.
