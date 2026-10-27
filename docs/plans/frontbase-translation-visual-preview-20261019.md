# Native saved-page translation preview — 2026-10-19

## Scope

M3a implements a private visual slice for saved Default plain Text/Heading/Paragraph fields. It does not complete M3, multilingual publication or live-record localization. The previous Arabic batch stays on owner-requested hold: no new model call, reconciliation, allowance, retry or public release.

## Reused paths

- The reviewed-batch extractor is shared with visual authoring; eligibility, stable document/block/property identity, scope and source/context fingerprints remain the same. Bound subtrees and alternate-version content are excluded.
- The existing owned datasource resolver and HTTPS/PostgREST translation persistence supply reads and manual CAS revisions. Selecting a locale does not resolve AI credentials or dispatch work. Source rows/layout are never overwritten by translation saves.
- The existing builder render hook/service-worker/network fallback renders a transient saved layout. Default block resolution is explicitly requested. A document-scoped language/direction shell supplies Arabic RTL without a global locale or another renderer.
- A builder entry opens a separate translation workspace, unmounting source design shortcuts/DnD. Click a text element or choose a text field, compare its original, edit and Save translation draft. Back to design returns to the untouched source store. The existing searchable language picker lists configured source/targets.

The source-language preview uses the same server-saved layout as the target preview. Unsaved design is not implicitly saved or published. Missing/outdated translations show source fallback and field status in the private workspace. Layout overrides, menus, rich text, metadata and live records are not translated by this first surface.

## Auth, freshness and failure contract

The two private page-preview endpoints inherit the existing authenticated administrator gate and no-store policy. The server resolves tenant/project/storage/language/page identity; the browser supplies only owned selection, configured locale, optimistic token and bounded plain correction. Tokens include saved-page/configuration identity and source/head snapshot. Source/configuration/revision changes reject stale writes; generated replacements remain blocked over manual heads. A transport error fails the preview instead of hiding fields as successful empty results. Store retargets are checked against the same resolved destination.

Cross-store source/revision changes are not a distributed transaction. A source change after a revision commit makes that revision stale; refresh checks source/configuration again and suppresses outdated target text. Failed save confirmation asks for reload rather than blind retry.

## Local verification

Workspace check/build pass, including client-symbol verification. The expanded builder type check reports the same 17 pre-existing errors as importing the original canvas hook alone, with zero additional diagnostics; the repository's existing scoped console check passes. This does not claim whole-console type health.

The new backend behavioral suite verifies manual reload, unchanged saved source, optimistic and concurrent CAS, source/configuration freshness, unsupported/foreign/bound inputs, anonymous/non-admin/tenant denial, sanitized transport failure, manual protection, retained held markers and zero provider calls. Five in-memory compiled faults are caught without rewriting artifacts. Three initial preview UI cases plus 17 retained batch UI cases pass; the final four-case preview suite adds a capture-event regression proving preview selection suppresses source click workflows and submit handlers. All 25 retained batch mutation faults pass and restore exact source/artifact hashes. Retained batch/storage suites and response conformance gate pass. The conformance gate measures existing registered contract operations; the new endpoints are additionally covered by their explicit behavioral/schema tests, not claimed as a regenerated whole-app contract.

## Delivery

Source `dc1c46c` adds the bounded workflow; `2794b75` adds preview click/submit suppression. Final clean Git archive contains 2,025 entries / 6,655,464 bytes, SHA256 `4f21129491fab29117631950ad02a9d5d7475a577b5bd315ae8e77dd41a6ea07`. Action `cmvf6vklk006007qq6lv1hbja` completed 2026-10-19 14:47:49 Kuwait (11:47:49 UTC). Container `90d8673927a8b7c684bea3ee7323593180a731911fa4df5327ca767cbf9235e0` is healthy; Docker/client gates pass. Service configuration, including environment/keys/mounts, matches the pre-delivery baseline except the intended source upload. Eight public page/auth-denial status/byte/hash results match.

Authenticated staging Homepage → Translate saved page loads the existing Arabic heading and paragraph into the actual rendered introductory card, with RTL, source text beside the selected translation, draft provenance and missing-field fallback options. No actual owner translation was edited or saved during native verification; manual persistence/concurrency were verified in the deterministic HTTP fixture to preserve the held pilot. No new generation, cancellation/reconciliation, SQL, credential or public publication change occurred.

## Remaining work

M3b is next: inspectable revision history, coverage and explicit review/source freshness across supported fields, then the M4 prepare/preview/publish/rollback path. This surface currently supports only saved Default plain page text (at most 100 candidate fields); save the source design separately, then reload translations. Menus, alternate versions, live list data, rich text, SEO and other surfaces retain their separately planned gates. No public language switcher, localized route or full multilingual publication is delivered. The expanded builder type debt remains 17 baseline diagnostics. Unrelated staged versions/deletion, 1,876 other index entries and local generated CMS are preserved.
