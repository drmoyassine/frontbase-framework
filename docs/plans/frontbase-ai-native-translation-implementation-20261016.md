# AI-native translation implementation plan — 2026-10-16

## Current execution order — 2026-10-20

This is the active work order; the milestone definitions below describe target capabilities, not blanket completion. [Homepage and navigation receipt](frontbase-homepage-arabic-publication-20261019.md) is the delivery evidence. Public-release readiness and paused CF-22 remain separate.

### Delivered and verified on staging

- Translation storage can use the content datasource or a separate configured HTTP destination. Actual Transo / native PostgREST / `translations` storage is working; `public` remains reserved. This does not certify every writable Frontbase datasource adapter yet.
- Existing OpenAI/OpenRouter integration, searchable model/language selection, contextual selected-input jobs, immutable revisions, manual protection and request-accounting/recovery seams have bounded evidence.
- Arabic Homepage is published with 85/85 display/accessibility/metadata fields, RTL, reviewed preview and explicit publication. Two original provider-generated drafts were reused; the rest were authored by the agent through manual revision APIs. This proves the rendered Homepage outcome, not an automated provider-generated whole-site batch.
- Native dropdown switches languages on the current page and preserves query parameters. Arabic menus, cards, GET search and nested public routes keep `/ar/`; redirects retain existing publication integrity gates. Source content and external/API/assets/download destinations remain intact.
- Other page bodies are still source-language fallback under the localized shared shell. They retain source canonical URLs and do not gain false translated head alternates.
- The old unsent job is cancelled. Two requests remain settled and one remains uncertain in reconciliation review. This does not block the published page; unknown usage is not zeroed and no paid fallback is authorized.

### Ordered delivery status

| Priority | Work | Completion gate |
|---|---|---|
| 1 — delivered | Admin session recovery | [Staging receipt](frontbase-admin-session-recovery-20261020.md): server-cookie validation, shared no-replay 401 recovery, same-identity continuation and mounted draft retention. Workspace checks/build, 12 focused tests, seven faults and retained suites pass. Valid-session dashboard verified; forced browser expiry was not performed. |
| 2 — next | General page and live-record translation identity | Extend the Homepage contract to selected pages, menus and Block Versions. Bind live text to datasource/schema/table/stable record key/field identity rather than rendered row position. Use the same List Component binding path for Repeaters, Tables and Grids; preserve membership/permissions and source updates, with batched reads rather than per-card requests. |
| 3 | Complete the AI-native authoring workflow | From configured languages and selected scopes, generate missing text in bounded resumable jobs, visually refine and preserve manual edits. Extend the current four-field selection flow deliberately; make partial-save recovery/progress reliable. Free-provider failures should leave completed drafts usable and expose an explicit retry/skip path without paid fallback, unaccounted resends or fabricated usage. Validate an actual representative provider batch; agent-authored completion is not proof of unattended generation. |
| 4 | Review/history and general locale publication | Expose generated/manual revision history, coverage and source changes in native UI; complete preview → publish/discard plus explicit rollback/deactivation for selected pages/locales. Define and test per-unit missing/outdated policy so routine live-source changes do not invalidate an entire locale or silently mislabel source fallback as completed translation. Cover concurrent edits, source changes, alternative versions and isolation. |
| 5 | Localized live query correctness | Implement and verify translated search/filter/order/count/pagination before page slicing for same and separate stores. Until accepted, the live source query remains source-language behavior; Arabic route navigation does not establish Arabic querying or translated catalog contents. |
| 6 | Remaining surfaces and storage certification | Cover forms, validation/empty/loading/error messages, accessibility and SEO consistently; verify responsive RTL and locale formats. Certify each additional writable translation-store adapter independently, while retaining optional same/separate storage and pure HTTP runtime transport. |
| 7 | WordPress migration and operating/release proofs | Compare source/translated sitemap URL literals and slugs for every site/locale, including translated-slug sites; review ambiguous mappings, use optional GSC observations and preserve URLs/redirects. Complete backup/restore/retention, clean-host/edge and independently installed package evidence before distribution or cutover. |

### Immediate executable task: general page and live-record identity

The dashboard recovery slice is delivered with [bounded evidence](frontbase-admin-session-recovery-20261020.md). Next inventory existing extraction and List Component binding contracts, then extend stable resource identity to selected saved pages, shared menus, Block Versions and datasource/schema/table/stable-record-key/field references. Reuse the same binding path for Repeaters, Tables and Grids, and batch live reads. Require fixtures for source edits, reordering, schema changes, alternative versions and tenant isolation before expanding publication. This next implementation is not yet claimed complete.

### Translation constraints retained

Reuse `@frontbase/translation` identity/revision/job ports, existing owned HTTP adapters, connected accounts, shared conditionals/List Components and the one renderer. No parallel provider client, revision store, queue, renderer or frozen datasource mode. Source records stay live; immutable translation revisions/releases are publication resources. Current Homepage publication is tied to its rendered source/site/configuration and refuses unsupported interactive lists/alternative versions; generalization and source-change availability are still acceptance work. The seventh translation library candidate has its own package-release gates. No automatic provider dispatch, paid fallback, accounting reset, migration cutover or CF-22 resumption follows from this plan.

## Standalone package prerequisite

Owner requires `@frontbase/translation` as an independently consumable seventh npm framework library. The earlier six-package-only localization proposal is superseded by that explicit decision. Extract the existing foundation into this package with compatibility forwards; independently install/test its tarball and declarations before building the lifecycle there. Generic engine policies/ports must not depend on Frontbase backend/core/console; host-specific extraction, auth, UI and transport integrations consume them. [Package plan and evidence](frontbase-translation-package-20261016.md). No npm publication or complete AI engine claim follows from this extraction.

## Delivery strategy

Prove one end-to-end English/Arabic vertical slice first: language settings → selected translation storage → one page/menu and live Repeater → contextual generation → manual correction → exact preview → publish → public switcher. The slice must include same-datasource and separate-datasource fixtures early; do not build a storage-specific UI and retrofit portability later.

Extend the proven contract to all translatable surfaces and all three List Components. A display-only translated Repeater is an intermediate milestone, not completion of localized search/sort/counts. Provisioning the owner's self-hosted Supabase, migrating GTranslate and enabling production languages are separate later actions, not implied by approval of this design.

## M0 — Inventory, contracts and executable design fixtures

Dependencies: accepted product requirements; no provider credentials needed.

Tasks:

- Enumerate component metadata, rich-text representations, both HTML shells, builder/public query paths, menus/forms/SEO, registered datasource types, auth and publication seams. Record exact source files and provider capability gaps.
- Define versioned schemas for locale config, stable resource refs, translation units/revisions, context, protected tokens, job intents/results, published resources, routes and localized query requests.
- Define MessageResolver/TranslationStore/AIProvider/job-runner interfaces under `@frontbase/translation`. Reuse existing transport capabilities through host adapters without importing Frontbase consumers or duplicating their contracts. Validate an external tarball consumer and native host fixtures.
- Implement per-site/per-locale sitemap comparison, preserving literal URLs and refusing positional or AI-guessed translated-slug mappings. Same-prefix observations remain candidates until verified; missing locale inventory remains unknown. Record optional sitemap/GSC connector boundaries.
- Create Arabic/English fixture corpus: plural categories, mixed-script values, rich text, repeated ambiguous terms, @ references, menus/counts/errors, composite record keys and source edits.
- Compare i18next/one selected syntax, MF2/messageformat and FormatJS ICU at pinned versions. Measure parse/format behavior, edge bundling, dynamic catalog support, no eval/catalog code execution, isolation and bundle/cold-start cost. Inspect licenses. Compare a native Intl reference as well; select one runtime/format or explicitly none only after evidence. None requires a documented solution for required message/validation behavior, not an assumption that Intl supplies a message parser.
- Resolve initial missing/outdated behavior, budget/publish policy, initial locales, route default and API/store bounds. Define exact versus eventual freshness for text, membership and deletion separately.

Acceptance: reviewed wire contracts/fixtures, support matrix and measured runtime decision; no live changes. Record accepted implementation decision in DECISIONS.md only after review, preserving the owner-approved standalone engine boundary and existing host-package responsibilities. A failed candidate is rejected on observed behavior, not general popularity. None of the shortlisted libraries is an owner-confirmed valid outcome; this is not a requirement to build a replacement engine.

## M1 — Storage, lifecycle and isolation

Current partial implementation: [revision lifecycle and SQLite evidence](frontbase-translation-revisions-20261016.md). Source/head CAS, immutable target revisions, manual protection, replay and same/separate SQLite destinations are locally verified. This does not close provisioning, PostgreSQL/async providers, leases, releases, retention/export, source history or freshness gates.

Dependencies: M0 contracts.

Tasks:

- Implement translation-package lifecycle/schema and adapter conformance suite; start in-memory only as test double, then actual PostgreSQL/Supabase and SQLite-family persistence.
- Versioned additive provision/validate flow, configurable connection/namespace/prefix, existing-resource binding, durable CAS/revision storage, leases and release preparation.
- Small app config stores destination reference/pointers; external destination owns bulk translation data. Implement same-destination and different-destination modes with identical API semantics.
- Owner/project isolation, exact source identity, indexes, job history retention/reference protection, opaque errors and export scaffolding.
- Inventory remaining writable connector adapters and add coordinated paths or explicit unsupported capabilities. Do not declare provider parity from an SQL-only fixture.

Acceptance: two projects sharing physical tables cannot read/write each other; same/separate DB results match; human concurrent edits produce one accepted CAS and one conflict; interrupted provisioning/release preparation recovers; missing permissions/read-only adapters explain the unavailable operation. Test actual transactions and transaction-less adapter recovery. No credentials or private translation bodies in public payloads.

Fault gates: remove owner predicate; bypass CAS; accept stale lease/fencing token; prune published revision; activate missing external preparation. Each mutation must fail a corresponding test and restore baseline.

## M2 — Extraction, context and durable AI jobs

Current partial implementation: [immutable input history and durable test-provider jobs](frontbase-translation-jobs-20261017.md). SQLite discovery/leases/retries/cancellation and atomic revision/job completion pass local recovery/fault tests. This does not close extraction, configured AI, billing/attempt accounting, memory, host scheduling or other-provider gates.

Dependencies: M1 and existing guarded transport/credential contracts.

Tasks:

- Extract messages and rich-text units from page/menu/component metadata and selected record fields, maintaining stable refs across movement/edits. Resolve Repeater item-template/record ownership and Block Version inheritance.
- Context builder uses component role/page/neighbor/field/glossary guidance; protected tokens preserve bindings, markup and links. Configure content selection/classification; exclude credentials/unselected sensitive fields.
- Implement scoped memory/glossary lookups, provenance and human-head precedence. Shared pools require explicit project membership; no accidental cross-project reuse.
- Add AIProvider adapter and deterministic fake provider for tests; real provider integration uses configured server credentials and existing safe network path. Validate schema/placeholders/rich text and reject instructions/executable output.
- Persist plans/items before dispatch, idempotent claim/commit, lease expiry/recovery, retry/backoff, budget reservation, progress/cancel/resume and uncertain-attempt accounting. Integrate durable workflow primitives rather than treating timers as a scheduler.
- Source-change invalidation via builder events and adapter-supported external refresh/reconciliation. Record freshness visibly.

Acceptance: regenerate unchanged content reuses permitted memory; source edits cannot let late results overwrite current translations; manual correction survives model/prompt changes; duplicate delivery does not duplicate committed revisions; cancelled/expired workers cannot commit; worker restart resumes queued work. Generation never occurs on an anonymous public request. Fake and configured real provider tests are reported separately; no unapproved content transmission or spend.

Fault gates: ignore expected source hash; overwrite manual head; leak shared-memory candidate; accept broken placeholder/markup; commit after cancellation; skip budget reservation. Pin limitations on exactly-once provider charging.

## M3 — Native authoring and preview vertical slice

Dependencies: M1–M2 core.

Tasks:

- Settings → Languages with source/target locale list, storage selection and validation/provision preview; provider settings reference secure accounts, not inline credentials.
- Translation workspace coverage/jobs/review/history and glossary; initial entry points through Settings and builder links. Validate sidebar placement with actual volume before adding a new top-level area.
- Builder locale picker, localized preview, selected-element translation editor, Generate/Regenerate/history, missing/outdated markers and manual corrections. Same component renderer; no special Arabic page clone.
- Data Inspector: translatable field configuration, selected context fields, per-record locale view and batch generation/review controls. Rich-text controls distinguish text from identifiers/URLs.
- Register locale.code/direction as read-only shared @ context for existing conditions/Block Versions; protect identities and unchanged source actions.

Acceptance: user creates a page and Card Repeater from scratch, binds live data, selects Arabic and edits text without leaving visual context; translation edits do not mutate original text, conditions or bindings. Shared fields follow Default; explicit structural versions behave correctly. Source and translation concurrent edits remain recoverable. Preview is visibly draft and cannot leak through anonymous APIs.

Verification: focused console authoring/CAS tests plus native rendered comparison, keyboard navigation and Arabic layout. Do not create tests that only mirror JSX labels; assert meaningful authored state and preview/public separation.

## M4 — Native rendering, releases, routes and switcher

Dependencies: M3 slice, M1 release storage and M0 message choice.

Tasks:

- Request-scoped locale resolver; native message/structured-content resolver shared by server, builder and browser; both HTML shell paths handle language/direction consistently.
- Language Switcher element/menu item, equivalent-page links, safe query/anchor preservation, preference storage and explicit URL precedence. No preference-only SEO pages or forced redirects.
- Bidirectional route registry, uniqueness/conflict handling, reserved paths, localized slugs and explicit aliases/redirect updates. No LLM route decisions at request time.
- Prepare immutable locale release resources, verify coverage/source/config/base, activate by CAS and retain rollback predecessor. Exact private preview references both design and translation drafts.
- Source-language resilience, last-known-good/fallback policy, locale/audience/release-aware caching, approved revision visibility and record deletion/permission invalidation.
- SEO alternates/canonical/sitemaps and readiness from the same route registry; staging remains noindex unless separately authorized.

Acceptance: hard reload on each language URL returns the correct complete SSR language; switcher opens equivalent page and source identifiers remain stable; no cross-tenant/global-language bleed. Draft changes never become public before Publish. A failed external prepare leaves previous release active. Store/provider outage does not add a translation dependency to default language. Rollback restores the prior approved translation release without changing source records.

Fault gates: remove locale from cache key; share instance across requests; expose draft revision; activate partial release; trust supplied project/locale header for authorization; emit an unpublished hreflang target.

## M5 — Live record localization and remaining surfaces

Dependencies: M4 publication path.

Tasks:

- Batch allowed translation lookup after existing live source authorization/projection. Keep count/membership source-owned for source-query mode; no N+1 reads.
- Integrate common behavior into Repeaters, Tables and Grids, including refresh, empty/error/loading state messages, field mapping and record links.
- Cover forms/errors, rich articles, menus, alt/aria/placeholder text, SEO and supported structured-data display fields. Define explicit exclusions for IDs, scripts, conditions, URLs and monetary values.
- Publish new record translation revisions independently of page redesign; preserve live source data and missing/outdated policy.

Acceptance: original source record changes remain live, affect fingerprint/coverage and do not expose unapproved translation drafts. A newly authorized/deleted record is handled by current source membership. All three list components and builder/public/browser refresh agree. Source-query search limitations are clearly labelled at this intermediate phase; this is not complete localized search acceptance.

## M6 — Correct localized queries across same and separate stores

Dependencies: M5; provider-specific query/index capabilities validated in M1.

Tasks:

- Extend registered query contract with source-versus-localized field semantics; locale/release-aware query planner and stable tie ordering.
- Implement same-DB authorized join path where available; implement separate-store derived localized record index with incremental reconciliation, release/source watermarks, tombstones and rebuild/recovery.
- Intersect localized candidates and current authorized source filters before counts/pagination. Test source-only joins/filters, private per-user scopes, deletions and stale indexes; enforce exactness/capability limits rather than silently overfetching one page.
- Add index readiness/last-sync and explicit source-query fallback. Do not offer unsupported search/sort controls or claim exact totals when validation was capped.
- Validate large-catalog batches and common/filter/late-page queries with bounded work and explainable freshness; no mandatory full-table fetch on every page request. Provider-specific accelerated plans are separate evidence.

Acceptance: known Arabic matches outside English page1 are found; localized order differs correctly; exact count equals all authorized matching rows, zero/last/next pages agree across all three components; query reset on language switch is correct. Same and separate stores give the same results under the defined freshness contract. Revoked records cannot appear through translations or counts. If exact query proof cannot complete, response explicitly rejects that mode or uses declared source semantics.

This is a completion gate for the owner's separate-store multilingual discovery use case, not optional polish. Do not hide it behind a superficially working switcher.

## M7 — Operational and multi-site acceptance

Dependencies: M0–M6 and independently configured test destinations/providers.

Tasks:

- Validate multiple sites/projects sharing one translation destination and optionally authorized memory pools. Schema-per-project mapping is additional adapter coverage, not a new logical model.
- Finish writable-provider matrix, store relocation/export/restore, retention and referenced-revision protection, limits/usage, source/index reconciliation and per-locale monitoring/runbooks.
- Verify restart/migration/backup/restore, partial store outage, dispatch recovery, stale AI result and concurrent publication under actual configured hosts.
- Compare translated visual output at desktop/mobile, long strings and mixed RTL/LTR. Review correction durability and generation provenance.
- Package/release documentation states exactly which adapters, message runtime, locale/query features and configured-provider paths are verified. No public-framework gate is closed merely by passing the pilot.

Acceptance: owner can configure same datasource or separate self-hosted Supabase, translate a selected page/collection, visually refine, preview, publish and recover without affecting other sites. Real provider tests are credential/spend-gated; report any skipped paths. Reuse a second content domain as bounded translation acceptance, without resuming the parked generic Booking for X feature sprint.

## Verification and delivery discipline

For every code-bearing milestone run `pnpm -r check`, `pnpm -r build`, focused core/console/backend integration and relevant existing mutation/conformance/no-leak gates. Pin source/image/store schema/runtime versions. Broader console type debt remains separate; do not weaken gates or conceal pre-existing failures. Reuse test doubles for fault injection and actual SQLite/PostgreSQL adapters for persistence semantics; fake provider tests do not certify real external integration.

Before touching staging: review package diff, omit unrelated workflow/email/generated/conflict changes, record active publication/drafts and verify backup/recovery. Use a disposable page/project and explicit rollout configuration before modifying existing published pages. Schema provisioning, AI data transmission/spend and publication require their applicable authorization; obtain it only when there is a concrete operation to review. No unnecessary repeated approval where session authorization already covers the action.

A milestone receipt includes completed scope, exact commands/results, skipped credential gates, changed files, source/image/config identities, residuals and next executable task. Owner now authorizes implementation beginning with M0. Complete remaining contracts/runtime evidence and record the selected runtime before moving into M1; do not claim M0 or multilingual delivery complete from the first slice.

## Decisions/open questions before implementation

1. Approve or change proposed initial English/Arabic, generated drafts requiring review, project-private memory and subdirectory defaults.
2. Choose never-translated/outdated public behavior and data-readiness policy; distinguish this from normal source-language availability.
3. Identify initial supported writable adapters and exact deployment test targets; no provisioning of the planned self-hosted Supabase yet.
4. Set AI provider/data classification/budget policy. Deterministic provider fixtures can proceed independently of real keys once implementation is authorized.
5. Accept the localized-query freshness/exactness contract; approve any explicit initial capability limits rather than allowing inaccurate search/counts.

Deferred: GTranslate inventory/extraction, WordPress domain/SEO cutover, cancellation, standalone external-site proxy, reservations/payments and the previously parked tasks. Native architecture retains migration hooks without making migration the prerequisite for implementing the product.


## M0 initial implementation receipt — 2026-10-16

[Local foundation receipt](frontbase-localization-m0-foundation-20261016.md) records implemented core config/resource/revision contracts, isolated stable identities/source fingerprints, protected rich-text segmentation/reassembly and deterministic sitemap comparison. A new `@frontbase/edge-core/localization` entry exposes the data-only primitives. No UI/API/storage adapter or language serving is enabled; generated output alone is not publication.

Pinned isolated probes cover i18next JSON, i18next ICU, FormatJS ICU and Unicode MF2; initial Arabic plurals, dynamic message replacement, independent instances, strict error behavior and browser-target bundle measurements are recorded. Rich-text interchange is bounded and tested separately; it is not yet a full editor/renderer roundtrip or actual worker/browser parity proof. Do not select the runtime solely by bundle size or a single timing run.

Remaining M0: complete job/store/context/route wire contracts and exact capability matrices, validate real browser/worker/catalog/rich-text behavior, choose initial fallback/publishing defaults and record the measured runtime decision. Then M1 builds real storage and its conformance gates. Mandatory translated-slug comparison is retained for all later migration adapters; USA identity-prefix data is not an estate-wide assumption.
