# WordPress pilot P0: evidence and implementation specification

**Executed:** 2026-10-05. **Baseline:** `ec17aba`, `codex/wordpress-pilot`. **Verdict:** P0 evidence/design artifacts complete, with explicit acquisition dependencies below. P1 can start with bounded reconciliation. P2 depends on acceptance and implementation of the proposed configuration/publication design. No production migration, new runtime, database write or release is completed by this report. [Work package](wordpress-pilot-p0.md), [active roadmap](wordpress-pilot-roadmap.md), [prior implementation evidence](wordpress-migration-pilot.md).

## 1. Coverage ledger and gap register

The protected evidence directory is `C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6`. `p0-evidence-manifest.json` records input bytes, SHA-256 and modification times. `p0-coverage-ledger.json` contains one row for every **1,445 captured source records**, including attachments, with source/target identity, body hash, original path, relations, asset references and independent migration/publication/verification states. Detailed recovered material stays outside Git. Reproduce with [audit-p0.py](../../scripts/migration/audit-p0.py):

```powershell
python scripts/migration/audit-p0.py --evidence-dir 'C:/Users/drmoy/.codex/visualizations/2026/10/04/01a105ea-d8e3-7251-9d16-58014053c4d6'
python -m unittest discover -s scripts/migration -p test_migration.py
```

| Input | Capture/role | SHA-256 |
|---|---|---|
| `study-in-usa-wordpress-inventory.json` | Source captured 2026-10-04 11:28:44 UTC; selected incident-time fields, not a certified clean backup | `9e6558398c7ee19e114c53c30a6c4951ccdc42acbc9192bc53fc01427921e847` |
| `p0-supabase-identities.json` | Read-only canonical identities captured 2026-10-05 05:21:00 UTC | `142b65cce5220832da85b59919395a20fa0b85f495c2a5486e13b6f2b722544d` |
| `study-in-usa-expanded-catalog-current.json` | Historical expanded selection; not original-source completeness | `f5c3b7736ea8f2376cb8233e0de506fd6b9f3061085883257f273dc97dc37b03` |
| `study-in-usa-reconciliation-current.json` | Historical comparison; current ledger recalculates identity matches | `51c1dc4e1b76e536de79190f74ce25bdfed5e147ee2c0f3ebd8325ce6772e342` |

| Source category | Captured coverage | Canonical/preservation state |
|---|---|---|
| Institutions | 18 published listings | 5 exact URL matches; 13 unresolved |
| Programs | 258 published listings | 258 exact URL matches; this proves identity, not content approval |
| Pathways | 34 published listings + 1 anomalous `published` status | 34 unmapped; anomalous record requires explicit classification |
| Articles | 957 published posts; 955 known paths | 77 private staged snapshots; 880 not staged. No dedicated public article collection found in inspected table-name/schema evidence |
| Editorial pages | 14 published; 12 known paths | 14 staged; two original paths unknown |
| Attachments | 163 inherited source records | 108 staged; 55 not staged. GUIDs are unverified asset candidates |
| Taxonomies | Observed relationship rows: region 324, listing tags 293, degree-level 293, program-category 293, start-date 648, category 957 | Row counts are term assignments, not distinct vocabulary counts or complete SEO evidence |
| Forms | Four bodies contain form shortcodes: source IDs 132, 733, 1195, 2495 | Definitions, validation, delivery and consent behavior not captured |
| Navigation/languages/downloads/commerce/member behavior | References may appear in bodies; complete configuration not exported | Coverage unknown; acquire evidence, then classify required or explicitly unused |
| Search/SEO priority | Stored paths and selected metadata available | No verified complete sitemap/Search Console/traffic baseline; do not invent traffic importance |

There are **1,278 known non-attachment paths**, four missing non-attachment paths, and zero exact duplicate known paths in this export. This does not prove absence of normalized/case/query collisions or routes outside the selected export. All ledger rows remain **publication unreviewed / verification not-run**. Prior local 310-route HTTP success is separate historical evidence.

Read-only Studygram refresh at 05:23:13 UTC: country 22 selects 10,015 programs, of which four have cover values; institution→city→country selects 231 institutions, of which three have cover values. No parent-country mismatch was observed among joined program/institution rows; that query is not an orphan check. Expanded and original coverage remain separate.

| Gap | Evidence and severity | Responsible area / next action / completion proof |
|---|---|---|
| G01-original-path | Page IDs 134, 3811; post IDs 5961, 7553 have no recovered path; launch blocker | Migration: recover permalink/rewrite/redirect evidence from source DB, backup or sitemap; record exact destination or reviewed exclusion |
| G02-canonical-listing | 13 institutions, 34 pathways and anomalous listing status; launch blocker | Migration: compare stable identities and explicit source relations; guarded imports/links with before/after hashes; never merge by title alone |
| G03-article-collection | 880 posts not staged; no reviewed canonical collection; launch blocker | Data/CMS: preserve remaining snapshots, then propose article/taxonomy/media model and import exact paths with provenance |
| G04-original-author-date | Original publication date/byline not exported; launch blocker for article fidelity | Source acquisition: export actual fields/authors; modification date cannot substitute for publication date |
| G05-asset-availability | 55 attachments not staged; 369 records reference covers/thumbnails; sparse canonical covers | Media: collect cover/logo/gallery/inline/download manifests; check ownership, MIME/size/hash/availability, safe storage and rendered binding; do not certify incident files as clean |
| G06-content-quality | Muhlenberg institution description empty canonically although source has body | Migration: field-level compare body/excerpt/facts; resolve conflicts with provenance and explicit editorial review |
| G07-site-behavior | Menus/locales/form definitions and actually used member/payment flows unknown | Source acquisition + owner review: export configuration; demonstrate required behavior or record evidence-backed non-use |
| G08-SEO | Exact paths alone do not prove metadata, indexing, structured data or internal links | Migration/renderer: canonical/title/description/robots/status/redirect/media/link ledger; acquire sitemap/search baseline where accessible |
| G09-publication-consistency | Public resolver reads mutable published-page layout | Backend/compiler: implement coherent application revision and draft/live separation before lifting directory publish refusal |
| G10-query-scope | Directory configuration is not wired to registered queries | Compiler/backend: server-owned row/field scope, bounded params, relationship/detail resolution, no browser executors or credentials |
| G11-activation/cache/upgrade | Project KV has no configuration history by itself; atomic activation unverified | Backend/edge: verify adapter CAS/transaction behavior, revision cache keys, rollback and self-host upgrade compatibility |

No live writes were performed. Recovered text/assets require review; the source export is not transaction-wide consistent. Acquiring missing evidence is an explicit P1 task, not an unexplained P0 omission.

## 2. Public data contracts and configuration/publication blueprint

### Consumer field and relation specification

Publication eligibility is separate from canonical database existence. The template uses configurable collection roles and field mappings; Studygram names/country IDs belong in configuration, not generic engine code.

| Role | Required identity/relations/public fields | Optional fields and unresolved mapping |
|---|---|---|
| Institution | Stable ID; exact source alias; name; one city reference; city→country; approved description | Cover/logo/gallery, admissions and website; verify public status and sanitization. One city can contain many institutions |
| Program | Stable ID; exact source alias; name; institution reference; approved body; city/country consistency | Degree/category/intake, requirements, tuition/currency/duration only when verified. Parent scope must be enforced server-side |
| City | Stable ID/name/country; public display facts if approved | City detail route optional; do not generate indexed pages solely because a row exists |
| Article | Stable identity/source ID; original path; title/body; actual publication date; author; editorial/publication state | Excerpt, cover/inline media, categories/tags, SEO overrides; proposed consumer model, no new table created in P0 |
| Media | Stable source/reference; approved storage URL; MIME/type; provenance/availability | Alt text, dimensions, caption and transformations; attachment GUID is not canonical route proof |
| Pathway | Stable identity/path; verified provider/institution/program relations and public content | Relationship cardinality requires source evidence; never infer commercial agreements |

Allowlisted output contains only reviewed role fields. Exclude internal agreements, personal/student data, credentials, operational notes and arbitrary source metadata. Country filters select content; they do not establish authorization. Shared Supabase may serve separately deployed sites through separately approved projections. Preserve source provenance; do not overwrite stronger canonical values merely because an incident copy differs. Unknown/conflicting rows remain unreviewed or quarantined.

### Actual implementation trace

| Existing seam | Observed behavior / implication |
|---|---|
| [BuilderHeader](../../packages/console/src/components/builder/BuilderHeader.tsx), [page slice](../../packages/console/src/stores/slices/createPageSlice.ts), [page API](../../packages/console/src/services/pages-api.ts) | Actual console save/publish uses compatibility page APIs; existing drawer is the correct admin integration surface |
| [Project routes](../../packages/backend/src/compat/routes/project.ts), [KV store](../../packages/backend/src/compat/store.ts) | Project settings use tenant-owned `settings` KV and overwrite merged JSON; no automatic configuration revision/history. Existing conditional-value update patterns are useful evidence, not a proven directory activation implementation |
| [Page routes](../../packages/backend/src/compat/routes/pages.ts), [page store](../../packages/backend/src/compat/pages-store.ts) | Publish marks the mutable page published and records page snapshots. Rollback restores a page layout, not a coherent config/query/route set. Batch route currently returns empty success results; it is not atomic site publication |
| [Published serving](../../packages/backend/src/tenancy/serving.ts) | Reads current `compat_pages.layout_data` for published pages. Saving those layouts can affect served content without another publication. Do not assume page snapshots provide draft/live separation |
| [Worker](../../examples/cf-full/src/worker.ts), [enrichment](../../packages/backend/src/compat/enrichment.ts), [data execute](../../packages/backend/src/compat/routes/data-execute.ts) | Existing renderer/enrichment and hydration data plane exist, but they do not compile this Directory contract into registered queries. Legacy query behavior is not permission to expose arbitrary directory queries |
| [Registered queries](../../packages/compiler/src/queries/defineQueries.ts), [manifest](../../packages/compiler/src/manifest/build.ts), [publish pipeline](../../packages/backend/src/publish/pipeline.ts) | Reusable compilation/public projection contracts exist. The lower-level pipeline is separate from the actual compatibility console publish route |
| [Directory validation](../../packages/backend/src/compat/directory-configuration.ts) | `directory_runtime_pending` refusal remains necessary until runtime and security acceptance are demonstrated |

### Recommended design, pending acceptance

**One self-host deployment = one project/application = one site with its own engine/worker.** USA and Hungary use separate deployments; no multi-site registry or new service/package is proposed. Cloud retains its tenant ownership envelope as additional compatibility coverage.

Use existing tenant-owned KV storage for a typed application configuration, with dedicated validated APIs inside the existing backend. Candidate keys: `directory:draft`, immutable `directory:config:<hash>`, immutable `directory:publication:<hash>`, and `directory:active`. These names and persistence semantics are proposals. Generic unrestricted project-settings PUT must not overwrite the active publication or bypass ownership/validation.

Every directory, institution, program and article layout references a role in the deployment's shared configuration. Configuration holds datasource references, configurable collections/relations, approved publication scope, route rules, branding/locales and contacts. Per-page presentation/SEO overrides cannot widen scope. Keep secrets in existing server-side secret storage.

Publish builds one immutable application artifact containing configuration revision, role/layout revisions, validated route aliases, server query registry references, public projections and metadata rules. Validate all references and collisions before activation. Write the complete artifact first, then compare-and-swap the active pointer against the expected prior revision; a lost race cannot activate a partial artifact. Verify atomic conditional updates/transaction support across supported adapters rather than assuming it. Invalidate caches after successful activation. Requests resolve one active artifact consistently; they do not assemble mixed revisions from mutable pages.

Retain existing non-directory page behavior unless separately authorized. Directory drafts must render through a distinct preview revision and cannot update the live artifact. Existing page-root configuration needs an explicit compatibility conversion to shared configuration; conflicting roots fail preflight rather than silently choosing one. Do not remove the publish guard before these paths pass.

Server query contracts enforce approved IDs/status/relations and public column allowlists. Client filters only narrow scope; unknown filters/sorts/page sizes are rejected or bounded. Original aliases take precedence over patterns for newly approved records; reject path collisions, preserve nested program URLs, define trailing slash/query semantics and explicit 301/404/410 outcomes. Cache keys include deployment/tenant, publication/query revision and normalized bounded parameters. Rollback activates a compatible prior config/layout/query/route artifact coherently and invalidates current cache entries.

**Data refresh remains a separate policy:** pinning configuration does not freeze external Supabase rows. Recommended initial policy is reviewed publication membership/content with explicit refresh/preflight for changes; truly live facts require defined refresh/invalidation semantics. P1 must choose and implement that policy before P2 claims coherent content publication.

Framework version, configuration schema version, template version and publication revision are distinct. Self-host installations receive shared framework capabilities when upgraded; automatic updating is not established. Upgrade tests must preserve owner content/settings/customized layouts, reject unsupported schemas clearly and demonstrate backup/rollback. A framework upgrade must not silently republish content or replace customized templates.

Admin UX remains in the existing console: shared application settings configured once, builder page/layout role selection, preview and publication preflight through existing controls. The present page-level Directory tab is a prototype seam, not the final shared-settings implementation. This is a decision-ready proposal; only the owner-confirmed deployment boundary is recorded as accepted architecture.

## 3. Verified real slice

| Item | Exact evidence | Outstanding prerequisite |
|---|---|---|
| Muhlenberg institution | Source 3615 → canonical 512, `/muhlenberg-college/`; city 286, country 22 | Canonical description empty; source body has 1,553 characters. Review/import content |
| Dental dual-degree program | Source 3639 → canonical 46188, `/muhlenberg-college/dual-degree-bachelor-of-science-biology-transfer-to-doctor-of-dental-medicine/` | Canonical description/requirements present; equivalence not yet checked |
| Parent and city | Source relation parent 3615→child 3639, field `program-university-link`; canonical program institution 512/city 286/country 22; city 286 = Allentown | Verify all related original programs and orphan/conflict checks before production |
| Covers | Institution source `/wp-content/uploads/2023/07/Muhlenberg-College.png`; program source `/wp-content/uploads/2023/07/Muhlenberg-College-cover.png` | Both canonical cover values blank; availability/transfer/cleanliness unverified |
| Logos | Source `Muhlenberg-College-logo.png`; canonical URL values have trailing whitespace | Normalize with provenance; verify actual asset availability |
| Article follow-on | Source post 4164, `/blog/muhlenberg-college-summer-internship-highlights-how-a-healthcare-experience-shapes-future-medical-professionals/`, thumbnail 5549 | Original date/byline, canonical collection and media availability unresolved; modified date is not publication date |

P2 must render the institution directory, institution detail with its approved program collection, and this exact program detail with parent/city links using the same configured publication revision. Search/filter/sort/pagination must work through scoped server queries. Empty results, missing parent, unknown route and unavailable assets need explicit outcomes. The subsequent article slice proves CMS editing/SEO/related links; it is not complete today.

## 4. Acceptance matrix and ordered implementation backlog

| Gate | Required assertion / owner | Status |
|---|---|---|
| Source accounting | Every captured record has identity/path/disposition/provenance; missing source categories have acquisition tasks / migration | Ledger 1,445/1,445 generated; publication review and missing acquisition remain |
| Analysis correctness | URL identity does not approve content; asset GUID cannot invent permalink; duplicate source IDs fail / migration | Python suite 17/17 passed |
| Self-host lifecycle | Save/reload shared config, preview draft, publish complete revision; all roles use it; draft edits leave live unchanged / console+backend | Planned P2; current mutable-layout gap open |
| Queries/isolation | Forged params cannot widen membership/fields; cross-owner datasource rejected; parent programs cannot leak; browser/SW no executors/secrets / compiler+backend+edge | Existing guards retained; new runtime gates not run |
| Routes/SEO/media | Exact original routes, canonical/status/redirect semantics, SSR content/head, internal links, verified covers/inline assets / renderer+migration | Historical listing HTTP checks only; full equivalence pending |
| Revision/race/rollback | Concurrent activation has one winner; no mixed roles; cached old responses invalidated; rollback restores coherent prior artifact / backend+edge | Planned; adapter behavior unverified |
| Reuse | Separate Hungary deployment configures the same implementation without source edits; cannot access USA deployment settings / self-host | Planned second deployment; Cloud ownership tests remain additional |
| Upgrade | Shared framework update preserves saved configuration/content/layout customizations; schema/template adoption and rollback explicit / packages+self-host | Planned; no automatic-update claim |
| Operational cutover | Forms/CTAs, security gates, cache/load, backup/restore, final source delta and rollback rehearsal / deployment | P3–P5, not executed |

Ordered tasks:

1. **P1a — source completion:** migration tooling acquires missing paths/authors/dates and navigation/forms/locales evidence; preserve remaining 880 article and 55 attachment snapshots privately. Completion: hashed source coverage and explicit unknown/non-use decisions.
2. **P1b — original identity reconciliation:** guarded institution/pathway linking/import, anomalous-status review and relation/orphan checks. Completion: all original listings accounted for with reviewed mappings, no title-only merges.
3. **P1c — publication model:** specify reviewed membership/content refresh policy, article/taxonomy/media collections and public projections. Review proposed schema/write plan before migration; do not change internal commercial relationships. Completion: actual slice has approved content/relations/assets and reproducible import evidence.
4. **P2a — accept/configure application contract:** existing edge-core contract, backend KV/API and console shared settings; add role references and explicit page-root compatibility. Completion: persistence/validation/ownership/upgrade cases pass. Record accepted architectural choice in decisions before implementation.
5. **P2b — compile/serve slice:** existing compiler registry, backend approved-query execution and edge runtime route/detail rendering. Completion: Muhlenberg slice reads real approved data with bounded server scope and browser projection checks.
6. **P2c — coherent publish:** immutable artifact, verified CAS activation, preview/live separation, cache revision and rollback. Completion: race/draft/rollback tests plus existing security mutation/conformance gates; only then consider lifting `directory_runtime_pending`.
7. **P2d — deployment/reuse proof:** independently configured USA and second self-host instance of the same implementation, then Cloud compatibility tests. Completion: real host evidence, not fixture-port screenshots.

Verification this execution: `pnpm -r check` and `pnpm -r build` exited 0; existing bundle warnings remain. Migration Python suite passed 17/17. Build refreshed tracked `examples/cf-full/api/cms.mjs`. No provider deployment, production HTTP equivalence, new runtime isolation/mutation gates or upgrade tests were run; no runtime security behavior changed. Previous focused runtime evidence remains in the historical pilot document and is not a substitute for the planned gates.

**Next executable task:** P1a source completion and P1b identity reconciliation, beginning with source evidence acquisition and reviewed Muhlenberg field comparison. Storage/publication design is ready for owner review; P0 does not silently accept it or begin an uncontrolled feature sprint. R0 remains in progress, CF-22 remains paused, and public release scope is unchanged. P0 tooling/report and supporting plan/audit changes are uncommitted; unrelated work is preserved.
