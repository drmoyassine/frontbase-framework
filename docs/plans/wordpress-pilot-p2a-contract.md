# P2a: one site configuration and a coherent published version

**2026-10-06 — shared authoring, explicit page linking and transient preview implemented; live data/publication pending.** Owner authorized continuing under the [active roadmap](wordpress-pilot-roadmap.md); the authoring selection is recorded in [DECISIONS.md](../history/DECISIONS.md). Strict revisioned Directory draft, dedicated existing-settings key, authenticated project API, existing Settings controls and owner-implicit page-role references are implemented. Legacy-copy conversion is explicit per page. All immutable publication/activation keys and live-query integration below remain proposals. Six packages, one engine and self-host/Cloud ownership are unchanged; this is not shipped site publication.

## Owner-visible behavior

Configure the site once in the existing /frontbase-admin: database, storage, destination, branding, contacts, collection/field relationships and page templates. Institution/program/article pages reference those settings; they do not each carry their own country/connection/branding copy. A page selects its role and editable layout.

Saving changes affects preview. Publishing activates a complete reviewed version. Visitors keep seeing the previous published version until activation succeeds. Rollback selects a prior complete version. USA and Hungary use this same behavior in separate deployments.

## What the current code actually does

| Seam | Trace / consequence |
|---|---|
| Project ownership | [project.ts](../../packages/backend/src/compat/routes/project.ts) reads/writes key project through a tenant-scoped KeyValueStore. Existing PUT merges the body and uses unconditional upsert; timestamps are not optimistic concurrency control. Do not put a live activation pointer into this unrestricted merge. |
| Persistence primitives | [store.ts](../../packages/backend/src/compat/store.ts) scopes settings by tenant_slug/key. KeyValueStore has no CAS. CommunityInviteStore already demonstrates UPDATE conditioned on the exact old value and affected-row count; a reusable conditional write seam can follow this pattern. [DbRunner adapters](../../packages/edge-infra/src/providers/runners.ts) must prove affected-row reporting; no blanket cross-host atomicity claim. |
| Current authoring contract | [configuration.ts](../../packages/edge-core/src/directory/configuration.ts) is a strict data-only v1 Directory schema; incomplete authoring drafts are allowed. It carries datasource ID, role/field mappings, scope, browsing, routes and contacts, not credentials/SQL. New shared settings reuse this validation, with an explicit envelope/reference migration. |
| Actual page API | [pages.ts](../../packages/backend/src/compat/routes/pages.ts) validates page-root Directory settings and refuses Directory publication with directory_runtime_pending. [PagesStore](../../packages/backend/src/compat/pages-store.ts) marks the mutable compat_pages row published and separately snapshots layout. Two writes do not provide coherent site activation. Preserve the refusal. |
| Actual public serving | [serving.ts](../../packages/backend/src/tenancy/serving.ts) selects mutable compat_pages.layout_data by tenant and published flag. It also currently derives public title from name rather than the dedicated title field. [worker.ts](../../examples/cf-full/src/worker.ts) calls it; self-host enables legacy crossTenantFallback, Cloud does not. New site versions must never use cross-owner fallback. Metadata fidelity is an explicit P2 test, not established by draft saves. |
| Compiler/query seams | [defineQueries.ts](../../packages/compiler/src/queries/defineQueries.ts) owns registered executors/parameter validation; [manifest assembly](../../packages/compiler/src/manifest/build.ts) builds deterministic manifests and strips executors from browser projection. An external data/config change needs a publication fingerprint in versionPrefix; the current manifest hash alone does not bind external content. |
| Separate publish pipeline | [pipeline.ts](../../packages/backend/src/publish/pipeline.ts) assembles a manifest and purges page caches. It is not the current compat Directory flow and is not a ready site-wide transaction. Reuse compiler assembly, not a second publisher/renderer. |

Comments can be stale: pages.ts still contains an old note that runner is absent, while [app.ts](../../packages/backend/src/compat/app.ts) actually supplies it. The trace above uses executable wiring, not that comment.

## Recommended minimal persistence design

Use the existing application-state settings table and project/tenant owner. Add dedicated validated site-configuration operations under the existing project API namespace. Do not embed live state in the legacy unrestricted project PUT, add a multi-site registry, mix it with Studygram canonical tables or create a required new service.

| Record | Proposed key / fields | Access |
|---|---|---|
| Shared authoring draft | site_configuration:v1; schemaVersion, monotonically increasing revision, Directory configuration, template version, role-to-page IDs, connected storage provider ID, publication policy | Authenticated owner-scoped read/write, expectedRevision required. IDs are references, never credential copies. |
| Prepared published version | site_publication:v1:<full content hash>; compatible schema/framework requirements, fixed configuration, page layouts/metadata, route manifest, bounded reviewed public content/media references, query plan/version | Immutable server record. Referenced page/datasource/storage ownership must match before construction. Internal binding IDs stay server-side. |
| Active version pointer | site_publication:active:v1; version hash, generation | Server-only conditional activation using expected current pointer. Generic project/settings merge cannot alter it. |

Keys are a concrete proposal, not already persisted objects. Bound serialized sizes/row counts before writes. The first institution/program/article slice can be a small JSON artifact in settings; full-catalog artifact size/storage strategy needs measured evidence before P3, rather than assuming an unlimited settings blob. Garage's public image bucket must never hold private configuration/source evidence. No full portfolio content is staged into these records now.

Keep schema version, authoring revision, template version, framework version and publication fingerprint distinct. Page refs contain only a supported reference version and role (directory, institution, program, city, article-index/article-detail or editorial page); they resolve through the owning project's settings. Define disabled optional roles explicitly. Existing article/pathway mappings are optional until configured; do not invent canonical pathways as a new table when Studygram uses programs.

### API behavior to implement

- GET the shared draft through an authenticated project subresource; return revision and validation/readiness state, never resolved secrets.
- PUT a strict envelope with expectedRevision; successful conditional write increments revision. Invalid schema is 422, foreign/unavailable binding 403, stale revision 409. Creation is conditional too; an upsert cannot allow two initial writers to win.
- GET preview/layout using the owned draft and owned page references. Preview does not read the active pointer and cannot activate anything.
- Prepare publication through the existing admin publication flow: validate all enabled roles, capture fixed inputs and build one artifact using registered query/compiler seams. Return a hash and preflight results.
- Activate only a complete compatible artifact, conditional on expected active generation/hash. A conflict is 409; a failed preparation leaves old live state untouched. Rollback uses the same activation validation against a prior artifact.

Exact additive endpoint names and OpenAPI/schema declarations are implementation work; do not silently extend the vendored compat request schemas or skip default-deny authorization. Initial config writes may ship behind the publication refusal; activation/runtime cannot be enabled independently of their tests.

## Data refresh and public queries

For the first slice, recommend a reviewed publication snapshot: fetch current canonical data through the owner's real connected datasource during preflight, reconcile exact original identities, project approved fields/content, then bind that fixed content to the published artifact. Editing Supabase rows updates the next preview/preflight, not the live revision implicitly. This is a proposed policy to implement, not a claim that existing saves freeze external data.

Published registered queries provide search/filter/sort/pagination and institution-to-program detail resolution over the approved version. Params may narrow its scope only; query IDs, selected output fields and relationship rules are server-defined. Never accept client table names, arbitrary SQL, source metadata or datasource credentials as public params. Future explicitly live facts require separate refresh/invalidation policy; do not silently mix them with fixed editorial content.

The USA consumer maps existing institutions/programs/cities/countries; country 22 is consumer configuration. provider_id and CRM fields stay private. Editorial records require a consumer schema with authenticated revision-aware draft writes and approved public projection; a generic RPC endpoint is not sufficient editorial authorization. Raw recovered HTML/SEO plugin values are private evidence, not executable layout/canonical overrides.

Runtime reads one active version at request entry and uses it for every role/query in that response. It does not reread draft config or mutable page layouts mid-render. Its cache key includes owner/deployment, publication hash and normalized bounded params; public and private/user results cannot share keys. Compiler browser output contains no executor, connection secret or private source diagnostics. No browser-side executor is introduced.

## Routes, migration and compatibility

1. Original WP aliases resolve canonical IDs independently of title/name/template IDs. Nested program paths and trailing-slash outcomes are explicit. Query-string sorting is browsing state, not a distinct content identity.
2. Validate collisions across original aliases, editorial paths, configured indexes, approved expanded routes and reserved API/admin/static paths. Do not silently let a detail template shadow an unrelated page. Original paths are not invented for the four unresolved editorial records.
3. Opt-in site-managed paths resolve exclusively through the active site artifact. Missing/invalid active version yields a clear refusal; do not fall back to mutable legacy pages or another tenant. Existing legacy pages outside this opt-in ownership stay on their current compatibility path.
4. Migration of page-root prototype settings is explicit: read candidate configs from owned pages, compare them, and offer a single shared draft if compatible. Conflicting country/binding/contact values block automatic selection. Migration does not publish, delete old layouts or silently replace customizations.
5. Site-managed page/config changes must not be independently activated by a legacy single-page publish call. Preflight or explicitly route them through complete site activation. Apply this to article/editorial roles too; a directory-only check cannot protect the complete managed site.
6. Framework upgrade preserves owner content/layout overrides, validates schema support and does not republish. Template adoption is explicit. Rollback verifies both artifact compatibility and continued media availability; changing pointer alone cannot restore deleted images or database rows.

## First implementation boundary and verification

Start with shared authoring configuration only: strict envelope and page reference schema, owner-scoped conditional store, authenticated project subresource, existing console shared controls, page-role references and prototype migration diagnostics. Keep directory_runtime_pending and all new activation operations unavailable until P2b/P2c pass. Record the durable storage decision before this implementation.

| Gate | Required proof |
|---|---|
| Shared settings | Save/reload once; all owned page roles reference identical revision; individual layout changes remain independent. Incomplete valid draft allowed; publish readiness stricter. |
| Concurrency | Two same-revision writes have one winner; stale write returns 409; initial create race likewise. Prove actual supported adapter affected-row/conditional-write semantics. |
| Ownership/secret | Foreign datasource/storage/page/config/artifact references refused; no request-body owner overrides; default-deny anonymous API; no secret in config/error/log/browser output. |
| Migration/upgrade | Identical prototype configs migrate once; conflicting copies refuse automatic selection; custom layouts preserved; unsupported versions refuse clearly. |
| Publication | Fixed config/layout/metadata/content hashes; two activations have one winner; draft/canonical edits leave published output unchanged; all roles update coherently; rollback works. |
| Serving/query | Original institution/program/article URLs render real approved content; public title uses reviewed title, not internal CMS name; filter/scope/parent attacks cannot widen approved output; no cross-owner legacy fallback. |
| Cache/browser | Publication-scoped cache/SW version changes; unauthorized responses not cached publicly; browser projection strips executor/secrets. |
| Hosted | Isolated actual deployment verifies admin configure/edit/save/preview/publish/update/rollback. Fixture/snapshot ports do not satisfy this gate. |

Code changes require workspace check/build, focused schema/store/route/console tests and existing security mutation/conformance/no-leak gates. Keep mutation/build runs sequential and record credential-gated adapter/host skips honestly. This preparation performed no runtime changes or live CAS/activation tests.

## Reviewable Git checkpoint

Current branch HEAD remains ec17aba. Preparation captures a private file/hash/patch inventory outside Git; it is not a commit and no files are automatically staged. Use explicit path/hunk ownership when making the next checkpoint. Do not git add all, reset, stash, rebase or force-push.

| Group | Paths / handling |
|---|---|
| Migration/editorial/template owned work | scripts/migration modified/new recovery tools and tests; educationDirectoryTemplate.ts/test, editorialDraftTemplate.ts/test; docs/plans/wordpress-pilot-*.md and wordpress-migration-pilot.md. Review data/tooling/template changes as a bounded group; raw export/media/credentials remain outside Git. |
| Reusable storage owned work | Backend storage.ts, S3 strategy/registry/test and storage resolver app.ts wiring; edge-infra storage/providers.ts, export and SigV4 tests; console edgeConstants.tsx; backend/edge-infra package test commands. Review together with secret/SSRF/tenant evidence. |
| Shared durable documents | docs/history/DECISIONS.md and PUBLIC-RELEASE-AUDIT.md: review individual pilot additions before staging. Future simultaneous entries must not be overwritten or swept into a commit merely because the file is listed. |
| Generated artifact | examples/cf-full/api/cms.mjs is build output; fingerprint retained. Rebuild and review against final source checkpoint; do not treat its large diff as independent feature ownership. |
| Unfamiliar, excluded | .gitignore, docs/plans/competitive-roadmap.md, examples/cf-full/e2e/cloud/find-second-identity.mjs and hosted-journey.spec.ts. Preserve; no inclusion without provenance review. |

The checkpoint groups isolate review responsibilities; they are not proof that every listed full-file diff belongs exclusively to this chat. Re-read Git status/documents before editing or committing. Exact private checkpoint paths/hashes are recorded in the supporting audit, not public recovery data.

## Shared authoring foundation delivery — 2026-10-06

- Existing Settings → General now contains [Shared directory settings](../../packages/console/src/components/dashboard/settings/shared/SiteConfigurationForm.tsx), reusing the builder's Directory controls. It handles loading, saving, retained edits after conflict and explicit reload. No new admin application.
- [Strict draft/save envelopes](../../packages/edge-core/src/directory/configuration.ts) carry schemaVersion and revision/expectedRevision. Incomplete valid mappings remain authoring drafts; no executable queries or credentials are accepted.
- [Project API](../../packages/backend/src/compat/routes/site-configuration.ts) exposes authenticated GET/PUT /api/project/site-configuration/. Editing requires an existing administrative role, datasource ownership is checked, bodies are bounded to 64 KiB, invalid inputs return fixed validation errors, and publicationAvailable remains false.
- [Dedicated settings store](../../packages/backend/src/compat/site-configuration-store.ts) uses site_configuration:v1 under the authenticated owner. Initial insert and old-value conditional update give one winner and stale 409. Corrupt stored configuration fails opaquely instead of being treated as a missing draft. Legacy project PUT does not modify this record.
- [Backend gate](../../packages/backend/test/site-configuration.mjs) proves actual SQLite create/update races, strict validation, anonymous/viewer refusal, cross-owner and datasource isolation, body bounds and no corrupt-value leakage in responses/logs. [Mutation harness](../../packages/backend/test/site-configuration-mutation.mjs) proves all three deliberate CAS/ownership breaks are detected. Live D1/Postgres conditional-write semantics are not claimed.
- Authenticated loopback CMS on port 4389 saved USA identity/contact settings at revision 1, reloaded them and retained that revision after process restart. Stale writes returned 409 and anonymous reads 401; two existing editorial drafts remained accessible. Datasource/mappings remain incomplete. A restart-role mistake seeded a duplicate local account; exact guarded undo with a private recovery copy restored the original owner. No production data changed.

Verification: pnpm -r check and pnpm -r build exited 0; focused console tests passed 6/6; shared configuration, existing Directory, compat-security, compat-tenant-matrix (175/175) and edge-infra no-leak gates passed. Backend mutation passed 24/24 existing plus 3/3 new RED-on-break cases, then restored sources and rebuilt. Existing bundle warnings remain. The strict compat-conformance --gate probe exited 1: 248 conforms, 0 violations, 77 product-verified refusals and 9 unreachable operations. Verbose diagnosis identified three cache/queue/vector test fixture-create conflicts, four missing storage bucket fixtures, sync search-all 404 and sync test-raw 500. These are unresolved fixture/compatibility coverage, not passes; this increment does not resume CF-22. New shared API has its own focused schema/ownership gate rather than an inherited product response schema.

Private local proof/rollback files remain outside Git. Code and evidence are uncommitted on codex/wordpress-pilot; unfamiliar work is preserved. No hosted browser acceptance, page migration/linking, shared preview resolution, live query execution, publication activation or production cutover occurred.

## Page linking and shared preview delivery — 2026-10-06

- Page root siteConfiguration contains version 1 and one of seven roles only. Owner, datasource and shared revision are not copied into the page reference. [Backend validation](../../packages/backend/src/compat/directory-configuration.ts) resolves the authenticated owner's draft, verifies its datasource remains owned and refuses invalid references/bindings, missing owned settings or a simultaneous legacy copy.
- Existing Page Settings → Directory adds [linking controls](../../packages/console/src/components/builder/directory/SharedPageConfigurationPanel.tsx). An identical validated legacy copy can be explicitly converted; mismatches show diagnostics and disable automatic selection. [Conversion](../../packages/console/src/components/builder/directory/linkSharedConfiguration.ts) retains page identity, custom components and unrelated root fields. No automatic bulk migration or unapproved copy winner.
- Linked pages can explicitly add a reusable header/contact section. It binds only site name/destination and approved email/WhatsApp/directory href fields. The [canvas](../../packages/console/src/components/builder/canvas/useIframeCanvas.ts) fetches authenticated shared settings and projects these fields into a transient render request. The existing worker/SW renderer remains unchanged; saved layout keeps bindings and owner content, not resolved settings. Returning to the builder or editing reloads the shared draft. Missing/invalid settings fail closed instead of showing stale preview. Unbound custom text is unchanged.
- [Page store](../../packages/backend/src/compat/pages-store.ts) and [routes](../../packages/backend/src/compat/routes/pages.ts) refuse linking/restoring shared settings into an already-live page until explicitly unpublished. Conditional SQL also protects against a competing publish; legacy activation requires its read layout still match. Linked roles retain directory_runtime_pending. This protects the current mutable-page serving seam; it is not coherent site activation or rollback.
- Authenticated local CMS proof links the existing unapproved article draft and two new institution/program template scaffolds to shared revision 1. Saved references reload, all three render USA branding and contact links through the actual /builder/api/reRender engine, and every publish attempt returns 422/directory_runtime_pending. Original article content/IDs/slug are retained; its before-copy and proof remain private. Institution/program scaffolds explicitly say data integration pending. This is local API/renderer proof, not hosted browser or canonical editorial publication.

Verification: pnpm -r check exited 0 after rebuilding new edge-core declarations (the initial check against stale dist failed with missing exports); final pnpm -r build exited 0 with existing bundle warnings and regenerated api/cms.mjs. Console tests passed 10/10, including unchanged Directory controls and shared preview refresh/failure/no-mutation cases. Backend site-page-reference and directory-configuration gates passed; compat-wave1b passed 6/6. Final compat-security, compat-tenant-matrix (175/175) and edge-infra no-leak passed. Full backend mutation passed 24 existing + 3 shared-draft + 4 page-reference/race gates, then restored sources and rebuilt. The strict compatibility probe remains exit 1: 248 conforms, 0 violations, 77 product-verified refusals and the same 9 unreachable operations documented above. No live D1/Postgres race proof, hosted browser test, Supabase mutation, live listing query or production publish/cutover.

The previous foundation checkpoint is pushed as fd0e7b9; this page-linking increment remains uncommitted on codex/wordpress-pilot. Unfamiliar changes are preserved. Accepted release scope and CF-22 pause are unchanged.

**Next task at the page-linking checkpoint:** P2b server-enforced live collection/relationship queries and original detail-route resolution from shared mappings, using Muhlenberg institution 512/program 46188 plus a reviewed editorial slice. The query authoring boundary below advances this task; complete site publication remains P2c.

## P2b live query authoring boundary — 2026-10-06

The [registered query factory](../../packages/compiler/src/queries/directory.ts) uses the existing defineQueries contract. Saved field/table mappings become validated SQL identifiers; visitors/operators cannot supply SQL, columns, datasource, tenant or country parameters. Queries require the bound authenticated owner context, use parameterized values and bounded result projections, enforce the configured destination on records and parent institutions/cities, and resolve stored original URLs without deriving slugs from titles or parents. Detail paths with more than one match are refused. Browser registrar projections contain query metadata only.

The [authenticated preview route](../../packages/backend/src/compat/routes/directory-preview.ts) resolves the owner's shared revision and datasource through existing encrypted connected-account/runner seams. Requests and row projections are bounded, role-restricted and no-store. Stale revisions are refused before execution and checked again after execution; provider failures are opaque. This is read-only authoring: Active/Draft content may be inspected, and no public approval, canonical mutation, cache activation or publication is implied. Supported authoring roles in this increment are institution/program/city lists and institution/program details. City detail paths, latest/date/degree/intake/city filtering, editorial queries and public execution remain later work.

[Page Settings → Directory](../../packages/console/src/components/builder/directory/DirectoryQueryPreview.tsx) supplies title search, original-path detail lookup and institution-to-program navigation. Unsaved local copies do not replace the saved configuration; stale in-flight preview results are discarded. Existing custom layouts remain intact. At this query-authoring checkpoint, rows were displayed only in the settings panel; the canvas continuation below advances that boundary.

Actual local shared revision 2 maps public.institutions/programs/cities, country_id 22, identity/description/cover/logo/gallery fields and institution/city relationships. A private before-copy was preserved; existing different mappings would have been refused. Authenticated local API proof returns Muhlenberg institution 512, program 46188, the parent relationship and both exact original paths; anonymous POST returns 401. The browser exercised institution and linked-program previews through the existing builder drawer. No Supabase data, grants, setup SQL, live page or production deployment changed. Full verification results and remaining compatibility residues are recorded in the audit.

**Next task at the query-authoring checkpoint:** explicit template/canvas bindings, delivered below. Reviewed editorial data and public execution remain open.

## P2b editable canvas bindings — 2026-10-06

Existing Page Settings can append editable cards or details after a successful data preview. Existing Repeater/Container templates store a registered query ID and bounded sample parameters; child Image/Heading/Paragraph/Link components store allowlisted record-field references. Existing Properties controls edit sample search/path, card layout/columns and record fields. Custom source nodes remain intact; fetched records and credentials are never saved into the layout.

The [binding contract and projection](../../packages/edge-core/src/directory/bindings.ts) reject unknown fields/queries, nested queries, legacy query conflicts and orphan record bindings. Backend save validation requires the shared settings reference. The [canvas loader](../../packages/console/src/components/builder/directory/loadDirectoryCanvas.ts) calls the existing authenticated query preview against one saved revision, projects bounded results transiently, and renders through the existing engine. Stale/failing queries clear the preview. Text is literal and escaped; links preserve validated original paths; media requires safe HTTPS URLs. This is an authoring sample, not an approved public route or rich HTML/editorial renderer.

Actual local builder proof: institution draft e630b281-b773-422c-8924-4fbc2f77ebf3 saves an institution-card query, Muhlenberg original-path institution detail and parent-filtered program cards. Program draft bd04d978-1ae4-4876-8b31-521ad09879eb saves and reloads the original-path program detail. Both preserve their original two nodes and store no fetched descriptions. Browser renders actual institution/program descriptions, program cover and original program href. The selected institution cover field is empty in this proof; its placeholder remains a media gap. Private before/saved/proof files and p2b-program-canvas.png stay outside Git under garage-deployment. Existing scaffold placeholders are preserved intentionally. Publication remains refused with directory_runtime_pending.

Verification: final workspace check/build passed; focused console tests 18/18, core mutation 5/5 and backend mutation 37/37 passed. Core golden parity 15/15 and WYSIWYG 14/14, SQLite directory preview, page-reference, security, tenant matrix 175/175 and no-leak checks passed. The existing core mutation fixture was repaired to require compiling deliberate breaks; restoration rebuilt successfully. Strict compatibility conformance still has zero violations but nine unreachable operations, so its gate remains failed. Exact results are in the audit. No Supabase content/schema/grant changes, public deployment or release-scope change.

**Next executable task:** review and integrate one recovered article through the existing editorial authoring/public projection contracts, resolve required media/factual gaps, then implement P2c approved public queries/routes and coherent publication/cache/rollback. City details, advanced filters, hosted SEO and a second destination remain unverified. Complete P2b/P2 is not claimed; code and delivery evidence remain uncommitted after fd0e7b9.
### 2026-10-06 article authoring continuation

Optional article guard/byline/date mappings extend the same shared configuration contract; older drafts default the added fields to empty. Authenticated registered queries and reference-only article templates now load the initial canonical Supabase article in existing Page Settings and canvas preview. Actual local save/reload and restored security/mutation results are recorded in PUBLIC-RELEASE-AUDIT.md. Public execution, canonical revision editing and approval remain open; the one-site/one-engine and publication refusal boundaries are unchanged.

### 2026-10-06 canonical editing continuation

Canonical revision editing advances the preceding checkpoint: existing Page Settings now edits a bounded article draft through server-only owner/configuration/datasource scope and document compare-and-save. Original source/path/destination/date identity is immutable; prior versions are atomically archived in a private Postgres history table. A review request requires language and a note but does not approve or publish. Actual browser save/reload reached revision 2, a stale revision-1 request returned 409, and archived revision 1 preserves unchanged public content/URL/date. See the editorial model and audit for schema, permissions, exact verification and remaining compatibility residues.

Media selection, factual/language approval, public execution and coherent activation/cache/rollback remain open. Editing supports existing semantic runs, not a complete rich-text/media block editor or browser restore UI. The one-site/one-engine and directory_runtime_pending boundaries remain unchanged.

### 2026-10-06 article cover continuation

Cover selection now uses existing connected storage in Page Settings, persists cover_url/cover_alt through the canonical revision contract and projects mapped cover/coverAlt through existing Image components. Local shared revision 4 supplies these mappings. The initial article remains draft revision 2 with an unassigned cover because recovery evidence has no source URL/thumbnail ID. No automatic media substitute or public approval.

The shared picker now fetches provider-scoped bucket data, supports choosing a connection and retrying failed loading. Article mode requests configured public URLs; strict canonical validation refuses temporary signed URLs. This URL selection changes no bucket visibility/access. S3 bucket visibility metadata is not authoritative for Garage website access. Garage's S3 list returns alias names, so the three returned names must not be reported as three distinct physical buckets without internal-ID evidence. The owner confirms one bucket; the pilot uses study-in-usa-media. Folder navigation additionally avoids a second search-parameter write overwriting its path; path navigation already resets pagination.

Inline body media, complete formatting/media review, factual/language approval and P2c public execution/activation/cache/rollback remain open. Exact verification and private browser proof are in the audit.
