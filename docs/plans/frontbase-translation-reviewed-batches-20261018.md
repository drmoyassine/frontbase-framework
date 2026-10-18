# Reviewed translation batches — 2026-10-18

Status: bounded backend implementation verified locally; source and generated checkpoint pending. Continues the [AI dispatch plan](frontbase-translation-ai-dispatch-plan-20261017.md) and [allowance reconciliation](frontbase-translation-allowance-reconciliation-20261018.md). This is a bounded backend slice, not the completed multilingual product or a staging deployment. Real-provider execution remains disabled by default.

## Scope and reuse

[Batch orchestration](../../packages/backend/src/compat/translation-batches.ts) reads one to four explicitly selected native Default plain-text Heading/Paragraph/Text fields from tenant-owned, nondeleted pages. Bound/list subtrees, dynamic references, markup, unsupported fields and duplicate selections are refused. Menus, live record fields, rich text and alternative Block Versions remain subsequent extraction work. No whole record or page is sent to the model.

Planning returns the exact selected text/context, target locale, provider account/model, request/input/output ceilings, opaque batch ID and sealed review hash. Monetary cost is explicitly unknown. It writes only lightweight orchestration metadata to existing tenant settings; source bodies remain on owned pages until approved registration. Planning reads translation capabilities/history but never creates an allowance, registers source history, enqueues a job or invokes AI. Source/layout/name hashes and current generation/storage references are pinned. Existing source/context history is job reproducibility, not a frozen datasource feature.

[Authenticated handlers](../../packages/backend/src/compat/routes/translation-batches.ts) reuse default-deny principal/tenant resolution and existing owner/admin roles. All responses use no-store and fixed safe errors. JSON inputs are strict and streamed with a 16KiB cap; clients cannot supply tenant/project scope, credentials, provider destinations, source text or job identities. These are additional framework routes, not additions to the vendored legacy OpenAPI denominator; focused tests cover their responses separately.

| Operation under `/api/project/translation-batches/` | Behavior |
| --- | --- |
| GET root | Bounded capability metadata and actual host execution gate |
| POST `plans/` | Review owned selected text; no model call |
| POST `:id/start/` | Require review hash and literal content-transmission approval; record actor and allocate reviewed requests |
| POST `:id/continue/` | Prepare one source/job or execute at most one existing leased job |
| GET `:id/` | Persisted progress, safe failures/accounting and current completed draft text; never AI |
| POST `:id/cancel/` | Freeze orchestration and use existing bounded cancel/reconcile; unknown usage held unless explicitly counted as consumed |

The app option `translationExecutionEnabled` defaults false; both Start and Continue refuse execution without explicit trusted host wiring. There is no environment switch or production wiring in this slice. Existing generation settings continue to report generation unavailable. Cancel remains usable while execution is disabled so recovery cannot be stranded by a rollout gate. Saving provider settings does not approve transmission.

The existing engine remains authoritative for source history, immutable intent, leases, cancellation, revision/head CAS and attempt accounting. All reviewed intents are persisted before any dispatch. Lost preparation progress can replay the same source and stable job ID. Duplicate/concurrent continuation does not create a second physical attempt. Execution is administrator-triggered continuation; no in-memory timer, unattended scheduling or queue-callback acceptance is claimed.

Allocation uses an atomic predicate on the exact approved batch row in the same host settings database, for initial INSERT and closed-predecessor replacement. Cancel changes that row first, so a late Start cannot mint an orphan allowance. Batch cursor writes use exact-value CAS and cannot overwrite cancellation. Host settings and the selected remote translation destination are not one transaction: a late remote enqueue may leave a fenced old job, but closed allowance/batch guards prohibit dispatch. Existing reconciliation remains required before a fresh allocation.

Current owned source/settings are rechecked before preparation and at the runner's final call guard. A post-provider check cancels the original job before late draft commit if its approval/source/configuration changed. Known usage still settles on the original ledger; missing usage remains held. Status withholds old draft text when its source changed or became inaccessible. Existing human-head protections remain authoritative. These guarantees do not imply exactly-once external billing, a monetary cap or provider-account-wide concurrency.

No new SQL protocol/migration, driver, credential store, queue, package dependency or public rendering behavior. Original owned datasource resolution, encrypted credentials and canonical guarded Supabase/PostgREST HTTP transport are reused. The seventh engine candidate remains standalone and unpublished; Developer Preview release gates and paused CF-22 are unchanged.

## Verification

[Focused API/recovery suite](../../packages/backend/test/translation-batches.mjs) uses the shared encrypted owned-host fixture and injected fake HTTP provider over reference SQLite persistence. It covers auth/roles/tenant ownership, no-call review/start/status, strict bounds and approval, default gate, native extraction refusal, stable restart/concurrency, all-intents-before-dispatch, changed source/settings, stale draft withholding, provider failure/unknown reconciliation, cancellation during a call, lost progress and controlled allocation/cursor races. Raw network fetch is forbidden.

[Thirteen fault checks](../../packages/backend/test/translation-batches-mutation.mjs) remove administrator/execution/consent gates, owned lookup, bound-subtree refusal, review seal, source pin, last-call permit, post-result fence, progress CAS, both atomic allocation predicates and stale-result withholding. Each must fail behaviorally, restore green and preserve exact source/artifact hashes. Retained allowance/lifecycle/storage/generation and engine fault gates remain required. [Exact gate results](../../scripts/localization/reviewed-batch-evidence/gates.json) pass: pnpm -r build/check; focused API and retained allowance/lifecycle/storage/generation, SDK HTTP/external/security/tenant/strict legacy conformance; shared AI/translation HTTP and engine functional tests;13 new plus29 retained host and36 engine faults. [Standalone offline tarball/types proof](../../scripts/localization/reviewed-batch-evidence/package.json) and [actual batch-route browser-compatible HTTP graph](../../scripts/localization/reviewed-batch-evidence/import-graph.json) pass. All mutating suites restored before the final full build; configured type scope and existing bundle warnings remain. CMS SHA256 `536bc32256bf5414538075aefc6b3d3dd1f5331697fd1b0e81f553adf44faa12`. No complete external backend type/clean-room or public-release clearance is inferred.

This slice uses deterministic injected HTTP/SQLite fixtures. Earlier real disposable PostgreSQL/PostgREST evidence concerns the unchanged underlying protocol, not this new orchestration's deployed acceptance. No owner SQL installation, real-provider/queue test, selected-content transmission, live publication or staging deployment was performed. Full external backend declaration/clean-install release gates remain separate.

## Next executable work

1. Add native selected-text review and progress controls to Settings/Builder using existing page APIs, settings forms, async/conflict/reload patterns and these handlers. Include bounded resource discovery, exact transmission review, explicit Start, continuation and reconciliation states. Keep the gate disabled until UI/recovery acceptance passes.
2. Extend the same extractor to menus and explicitly selected live fields; retain same/separate destination and privacy tests. Complete controlled fake English→Arabic acceptance, then separately approve a real-provider batch and any required owner protocol installation.
3. Add native visual locale refinement/preview/publication, RTL, public switching and localized search/sort/count behavior across Repeaters, Tables and Grids. Then broader providers/memory/glossary/operations and sitemap-first migration with mandatory per-locale translated-slug comparison. No snapshot feature or CF-22 reactivation.

Rollback: keep host execution disabled and use the bounded cancellation route before removing orchestration handlers; retain allowance/history/unknown records. Reverting source is not a refund, destination downgrade or reason to delete durable jobs. Shared unrelated staged/worktree changes remain preserved.
