# Owned file-state callback candidate

2026-10-10. Experimental implementation and acceptance evidence following the [native file diagnostic](wordpress-pilot-file-state-evidence.md) and [namespace contract](wordpress-pilot-namespace-contract.md). The candidate remains under `packages/edge-infra/test/`; it is not exported, registered, wired into the CMS or adopted as an installer capability. Existing adapters and package dependencies are unchanged.

## Implementation and verified scope

### Latest containment and rejection repair

[Failure-containment evidence](wordpress-pilot-state-failure-containment.md) now passes ten fence groups/two independent fence controls, including blocked participating writers across process restart and falsy callback/COMMIT failures. The added falsy-callback test initially failed because the candidate used error truthiness. Outcome-field presence now detects all rejections, with non-Error callback failures normalized. Candidate baseline 13/13, source controls 7/7, alternate cleanup 8/8 and lifecycle 10/10 pass. Current source SHA256 `b82c6cc3fa521d4cb89fa0ef297dec2def8a42a9ddca00371af6d588aec7b55c`. Earlier sections retain dated hashes/counts. The write fence and candidate are still test-only; production writers, storage architecture, typed/billing and journal-based recovery remain gated.

### Latest alternate cleanup assessment — partial recovery, not full acceptance

The test-only candidate now attempts `client.executeMultiple('ROLLBACK')` after the primary prepared-statement rollback rejects or exceeds its cleanup deadline. The installed local SDK exposes this method and routes it through native exec. The input is **exactly one constant control statement**; callback queries/writes keep SDK parameter binding. No user SQL or value is interpolated. Each path is separately bounded by `cleanupMs` (up to twice that asynchronous wait budget); synchronous native execution cannot be preempted by these timers.

Original rollback uncertainty is preserved even when alternate cleanup acknowledges success (`cleanupRecovered: true`). That flag describes the cleanup acknowledgement, not ownership, durable operation completion or permission to replay. Lost alternate acknowledgement can leave the file available with the flag absent; availability alone does not establish an operation result. After an attempted COMMIT, best-effort rollback cleanup preserves `state_commit_uncertain` regardless of whether the row persisted. Never repeat the callback or report success from that cleanup.

New [assessment](../../packages/edge-infra/test/owned-file-state-cleanup.mjs), command `pnpm --filter @frontbase/edge-infra exec node test/owned-file-state-cleanup.mjs`: **8/8 observations**, exit 0, private `frontbase-alternate-cleanup-dZxQBk`. Final regressions: candidate **13/13** (`frontbase-owned-state-jEZYcs`), source controls **6/6** (`frontbase-owned-state-controls-gwMtOG`), earlier lifecycle counterexamples **10/10** (`frontbase-owned-lifecycle-5fumMH`). All use synthetic OS-temp files only. Current candidate SHA256 `afbd81ba7af1b77a043cba3e03eb8017b4297dc4c55a6b264e799d110adbf444`; earlier sections preserve dated counts/hashes.

| Injected boundary | Same file writable while original process lives | Reported outcome |
| --- | --- | --- |
| Primary rollback rejects, alternate succeeds | Yes | Rollback uncertain; cleanup acknowledged |
| Primary rollback stalls, alternate succeeds | Yes | Rollback uncertain; cleanup acknowledged |
| Alternate actually rolls back but acknowledgement is lost | Yes | Rollback uncertain; cleanup not acknowledged |
| Both cleanup paths reject | No | Rollback uncertain; native lock remains |
| Both cleanup paths stall | No | Rollback uncertain; native lock remains |
| Alternate method absent | No | Rollback uncertain; native lock remains |
| COMMIT fault before actual execution, alternate rollback succeeds | Yes; original row absent | Commit uncertain; cleanup acknowledged |
| COMMIT actually applies but acknowledgement is lost | Yes; original row persists | Commit uncertain; cleanup not acknowledged |

Each child runs the callback once and inserts a SQL-looking value through a bound parameter. Parent read-back checks exact expected row presence and probes same-file writes while the child is alive. Unrecovered cases require owned-child termination before reuse. Stalls are injected around the local synchronous driver, not proofs of interruption of actual native work. The prior lifecycle fixture deliberately omits the alternate method and still reproduces close-only lock retention.

A sixth independent source control omits the alternate call in an in-memory candidate copy but leaves its claimed recovery flag intact. **Actual same-file reuse** then fails the specific detector; original baseline passes. This prevents acceptance based merely on method counters or metadata. Repository candidate and installed SDK bytes are untouched by controls.

**Residual blocker:** double cleanup failure/native handle release is unresolved. This assessment adds useful recovery but does not certify an installer state capability. Next: deterministic handle-release or explicit failure-containment/recovery contract assessment; then SQL trust, typed packaging, existing billing and coordinated writer acceptance. No production export/adapter, dependency, process-restart policy, live application data or release-scope change was adopted.

Final verification: workspace check/build, existing guarded page-change 15 groups and no-leak exit 0; three changed-script syntax checks, whitespace and 227 local links pass. The last two regression launches initially timed out in automatic approval without running; single retries passed. Existing build warnings and host artifact sizes remain unchanged. Production security mutation, typed/billing/hosted capability and live/fresh data gates are skipped for this test-only assessment, not certified. Work remains uncommitted and primary build slot is released.

### Earlier lifecycle increment — close-only counterexamples

The candidate now bounds asynchronous callback execution with a validated deadline and optional cancellation signal, closes callback access on interruption, bounds rollback waiting separately, and preserves uncertain COMMIT results without replay. Errors from cancellation, rollback and disposal use constant codes; this is not a claim of universal production error sanitization or synchronous CPU preemption.

Commands: the two suites below plus `pnpm --filter @frontbase/edge-infra exec node test/owned-file-state-lifecycle.mjs`. Current runs: candidate **13/13**, private `frontbase-owned-state-rnUgCQ`; source controls **5/5**, private `frontbase-owned-state-controls-m44hpy`; lifecycle **10/10 observations**, private `frontbase-owned-lifecycle-IGpCcq`, all under OS temp, exit 0. Added independent controls remove the deadline or cancellation handler in memory, detect the specific missing refusal, then pass original baselines. No repository or installed dependency mutation.

**These ten observations include two reproduced failures of cleanup, not ten accepted production behaviors.** The first lifecycle run exited 1: same-file reuse after injected persistent ROLLBACK failure returned `state_busy`. A subsequent isolated-process fixture independently reproduces both rejected and stalled ROLLBACK: the candidate returns sanitized `state_rollback_uncertain`, another connection sees no uncommitted row, but BEGIN still refuses with `state_busy` and never enters its callback while that process remains alive. Terminating the owned child process releases the lock; a new transaction on the same file then succeeds. Calling SDK `close()` is therefore insufficient on these exercised fault paths. Exact native cause is not established. No automatic application-process termination or fallback is implemented or recommended as a shipped recovery policy.

Other lifecycle observations cover pre-aborted zero connections, late callback access refusal, timeout rollback/reuse, cancellation after actual COMMIT with a persisted row/no replay, explicit disposal error after actual close, preserved COMMIT uncertainty plus disposal error, and independent child termination before/after actual COMMIT. Disposal-error hooks throw **after** real SDK close; they do not prove recovery when close throws before disposal. Child termination is abrupt process recovery, not power-loss durability.

Current source SHA256: `966a2b3752afe166e3eae8cdb58626dba67c8badc7126e7318acf79eef99945d`. Earlier hashes/runs below are dated prototype history. Minimal native reproduction is now complete below; next is supported statement/connection cleanup remedy assessment before production adoption. Keep typed capability, trusted SQL boundary, billing consumers and coordinated namespace writers gated. No adapter registration, package/dependency adoption, publication or live data action occurred.

### Minimal native-close reproduction

[Diagnostic](../../packages/edge-infra/test/file-state-close-diagnostic.mjs), command `pnpm --filter @frontbase/edge-infra exec node test/file-state-close-diagnostic.mjs`, bypasses the callback candidate completely. Each of six independent child processes performs BEGIN IMMEDIATE, INSERT, optional ROLLBACK and close, then remains alive while another client probes the file. SDK and its exact installed native dependency are compared; no dependency is installed or changed.

| Path | Explicit rollback before close | File available while child stays alive |
| --- | --- | --- |
| SDK execute | Yes | Yes |
| SDK execute | No | No: SQLITE_BUSY |
| Native prepare/run | Yes | Yes |
| Native prepare/run | No | No: SQLITE_BUSY |
| Native exec | Yes | Yes |
| Native exec | No | Yes |

All six show zero visible uncommitted rows; all files accept a new transaction after child termination. **6/6 observations, exit 0**, reproduced twice, final private evidence `frontbase-native-close-tidoE2`, earlier `frontbase-native-close-dcmDQJ`. Earlier four-path run also reproduced the first four (`frontbase-native-close-4Zbaax`); the added direct-exec comparison narrows the behavior to the exercised prepared-statement paths. Source inspection shows SDK execute uses native prepare, and native close invokes its binding; the fixture does not prove the binding's internal cause. Retained statement lifetime is a hypothesis, not an accepted root-cause finding. Do not interpolate SQL or substitute unparameterized exec for the production runner based on this control. Supported deterministic release with parameterized queries, post-fault reuse and no replay still needs proof. No upstream issue/message was sent.

Final workspace check/build exit 0; existing warnings remain and host sizes/client-symbol checks match the preceding increment. Five primary JS syntax checks, whitespace and 220 local evidence links pass. Existing page-change 15 groups and no-leak passed after the candidate changes; not repeated solely for the additive native fixture. Billing, production capability/security mutation, hosted/live provider and fresh migration checks remain skipped. Changes remain uncommitted; no primary subprocess/build lock remains. No new architecture/release decision is inferred from these observations.

[Candidate](../../packages/edge-infra/test/owned-file-state-candidate.mjs) owns one SDK client per attempt and uses `execute('BEGIN IMMEDIATE')` on that connection, avoiding `client.transaction()` connection detachment. Failed starts close their connection before a bounded new attempt. Callback operations share that connection; nested transactions and explicit leading transaction-control statements refuse. The callback runner closes at callback completion, pending operations drain before rollback, and suppressed statement/count failures cannot authorize commit. Clients close on the exercised commit/refusal/rollback paths. A commit exception becomes `state_commit_uncertain`, with no replay or assertion that rollback succeeded.

This is a trusted-framework-statement experiment, not an arbitrary-SQL security parser. The leading-token check alone is not a production security contract. User-supplied SQL, cleanup/rollback recovery, production error sanitization, typed packaging, owner namespace coordination and existing billing consumers still require implementation acceptance. Deadline/cancellation observations are scoped above. A factory option exists only for test controls; it is not a user-configurable adapter extension.

```powershell
pnpm --filter @frontbase/edge-infra exec node test/owned-file-state.mjs
pnpm --filter @frontbase/edge-infra exec node test/owned-file-state-controls.mjs
```

Windows / Node 26.7.0 / installed SDK 0.17.4, native libsql 0.5.29. Only new synthetic OS-temporary databases; no network, credentials or application databases. Thirteen independent control databases prevent an earlier fault standing in for a later case. A dedicated same-file control performs twenty consecutive callback transactions/read-backs.

| Acceptance group | Proven result |
| --- | --- |
| Commit/counts/escaped runner | Exact insert/missing-update counts, committed read-back, callback result and closed-runner refusal |
| Intermediate callback failure | Rollback after 1/2/3 mutations, no partial rows |
| Nested/manual control | Refusal and rollback; no early COMMIT |
| Failed start | Dispose before retry; callback executes once |
| Real overlapping clients | Competing start safely refuses before callback; fresh attempt succeeds after winner completes |
| Commit acknowledgement fault after SDK applies COMMIT | Uncertain result; row persists; no callback replay |
| Fault before actual COMMIT | Same uncertain result; close leaves no row; never infer commit state from the exception alone |
| Unsupported destination | Memory, remote and parameterized file forms refuse before client creation |
| Retry exhaustion | Three bounded start attempts, zero callback executions, all clients closed |
| Unawaited pending operation | Drain and rollback rather than partial commit or client use after closure |
| Suppressed SQL error | Prior writes roll back even if caller catches the failed statement |
| Suppressed malformed count | Reject count and roll back even if caller catches it |
| Repeated same-file lifecycle | Twenty sequential transactions/read-backs with zero tracked live candidate clients between callbacks |

Final isolated suite **13/13, exit 0**, reproduced twice: private directories `frontbase-owned-state-qWI8Rb` and `frontbase-owned-state-L2aoYm` under OS temp. Every candidate client opened through the tracked factory has one corresponding close and final live count zero. These checks track the exercised API disposal paths, not native handle accounting under every exception.

Independent source controls **3/3, exit 0**, evidence `C:/Users/drmoy/AppData/Local/Temp/frontbase-owned-state-controls-K7ef2e/evidence.json`. In-memory copies independently omit disposal, omit callback closure, or report uncertain commit as success. Each trips its specific detector around a real committed row; each is followed by a passing original baseline. Repository source and installed SDK are unchanged. Controls retain synthetic evidence outside Git, and clean up their owned clients without recursive deletion.

## Failure history and limits

Initial eight groups passed. One later shared-database twelve-group run refused with `state_busy` before the pending-callback case could begin; its expected `state_callback_pending` assertion failed, exit 1. An unchanged rerun passed twelve groups (`frontbase-owned-state-BlRSbc`), so the exact transient cause is not established. The final harness separates cases and adds the twenty-transaction same-file control; both final runs pass. This improves measurement isolation without claiming all post-fault same-file sequences or environmental busy conditions are resolved. Preserve bounded safe refusal and test post-fault reuse explicitly before adoption.

Acknowledgement faults are scripted around **actual native COMMIT**. They exercise application classification for both persisted and absent outcomes; they do not prove network-driver uncertainty or disk/power durability. Process-death observations from the previous raw-driver fixture do not automatically certify this new callback implementation. Add independent-process termination, cancellation, post-fault reuse, cleanup/rollback failure, billing and typed capability acceptance before production integration. No synthetic result authorizes an installer or current catalog publication.

Next primary work: harden this candidate against those lifecycle and trust-boundary gaps, define the explicit application-state capability, and extract/test shared route identity. Keep the original stores and all namespace writers gated until both adapter and namespace acceptance are complete.

Verification: final `pnpm -r check` and `pnpm -r build` exit 0; existing chunk/dynamic-import warnings remain. Host artifacts CF 517.7 KiB/Vercel 518.1 KiB/Deno 519.1 KiB gzip, zero prohibited client symbols. All three new JS syntax checks, existing no-leak and guarded page changes (15 groups) pass. Candidate source SHA256 `14555531de2f3228c225374aec9f31c712af2dc2da7d9020457fd48c41f52ce5`; in-memory controls leave it unchanged. No production mutation gate, billing integration, hosted adapter or live provider acceptance is inferred from this test-only increment. Work remains uncommitted; no dependency/export registration was changed.
