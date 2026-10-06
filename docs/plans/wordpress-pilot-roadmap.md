# WordPress pilot: north star, progress and execution order

**Updated:** 2026-10-06. **Active plan:** this document supersedes earlier next-task ordering in individual delivery reports. **Pilot:** study-in-usa.com. **Branch:** codex/wordpress-pilot; pushed baseline ec17aba, substantial subsequent work remains uncommitted. This is a pilot plan, not a production-readiness or framework-release declaration.

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
| Editorial | 971 private conversion drafts, 967 evidenced paths, dates/bylines/taxonomy/SEO evidence retained. Two examples saved/read back as unpublished layouts through actual local CMS APIs. [Editorial](wordpress-pilot-editorial-model.md) | Partial: conversion is not a finished rich-text CMS. Canonical editorial storage, authenticated editing, forms/media/factual approval and coherent publication remain open. |
| Templates/admin | Registered editable directory, relational browsing, Image primitives and editorial adapter reuse existing components. Directory settings use existing admin/page APIs; two editorial drafts exist in actual /frontbase-admin. [P0 trace](wordpress-pilot-p0-results.md) | Partial: page-scoped prototype settings need one deployment configuration; live role bindings/collection editing remain incomplete. |
| Live publication | Configuration validation/ownership checks exist; directory publication refuses with directory_runtime_pending. | Main integration gap: live approved queries/detail routing, coherent activation, revision caching/rollback and published-host SEO proof. |
| Reuse/operations | Six-package/one-engine architecture retained; prior security/conformance evidence recorded. | Separate destination, upgrades, deployed load/cache/forms/full restore and cutover not demonstrated. |

Port 4387 is a snapshot preview, not live Supabase sync. Port 4388 was a fixture controls/persistence harness. Port 4389 is the authenticated local full CMS with connected storage and two editorial drafts. None is a production migration. Saved static layouts do not prove shared collection editing or dynamic publication.

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

**Next executable task:** validated page-role references, explicit migration diagnostics for existing page-root copies and shared builder-preview resolution, preserving custom layouts. No new infrastructure or owner data input is needed for that boundary. Live query integration/coherent publication follow; a staging target is needed later for hosted proof. No production cutover or public/Cloud release-scope change.
