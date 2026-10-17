# Translation storage configuration — 2026-10-17

Status: implementation and local/live read-only acceptance verified; staging delivery pending. This is the next bounded slice after [HTTP persistence](frontbase-translation-http-20261017.md). No AI generation, data migration or language publication is included.

## Administrator flow

Settings → Translations offers the configured content datasource or another connected datasource. The selected concrete ID is saved explicitly; changing content bindings cannot silently redirect translation storage. Supabase Data API and native PostgREST formats are selectable. Other provider kinds remain visibly unavailable until equivalent persistence guarantees are implemented. Schema translations is fixed for this protocol; public is untouched. Arbitrary schema/table-prefix configuration is not implied by the earlier generic foundation contract.

Data → Datasources → Add/Edit a Supabase connection now also supports HTTPS URL/server-key credentials, using existing encrypted datasource storage. Native PostgREST requires no hosted Supabase management account. Blank editing values preserve stored credentials, and changing provider clears manually entered credentials. Generic inspector testing is disabled for this manual path; the administrator uses the translation protocol check. Table browsing support is not inferred from translation connectivity.

Check connection verifies the installed protocol and a scoped table read. Saving repeats that check server-side. Both are read-only against the destination: no SQL installation, arbitrary SQL RPC, record writes, remote schema migration, data copy or AI calls. The UI explicitly says write permissions are not verified. Selection changes do not transfer existing translations; Clear selection preserves the data and project identity. AI setup and visual multilingual editing remain later tasks.

## Ownership and reuse

[Shared data contracts](../../packages/translation/src/contracts.ts) contain only datasource reference, endpoint format and the fixed namespace. [Host settings and resolution](../../packages/backend/src/compat/translation-storage.ts) store revisioned configuration in the existing tenant-owned settings table, using conditional insert/update. There is no new application-state migration or credential store.

Each tenant/project receives a persistent server-generated UUID on its first settings write, retained through clear/retarget operations. Separate Frontbase installations can use the same tenant slug and shared destination without sharing a project identity. Clients cannot supply/replace that identity or the tenant scope. Backup/restore of a project must retain its settings identity; cloning a project into a new identity remains a separate workflow.

The server resolves only owned datasource and connected-account records, then reuses mergeAccountConfig, resolveDatasourceConfig, guardedExternalFetch and the existing Supabase/PostgREST client/translation adapter. It refuses unsupported kinds, missing/foreign accounts, anonymous-only credentials and unsafe URLs. Runtime workers can call configuredTranslationStorage to resolve the saved selection and current credentials afresh. No credentials, endpoints or account configuration are serialized into the storage-settings response. Administrator roles and default-deny auth protect all new routes; request bodies are strict and bounded to4096 bytes. No automatic fallback to another destination.

Framework-specific additive APIs: GET/PUT /api/project/translation-storage/ and POST /api/project/translation-storage/check/. They do not change the334-operation community contract denominator. Language configuration/AI orchestration must consume trusted scope from the host rather than client-provided scope.

## Verification

- Final pnpm -r build and pnpm -r check pass on Windows/Node24. Existing bundle warnings remain. Final client prohibited-symbol gate passes.
- [Backend and engine gate results](../../scripts/localization/storage-evidence/gates.json): storage API, actual SQLite create/update races, owned accounts/datasources, role/auth/bounds, strict inputs, read-only protocol checks, credential rotation, safe failures, encrypted manual-datasource create/update and preserved blank credentials pass. Seven source faults are detected: shared fetch injection, datasource ownership, trusted RPC scope, conditional settings update, role checks, cross-host project identity and identity stability.
- Each fault module is compiled in isolation against the already-built baseline; a fresh gate process fails behavioral assertions. Exact source AND compiled module bytes are restored and independently pass after each fault. Full workspace type/build checks are separate baseline gates; per-fault whole-package typechecking is not claimed.
- Ten UI tests pass across storage settings and datasource creation: same/separate selection, native endpoint, revision conflicts, safe check/save errors, missing sources, clearing and cross-provider credential clearing.
- Retained SDK HTTP15, external request, backend security/database security, tenant175 and strict response conformance pass. Translation functional suites and22 retained engine mutation faults also pass. The existing SDK source-mutation anchor now follows the extracted shared client; the complete older six-fault rebuild harness is not rerun here, while its shared injection fault is covered by the new storage gate.
- [Actual owner-instance acceptance](../../scripts/localization/storage-evidence/live-readonly.json): four certificate-verified HTTPS requests to studygram-selfhost through the new persisted-settings resolver, restricted to capabilities/read. Settings/datasource credentials are stored only in an isolated encrypted in-memory test app. Remote writes0, AI calls0; no staging storage selection is made.
- [Host import graph](../../scripts/localization/storage-evidence/host-graph.json): the actual backend resolver bundles for es2022 without Node compatibility/native database drivers, through the shared PostgREST client. This is compilation capability evidence, not deployed Cloudflare execution or browser credential delivery.

Initial fixture corrections are retained as limits: the cipher setup required await, datasource creation correctly returns201, and an old site-configuration test omitted the already-committed elementBrowsing:false field. Its exact expected response is corrected; the full race/auth/corruption test now passes. A mutation-script quote typo was corrected before acceptance. No production behavior or ledger was weakened to make a test pass.

No npm publication, clean-room release acceptance, new provider certification, source content publication, formatter choice, parked pilot resumption or CF-22 activation. Next translation product task: existing AI provider integration, budget accounting and durable dispatch using the selected storage; no paid calls are authorized automatically.
