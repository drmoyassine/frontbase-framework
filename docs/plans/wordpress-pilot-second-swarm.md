# Additional swarm: assignment handoff

**2026-10-07 — proposed assignments for the owner to dispatch elsewhere. No agents are dispatched by this document.** Use implementation checkpoint `0629e80` and coordination checkpoint `9ef0d4a` on `codex/wordpress-pilot`; resolve and record the actual starting SHA before work. The current [first swarm](wordpress-pilot-swarm.md) is already running. Primary retains architecture, publication controls, final core/template/consumer decisions, integration and independent acceptance.

## Suggested allocation

If you have four agents, assign one per workstream below. With two agents, start A and B; they unlock migration completeness and reuse. C and D can follow independently. These are substantial deliverables rather than additional visual tweaks.

| Workstream | Outcome | Priority / dependency |
|---|---|---|
| A — Migration completeness and media reconciliation | Reproducible record-by-record URL/content/media gap report plus safe import proposals | First; source snapshots and read access to Studygram are needed for complete evidence |
| B — Reusable template and fresh-install proof | Configuration-only USA/Hungary fixture deployments, portability evidence and proposed safe export contract | First; final export/import architecture returns to primary |
| C — Accessibility, performance and directory usability | Automated/visual evidence and a ranked list of reproducible problems on real-length data | Parallel; final integrated presentation acceptance waits for first-swarm delivery |
| D — Inquiry/application flow | Concrete configurable CTA/form design, isolated reusable prototype and delivery tests | Parallel; external delivery, storage/auth contracts require primary review before production integration |

## Shared instructions to paste before each assignment

Work on the Frontbase USA WordPress pilot, branch `codex/wordpress-pilot`. Read AGENTS.md, README, release strategy/audit/milestones/decisions and the pilot roadmap, packaging inventory, primary T2 review and both swarm handoffs. Inspect Git status and preserve unfamiliar changes. Create a separate worktree from an explicit recorded checkpoint before editing; use a different local port and an ephemeral test database. Do not use or restart the primary's server, local pilot database or existing browser tabs. Claim exact files in your worktree's audit and keep a dedicated delivery document.

Keep six packages, one engine and the existing `/frontbase-admin`; one self-host deployment is one site/application. Supabase content is authoritative, original WordPress public paths must be preserved, and extra Supabase records are intentional expansion. Connected storage is configurable; neither Garage nor Studygram-specific tables are mandatory framework dependencies. Final packaging is not decided by today's source paths.

Do not edit first-swarm-owned production surfaces: publication runtime/serving, worker dispatch, engine/shell metadata, directory binding/configuration contracts, template/header generators, builder date controls/canvas locale plumbing, or the existing S3/browser transition smoke. Propose a narrow change if you need those seams; primary integrates it after agreement. Do not implement publication activation controls, change canonical data, approve actual content, expose public grants, deploy, send real email/WhatsApp, or schedule backups. Use isolated synthetic records and fake delivery transports for tests. Read-only authorized audits are permitted; an import proposal is not permission to apply it.

No credentials, customer records, private WordPress recovery files or private local recovery evidence go into Git. Keep raw audit outputs private; commit tooling, synthetic fixtures and sanitized findings. Run `pnpm -r check`, `pnpm -r build` after code changes and appropriate tests; use existing security/mutation gates for affected security surfaces. Do not run source-mutating tests in another worktree. Separate worktrees do not isolate shared remote databases or buckets.

Deliver a scoped local commit/patch, exact SHA and file list, reproducible commands, test results, failed attempts, prerequisites, credential-gated skips and residual risks. Do not push or merge unless explicitly authorized. Your dedicated document is a proposal/delivery, not primary acceptance. The owner can forward proposed design decisions and final delivery to the primary session for review. Do not claim migration, installable-template or release readiness from a prototype.

## A — Migration completeness and media reconciliation

**Assignment:** Build repeatable audit tooling to reconcile every original USA WordPress record and public path against canonical content and intended Frontbase coverage. Start with existing source-recovery, harmonization and Garage evidence; determine which snapshots are available rather than assuming live WordPress is complete or accessible.

Compare institutions/programs/cities/countries against `public.institutions`, `public.programs`, `public.cities`, `public.countries`. Locate the configured editorial collection from existing configuration/evidence; do not invent a new blog table or assume all imported articles already exist. Preserve institution-to-program and institution-to-city relationships. Treat provider IDs as administrative data; never create a provider/commercial relationship just because a WP row lacks one. Keep ELS-scoped naming and previously authorized statuses intact.

Report each original path as exactly matched, ambiguous, missing, intentionally excluded with reason, or awaiting review. Include articles, informational pages, pathways and attachments in the inventory even where the current bounded publication capture cannot support them. Distinguish record absence, field absence, media availability, draft/review status and unsupported page type. Additional canonical rows are expansion, not missing-WP problems. Avoid fuzzy automatic merges; ambiguous matches need an explicit decision.

Audit cover/logo/inline image references, legacy-domain dependencies, safe permanent URLs, bucket/key existence, duplicate assets and unresolved internal links. Separate rights/alt-text/source-quality questions from HTTP availability. Do not manufacture missing covers; optional-cover collapse is implemented. Request metadata/list/head access as needed; do not bulk upload/delete or overwrite bucket ACLs. Retain the owner-deferred enrichment boundary.

**Owned scope:** a new `scripts/wordpress-audit/` tooling area, synthetic audit tests, and `docs/plans/wordpress-pilot-migration-completeness.md`. No production schema/configuration/query changes. Use the Supabase skill for live read queries and check its current docs before implementation; if access is unavailable, deliver offline tooling and label live reconciliation incomplete. Do not copy service-role keys into scripts.

**Deliverables:** source manifest with timestamps/checksums privately retained; sanitized counts by category; private per-path reconciliation ledger; idempotent dry-run import/update proposals with field-level before/after and evidence; prioritized gap decisions. Public reports must link to reproducible tools without shipping private raw exports.

**Acceptance:** every captured original record/path has a disposition; unresolved duplicates and unsupported routes are visible; rerunning the same snapshot produces the same ledger. No zero-gap claim unless actual row/URL evidence supports it. No canonical mutation this assignment.

## B — Reusable template and fresh-install proof

**Assignment:** Prove what is required to install the education directory into an unrelated self-hosted Frontbase deployment and configure a second destination without editing framework source. Use synthetic USA and Hungary datasets, independent deployment settings and separate engines/state. Do not use the private local pilot database as the installer.

Inventory current core/profile/template/consumer coupling. Identify hard-coded table names, country values, datasource IDs, paths, contacts, provider assumptions and secrets. Propose a versioned export artifact with editable layouts, supported query/binding contracts, field/relationship mappings and required capabilities. Export must exclude canonical rows, credentials, approvals, active pointers, immutable captures, local admin users and recovery data. Resolve datasource/storage references through existing administrator connection flows.

Send the exact export/import/upgrade contract to primary before implementing production import routes, a new schema version or relocating directory code. Meanwhile implement an isolated prototype exporter/validator with synthetic fixtures and collision/no-secret tests. Do not introduce a seventh package or declare a final extraction decision. Export is a design prototype until accepted.

Exercise fresh install, configuration save, preview and upgrade-preservation of owner-customized nodes through current available mechanisms. Publishing/rollback controls are pending; mark their clean-install proof blocked rather than bypassing them. Test two independent destination configurations and owner isolation without live Supabase or Garage dependencies. Determine which hosts can actually run from a clean documented environment; adapter code existence is not deployment evidence.

**Owned scope:** new `examples/education-template-proof/` or isolated test tooling, synthetic fixtures, `docs/plans/wordpress-pilot-template-install-proof.md`. Package manifests/shared production code only after primary agreement. Avoid modifications to first-swarm generators.

**Deliverables:** executable synthetic USA/Hungary reuse example, clean-environment commands and exact results, dependency/capability matrix, safe artifact proposal, customization-preservation tests and recommended core/template/consumer boundary with evidence.

**Acceptance:** no source edits between destination configurations; no inherited credentials/IDs/private rows; missing capabilities fail clearly; existing customization survives the tested update. Clearly state which lifecycle steps remain unproven.

## C — Accessibility, performance and directory usability

**Assignment:** Build independent browser/engine acceptance fixtures for directory, institution, program and blog pages plus their existing admin authoring flow. Use realistic long titles/body, optional media, absent/present contacts, empty results and institutions with many programs. Measure at phone/tablet/desktop widths and with keyboard navigation, rather than relying on overflow alone.

Audit heading order, link purpose, focus order/visibility, labels, contrast, screen-reader names, layout reflow/zoom and empty/loading/error states. Examine card-to-detail navigation and related programs, and whether configured search/filter/sort/pagination controls are actually present and work. Separate current capture limitations from bugs: publication v1 is bounded to48 records per collection and1MiB, and currently does not promise the full expanded catalog or all configured browsing facets.

Record SSR/response size, query counts, list-versus-detail work and image behavior on deterministic fixture data. Prefer repeatable timing/count budgets over unstable external-network scores. Compare cold/warm behavior without changing no-store/cache policy. SQL profiling against live Studygram is an additional read-only task only with appropriate access; no indexes/schema/cache backend changes without primary review.

**Owned scope:** new dedicated `examples/cf-full/e2e/pilot-quality/` fixtures/tests, `docs/plans/wordpress-pilot-quality-report.md`. No first-swarm generator/runtime/style changes. Do not test destructive admin actions or overwrite the actual Modified editor. A proposed fix belongs in a separate narrow patch after ownership agreement.

**Deliverables:** repeatable automated assertions, screenshots privately retained, ranked reproducible issues with affected role/viewport/trigger and recommended fixes, plus a supported-browsing matrix.

**Acceptance:** distinguish blockers from cosmetic issues and actual checks from proposed checks; verify fixes against the integrated first-swarm checkpoint later. No performance/accessibility claim based solely on an automated score.

## D — Inquiry and application flow

**Assignment:** Define and prototype a reusable inquiry/application flow that carries institution/program context into a configurable form. Distinguish external WhatsApp/mailto launchers from a form that submits and stores a lead; a clickable button is not proof of delivery.

Inventory recovered WP form fields and consent text, required relationships, destinations and any known CRM mappings. Propose configurable fields, validation, destination adapters, safe context IDs, success/error states and recovery behavior. Keep provider/commercial IDs administrative; avoid including secrets or untrusted arbitrary URLs in the browser. Do not assume the canonical institutions/programs tables are a lead database.

Primary must approve the data-storage/auth/transport/abuse contract before adding a production write route. Meanwhile build a standalone fixture/prototype through existing components with a fake transport: invalid inputs, repeated clicks, lost response, rate-limit refusal, adapter failure, retry, and context tampering. Never send real email/WhatsApp or create a real CRM lead. Network/SSRF/secrets and personal-data retention must use existing framework seams rather than a template-owned bypass.

**Owned scope:** isolated inquiry fixtures/prototype and `docs/plans/wordpress-pilot-inquiry-contract.md`; no shared publication or first-swarm header modification. Do not apply consumer schema migrations or invent live integrations.

**Deliverables:** field/context inventory, proposed reusable admin configuration and API contract, working fake-delivery prototype, integration test plan and explicit live delivery/storage prerequisites.

**Acceptance:** context validated server-side in the proposed contract, no duplicate records from retry in the fixture, clear safe error/recovery behavior, no public credential exposure. Live integration and end-to-end delivery remain separate primary-reviewed acceptance.

## Optional fifth agent — Operations and restore rehearsal plan

Prepare deployment/upgrade/rollback/backup observability runbooks and an ephemeral restore test using synthetic state, covering application control state, canonical database ownership, connected object storage and secrets. The owner deferred scheduled off-server Garage backup deployment; this assignment must not create schedules, select a paid provider or change the live VPS. Report required owner choices and what a rehearsal can/cannot prove. Dedicated `docs/plans/wordpress-pilot-operations-proof.md`; no infrastructure deployment or hosted readiness claim.

## Avoid duplicate work

The first swarm already owns old-SW/browser transition, safe S3 smoke alignment, captured SEO/sitemap, optional contacts, date formatting and synthetic approved-blog rendering. Publication activation controls, final integration, primary design decisions and actual reviewed staging are retained here. Do not launch another team on those same surfaces. New feature/schema/provider decisions return to primary through a concrete proposal; these assignments authorize bounded work and evidence, not production cutover.
