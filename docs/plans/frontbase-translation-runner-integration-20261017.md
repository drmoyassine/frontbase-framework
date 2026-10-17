# Translation database runner integration — 2026-10-17

> Historical direct-PostgreSQL translation bridge. Superseded by the owner-required [pure HTTP implementation and acceptance](frontbase-translation-http-20261017.md). Earlier measurements remain evidence for their original artifacts.

Status: local integration and conformance verified; actual PostgreSQL acceptance open. Uncommitted, unpublished and undeployed. Actual PostgreSQL/provider acceptance remains open.



## Delivered boundary



The owner explicitly directs reuse of Frontbase adapters. `@frontbase/translation` now has standalone async PostgreSQL revision/job persistence; `@frontbase/edge-infra/translation` bridges an existing `DbRunner` into it. The bridge imports the engine, not the reverse. Existing `postgresStateRunner` owns connections, parameter conversion, schema selection and transactions. No new database SDK, connection implementation, credential store or hosted dependency was added. The existing workspace translation package is a new edge-infra dependency (three additive lockfile importer lines); prior nine localization importer lines remain.



The standalone engine's minimal injected SQL capability intentionally does not import Frontbase's host runner type. The bridge consumes the canonical `DbRunner` type and delegates its methods with receiver binding. There is no independently reimplemented Frontbase runner. Domain persistence still owns translation schemas, source/context history, revision CAS, leases and atomic job completion; the synchronous SQLite reference remains supported by its prior tests.



## Storage and safety



Explicit initialization creates a separate PostgreSQL version1 namespace, seven tables including history/jobs, composite tenant/project keys and foreign keys, and a scoped ready-job index. No existing datasource or SQLite schema is automatically converted. New tables enable RLS without visitor policies and revoke PUBLIC grants. Trusted server-owner/BYPASSRLS access and a restricted host-selected schema are required; real PostgreSQL RLS enforcement is not proven by the local harness.



Every mutation uses the runner-provided transaction session. A bound tenant/project/table-prefix advisory lock serializes short local database work; READ COMMITTED isolation makes reads after the lock see preceding commits. Lock timeout5s and statement timeout15s bound waits. AI calls are outside these transactions. This conservative project-level serialization can limit throughput; narrower locking is an optimization requiring equivalent recovery/race evidence. Database time governs leases; application clocks do not establish production lease validity. Completion, target history/head and mutation version commit atomically. Errors are sanitized.



D1/libSQL/HTTP runners without transactional PostgreSQL capability are explicitly refused. No HTTP BEGIN/COMMIT emulation, blanket provider support or automatic datasource UI integration is claimed. A correct transaction runner is a trusted host requirement, not something structural typing can prove.



## Verification and limits



Node24.19.0 results: workspace `pnpm -r check` and `pnpm -r build` pass; the complete edge-infra suite (including isolation, runner, no-leak and the new bridge) passes; translation functional/SQLite and async-port conformance pass; core export compatibility and conditions pass. All23 in-memory faults are caught (18 retained plus5 new async-port scope, epoch, completion, RLS-statement and lock-statement faults). Existing broader source-rewriting infrastructure mutation suites were not rerun in the shared worktree; their safety/conformance behavior is covered here by the normal infrastructure suite and the new bounded in-memory faults, not a claim of renewed full mutation certification.

An offline tarball installed outside the workspace passes public-subpath functional checks and strict TypeScript consumption of the async port. The recorded archive is47,802bytes, not browser gzip, and precedes the final README-only documentation addition. [Machine receipt](../../scripts/localization/runner-evidence/results-package-node24-windows.json). Registry availability, external installation of the whole infrastructure package and live PostgreSQL are not proved by this standalone package test.

Private logs are `translation-runner-check-final.log`, `translation-runner-build.log`, `translation-runner-infra-tests.log` and `translation-runner-package-final.log` under the existing private evidence directory. Initial external packaging ran while the security initialization was still being added: its older compiled archive failed the new seven-table RLS-statement expectation. Rebuilt translation, reran the final conformance/fault gates and used a new external consumer directory; the final proof passes. A normal offline install proposed rebuilding the shared node_modules tree; no reinstall proceeded. Added only the new local workspace dependency junction with approved escalation after sandbox denial. No automatic approval rejection occurred. Source/index work was preserved.

Automated SQL/async transaction conformance uses real local SQLite storage with PostgreSQL-only settings, advisory locks, database time and RLS statements intercepted by the harness. This proves generated parameter bindings, session delegation, lifecycle behavior and refusal handling; it does not prove PostgreSQL syntax, RLS/grants, cross-connection advisory locking or a remote provider. No local PostgreSQL executable/server was available; no credentials or external service were used.



## Modified surfaces



- `packages/translation/src/adapters/postgres.ts` and `postgres-jobs.ts`, manifest/README and new conformance/fault fixtures.

- `packages/edge-infra/src/translation.ts`, server-only subpath, package dependency/test script and integration test.

- `scripts/localization/verify-package.mjs` covers new public subpaths and external async-port fixtures; additive lockfile importer.

- Governance/handoff documents link this receipt. Unfamiliar staged deletions, same-path untracked files and other session changes remain preserved. No commit, push, deployment, npm publication, live schema provisioning or model spend.



## Next executable task



Run the exact adapter/bridge against disposable PostgreSQL using the existing runner: independent connections, initialization/schema refusal, RLS/public-role access denial, transaction rollback/restart, project isolation, lease expiry/replacement and actual advisory-lock contention. Then integrate trusted saved-datasource resolution and complete provider budget/per-attempt accounting before any paid AI service. Administrator language setup, extraction, visual review/publication, localized routing/SEO/RTL remain later gates; parked pilot tasks and CF-22 stay parked.
