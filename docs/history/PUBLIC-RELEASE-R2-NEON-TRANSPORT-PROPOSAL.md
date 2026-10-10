# R2 Neon HTTP: verified boundary and proposed repair

2026-10-10. Primary evidence/design continuation of the [SDK HTTP delivery](PUBLIC-RELEASE-R2-SDK-HTTP-DELIVERY.md), [transport audit](PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md) and [Wave 1 allocation](../plans/wordpress-pilot-two-session-waves.md). This is a proposal, not an adopted dependency, security repair or provider-support claim. Six packages, self-host-first deployment boundaries and paused CF-22 remain unchanged.

## Installed API evidence

Inspected `@neondatabase/serverless` **1.1.0**, the installed edge-infra dependency. Its ESM entry SHA256 is `2913bd33766e5e9ca954c86d77c3664fc4169b2188cc8de558a07bb04ca0df27`. The [official configuration documentation](https://github.com/neondatabase/serverless/blob/main/CONFIG.md) and installed `CONFIG.md`/declarations identify `fetchFunction` and `fetchEndpoint` as global-only. Per-client `fetchOptions` supplies Fetch request options, not a supported transport override. Official main is supplemental documentation; the exact installed runtime and executable diagnostic determine the version-specific observations below.

The additive [offline diagnostic](../../packages/backend/test/neon-transport-diagnostic.mjs) exercises the actual SDK, current compiled [Postgres runner](../../packages/edge-infra/src/providers/postgres.ts) and current compiled destination policy. Eight observed groups:

1. `neon(dsn)(sql, params)` rejects with the tagged-template API error before HTTP. The supported conventional call is `.query(sql, params)`.
2. The production runner currently invokes that rejected conventional function form for both query and exec. Its existing construction-only test does not prove a round trip. This defect is independent of the missing guard.
3. An attempted function inside per-client `fetchOptions` is not selected as transport. Actual `.query()` uses the scripted raw/global fetch, carrying its POST body and connection-string header. Do not ship this as an injection technique.
4. Owner A's lazy query created under global hook A, then owner B's query under hook B, both execute through hook B. Both invented connection strings reach B's recording hook. This deterministic interleaving proves transport selection is not client-scoped; it does not prove an actual cross-tenant database query or live credential disclosure.
5. For `database.internal`, the SDK derives `https://api.internal/sql`, which the current backend policy rejects. The offline SDK still calls the scripted raw transport. Validate actual derived endpoints, not only the DSN host. No DNS or network reachability is established.
6. For a scripted UPDATE result containing no returned rows, row-array length is zero while `fullResults.rowCount` is seven. Counting rows cannot implement accurate affected-row/CAS semantics. This is driver result-shape evidence, not a real SQL/transaction proof.
7. The SDK wraps a throwing global hook without attempting raw fetch afterward. This does not mean backend injected policy is applied: the global hook is the only selected hook in that experiment.
8. The standalone diagnostic restores both original SDK global settings and native fetch on completion or failure. These global mutations exist only in the private diagnostic process, never application production code.

First diagnostic run failed because the default SDK rewrites `127.0.0.1` to `api.0.0.1`, which native Request rejects as an invalid URL. Corrected the fixture to a valid `.internal` derived endpoint; do not report the failed numeric fixture as a private-address request or accept arbitrary rejection as guard evidence.

## Recommended next implementation experiment

Prepare an **isolated, provenance-pinned SDK extension experiment** that adds an explicit per-client Fetch-compatible hook to the installed Neon implementation, preserving upstream query serialization, result parsing, error handling and endpoint derivation. This is the recommended technical investigation, not authorization to adopt/publish/maintain a fork. A passing copied-source experiment would still need a separate dependency distribution and maintenance decision before production integration.

Keep the transport selected in the client closure; do not read a tenant's hook from mutable process-global state at execution time. Preserve upstream defaults when the option is absent for operator-owned standalone use. Backend tenant-controlled calls must explicitly supply their guarded transport, without raw fallback after denial. The hook must see every actual SDK-derived endpoint, effective POST body/auth and cancellation. Preserve the existing runner seam and server-only boundary; do not implement a second handwritten Neon protocol in routes.

Pair any production integration with `.query()` and `fullResults: true`, returning `result.rows` for query and a validated actual affected-row count for exec. Reject malformed/missing count instead of inventing successful CAS. Confirm DDL/count-null semantics separately; never claim installer capability from a SELECT or fixture array length. Security and API corrections should land together so correcting the currently rejected query does not silently activate an unguarded path. Existing raw PostgreSQL application-state/native operator paths require their own deployment policy and are not this HTTP adapter.

The ordered acceptance backlog is:

1. Reproduce an immutable copied-SDK prototype outside installed dependency files, record original/modified source hashes and exact patch, and retain license/provenance. Test client A/B in overlapping and reversed order; global settings must remain unchanged. Verify ordinary/operator defaults separately.
2. Type the proposed per-instance option without casts/`any` suppression, test parameter serialization, result types/errors, lazy query/transaction behavior and full result metadata against installed upstream. Test query/exec counts, including nonempty SELECT, DML without RETURNING, zero updates and malformed metadata.
3. Assess upstream extension availability and maintenance/distribution choices. Require an accepted durable decision before manifest/lockfile adoption. A direct protocol adapter or permanently installed global router is an alternative architecture requiring independent review, not a shortcut.
4. Thread accepted transport through backend datasource and edge-database callers; test actual derived endpoint refusal, redirects, cancellation/deadline, secret-safe errors, no raw fallback and concurrent owner/host separation. Do not disable legitimate Neon capability silently or relabel unsafe success as support.
5. Independent mutations must catch loss of client hook, global-hook substitution, URL-only body/header forwarding, policy bypass, row-array count substitution and obsolete callable API. Restore/rebuild each baseline, then workspace build/check, tenant/security/conformance/no-leak and host gates. Keep shared response/behavior ledgers unchanged unless separately reviewed semantic evidence warrants a change.

Transient global swaps, per-request serialization around a global setting, undocumented `fetchOptions` injection and hand-rolled duplicated SQL drivers are rejected approaches. A stable operator-global transport alone cannot satisfy two hosts injecting different owner-scoped transports in the same process. This design remains compatible with the primary single-site self-host target while retaining cloud/multi-host isolation requirements.

## Reproduction and delivery boundary

### Completed runtime feasibility experiment

The additive [in-memory candidate](../../packages/backend/test/neon-client-experiment.mjs) imports a copied, hash-checked upstream ESM module through a data URL. It performs exactly two asserted single-occurrence replacements: add `fetchImpl:frontbaseFetch` to the `neon()` options destructuring, and select `frontbaseFetch ?? ce.fetchFunction` inside execution instead of the global-only hook. It writes no upstream file and stores no copied driver in Git. Original hash is recorded above; candidate runtime hash is `69fb2f7053d74e939e99e158b1e3893eea1ab3ddb1e207834a1f9b8ca8cc9605`. Source/provenance is the installed upstream MIT package; the script records the exact replacement pairs.

Nine offline groups pass: forward/reverse lazy owner isolation; derived `.internal` endpoint denial before transport; redirect/injected denial with no raw fallback; full-result DML metadata; actual upstream batch serialization/result parsing; already-aborted caller refusal; unchanged operator default; detected counterfactual removal of the hook followed by an independently imported clean candidate baseline; and unchanged candidate globals/installed upstream bytes. Guarded clients deliberately convert SDK input/init to a native Request before the existing backend guard so the Request deadline/caller contract applies. A raw global throwing sentinel is installed only in this experiment process, then restored.

This establishes a small runtime seam's feasibility. It does **not** supply source-level TypeScript declarations, distributable packaging/provenance/maintenance acceptance, real SQL semantics, adapter integration, actual host/DNS egress, malformed-count handling or the complete independent production mutation matrix. The next primary task is typed/distributable-candidate assessment, not repeating this completed runtime experiment or claiming the application is repaired.

```powershell
pnpm -r build
pnpm -r check
node packages/backend/test/neon-transport-diagnostic.mjs
node packages/backend/test/neon-client-experiment.mjs
```

The diagnostic deliberately asserts current defects; its GREEN result means the counterexamples were observed, not Neon acceptance. It is not registered as a passing production security gate. No production code, dependency, global application setting, real provider/data/publication or deployment changes in this increment. Parallel-session files are preserved; their reports still require primary review.

Final command results and build-lock release are recorded in the [audit claim](PUBLIC-RELEASE-AUDIT.md). Neon guard/API/count repair, namespace installer capabilities, behavior/type acceptance and R1/R2 remain open. The next executable primary task is typed/distributable-candidate assessment and independent review of completed external Wave 1 reports.
