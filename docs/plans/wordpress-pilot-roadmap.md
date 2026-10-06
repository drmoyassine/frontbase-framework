# WordPress pilot: north star, progress and execution order

**Updated:** 2026-10-06. **Active plan:** this document supersedes earlier next-task ordering in individual delivery reports. **Pilot:** study-in-usa.com. **Branch:** codex/wordpress-pilot; pushed shared-settings foundation fd0e7b9, subsequent work remains uncommitted. This is a pilot plan, not a production-readiness or framework-release declaration.

## North star

A self-hosted owner can connect a database and file storage, choose a reusable template, configure its content and relationships in /frontbase-admin, edit it, preview it and publish a secure site on their domain—without editing framework source. Their site and customizations survive a verified framework upgrade and can be rolled back.

The USA migration proves this with real data, existing public URLs and meaningful relationships. A separately configured Hungary deployment proves reuse. The result must become Frontbase capability, rather than a USA-specific application assembled by migration scripts.

One self-host deployment is one site/application with its own engine/worker, configuration, domain and publication state. Separate destinations reuse the implementation through separate deployments. Shared Studygram Supabase data and connected Garage storage do not merge deployment settings or permissions. Cloud tenant compatibility remains relevant under its existing topology; dedicated Cloud worker provisioning is not assumed.

## Outcomes

| Outcome | Acceptance |
|---|---|
| Faithful migration | Every original public WP record/URL has a reviewed canonical destination or explicit disposition. Supabase supplies authoritative content; WP supplies original URL identity and gap evidence. Content, relations, assets and SEO behavior are checked, not inferred from row counts. |
| Reusable Frontbase product | Existing admin configures data, filters, fields, relationships, layouts, routes, media and CTAs. One deployment-wide configuration governs all page roles. USA and a second deployment save/preview/publish through the same implementation without source edits. |
| Operable replacement | Deployed security, SEO/indexing, cache/load, forms, backup/restore, upgrade and rollback gates pass. Production cutover follows final source-delta reconciliation and a verified recovery path. |

URLs alone do not establish SEO fidelity; content, HTTP status, canonicals, indexing and links also matter. There is no ranking guarantee. Additional Supabase records are intentional expansion, not WP gaps. Database existence or an Active institution does not approve its public page, linked Draft programs or sitemap membership.

## Progress as of 2026-10-06

Recorded verified results below are not a fresh live database audit.

| Workstream | Proven result | Status / remaining gap |
|---|---|---|
| Source recovery | All 1,445 captured records privately preserved: 311 listings, 957 articles, 14 pages, 163 attachments. Enrichment includes dates/bylines, menus and form UI. [P1 evidence](wordpress-pilot-p1-results.md) | Captured preservation complete; source completeness/final delta and four editorial paths remain open. Recovery files are not certified clean. |
| Original listing identity | 18 institutions, 258 academic programs and 34 normal pathways map canonically; all 310 original listing paths pass locally. [Harmonization](wordpress-pilot-harmonization.md), [refresh](wordpress-pilot-garage-storage.md) | Normal identity coverage complete; anomalous-status source listing remains unapproved. Field/content/SEO acceptance remains open. |
| Canonical harmonization | Existing institutions/programs/cities/countries retained. Twelve ELS-scoped campuses and 34 linked Draft courses added; field/status/provider/city corrections verified. ELS umbrella source 3458 maps to institution 852. [Evidence](wordpress-pilot-harmonization.md) | Partial: center descriptions still contain host-university text; availability, pricing units/admissions and other field gaps need review. |
| Catalog preview | Latest narrow snapshot: 243 institutions, 10,049 programs, 190 cities. Projection: 10,478 directory listings, zero detected relationship issues; four catalog rows excluded. [Refresh](wordpress-pilot-garage-storage.md) | Offline only. Expanded records are not automatically approved for indexing/publication. |
| Connected media | Garage works through encrypted existing S3/storage seams. Twelve reviewed images referenced canonically: eleven ELS covers and one Muhlenberg program cover. Signed/public MIME/exact-byte checks passed. [Storage](wordpress-pilot-garage-storage.md) | Partial: remaining covers/gallery/inline/downloads, alt fidelity and browser upload CORS open. Full-volume off-server backups owner-deferred; still required for production readiness. |
| Editorial | 971 private conversion drafts, 967 evidenced paths and two existing CMS examples. Consumer canonical draft/evidence tables now store one article with guarded retry/conflict behavior; existing Data Studio API reads it. [Editorial delivery](wordpress-pilot-editorial-model.md#canonical-draft-initial-import--2026-10-06) | Partial: article template bindings, revision editing, forms/media/factual approval, remaining canonical imports and coherent publication remain open. |
| Templates/admin | Versioned owner-scoped shared settings, page-role links and editable query-bound cards/details use existing admin/page APIs and renderer. Local revision 2 maps Studygram USA data; actual institution/program drafts save and render live data with original paths. [Delivery](wordpress-pilot-p2a-contract.md#p2b-editable-canvas-bindings--2026-10-06) | Partial: canonical editorial integration, approved public route execution and coherent publication remain incomplete. |
| Live publication | Configuration validation/ownership checks and bounded authenticated query/detail resolution exist; directory publication refuses with directory_runtime_pending. | Main integration gap: approved public execution/detail routing, coherent activation, revision caching/rollback and published-host SEO proof. |
| Reuse/operations | Six-package/one-engine architecture retained; prior security/conformance evidence recorded. | Separate destination, upgrades, deployed load/cache/forms/full restore and cutover not demonstrated. |

Port 4387 is a snapshot preview, not live Supabase sync. Port 4388 was a fixture controls/persistence harness. Port 4389 is the authenticated local full CMS with connected storage and two editorial drafts. None is a production migration. Saved static layouts do not prove shared collection editing or dynamic publication.

**Current next task:** bind the stored semantic article to the reusable builder template, then implement expected-revision editing/review and required media/factual checks. P2c approved public queries/routes and coherent activation/cache/rollback follow. Editable directory canvas bindings and canonical initial storage do not complete the published directory.

## Reorganized milestones

Keep phase IDs for traceability. P0 evidence/design is delivered; proposed durable configuration/activation mechanics still need acceptance. P1 is partly delivered. **P2 is the next main implementation milestone.** P1 continues to support its reviewed slice and later complete coverage.

| Phase | Deliverable and exit gate | Current status |
|---|---|---|
| P0: truth/design | Coverage ledger, architectural trace, configuration options and acceptance matrix; select and record durable design before implementation. | Evidence/design delivered; persistence/activation choice pending. [P0](wordpress-pilot-p0-results.md) |
| P1: trustworthy data | Original identities plus reviewed fields/assets/editorial and public projections. Correct parents/cities; repeat imports create no duplicates; no unexplained slice gaps. | Preservation/normal listing identities complete; content/media/eligibility partial. |
| P2: one complete site journey | Configure in existing admin; bind a real institution/program pair and one article; save, preview, publish to isolated staging, update and roll back. One shared configuration; original URLs; bounded server queries; no draft/secret leaks; coherent revision/cache activation. | Next milestone. Keep directory publication refusal until real acceptance passes. |
| P3: complete USA | Approved directory/details, articles/taxonomies, essential pages/media and working CTAs/forms. Every original URL has reviewed content/status or redirect/removal; search/filter/navigation, mobile/accessibility and SEO checks pass. | Foundation only; not complete. |
| P4: reuse/operations | Separate Hungary deployment without source edits; no cross-deployment settings/content/cache leakage. Upgrade/customization/rollback, restore, load/cache and form delivery proven. | No end-to-end deployment proof yet. |
| P5: cutover | Final source delta, domain switch and monitored recovery rehearsal. No unexplained omissions; required workflows and backup/rollback executable; live-host checks pass. | Not authorized/executed by this replan. |

## Next work package: complete P2a–P2c

The next deliverable is a complete small site journey, not another standalone import or polished snapshot.

1. **Checkpoint and choose the configuration contract (P2a).** Separate pilot-owned diffs from unfamiliar concurrent work and prepare a reviewable baseline. Trace existing tenant-scoped project KV/settings and actual compat page/query publication paths. Specify configuration ownership/history, page references, migration from page-root prototypes, route collisions and revision activation. Record the selected durable choice in DECISIONS.md before implementing it. No multi-site registry or silently accepted new storage design.
2. **Connect shared admin configuration and bounded data bindings (P2a/P2b).** Existing /frontbase-admin owns database/storage selection, country scope, role/field/relationship mappings, aliases, templates and branding/CTAs. Verify save/reload and propagation across directory/institution/program/editorial roles. A country filter does not establish authorization.
3. **Supply one reviewed slice (P1 supporting P2b).** Use established Muhlenberg institution/program identities plus one reviewed article. Resolve required fields/media and approved facts. Review the smallest consumer editorial schema/write/public projection needed against current Supabase/RLS. Do not add parallel institution/program tables, bulk create 971 static pages or expose recovery metadata. Source chronology/form/content concerns stay visible.
4. **Finish coherent publication (P2c).** Use existing compiler/backend/engine query/route seams with bounded parameters and allowlisted output. Define content refresh/approval policy and bind consistent configuration/template/content versions. Verify draft/live separation, races, cache invalidation and rollback. Remove directory_runtime_pending only when runtime acceptance passes.
5. **Demonstrate isolated staging.** An administrator configures/edits; visitors see the approved version on original URLs; an update and rollback work; unauthorized requests cannot widen scope or expose secrets. Record actual host/commands/results/skips. Then scale the same flow across P3 content.

Design for second-destination configuration now; prove it in a separate P4 deployment. Wider catalog expansion and visual polish follow the working flow. Reproducing the WP theme, a new bespoke admin, unrelated builder redesign, plugin compatibility/marketplace and broad competitor parity are outside this increment. Essential source commerce/membership behavior, if established by evidence, becomes a scoped launch requirement.

## Ownership and architectural boundaries

- Migration tooling owns extraction, identity/provenance, sanitation, idempotent imports and transfer manifests. Private recovered bodies/credentials stay outside Git; scripts do not become the production CMS.
- Studygram owns canonical content and consumer editorial schema. Supabase populated content wins; WP paths remain. Internal providers/CRM agreements are not public fields and are never inferred from public posts.
- Media uses administrator-connected storage. Garage is the pilot choice, not a required framework service; its public bucket contains reviewed public assets only.
- Existing console/builder/backend own configuration, templates and editing. Existing compiler/backend/engine/edge-infra own query, routing and publication. Preserve six packages and one engine.
- Institution → many programs; institution → one city; city → many institutions. Keep source aliases separate from IDs; no title-only campus/provider merges.

Follow [registered queries](../history/DECISIONS.md#decision-a-16-registered-query-authoring-model-settles-chm-4), [compiler contracts](../../packages/compiler/src/queries/defineQueries.ts), [manifest assembly](../../packages/compiler/src/manifest/build.ts), [actual page APIs](../../packages/backend/src/compat/routes/pages.ts) and [project settings](../../packages/backend/src/compat/routes/project.ts). The separate low-level publication pipeline is architectural evidence, not proof that current Directory controls already integrate it.

Controls alone are not an end-to-end feature; a table is not editorial editing; a saved layout is not destination reuse. Prove persistence, authorization, runtime and publication for each reusable capability. Shared framework upgrades remain the self-host path, but automatic installation/compatibility/rollback are not proven by this pilot.

## Verification and handoff

Code work requires pnpm -r check/build, focused tests and existing security mutation/conformance/no-leak gates when their surfaces change. Run source mutation harnesses sequentially with builds and verify restoration; unreachable credential-dependent fixtures are not passes. Documentation-only planning checks links/whitespace and retains previous code evidence as historical.

Published-host acceptance covers paths/status, canonical/title/description/robots/sitemap, body/headings/internal links, media/alt and language/social/structured signals where used. Cache policy must respect approved version, destination and permissions, with measured TTL/invalidation/resource budgets. WhatsApp/mailto links do not prove form consent/delivery. Container persistence does not prove off-server full recovery.

Use this roadmap for current order; use [migration history](wordpress-migration-pilot.md), [P0](wordpress-pilot-p0-results.md), [P1](wordpress-pilot-p1-results.md), [harmonization](wordpress-pilot-harmonization.md), [editorial](wordpress-pilot-editorial-model.md), [storage](wordpress-pilot-garage-storage.md) and [audit](../history/PUBLIC-RELEASE-AUDIT.md) for exact historical results/residuals.

Frontbase public-framework release and paid Cloud keep their own gates. R0 remains in progress; CF-22 stays paused; no GA, full competitive parity or dedicated Cloud worker capability is claimed. [Release strategy](../history/PUBLIC-RELEASE-STRATEGY.md) is unchanged.

**P2a preparation delivered:** [shared configuration/publication contract and checkpoint ownership](wordpress-pilot-p2a-contract.md). The trace identifies mutable live page serving, unrestricted legacy project merging, missing settings CAS and public title/name fidelity as explicit integration tests. The new contract proposes dedicated settings keys/subresources under the existing project owner, not a new site registry. Private candidate copies/hash inventory are a review checkpoint, not a Git commit or full-file ownership approval.

**P2a shared authoring foundation delivered:** existing Settings → General saves one strict project-owned Directory draft with conflict-safe revisions. Authenticated local CMS save/reload/restart, SQLite race/isolation tests, console tests and 27 backend mutation cases passed; workspace check/build passed. Full compatibility conformance remains incomplete (0 violations, 9 unreachable fixture/operation paths). See [exact delivery and residuals](wordpress-pilot-p2a-contract.md#shared-authoring-foundation-delivery--2026-10-06). This is authoring persistence; existing pages still retain separate configuration and publication is refused.

**P2a page linking and preview delivered:** seven strict owner-implicit roles, explicit identical-copy conversion/conflict diagnostics and shared-settings canvas projection through the existing renderer. Custom layouts/URLs remain intact. Actual local institution/program/article drafts share revision 1 and refuse publication; institution/program drafts are scaffolds with live data pending. Console tests 10/10, workspace check/build, 31 mutation checks, page/security/tenant/no-leak gates passed. Strict compatibility coverage remains incomplete with the same nine unreachable operations. See [exact evidence](wordpress-pilot-p2a-contract.md#page-linking-and-shared-preview-delivery--2026-10-06).

**P2b query authoring delivered:** registered bounded institution/program/city lists and institution/program original-path details use saved mappings and the existing datasource runner. Fixed destination, parent/city boundaries, owner context and revision checks are enforced server-side. Actual local Muhlenberg institution/program reads and relationship navigation work in Page Settings → Directory. See [exact evidence](wordpress-pilot-p2a-contract.md#p2b-live-query-authoring-boundary--2026-10-06).

**P2b canvas increment delivered:** existing editable components bind to registered queries and allowlisted record fields. Saved drafts contain references, preserve custom nodes and render transient data through the existing engine. Actual institution cards/detail/linked programs and a program detail save/reload successfully. Program cover appears; institution cover remains missing in the selected field. Console 18/18, core mutation 5/5, backend mutation 37/37 and workspace check/build passed; nine strict compatibility coverage residues remain open. See [exact evidence](wordpress-pilot-p2a-contract.md#p2b-editable-canvas-bindings--2026-10-06).

**Editorial initial storage delivered:** one canonical article draft in Studygram, with semantic body/original path/dates/byline/taxonomy, private evidence and no browser access. Initial import preserves existing values on identical retries and refuses source/path/content conflicts. Existing Frontbase Data Studio API reads the row. Migration tests 42/42 and workspace check/build passed; direct Postgres deny/read/no-op/conflict checks passed. See [exact evidence](wordpress-pilot-editorial-model.md#canonical-draft-initial-import--2026-10-06).

**Next executable task:** registered article queries/semantic canvas bindings and expected-revision editing/review, then required media/factual checks and P2c coherent publication. A staging target is needed later for hosted proof. New linking/query/canvas/import work is uncommitted after pushed checkpoint fd0e7b9. No production cutover or public/Cloud release-scope change.
### 2026-10-06 continuation checkpoint

Delivered article authoring query/template preview through the existing admin and one engine, verified against the initial canonical Supabase article and a separate local saved draft. Fixed builder toolbar overlap across phone/tablet/desktop widths and aligned responsive drawers. See PUBLIC-RELEASE-AUDIT.md for exact tests, private proof names and unchanged nine strict conformance fixture residues. P2b remains open for expected-revision canonical editing/review, media and factual approval; P2c public execution/cache/rollback/SEO has not begun. No bulk blog import, public cutover or release-scope expansion.

### 2026-10-06 canonical editing checkpoint

Expected-revision canonical article editing and requesting review are delivered in existing Page Settings. Actual review-note-only save/reload advanced the initial draft to revision 2; revision 1 is privately archived and stale saves are refused. Identity, original URL/date and draft-only status are protected. Workspace check/build, 13 focused console tests, 44 backend mutation checks and six infrastructure mutation checks passed; nine existing strict conformance residues remain open. This completes the editing increment, not P2b or launch.

**Next executable task:** integrate reusable article media selection through administrator-connected storage and resolve explicit factual/language review. Then implement approval/public projection, P2c coherent site activation/cache/rollback, hosted URL/SEO acceptance and a second-country configuration proof. Rich block editing and an administrator recovery UI remain follow-up work. No new staging/cutover date is committed; work remains uncommitted after fd0e7b9 and public-release scope is unchanged.

### 2026-10-06 cover authoring checkpoint

Connected-storage article cover selection, alt text and expected-revision draft persistence are delivered. Cover/alt mappings use existing Image components and one-engine preview; private snapshots recover prior cover values. The shared file picker now actually loads buckets and supports connection selection/retry. The initial article has no recovered source cover reference, so its cover remains unassigned. No automatic replacement or approval.

**Next executable task:** explicit article factual/language review and approval criteria, including the original-date/event chronology conflict, missing source media and formatting fidelity. Then implement approval/public projection and P2c coherent activation/cache/rollback; hosted SEO/URL acceptance and second-country reuse remain launch prerequisites. Inline body media and a browser recovery UI remain follow-up work. No public activation or release scope change.
