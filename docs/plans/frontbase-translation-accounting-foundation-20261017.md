# T2 durable allowance foundation — 2026-10-17

Status: locally verified source checkpoint; full T2 remains open. This foundation follows the [deployed T1 settings](frontbase-translation-ai-t1-20261017.md) and [T2 plan](frontbase-translation-ai-dispatch-plan-20261017.md). It is not part of the1073252 staging image and does not enable generation.

## Bounded implementation

[Provider-neutral accounting contracts](../../packages/translation/src/accounting.ts) define immutable tenant/project allowances, a pinned policy hash, integer accounting units, request/concurrency ceilings and per-job/lease attempts. Units are host-defined; no dollar estimate, tokenizer, currency conversion or global provider-account spending guarantee is invented. The host must reserve a conservative bound and supply its reviewed charge policy. Pricing/config/storage-selection fingerprints and batch authorization are host integration work, not inferred from an opaque hash.

[SQLite reference implementation](../../packages/translation/src/adapters/sqlite-accounting.ts) extends the existing job adapter and uses its same transaction, trusted clock, source/head validation and lease fence. No second queue/connection driver. Allowance definitions cannot be silently edited/reset. Reservation checks aggregate charges/held amounts and enforce amount, request and concurrent limits atomically. Indexed, scoped SQL aggregates avoid copying a project’s attempt history into runtime memory. Attempt identity is the scoped job plus lease epoch; repeated dispatch never grants another external invocation.

Dispatch marks the attempt and job together in one transaction. Only demonstrably reserved/undispatched attempts can release their allowance. Completed usage settles idempotently, with conflicting settlement rejected. Unknown/invalid/over-reservation cost remains fully held as uncertain, occupying the concurrency slot and preventing another allowance from bypassing the same job’s unknown outcome. A dispatched record surviving a crash stays held until explicit reconciliation; this foundation does not claim an automatic reconciliation UI or cleanup policy. Cancellation does not refund external work.

The [existing runner](../../packages/translation/src/jobs.ts) accepts an additive injected accounting port: authorize → reserve → atomic dispatch → provider → settle → protected revision CAS. Accounting denial prevents calls. Settlement precedes revision acceptance, so a manual/source/head conflict does not erase incurred cost. Unknown provider failures become terminal under this accounting policy, avoiding automatic ambiguous billing retries. Failure to settle remains conservatively held. The generic standalone runner’s previous no-accounting mode is retained for backward compatibility/deterministic use; any later exposed Frontbase generation handler must require this policy rather than invoking that compatibility path.

No new dependency, Node-only import in engine code, provider SDK, public-schema use or owner-instance SQL change. The separate datasource still uses HTTP; the SQLite adapter is an injected reference/conformance implementation, not a proposal to replace studygram-selfhost with SQLite or add TCP support.

## Verification

Actual SQLite tests cover concurrent allowance limits, idempotent intent, one-time dispatch, no sent-request refunds, stable settlement, uncertain retention, request/concurrency caps, expired leases, tenant/project reads, over-reservation costs, zero-call denial, configured runner completion, cancellation before dispatch, manual conflict after provider success and restart through a second database connection.

Eight in-memory source faults are caught: allowance bound, concurrency bound, post-dispatch refund, lease fence, attempt owner predicate, duplicate dispatch, changed settlement and unsafe unknown-call retry. Source/index are unchanged by these faults. An initial mutation-fixture quote and non-unique anchor were corrected before acceptance; they were test setup failures, not passing fault evidence.

[Gate results](../../scripts/localization/accounting-evidence/gates.json): pnpm -r build and pnpm -r check pass. New accounting functional/eight-fault gates, retained localization/revision/job/PostgREST functional and mutation suites, backend AI/storage and tenant matrix all pass. Standalone offline tarball functional/strict external declaration proof passes with accounting included. The tracked application bundle is byte-identical to1073252 after the full build. Configured console type scope and existing bundle warnings remain unchanged. Standalone tarball proof is extended to execute the new accounting adapter suite and typecheck its export outside the workspace. No actual PostgreSQL accounting transactions, HTTP accounting adapter or paid-provider acceptance are claimed.

## Required continuation before T2/T3 can ship

Update: steps1–2 are now verified within the bounded [HTTP accounting continuation](frontbase-translation-accounting-http-20261017.md), using disposable local PostgreSQL/PostgREST. The owner destination remains unchanged. Steps3–5 remain open; the list below retains the original ordered requirements.

1. Implement equivalent narrow accounting operations in the existing PostgREST bridge/protocol with explicit capability/version negotiation; retain v1 storage compatibility and fail closed when accounting is absent. No generic SQL RPC.
2. Prove actual PostgreSQL concurrent reservations/dispatch/settlement, role isolation, fencing and rollback on isolated approved fixtures. Install/upgrade only through a concrete reviewed administrative operation; the owner database is unchanged here.
3. Compose a mandatory host accounting policy with pinned model/pricing/config and storage identity. Define exact token/currency bounds, retarget pauses and reconciliation; do not label the generic integer limit a monetary budget without those bounds.
4. Add bounded recovery for abandoned undispatched holds, explicit uncertain-call reconciliation, immutable batch intents and safe status/progress surfaces. No new attempt from an uncertain predecessor by silent reset.
5. Keep generationAvailable false until this accounting acceptance and T3 reviewed-batch/authenticated-delivery controls pass. T4 real provider testing needs a selected content batch and allowance. Visual locale preview/publication remains later.

T1 is committed/deployed separately. No paid calls, owner-destination writes, new runtime settings or publication occurred while building this foundation. Unrelated shared staged changes remain preserved.
