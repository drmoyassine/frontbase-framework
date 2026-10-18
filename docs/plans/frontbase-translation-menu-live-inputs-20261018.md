# Selected menu and live-record translation inputs — 2026-10-18

Status: bounded implementation verified locally; source delivery pending. Extends the [native review UI](frontbase-translation-review-ui-20261018.md) through the same sealed review, immutable input history, jobs, allowance and cancellation flow. Execution remains disabled by default. No staging deployment, owner SQL upgrade, datasource selection or real provider call is included.

## Implemented boundary

Administrators can mix up to four eligible page, menu and live-record fields in one batch. Owned menu discovery includes authored brand, footer copyright/description and item labels. It excludes destinations, audience rules and implicit inherited site text. A menu edit invalidates its old approval conservatively. Existing page selection shape and field ordering remain intact for persisted sealed reviews.

Live input initially selects an owned Supabase/PostgREST datasource, endpoint shape, public-schema table, candidate key/value and text column. The existing guarded encrypted credential resolver and canonical HTTP client are reused; the client gains the narrow `@frontbase/edge-infra/supabase-http` export. Reads project only key and text, match the key and request at most two rows. Missing, ambiguous or mismatched rows, unsafe identifiers, markup/bindings and non-string text refuse. Returned keys are normalized before duplicate-unit checks. This checks uniqueness on every read; it does not certify a database primary key or support composite keys yet.

The selector is an explicit table/record identity, **not a saved-view binding**. It does not apply saved-view predicates. Data Inspector/view-aware selection, other content schemas and other source adapters remain explicit follow-ups. There is no SQL input, whole-record upload, source write, automatic crawl or snapshot feature. Translation persistence can use the same or a separate owned datasource; its namespace remains `translations`.

Only selected text and safe field context reach the provider prompt. Record keys, connection references, unselected private fields and menu destinations/audiences do not. Keys remain part of durable resource identity at the selected translation destination. Source changes and connection retargeting are checked before dispatch and before committing a draft. Known usage still settles when a late source edit fences the draft. No second queue, lifecycle, credential store or persistence protocol was introduced.

The Settings source picker shares review/approval/progress/recovery with the earlier page flow. Loading metadata/fields never invokes a model. Fresh explicit consent is still required; execution is unavailable unless the trusted host enables it. Results are draft revisions, not public localized content. Existing cancellation and conservative unknown-usage reconciliation remain authoritative.

## Verification record

[Exact gates](../../scripts/localization/menu-live-inputs-evidence/gates.json): full pnpm -r build/check,27 Settings UI cases, mixed-source API/recovery and retained host/shared-HTTP/engine functional tests,25 batch/29 retained host/36 engine faults, security/tenant/strict legacy conformance all pass. Same/separate content and translation connections, selected projection, ambiguous keys, private-field exclusion, source retargeting and late edits are covered. Mutation runs restore exact source/artifact hashes. The existing page review shape remains accepted. These use injected HTTP/providers, not current staging, a paid provider or a full multilingual visual editor.

[Offline standalone engine consumer](../../scripts/localization/menu-live-inputs-evidence/package.json), [packed HTTP subpath types/requests](../../scripts/localization/menu-live-inputs-evidence/http-client-package.json) and the [actual HTTP-only batch-route graph](../../scripts/localization/menu-live-inputs-evidence/import-graph.json) pass. The HTTP subpath proof extracts the packed subpath with locally packed dependencies; it does not certify a full edge-infra install or all public packages. Source runtime remains HTTP-only; native SQLite/libSQL is test infrastructure. Existing build/router warnings remain. CMS SHA256: 701c66a0953cdb8d2194e4a1a4f169adc15dd074da9e5652a890633c45add4de. Shared-worktree checks are not clean-checkout release proof. The new pickers have DOM test coverage; no new browser/staging walkthrough is claimed.

An initial fault run encountered a Windows native access violation after a restored baseline printed PASS. It was not counted as a passing gate. The shared allowance fixture had attempted optional `close()` on a DbRunner that exposes no close method. It now retains the existing libSQL client and closes it explicitly in fixture cleanup. Fresh functional and all90 fault checks subsequently passed without retries or suppressed process failures. The cleanup defect is established; attributing the native crash exclusively to it would exceed this evidence.

## Next executable work

1. Add saved-view-aware live selection through the existing Data Inspector/view contracts, with explicit stable record identity and predicate/retarget freshness. Do not recreate filters as embedded SQL or silently equate raw-table reads with a view.
2. Separately review the selected destination's protocol capability and obtain an explicit selected real-provider batch/allowance before actual execution. No automatic SQL installation or billable connection test.
3. Build native locale refinement/preview/publication and public RTL/switcher; then localized live search/filter/sort/counts across Repeaters, Tables and Grids. Other adapters, unattended delivery, memory/glossary and multi-site operations remain separate. WordPress source/translated sitemap and slug comparison remains mandatory; CF-22 stays parked.

Rollback keeps execution disabled and preserves durable review/job/accounting history and cancellation. Removing source pickers does not erase unknown usage or authorize refunds. Shared unrelated staged/worktree changes must remain preserved.
