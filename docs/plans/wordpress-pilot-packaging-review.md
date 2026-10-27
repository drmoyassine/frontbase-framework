# Pilot packaging inventory

**2026-10-13 admin delivery:** [Pages/Settings receipt](wordpress-pilot-pages-settings-delivery-20261013.md) records the deployed unified inventory, cards/list, owner-scoped folders, truthful capture status, recoverable development-draft cleanup and General/Template field organization. Publication491deec1… generation12/configuration4 and canonical data stay unchanged. Source/docs uncommitted; existing public-release/installer/cutover gates and deferred URL-parent/branding/source-origin work remain unchanged.

**Homepage addition:** [Delivery](wordpress-pilot-homepage-delivery-20261012.md) keeps validated public settings/tokens, browser initializer, guarded saves and reviewed-base capture mechanics in reusable engine/admin surfaces. The education landing factory/copy/cards/presets belong to the template; country/contacts/media/configuration/captures remain site data. The current source export and live pilot are verified; a general production installer is still unclaimed.

## 2026-10-12 boundary review

The classification review is complete for the USA launch scope. This is a recommendation about ownership and an inventory of current coupling, not a claim that the reusable education template is production-installable. The deployed pilot reuses the existing engine and `/frontbase-admin`; it does not introduce another admin app, renderer or framework package.

| Keep in Frontbase core | Package with the education template | Configure for each deployment |
| --- | --- | --- |
| Engine/compiler/components; Repeater and bindings; auth and connection ownership; safe datasource/storage adapters; semantic editorial projection; immutable chunks/manifests; review, conditional publication and recovery mechanisms; shared builder/table/theme controls | Editable directory, institution, program, article/index and ordinary-page layouts; education collection/parent mapping defaults; education query profile, country-filter defaults and suggested contact presentation | Site identity/domain, country selection, datasource and column mappings, connected storage/public media base, original URL ledger/redirects, contact destinations and publication choice |

Studygram rows, provider relationships, WordPress imports/provenance, article approvals, actual captures, users, credentials and backup state are consumer data/operations. None belongs in a distributable template. Garage is optional connected storage; the template must not embed its hostname, bucket or keys. The one-site-per-self-hosted-engine model and six-package architecture remain unchanged.

Current source placement is not fully separated: `packages/edge-core/src/directory/` contains education configuration, query and layout contracts, while `packages/backend/src/compat/` contains their education-specific projection/preparation alongside reusable publication primitives. Existing saved layouts and schema/query IDs depend on these contracts. Moving them without a compatibility/version plan would break the pilot; no extraction or schema rename is performed here.

The existing `examples/education-template-proof` export/install/recovery implementation remains a design prototype. Read-only artifact/preflight checks and single-page guarded changes are implemented, but they do not establish a production multi-page installer, durable install journal, registry/UI, a fresh Hungary deployment or customization-preserving upgrades. Those are template-product acceptance work, separate from validating this restored USA site. The earlier acceptance list below applies to that future installable product, not an additional USA content-review queue or authorization to start another feature sprint.

The [execution plan](wordpress-pilot-execution-plan.md) owns the finite staging → owner-approved cutover sequence. No general public-release gate or paused CF-22 work is closed by this classification.

## Historical 2026-10-07 inventory

The following assessment predates the deployed staging acceptance; its installer acceptance requirements remain relevant to that future product. Its then-current pilot readiness/next-task statements are historical.

**2026-10-07 — provisional inventory, not a completed installable template.** The owner requires a final core/template/consumer review when the pilot work is complete. This inventory makes that review executable without treating current source placement as its outcome.

Use [T2/T6 in the roadmap](wordpress-pilot-roadmap.md) and the [parallel handoff](wordpress-pilot-parallel-handoff.md) to claim extraction/presentation work. No installable export, additional package or final ownership decision is delivered. A second session can inventory coupling and polish layouts without changing the shared publication contract; extraction across those shared files needs explicit coordination.

| Surface | Proposed home | Evidence / remaining decision |
|---|---|---|
| Authentication, datasource ownership, connected accounts/storage, secret handling | Core | Existing framework contracts; retain provider-neutral connection flows |
| Expected-revision settings, immutable captures, review metadata, conditional activation and recovery | Core mechanism | [Publication evidence](wordpress-pilot-publication.md); reviewed reader/public host dispatch implemented, activation HTTP controls and deployed acceptance pending |
| Safe semantic text projection and optional hiding of absent record images | Core component/binding capability | Existing component engine and Properties; evaluate generic naming during extraction |
| Fixed country filters, institutions/programs/cities mappings, parent relationships and education query IDs | Education template/profile | Currently under core directory subpaths; extraction/versioning must preserve saved contracts |
| Directory, institution, program, article-index and article layouts | Installable education template | Editable saved layouts exist; production styling/accessibility/SEO acceptance pending |
| Country, branding, original route identities, datasource and storage references, contact destinations | Deployment configuration | One deployment/site; USA and Hungary must configure independently without source edits |
| Studygram canonical tables/provider IDs, ELS naming, editorial import/history, WordPress recovery scripts | Consumer data/migration | Preserve Supabase ownership; never manufacture provider relationships or bundle recovery data |
| Garage deployment, keys, bucket and migrated images | Consumer operations/configuration | Core owns the storage adapter; template must not require Garage or ship credentials |

Final acceptance requires: clean install into a fresh self-hosted site, a second country configured through existing admin, exported templates without credentials/private rows, versioned compatibility and upgrade proof, migration/route conflict reporting, and a documented list of remaining core profile coupling. Keep six packages and one engine. No additional package or architectural extraction is accepted by this proposal.

The pilot is not ready for cutover. Public framework release remains separately gated by R0; CF-22 stays paused.
