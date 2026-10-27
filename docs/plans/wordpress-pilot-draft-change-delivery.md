# B foundation: guarded draft changes and durable recovery

**2026-10-08. Locally implemented and verified; uncommitted.** Continues the owner's direction after pushed checkpoint `bd9ea54`. This adds a backend foundation under the existing admin/auth/owner context. It is not a completed installer, upgrade UI, multi-page transaction or site publication mechanism. No actual pilot database, layouts, configuration, canonical data, review/publication, storage or deployment is changed by synthetic tests.

## Contract

The additive administrator-only routes are:

- `GET /api/pages/:page_id/change-state/`: a full-page state hash and draft eligibility.
- `POST /api/pages/:page_id/changes/`: strict bounded JSON with operation UUID, expected state hash and an allowlisted patch of name/title/description/keywords/layout.
- `GET /api/pages/:page_id/changes/:operation_id/`: read-only scoped status; never executes a prepared operation or writes a completion receipt.

Use the trusted request owner and explicit owner/admin roles, no client owner/capability/receipt fields. Responses carry coarse operation status and hashes, never the original/desired layout, recovery snapshot, provider configuration or actor claims. All new routes are no-store/noindex. Legacy page saves and their response envelopes remain unchanged. Slug, privacy, homepage, deletion and publication are deliberately excluded from this patch contract; namespace reservation/creation and publication require their own mechanisms.

The state digest covers every selected page field, including metadata, actual stored layout, content hash, privacy/homepage/publication/deletion, auth-form metadata, creation/update timestamps and the operation marker, bound to the owner. A layout hash or timestamp alone is insufficient. The SQL update compares the entire previously observed row and requires a non-deleted draft. This is exact-state comparison, not a monotonic revision counter; an edit that restores every compared byte has the same state. Generic legacy saves remain available, so the guarded owner slot is not a global lock over all page editing.

Migration23 adds nullable `last_write_operation` to existing pages. The guarded update writes this receipt in the **same SQL statement** as its page change. It is absent from legacy PageOut serialization and cannot be patched through legacy page saves. Fresh and upgraded schemas must converge while preserving pages. Down is intentionally additive/no-op, matching prior column migrations; do not partially run migration23 down and reapply it against the retained column. Artifact rollback retains the applied migration record; same-version full snapshot restoration is a separate recovery layer.

## Durable operation protocol

One owner-scoped active operation is stored through the existing settings database seam. Its strict, bounded record contains exact original and desired state, their hashes, operation/plan identity and phase. The original draft recovery state is persisted before the page can change. Completed/conflicted receipts are archived before the active slot is conditionally replaced. A concurrent replacement refuses; a running/prepared operation never expires to authorize a second writer. These records are sensitive administrator recovery state, not template-export data or public content.

An exact operation-ID retry must match page and request digest. Prepared work first conditionally records `applying`, then performs the full-row guarded update. A known zero-row conflict does not overwrite anything. A lost reply after a committed page update can be reconciled from the atomic marker **and exact resulting page hash**, even if completion-record writing was interrupted. Equal content without the marker is not ownership proof. An owner edit after application is preserved and stale recovery returns uncertain. Terminal archived receipts cannot authorize another write.

An interruption after `applying` but before the page write is **uncertain**: a fresh instance never replays it based on unchanged page bytes or timeout. It remains reserved. Reconciliation/cancellation must prove no writer can still run and preserve subsequent edits; an administrator resolution UI/protocol is future work, not an automatic release/lease-expiry shortcut. The new HTTP handler never claims “nothing changed” after an ambiguous database error.

No transaction API or raw SQL import is exposed. The current proof uses real local SQLite with accurate affected-row counts; selected hosted/provider adapters need independent acceptance. The operation covers one draft only. It does not reserve template slugs/roles, synchronize shared configuration, create a page, restore a whole installation, or provide an upgrade merge algorithm. The current layout contract bounds the root/content envelope and reuses directory-binding validation; complete artifact grammar and field/schema/capability preflight remain installer requirements.

## Verification and remaining work

Initial interrupted run:13 functional groups passed. After resume,15 groups including read-only status and recovery across three independent Node processes pass. The persistence test creates only a guarded generated temporary SQLite path, persists intent in one child, commits with a deliberately lost reply in the second and recovers in the third without a page update. Final mutation12/12 goes RED with independently rebuilt functional15 GREEN after each fault and matching source hashes. The first SQL fault removed placeholders but retained their arguments, so its RED could be a SQL binding error; the corrected final fault keeps valid bindings, deliberately bypasses the predicate and asserts the specific applied-versus-conflict overwrite failure. That final run supersedes the first count. The interrupted edit/build/test command was rejected because automatic approval review could not complete at the account usage limit; it executed no changes. Owner later requested resume; no approval bypass was used.

Final integrated verification on Windows, Node26.7.0 and pnpm10.15.1:

| Command / gate | Result |
|---|---|
| Backend `test/page-changes.mjs` | 15 grouped checks pass, including real SQLite races, read-only status and three-process persistence |
| Backend `test/page-changes-mutation.mjs` | 12/12 injected faults detected; independently rebuilt functional15 passes after each restoration; source hashes identical |
| `pnpm -r build`, then `pnpm -r check` | Both pass; existing chunk-size/static-dynamic-import warnings retained |
| Backend `test/migrations.mjs` | Fresh/idempotent/full rollback/reapply and fresh/upgrade convergence pass |
| Backend `test/compat-wave1b.mjs` | 6/6 pass |
| Backend site configuration, page reference and publication-control tests | Pass |
| Backend compatibility security and database-security tests | Pass |
| Backend tenant matrix | 175/175 identifier-bearing operations isolated; 29 scoped tables checked per operation |
| Example `dist/smoke-host.mjs` | Pass, including artifact parity, Node exclusions, assets, routing, default-deny and boot/no-leak checks |
| `scripts/wordpress-pilot-ops/server-restore.test.mjs` | 8 real-server groups pass using synthetic same-version SQLite and both secret-custody modes; no deployment |
| Backend `test/compat-conformance.mjs --gate` | **Exit1 remains unresolved:** 248 conforming, zero violating, nine unreachable, 77 product-verified refusals across 334 operations; differential577 cases/76 differing. This is not an all-green conformance or release claim |

Regenerated `examples/cf-full/api/cms.mjs` from restored source. Build artifact measurements are CF514.1KiB, Vercel514.5KiB and Deno515.5KiB min+gzip; these are current local artifacts, not a hosted portability acceptance claim. Hosted adapters, actual pilot migration/restart, real storage/datasource and deployment checks were not run. Source, tests, generated host and evidence remain uncommitted; the previous pushed checkpoint remains `bd9ea54`. Public-release strategy, milestones and README readiness claims are not advanced by this bounded proof; R0 and its release backlog remain separate.

Next B work: actual capability/namespace preflight and durable page-creation/configuration steps; cancellation/reconciliation of stalled operations and guarded restoration/history UI; full artifact orchestration through existing admin; conditional three-way customization upgrades and clean separate-country proof. D's existing-engine public-input contract and durable inquiry storage/delivery remain separate work. Final core/template/consumer packaging, full migration, staging, intended-host operations and owner-deferred off-server recovery remain open. R0 in progress; CF-22 paused; no release-scope or public readiness claim.
