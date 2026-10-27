# Translation revision lifecycle and SQLite persistence — 2026-10-16

Status: bounded local implementation of M1, not full M0/M1 completion or a deployed AI translation workflow. [Standalone package](frontbase-translation-package-20261016.md), [architecture](frontbase-ai-native-translation-architecture-20261016.md) and [full implementation plan](frontbase-ai-native-translation-implementation-20261016.md) retain the wider gates. Other pilot work stays parked.

## Subsequent continuation

The [2026-10-17 input-history/job slice](frontbase-translation-jobs-20261017.md) adds immutable selected source/context, schema2 migration, provider ports and durable SQLite local-provider execution. Statements below about current-only source/schema1 and pending job ports describe this original checkpoint; the continuation is current evidence. Full configured AI, PostgreSQL, budget and visual/publication gates remain open.

## Implemented behavior

- [Revision lifecycle and port](../../packages/translation/src/revisions.ts): bounded schemas for registered source state, revision intents, immutable stored target revisions, a small source/head read and atomic persistence mutations. Public APIs are `syncSource`, `writeManual`, `writeGenerated` and `writeImported`. The host authenticates/authorizes callers and supplies trusted tenant/project scope; a low-level persistence adapter is never a visitor authorization API.
- Source synchronization requires the expected source version. The source has a monotonic logical version separate from its content fingerprint. A change from A to B and back to A keeps the same stable unit ID but advances that version; output from the original A cannot commit against the later A.
- Target writes require both the exact source version/fingerprint and expected translation head. A unit mutation CAS prevents races after the policy read. Different locales share a conservative unit mutation counter, so noninterfering writes may need a fresh read/retry; there is no automatic rebasing of stale generation.
- Manual heads block generated and imported replacements, including when the caller supplies the latest head. A new explicit manual correction may replace it. No manual-unprotect, job cancellation or publish capability is implied.
- Target revision IDs are immutable and scoped to tenant/project/unit/locale. Identical delivery acknowledges the original history entry without moving the current head; a different intent with the same ID is refused. Replaying a pre-correction AI result cannot restore it over a human correction. Duplicate concurrent delivery advances history/head once.
- The initial validator preserves the multiplicity and identity of plain-message `{{field}}`/`{$name}` bindings and refuses missing, extra, changed or malformed tokens. ICU/MF2 revision writes are explicitly unsupported until validated format support is selected. This token guard is not a new plural/message language or a complete native rich-text persistence adapter.

## Persistent reference adapter

[SQLite adapter](../../packages/translation/src/adapters/sqlite.ts), available only through `/adapters/sqlite`, imports no driver, Node built-in, database SDK or Frontbase host. An application injects a dedicated synchronous SQLite connection with `exec` and prepared `get`/`run`; asynchronous transports cannot claim this interface without a suitable implementation.

Explicit `initialize()` creates version1 metadata, source/current-unit, target-revision and target-head tables in a transaction. Table prefixes are bounded identifiers; values and tenant/project keys are bound parameters. Every read/write key includes tenant/project/unit, and head/revision joins carry the same composite owner keys. Foreign keys are required. Future schema versions refuse rather than being silently upgraded. Full schema-shape inspection, permissions/provisioning UX and migrations from other versions are pending.

`BEGIN IMMEDIATE` serializes the version check, immutable revision append, head advancement and unit-counter update. Failure rolls all parts back. No SDK/environment credentials, network, AI calls or connection provisioning are introduced. The source/destination choice is an injected capability: conformance exercises content plus translations in one SQLite database and in two separate databases, checking the source article remains unchanged. This is not cross-database publication or a distributed transaction claim.

Current-source registration is authoritative only for the engine's registered state. It does not detect an unobserved upstream edit. Current source payload is retained; full immutable source/context history, tombstones/deletion and published-resource retention are still pending. No target history pruning API exists. Job leases/cancellation/fencing, AI provider/budget contracts, glossary/memory, external-source freshness and locale configuration enforcement remain additional work.

## Verification

- [Lifecycle tests](../../packages/translation/test/revisions.mjs): test-double and real SQLite conformance; cross-tenant/project IDs and same-table reuse, stale/competing writes, same-intent concurrent retries, source ABA, manual/import protection, token/format refusal, quoted SQL data, safe counters and no publication fields.
- Real temporary SQLite file closes/reopens with source/head/target history intact. Two independent connections race from the same observed head and admit one commit. Separate table namespaces and schema-version refusal pass. Forced failure after history INSERT leaves no revision/head/counter update; a later retry succeeds. Same/separate source/destination database cases preserve original content. Power-loss/process-kill and multi-process lock recovery are not tested.
- [New fault tests](../../packages/translation/test/revisions-mutation.mjs) catch removal of manual-head protection, source ABA fencing, trusted scope binding, SQLite CAS, owner read predicate and rollback. All6 pass; retained original6 localization faults also pass. Faults alter in-memory module copies, not files/index.
- [Independent tarball proof](../../scripts/localization/revision-evidence/results-package-node24-windows.json): offline install outside the workspace, disabled lifecycle scripts, public functional/lifecycle exports, actual SQLite conformance and external TypeScript declarations. The validator is a locally packed dependency fixture; this is not npm registry publication evidence. Archive bytes include server adapter/declarations/maps/license, exclude dependencies, and are not delivered-browser gzip bytes.
- [Local host proof](../../scripts/localization/revision-evidence/results-hosts-node24-windows.json): Node24/local workerd agree on lifecycle CAS, manual protection and history replay plus existing identity/rich-text/message fixtures, with eight concurrent request fixtures per host. Worker lifecycle persistence is an in-memory test double; real SQLite persistence is verified only on Node24. No D1/Turso/PostgreSQL, deployed Worker or actual-browser storage claim.
- Workspace `pnpm -r check` and `pnpm -r build` pass. Core localization export-identity compatibility and retained conditions tests pass. Existing build warnings remain. Tests use Node24 explicitly; an early pnpm invocation inherited Node26 from PATH, so final recorded gates prepend the Node24 runtime. Minimum-Node evidence remains open.

Reproduce after workspace build:

```powershell
pnpm --filter @frontbase/translation test
pnpm --filter @frontbase/translation test:mutation
node scripts/localization/verify-package.mjs <absolute-npm-cli.js> <new-directory-outside-workspace>
node --disallow-code-generation-from-strings scripts/localization/evaluate-hosts.mjs <isolated-runtime-dependencies> <private-output>
```

SQLite tests use Node24's built-in test-host driver, not a new application dependency. Functional tests, package tests and mutation fixtures are separate from configured external-provider acceptance. No PostgreSQL credentials, schemas or datasets were accessed. No new dependencies or lockfile changes were needed for this continuation. Existing unrelated staged/unstaged work and generated artifacts are preserved; nothing was staged, committed, published or deployed.

## Next executable work

Finish immutable source/context history and bounded AI/job-runner contracts, then durable generation with a deterministic fake provider and lease/cancellation fencing. Implement the guarded PostgreSQL/provider adapter and conformance before claiming the owner's intended translation destination or general datasource support. Native editor/preview/releases/query/SEO/RTL remain later gates. The current revision methods store drafts only; they do not translate automatically or make content public.
