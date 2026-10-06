# P0: baseline and design work package

**Date:** 2026-10-05. **Status:** executed as an evidence/design work package; [results, gaps and implementation specification](wordpress-pilot-p0-results.md). Missing-data acquisition and proposed architecture acceptance remain explicit dependencies; migration/runtime implementation is not complete. **Parent:** [active pilot roadmap](wordpress-pilot-roadmap.md). **Baseline:** `ec17aba` on `codex/wordpress-pilot`; [historical source and verification evidence](wordpress-migration-pilot.md).

## Objective

Primary acceptance target is one self-hosted deployment per site/application, with its own engine/worker, domain bindings, administration, configuration and publication state. USA and Hungary use separate deployments of the same reusable template/framework, not a multi-site router inside one self-host installation. Cloud multi-tenant deployment remains a compatibility target; this pilot does not add dedicated-worker provisioning to Cloud. Reusable functionality belongs in the shared implementation without Cloud billing, signup or hosted-control-plane dependencies.

Make the USA migration and reusable template implementation decision-ready. P0 must answer: what must be preserved, what is missing, how all site pages share configuration, how that configuration reaches the existing published runtime, and what proves the implementation correct.

P0 delivers four artifacts: a coverage ledger and gap register, a site-wide configuration/publication blueprint, a real vertical-slice specification, and an acceptance matrix with an ordered P1/P2 implementation backlog. P0 does not import the remaining data, build the live runtime, finish the template, or switch production traffic.

## Task sequence

| Task | Actions | Output and completion evidence | Dependency |
|---|---|---|---|
| P0.1: establish evidence baseline | Inventory protected exports, capture times, hashes, schema/identity/catalog snapshots and source completeness. Distinguish incident copies from established clean backups. Refresh read-only database evidence where necessary. | Evidence manifest identifying each input, capture time, checksum, coverage and limitations; reproducible commands without credentials. | Existing source access. |
| P0.2: construct coverage ledger | Enumerate source listings, posts, editorial pages, taxonomies, media/downloads, languages, navigation, forms and any actually used commerce/member behavior. Join source identity to canonical IDs and exact original paths; compare records and relationships. | One ledger with every observed source record/URL, separate inventory status for each source category and a linked gap register. Counts reconcile to the captured source, not an arbitrary expanded catalog count. | P0.1. |
| P0.3: define publication data contracts | Specify required/optional fields, entity identity, parent/city relationships, article/media/taxonomy roles, public field allowlists and source-of-truth rules. Identify gaps in current tables without changing them. | Field/relation mapping matrix; reviewed projection requirements; proposed consumer schema/import tasks, with source provenance and conflict rules. | P0.2; inspected Studygram schema. |
| P0.4: trace Frontbase lifecycle | Trace actual admin edit/save/preview/publish/read/rollback paths, tenant/project/domain ownership, query registration/execution and cache invalidation. Separate implemented behavior from proposed wiring. | File/API/contract map showing the exact reuse seam and any missing integration. No assumption that a low-level pipeline already serves the compatibility console. | Repository inspection; can start alongside P0.1–3. |
| P0.5: specify site-wide configuration | Evaluate identity/persistence candidates; define versioning, page references, layout roles, routes, scope, public query projection and compatibility from page-root configuration. | Decision-ready blueprint, tradeoffs, proposed decision text and migration/rollback behavior. Record accepted architecture in the canonical log only after the choice is accepted. | P0.3–4. |
| P0.6: choose the real slice | Verify one original institution, its city and original linked programs; select usable source content/media; add a representative original article for the subsequent CMS slice. | Exact source/target IDs, URLs, selected fields/assets, expected navigation and unresolved prerequisites. Fixture data cannot count as original-site proof. | P0.2–3. |
| P0.7: define tests and implementation backlog | Map success/failure cases to execution host, assertions, owning existing package and prerequisites. Split P1/P2 into bounded changes ordered by dependencies. | Acceptance matrix, P1/P2 task list and readiness verdict with evidence links. Provider/credential skips stay visible. | P0.5–6. |

The assistant owns technical inventory, reconciliation analysis, repository tracing, specifications and proposed tests. The owner resolves business/editorial ambiguities that evidence cannot settle: intentional removal, authoritative conflicting content, actual commercial/provider relationships, essential form behavior and final architectural choices. Collect those issues into one review register rather than interrupting for each routine mapping choice.

## Artifact 1: coverage ledger and gap register

Store raw source data, content bodies, connection details and detailed exports in the existing protected evidence directory outside Git. Commit the ledger schema/tooling and redacted summaries, not private recovered material. Begin with existing inventory/reconciliation scripts; record extensions needed for pages, posts, assets and SEO rather than replacing working tooling.

Each ledger record must capture:

- Identity: source origin, source type/ID/status, capture and source dates, source hash, target collection/ID and match evidence.
- URL: exact original URL/path/query behavior, intended canonical, target path, aliases, expected HTTP status and redirect/removal decision. Missing paths are explicit unknowns.
- Content: title, meaningful body/excerpt, dates/byline, taxonomies, SEO fields and whether each is present, missing, conflicting or unverified. Store references/hashes instead of raw bodies in shareable reports.
- Relations/assets: expected institution/city or other source relationships, cover/logo/gallery/inline media/download references and availability/provenance checks.
- Workflow: source coverage class, migration disposition, publication eligibility, priority, linked gap ID, owner, next action and evidence reference.

Use independent states: `migration_disposition` = matched/missing/stale/duplicate/conflicting/excluded/unsupported; `publication_eligibility` = approved/quarantined/unreviewed; `verification` = verified/failed/not-run. An exact URL match is not content approval or a passing SEO test. Distinguish absence established by source evidence from data that was not exported.

Separate source coverage into **original WP**, **expanded catalog** and **reuse fixture**. Do not mix their totals. Recorded starting gaps include 13 institution mappings, 34 pathway mappings, two missing article paths, original article dates/bylines, most covers and incomplete city/field quality. Revalidate these counts against the P0.1 baseline before treating them as current.

Prioritize exact original listing URLs and known search landing URLs first; include all inventoried articles and other legitimate public routes in the migration plan. If Search Console/log/sitemap evidence is unavailable, mark search-priority unknown and use source coverage as the initial priority—not invented traffic estimates.

The gap register records gap ID, affected records/routes, evidence, severity, dependency, responsible area, next action and completion proof. Missing content/assets can remain unresolved at P0, but every gap needs an executable P1/P3 task. Suspected injected/spam material is quarantined with evidence and a review action.

## Artifact 2: configuration and publication blueprint

First inspect [project settings](../../packages/backend/src/compat/routes/project.ts), [actual console page routes](../../packages/backend/src/compat/routes/pages.ts), [current directory contract](../../packages/edge-core/src/directory/configuration.ts), [publication refusal](../../packages/backend/src/compat/directory-configuration.ts), [registered queries](../../packages/compiler/src/queries/defineQueries.ts) and [manifest assembly](../../packages/compiler/src/manifest/build.ts). Trace relevant stores, providers, route resolution and cache code from those entry points; record what is actually called.

The blueprint must settle these questions before implementation:

| Design topic | Required specification |
|---|---|
| Ownership and identity | Bind one self-host deployment/project to one site and its engine/domain. Country ID selects data, not authorization. In Cloud preserve the existing tenant ownership envelope without assuming its topology matches self-hosting. |
| Persistence | Prefer one versioned project/application configuration through existing storage seams over duplicated page-root settings; verify the existing project KV/version support before changing schema. A multi-site registry is outside this pilot's self-host scope. |
| Shared settings | One configuration supplies datasource reference, collections/relations, publication scope, URL ownership, branding, locale and contacts to all page roles. Credentials remain in existing server secret handling. |
| Layouts and overrides | Index, institution, program, pathway, city/article roles refer to reusable layouts. Identify safe per-page presentation/SEO overrides; prevent overrides from silently widening data scope. |
| Versions | Define config/layout schema versions, draft vs published configuration, references, atomic multi-page publication or explicit consistency behavior, upgrade compatibility and rollback. Separately choose live data refresh vs reviewed data revision; pinning configuration alone does not freeze database content. |
| Query execution | Emit existing registered query contracts with validated params and server-enforced row/field allowlists. Bind relationship lookup, pagination/search/filter/sort and detail resolution. Browser/SW output contains no executor or privileged credentials. |
| Route ownership | Key original aliases by source site and entity identity. Define literal old paths, new-record patterns, redirects, duplicate/path collisions, missing/retired records, trailing slash and relevant query behavior. Fail publication on unresolved collisions. |
| Compatibility | Migrate/read the current page-root configuration explicitly, preserve non-directory pages, reject unknown versions, and support rollback without resurrecting unsafe mappings. |
| Cache and runtime | Identify cache keys incorporating site and publication scope/revision; specify bounded parameters/results, invalidation and failure/empty-state behavior. Set budgets after measurement. |
| Admin experience | Configure once in the existing console, select page/layout roles in the builder, preview approved data, review preflight and use existing publish/deploy controls. Define the future location of shared settings; today's Directory tab is not automatically the final site-settings UX. |

Recommended design principle: explicit site identity and one versioned shared configuration, resolved through existing tenant/project ownership and publishing contracts. Exact persistence/API shape remains to be selected from repository evidence. Keep the reusable machinery independent of Studygram table names, country IDs, domains and contacts. Education collection roles are the template's configuration, not special cases in the generic renderer.

The proposed logical lifecycle is concrete, but not implemented or an accepted storage decision:

1. Resolve the deployment's existing project/application and authenticated owner. In self-host that deployment represents one destination site; USA and Hungary run as separate deployments. In Cloud retain existing tenant ownership checks. A source/site identifier can preserve provenance, but does not require a multi-site runtime registry.
2. Save one draft project/application configuration revision. Every page/layout resolves the deployment's shared configuration and its page role (directory/institution/program/article), with validated presentation overrides; it does not duplicate mutable scope/connection settings.
3. On publish, validate references and datasource ownership, resolve all roles from the same configuration revision, compile existing registered-query/layout/route contracts, and create a consistent site publication revision. Exact atomicity/storage mechanics require the P0.4 trace and accepted P0.5 design.
4. Serve every role from the active site publication revision through the existing engine. Server execution applies approved site selection and public-field scope; client query parameters can only narrow it. Route aliases and cache keys include site identity and relevant publication/query revision.
5. Editing draft configuration does not change published pages until publication activates a new revision; rollback restores the prior configuration/layout/query/route revision coherently. Live datasource content changes require a separately defined refresh/editorial policy—configuration pinning alone does not version data.

Keep framework release version, configuration schema version, template version and site publication revision distinct. Installing a framework update must preserve saved content/configuration; any schema migration and template adoption requires compatibility/backup/rollback tests. Reusable pilot improvements are part of self-host upgrades, but automatic installation and verified upgrade behavior are not established by the current prototype. Do not let a framework update silently republish a site's content or replace an owner's customized template.

Document required capabilities for article/media/taxonomy editing and import as distinct concerns. Propose Studygram's content model with provenance, URLs, original dates/bylines and publication state; avoid conflating a consumer content schema with a mandatory framework database. P0 specifies the model, P1 implements reviewed data changes and P3 proves editor/publish behavior.

## Artifact 3: verified slice specification

The primary P2 slice contains a directory page, one original institution detail page, its city and at least one original linked program detail page. Include search/filter/pagination behavior and the institution's program collection without a second unrelated institution's programs leaking into it. Choose the actual records after canonical identity checks; do not force Muhlenberg/UNLV into the slice if their mapping cannot yet be verified.

The specification records source and target IDs, exact original URLs, field mappings, explicit parent/city evidence, usable source cover/logo assets and expected server-rendered content. Missing source assets are documented prerequisites, not substituted images counted as migrated assets. Source aliases may differ from canonical parent slugs and must still work.

Define the expected journey: select datasource → configure scope and fields once → assign reusable page layouts → preview → save/reload → publication preflight → isolated staging publish → directory/institution/program navigation → rollback. The actual admin and published runtime perform this journey; ports 4387/4388 are historical prototypes.

Also specify one original article for the P3 CMS slice, including exact path, title/body, dates/byline, category and referenced media. Include one non-USA record/site in negative tests and a minimal second-destination configuration for reuse. Select real available second-destination evidence rather than inventing a complete Hungary dataset.

## Artifact 4: acceptance matrix and implementation backlog

These are planned checks, not new passing results.

| Check | Assertions | Execution surface / stage |
|---|---|---|
| Inventory determinism | Captured source counts reconcile; stable identities/hashes; duplicate/collision/missing-path detection; source omissions reported. | Protected export + migration tooling / P0–P1. |
| Mapping correctness | Expected parent/city; no orphan or title-only merge; authoritative conflict rules; idempotent imports. | Read-only analysis then reviewed import tests / P1. |
| Shared configuration | Save/reload; all page roles use one config revision; compatibility migration; draft changes do not silently alter published scope/layout. | Actual console and tenant-scoped APIs / P2. |
| Query safety | Foreign datasource/site/tenant denied; direct query cannot bypass publication allowlist; bounded params; private fields absent. | Existing proxy/provider boundary plus mutation/conformance / P2. |
| Runtime and routes | Original aliases return expected 200 content; correct institution/program/city links; collision and invalid paths fail; missing pages return real 404. | Actual staging server-rendered HTML/HTTP / P2–P3. |
| Media and articles | Cover vs logo roles correct, referenced assets available, dates/bylines/taxonomies preserved; safe rich content; article draft/edit/publish works. | Data/storage and actual admin/published pages / P1–P3. |
| SEO | Titles/descriptions, canonical/robots, headings/content, links, sitemap and language behavior match reviewed intended outcomes. | Source ledger compared with staging/published host / P3–P4. |
| Reuse and versions | Second destination needs no source edits; no records/routes/cache leak across sites; config/layout upgrades and rollback retain correct bindings. | Same template/admin/compiler/engine / P4. |
| Operations and leads | Required form delivery, cache invalidation/resource budgets, isolated restore, final delta and submission-aware rollback. | Intended host/providers/operator rehearsal / P4–P5. |

The resulting P1/P2 backlog needs an ID, owning existing package/consumer area, dependency, affected contracts/files, input fixture, verification command or browser journey, expected result and completion artifact for every task. Design acceptance is a prerequisite for durable configuration changes. Keep the publication refusal until the scoped live runtime and its negative tests pass.

## Inputs and unavailable evidence

Use protected source/schema exports and existing Studygram access; never ask for credentials in the plan or commit them. If refresh/export access is unavailable, retain measured historical evidence and create an explicit acquisition task. Search Console, access logs, original media, missing publication metadata and essential form settings may require additional exports/access. Such gaps prevent completeness claims for affected categories; they do not justify guessed URLs or broad crawling of an unstable WP server.

No remote data rewrite, media transfer, schema/RLS change, deploy, production traffic switch or architectural acceptance is required merely to complete these specifications. Separate later implementation actions from this planning scope.

## P0 exit gate and handoff

P0 is complete only when:

1. The evidence manifest and coverage ledger exist, with every observed record represented and every required source category classified as inventoried, evidenced absent or unavailable with an acquisition task.
2. Every known mapping/path/asset/content gap has severity, ownership, dependency and next action; expanded catalog totals cannot conceal original-site gaps.
3. The site-wide blueprint traces actual runtime contracts, compares design candidates, specifies versions/routes/scope/compatibility and is decision-ready. Accepted architectural choices are recorded canonically before P2 implementation.
4. A real institution/program slice is identified with proof and explicit outstanding prerequisites; article and reuse-test specimens are specified.
5. P1/P2 tasks and the acceptance matrix are executable, with actual-host checks and provider skips identified. There are no unassigned unknowns behind the publication guard.

Handoff verdicts: **ready for bounded P1/P2 work**, **ready with named data-access dependencies**, or **not ready due to an unresolved design prerequisite**. Do not report full migration readiness. Full original content/media/SEO completion belongs to later milestones; P0 identifies and plans that work.

Start execution with P0.1 and P0.4, then construct the unified ledger. Do not begin by adding more directory controls or choosing a new settings table. This planning task creates the work package; it does not claim those execution tasks are already finished.
