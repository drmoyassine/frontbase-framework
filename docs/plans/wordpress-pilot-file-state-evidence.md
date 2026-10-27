# Native file-state transaction observations

2026-10-10. Primary evidence for the [namespace contract](wordpress-pilot-namespace-contract.md), not a delivered state capability or installer. No production adapter, dependency, migration, package registration or public application state changed. This diagnostic uses the installed SDK directly in an invented fixture; production continues to use the established runner seam.

## Reproduction and bounds

```powershell
pnpm --filter @frontbase/edge-infra exec node test/file-state-transaction-diagnostic.mjs
```

Windows, Node 26.7.0, installed `@libsql/client` 0.17.4/native `libsql` 0.5.29. Installed SDK `lib-esm/sqlite3.js` SHA256 `cdf2ad648f1ca39876ef22e94979cd58d7d7444eae8c4ad2b7dc45a2c26c90b1`. Each invocation creates a new OS-temporary directory and synthetic file database. Child processes are terminated only after private IPC identifies the tested boundary; startup/termination waits are bounded. Retain synthetic files and JSON outside Git; no deletion, remote socket, credentials or live data access.

Final diagnostic: **exit 0, nine observation groups reproduced**. Private JSON: `C:/Users/drmoy/AppData/Local/Temp/frontbase-file-state-5SIJ25/evidence.json`; prior nine-group run `frontbase-file-state-prLS4K` also passes. Earlier eight-group runs `frontbase-file-state-Vy8vUS` (with a busy-timeout PRAGMA), `frontbase-file-state-BUNmqq` (without it) and `frontbase-file-state-doV0RA` independently reproduce the initial observations. Final source removes the PRAGMA, adds the successful immediate-disposal control and asserts the exact missing-table message and nine-group count. Passing observations include unsafe behavior; they are not installer acceptance checks.

| Observation | Result |
| --- | --- |
| Commit, counts, parent and closed transaction | Insert reports 1; missing update reports 0; parent reads committed row; completed transaction refuses reuse |
| Rollback at intermediate writes | Injected callback rejection after 1, 2 and 3 writes; explicit rollback leaves none of those rows |
| Constraint failure | Duplicate identity refuses; explicit rollback removes preceding new row and retains original |
| Competing connection and retry | Second write transaction refuses with `SQLITE_BUSY`; winner commits; same-connection retry writes but commit fails with “SQL statements in progress”; explicit rollback removes retry row |
| Fresh connection recovery counterexample | A third connection in that same process can write, but commit still reports `SQLITE_BUSY`; explicit rollback removes its row. After terminating that disposable process, a fresh parent connection commits successfully |
| Immediate-disposal control | Close the contender client immediately after failed BEGIN, before starting a retry; winner and a fresh connection both commit in the same process. Independent parent read-back sees both rows |
| Process death before commit | Child killed after write, before commit; fresh connection sees no row |
| Process death after commit | Child killed after SDK commit returns; fresh connection sees committed row |
| Application reply loss and memory boundary | Dropped application acknowledgement after SDK commit leaves row readable; no replay. Separate memory transaction again leaves the parent without its original table |

The code emits nine groups: the contention/fresh-recovery counterexample is one group; application reply loss and memory behavior are separate groups. Exact predicates and sequence are in the [diagnostic](../../packages/edge-infra/test/file-state-transaction-diagnostic.mjs).

## Failure history and consequence

The first run exited 1 when it optimistically expected a same-connection retry to commit after contention. A second run exited 1 when it optimistically expected a fresh connection in the same process to fix it. Neither failure is an acceptance result. The final fixture isolates that contention lifecycle in a disposable child process, explicitly asserts both failures and rollback, then verifies recovery after the process exits. No installed SDK files were patched and no automatic retry workaround was introduced. Removing the PRAGMA reproduces the same result, so this is not solely that probe setting.

The observed sequence is a **blocking connection-lifecycle issue for naive reuse of this raw transaction path**. The additional control demonstrates a bounded supported disposal strategy: close the client immediately when BEGIN fails, before attempting another transaction on it. Installed source retains that connection on a failed BEGIN and detaches it only when BEGIN succeeds. After a retry succeeds in beginning, parent-client close alone can no longer dispose that transaction's connection; therefore the ordering matters. This is evidence for designing an owned-client capability, not a general recovery guarantee after commit failure. It neither proves the exact native statement defect nor establishes all resource-lifecycle/host guarantees. Existing application runners remain unchanged; do not expose raw transactions universally.

Application reply loss is simulated *after* SDK commit has returned and is distinct from losing the SDK's own commit acknowledgement. An actual uncertain SDK commit, disk/power failure, nested callback behavior, transaction escape, billing compatibility, owner namespace/all-writer protocol, host builds and hosted adapters require separate acceptance. Explicit rollback in these fixtures is not a generic recovery promise after an uncertain commit.

Verification: `pnpm -r check` and `pnpm -r build` exit 0. Existing chunk/dynamic-import warnings remain; host artifacts CF 517.7 KiB/Vercel 518.1 KiB/Deno 519.1 KiB gzip, prohibited client symbols zero. Diagnostic syntax, D1 count 15/15, no-leak, guarded page changes 15 groups and destination-preflight regressions exit 0. This test-only change does not modify a security-sensitive production seam, so no new production mutation run is claimed. No live provider/host/credential-gated acceptance was run.

Next: use the disposal control to design an explicitly owned file-state transaction candidate, then prove callback/resource lifecycle, busy retry before mutation, uncertain SDK commit and billing compatibility before adapter adoption. Shared route-identity and read-only collision fixtures can proceed independently; installing remains gated. Existing Neon maintenance choice is unrelated and remains pending.

Subsequent primary increment implements the [test-only owned-file candidate](wordpress-pilot-owned-file-candidate.md), passing 13 isolated groups/three source controls while retaining the documented hardening/adoption gates. Its evidence supersedes the candidate-design next task above without turning these raw-driver observations into production capability acceptance.
