# R2 behavior measurement repair proposal

**2026-10-09; read-only proposal for primary review.** This follows the [isolation diagnostic](PUBLIC-RELEASE-R2-BEHAVIOR-ISOLATION.md), [accepted auth-primary repair](PUBLIC-RELEASE-R2-AUTH-PRIMARY-REPAIR.md) and [transport inventory](PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md). It changes no handler, fixture, classifier, ledger, dependency or gate. No build or live operation ran for this document. [Current audit](PUBLIC-RELEASE-AUDIT.md) governs integration; CF-22 remains paused.

The smallest safe next increment repairs **measurement integrity**, not the ledger's pass result. A fail-to-pass change cannot honestly be promised while the gate compares exact historical status/evidence strings and current evidence differs. Keep the failing ledger and full operation denominator visible throughout. Review any eventual status or evidence amendments individually; never run `--dump-ledger` to adopt the current output.

## What is already established

The original diagnostic baseline at `d3cd122` produced270 functional/47 shape-only/17 external-disabled and50 ledger differences. Reverse ordering changed36 evidence entries and25 classifications. Thirty-one of50 forward differences change only the SQL count token. These are dated baseline measurements, not the expected post-auth-repair result.

Primary subsequently repaired the concrete auth-primary column/config inconsistency and verified functional7/7 and mutation3/3. That accepted production repair must remain separate from proposed probe repairs; rerun and identify the compiled auth route before comparing new measurements. The old diagnostic's failures must not be represented as remaining production defects after repair.

Current [probe](../../packages/backend/test/compat-conformance.mjs) has four distinct weaknesses:

1. Its fixture IDs are distinct, but the app, database, settings, defaults, memory storage and password-reset map persist across334 operations.
2. Behavior is derived before response conformance/refusal handling. A400/404 or200 `success:false` can be called functional from incidental SQL or an attempted outbound request.
3. Empty/default fixtures are treated differently depending on whether unrelated prior queries returned rows. No nonempty target fixture means the starvation experiment is often inconclusive.
4. Starvation empties every query, including configuration and supporting state; replay errors are treated as positive dependence, and attempted provider calls are not equivalent to completed intended effects. SDK transport is not exhaustively injected.

## Proposed smallest implementation sequence

### 1. Isolate fixture state while preserving the gate

Extract the existing synthetic app setup into an operation-context factory. Give each operation its own migrated SQLite runner, app, memory storage, reset-token map, tracing state and fixture serial. Reuse the same invented principal, scripted dependency contracts and operation inventory. Construct context immediately before `prepareFixture`; dispose only that context's exact local handles/files afterward. A cached test password hash can avoid334 expensive hashes without altering production auth or reusing database state.

Pass the operation context explicitly into fixture/request helpers and measurement. Avoid replacing global mutable app/runner variables around potentially asynchronous requests: that makes accidental concurrency couple one operation to another. The unchanged operation inventory must still contain334 entries; fixture failures must emit one explicit measurement and an unreachable/refusal result, never disappear from the denominator. Do not drop operations or accept previously unknown refusals to get zero unreachable.

Safe integration points are the probe's setup block, `requestJson`/`createFixture`, `prepareFixture`, and the main `entries` loop. Keep the existing response validator, differential refusal corpus and strict `--gate` threshold intact. Existing fixture mutation anchors may require a mechanical update after extraction; their four intended regressions must still fail real requests and independently restore GREEN.

Acceptance for this increment: forward, reverse and at least two deterministic seeded permutations produce the same classification and qualitative evidence for each operation. Raw SQL counts are retained, and every334-operation run is compared rather than accepting equal aggregate totals. Classification stability alone is insufficient; the existing diagnostic showed identical404 responses could still be mislabeled functional.

### 2. Add positive preconditions for the observed cases

Use the successful controls from the diagnostic instead of minimal generic schema synthesis:

| Operation | Required positive fixture/assertion |
|---|---|
| Storage compute/list/delete-provider | Create owned connected account, local provider and exact bucket; bind actual IDs; insert an exact-bucket42-byte shadow file. Require compute42, named file/total1, or actual provider removal respectively. A query on synthesized `probe` is not a success fixture. |
| Queue/vector lists | Create a nonempty named resource through real API; require that named resource in the result. Empty lists remain a valid API response, but cannot prove that a read shapes output. |
| Agent settings | PUT a nondefault temperature and require it in GET. Avoid persisting values equal to defaults as a dependence control. |
| Primary auth form | Use normal CREATE→set-primary→GET and require the chosen ID and primary flag. Preserve inactive/no-fallback/owner tests from the accepted repair; do not restore config-only selection. |
| Project asset upload | Use an allowed extension and asserted persisted public asset result. Keep the invalid extension case as a negative test. Do not claim image-content validation from extension acceptance. |
| Datasource search | Keep the real local searchable row and matching nonempty query; require the intended matching record rather than a merely nonempty response envelope. |

Prepared data and measurements must be separable: setup SQL/provider calls must not be counted as effects of the operation being measured. Setup success predicates should fail before measurement when a required account/provider/resource is absent. Negative fixtures remain independently tested; response-schema conformance is not a substitute for positive behavior assertions.

### 3. Record outcome before proposing status changes

Add diagnostic outcome fields orthogonal to the existing four status labels: observed HTTP code, operation-specific success predicate, attempted/completed provider calls, returned target rows, intended state change, and refusal reason. Initially retain the existing ledger comparison and report explicit contradictions, such as `functional` with an unmet success predicate. A contradiction must keep a diagnostic integrity gate RED; it must not be erased by relabeling or treating a failure envelope as successful provider work.

Use operation-specific predicates where response semantics differ. A global recursive search for `success:false` would wrongly interpret a record's boolean data, and a blanket requirement for `success:true` would wrongly reject lists/bodyless mutations. Health/check routes can legitimately report a negative health result: they require evidence of the intended check, distinct from claiming the downstream service was healthy. Top-level envelopes, expected mutation results and provider test round trips need explicitly reviewed predicates.

Evaluate behavior only after the response/refusal branch has been identified and any success response validated. Schema conformity remains a separate gate: a schema-valid error envelope is not intended-operation success. Product-verified refusal means the differential corpus verified that request's refusal; it does not prove feature availability or permit a functional success classification.

### 4. Tighten counterfactuals without inventing dependence

For read-only success candidates, keep supporting auth/owner/configuration rows present and alter only the operation's seeded target data. Examples: remove the matching file, resource, primary form or `agent_settings` value while retaining principal/provider resolution. Compare the explicit success predicate and business output, not just any response/error difference.

Record original and counterfactual traces separately. Empty target reads are inconclusive; a query count does not make them functional. A counterfactual500 due to missing cipher settings/auth support is inconclusive, not proof that the intended listing read matters. Restrict replay transport/session/writes: if a supposedly read-only replay attempts a write or provider action, fail the measurement rather than silently performing it or counting the error as dependence. Preserve exact data identities needed by predicates; normalize only documented volatile response fields, rather than masking every UUID/timestamp anywhere in business content.

The local operation context should be discarded after the counterfactual; do not restore a shared live database to simulate isolation. None of this authorizes production record changes.

### 5. Treat transport denial as unavailable evidence

Use a throwing global fallback spy and scripted injected transport so diagnostics never contact invented endpoints. Record every fallback attempt. An injected denial followed by a raw/global SDK attempt is an integrity failure, not a scripted successful provider check. The [transport inventory](PUBLIC-RELEASE-R2-TRANSPORT-AUDIT.md) has the separate repair/acceptance scope; do not fix adapter injection incidentally inside a probe refactor.

Distinguish unavailable dependency, configured dependency failure, policy refusal and completed effect. Current text matching for `not configured`/`no provider` is only an observation, not a universal authoritative capability contract. No token, network error or persisted audit row can substitute for the provider operation. For a vector connection probe, DDL/upsert/search/delete must be demonstrated through recorded scripted protocol responses or a supported local adapter; failed fetch plus SQL reads is not round-trip proof.

## Changes requiring separate expectation review

| Evidence class | Proposed review result; not adopted |
|---|---|
|31 count-only baseline differences | Review corresponding production read/write changes and retain numeric diagnostics. Do not normalize counts out of the existing exact ledger comparison. A future qualitative evidence format is a separately versioned gate-contract choice requiring reviewed tests. |
| Functional404 or missing-credential400 | These are refusal/incomplete success evidence. Decide whether a new outcome/status representation is required; do not relabel them to silently satisfy current four-state expectations. |
| HTTP200 `success:false` provider test | Could prove a correctly executed negative check only with operation-specific attempt/result evidence; cannot prove successful connectivity. Existing generic functional classification needs explicit review. |
| Default/empty reads currently shape-only | Populate and target the counterfactual first. The eight passing positive controls show several handlers already work; do not add pointless SQL or change production responses to satisfy the probe. |
| Redis settings defaults | Source intentionally returns defaults. A stale functional ledger entry must be reviewed against supported behavior; no new settings feature is implied. |
| Auth primary | Production defect already fixed with independent functional/mutation evidence. Any changed ledger observation must cite that accepted repair and fresh measured baseline. |

Preserve the existing behavior ledger until this review yields an operation-by-operation proposed patch. The complete CF-22 runner also requires all334 operations functional; its17 baseline unavailable capabilities cannot be made complete by expectation changes. CF-22 stays paused, and Developer Preview release evidence must state capability boundaries independently.

## Required misclassification tests

Before adopting a classifier/status change, prove these actual app or probe faults fail:

- Prior-operation settings/provider pollution changes a later result; forward/reverse/permutation invariance fails.
- Missing provider or wrong bucket bindings produce404 while SQL executes; diagnostic success predicate fails.
- A canned empty list with an added irrelevant read cannot pass a nonempty fixture/counterfactual check.
- A canned default settings response cannot pass the nondefault value assertion.
- Primary lookup selects stale config or inactive/foreign forms; existing auth-primary tests fail.
- A provider test returns200 `success:false` after a failed attempt; no successful round trip is recorded.
- A refusal persists an audit/attempt row; the measurement still cannot claim intended mutation success.
- An injected transport denies before network, but an SDK uses global fallback; integrity test records and fails it without actual network.
- Counterfactual starvation removes supporting secret/auth rows and causes500; measurement reports inconclusive instead of functional dependence.
- A replay performs a write or provider request; the read-only safety guard fails and original traces stay distinct.
- One operation throws during fixture preparation; the334-operation denominator and explicit failure remain.
- An extra harmless SQL query changes only raw counts; exact ledger stays RED until individually reviewed, while qualitative operation-success evidence is not falsely upgraded.

Mutation tests must cause those concrete wrong outcomes, compile where source is mutated, detect the intended failure rather than a SQL binding/transport infrastructure error, and independently rebuild/restore GREEN after each fault. Primary runs shared builds under the exclusive lock. Existing response, refusal, owner, auth, secret, SSRF and no-leak gates remain required.

## Proposed next executable task

Primary claims the operation-context extraction and the observed positive fixtures, then reproduces order invariance and existing strict response/fault gates. Keep classifier/ledger behavior unchanged in that first code increment and explicitly report residual wrong-outcome classifications. A second bounded increment introduces reviewed operation-specific success/counterfactual integrity checks; only after that evidence is stable should primary propose exact expectation changes. This avoids coupling production repairs, fixture repairs, transport acceptance and a ledger rewrite into one unreviewable pass.

Owned deliverable: this document only. No code or gate result changed. Full R1/R2, package/CMS/host acceptance and pilot installer/inquiry/migration/reuse remain open; no GA, deployment or feature-parity claim follows.
