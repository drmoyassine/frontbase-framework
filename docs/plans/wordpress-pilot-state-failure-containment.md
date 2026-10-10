# Application-state failure containment assessment

2026-10-10. Primary proposal and test-only evidence, following the [native cleanup assessment](wordpress-pilot-owned-file-candidate.md) and [namespace contract](wordpress-pilot-namespace-contract.md). No production adapter, sidecar storage architecture, recovery UI or deployment is adopted. M2 and release gates remain open.

## Required behavior

Contain native resource failure separately from logical installation ownership. If the database connection cannot be cleaned up reliably, block **all participating protected writes using that application-state database**, across owners and process recreation. Each owner's unresolved operation journal remains owner-scoped. A database-wide resource fence must not disclose another owner's operation, content, paths or credentials.

Persist a reservation **before** opening the potentially failing transaction. Attempting to persist a new fence only after rollback fails is too late: the database may already reject writes. Missing/failed persistence refuses the operation before its client or callback opens. The trusted adapter must provide exclusive ownership of this reservation; a read-then-write check or in-memory boolean is insufficient.

While a reservation exists, new participating writers refuse promptly with a stable recovery-required result. No time expiry, retry, new coordinator object, equal page bytes or successful native lock probe releases it. Markers surviving process death cover both absent and persisted COMMIT outcomes. Clearing an error from memory cannot authorize resumed writes.

Known transaction success and successful disposal can release a reservation on the ordinary path. Lost replies, callback/statement/count errors, uncertain COMMIT, failed rollback or disposal keep it. The current fixture conservatively keeps it even after a callback error whose rollback acknowledged success; narrowing that rule requires explicit durable outcome evidence, not error-code heuristics. Existing operation-idempotency receipts remain a separate prerequisite: successful marker removal alone does not implement replay-safe successful retries.

This resource fence complements the owner coordination row/journal; it cannot replace route uniqueness, owner isolation, publication review, preimages or conditional restore. Every inventory writer must enter the eventual shared seam. Existing production writers do not yet do so.

## Node/file acceptance implementation

[Fence candidate](../../packages/edge-infra/test/owned-file-state-fence.mjs) is deliberately outside exports. It requires an existing file database and existing trusted marker directory, resolves their paths, derives a marker name from the canonical configured database path, uses exclusive `open(..., 'wx')`, writes bounded operation metadata and syncs/closes the file before invoking the owned transaction candidate. Only known return releases the marker. Other outcomes retain it. Status exposes only `ready` or `blocked`; no reset, expiry or replay API exists.

The marker directory is supplied by the test harness, **not selected by a browser/request**. Its placement is not an accepted Frontbase storage choice. It is not a claim that S3, an arbitrary connected bucket, another database or edge-runtime storage supplies equivalent exclusivity/durability.

The proof covers normal process interruption with retained local files. It does not certify directory-entry durability during power loss, filesystem/network-share atomicity, symlink/hardlink/case/drive alias attacks, database replacement, marker tampering, disk-full interruption, shutdown supervision or distributed hosts. All coordinators must use the same trusted binding and marker store; another directory or direct SQL is a bypass. Known native locks can still require process recovery. The framework does not terminate a real application process or silently change drivers.

## Explicit recovery contract before integration

1. An authorized application operator quiesces every writer sharing the state resource, including old runtimes and background work. Capture serving immutable published content remains separate; no unreviewed draft is activated.
2. Release/recreate native resources under the approved host recovery procedure. A successful connection probe proves availability only. It does not resolve an operation or clear the fence.
3. Read and validate the corresponding owner journals, resource markers, intent digests/generations and exact preimages/current state. Sidecar operation metadata alone is insufficient. Missing, damaged or contradictory evidence keeps writes blocked. Public/admin responses must remain bounded and owner-safe.
4. Record a durable terminal outcome only when journal and resource evidence establish it. A persisted exact operation marker plus matching journal is different from equal content. Never replay prepared or ambiguous intent. Restore is a new conditional operation preserving later owner changes.
5. Clear the resource fence only under exclusive recovery ownership after validating all unresolved operations and the current generation. Protect against concurrent marker replacement/removal and crashes during outcome recording/clear; prove those boundaries independently before exposing a control.

Admin presentation belongs in `/frontbase-admin`, through its existing authorization and status flow. Suggested user-facing state: “Changes are paused because a previous change needs recovery. Review its status before resuming.” No public button may clear a marker. A restart or elapsed time must not show a completed install automatically.

The test candidate intentionally supplies **no recovery-clear implementation**: generic unlink/reset would bypass the missing reconciliation evidence. Privileged operator filesystem/SQL modifications remain an explicitly uncontrolled boundary.

## Verification and next integration gates

Commands:

```powershell
pnpm --filter @frontbase/edge-infra exec node test/owned-file-state-fence-test.mjs
pnpm --filter @frontbase/edge-infra exec node test/owned-file-state-fence-controls.mjs
```

Acceptance covers known success and sequential reuse; two independently created coordinators competing on one file; conservative error fencing; malformed markers; independent database resources sharing one marker store; refused remote/invalid operation inputs; five falsy callback and five falsy COMMIT-acknowledgement rejections; process death before COMMIT, after actual COMMIT, and after both rollback paths fail. Each crash case reads actual row state, proves the native lock is released after owned-child termination, then verifies a newly created coordinator still refuses before client/callback execution.

Independent in-memory source controls release a marker on error or replace exclusive creation with truncating creation. Both must trip specific real-effect detectors, then original baselines pass. Controls do not mutate repository or installed SDK bytes.

Final containment suite **10/10, exit 0**, private evidence `frontbase-state-fence-71vQ0o` under OS temp; prior eight-group run `nJIDzd` and seven-group runs `hID2jC`/`efJOC7` precede falsy-value acceptance. Fence controls **2/2, exit 0**, private `frontbase-fence-controls-vZtjtp`. These are synthetic evidence, not production/release acceptance.

One added ninth-group run exited 1 with “Missing expected rejection”: a callback throwing `undefined` was incorrectly treated as success. The candidate's promise race checked error truthiness, not whether it rejected. The bounded test-only repair checks presence of the error outcome field and maps non-Error callback rejection values to `state_callback_failed`. Final groups cover `undefined`, `null`, `false`, `0` and empty string: callback failures roll back and retain fences; failures after actual COMMIT retain the committed row, `state_commit_uncertain` and the fence, with callback count one. A seventh candidate source control restores truthiness checking and detects the wrong returned outcome/real row, followed by a passing original baseline.

Affected candidate regressions: **13/13** (`frontbase-owned-state-CQUiAh`), source controls **7/7** (final `frontbase-owned-state-controls-nP0idz`, prior `490QVw`), alternate cleanup **8/8** (`frontbase-alternate-cleanup-NzOFds`) and previous lifecycle **10/10** (`frontbase-owned-lifecycle-WLyVc0`), exit 0. Current candidate SHA256 `b82c6cc3fa521d4cb89fa0ef297dec2def8a42a9ddca00371af6d588aec7b55c`; fence SHA256 `84773af0f10af0bd2c2567274a7a0fe0c309c431d4854aac08e931412e4bce59`. No production source/export/dependency is changed.

Final workspace check/build, guarded page-change 15 groups and no-leak exit 0; five changed-script syntax checks, whitespace and 237 pre-receipt local links pass. Existing chunk/dynamic-import warnings remain; host artifacts CF 517.7 KiB/Vercel 518.1 KiB/Deno 519.1 KiB gzip, zero prohibited client symbols. Full production security mutation, typed/billing/hosted capability and live/fresh data checks are skipped for this test-only increment. No storage architecture decision is accepted; no real application state was opened. All work remains uncommitted; primary build slot is released.

Next executable work: specify the explicit typed state/coordination capability and canonical route-identity tests while preserving this recovery contract; production eligibility additionally requires secure/durable fence placement or equivalent adapter semantics, all-writer integration, journal-based reconciliation and the existing billing consumers. The sidecar experiment is an evidence option, not a supported host requirement or accepted architecture decision. No production install or publication is authorized by these tests.
