# R0 Public Release Scope and Truth Audit

**Status:** In progress

**Assignee:** Codex launch-readiness session (2026-09-06); Cloud-first evidence under owner direction

**Last updated:** 2026-09-06

## Objective

Establish the smallest truthful first public Frontbase edition and the exact work required to release it as a self-hostable, AI/agent-oriented, edge-native app-builder and framework. This audit implements R0 from [PUBLIC-RELEASE-STRATEGY.md](./PUBLIC-RELEASE-STRATEGY.md) and Decision A-20 in [DECISIONS.md](./DECISIONS.md#decision-a-20-public-release-positioning-and-gated-rollout).

This is a read-first audit. It does not authorize resuming CF-22, changing the six-package architecture, publishing packages, deploying, or fixing every discovered issue.

## Claim protocol

Before substantial work, change `Status` to `In progress`, identify the agent/session in `Assignee`, update the date, and inspect Git status. If another active session already owns the audit, coordinate or choose a non-overlapping task.

## Required evidence

### 1. Product scope and claims

- Map each headline README and strategy claim to shipped code and reproducible evidence.
- Define candidate release label: developer preview, alpha, beta, or stable.
- Define the first edition's included and explicitly excluded capabilities.
- Reconcile Phase 3/4 intent with current implementation and paused CF-22 residue.

### 2. Package consumability

- Inventory all six package manifests, publish metadata, licenses, entry points, peer dependencies, and `workspace:*` coupling.
- Determine which packages can be packed and installed by an external consumer today.
- Identify private artifacts or cross-repository pins required by the default path.
- Test package tarballs outside the monorepo when safe; record commands and results.

### 3. Self-hosting contract

- Verify the documented Cloudflare path from a clean environment through project creation, administration, publication, and operation.
- Classify Node/Docker and other provider claims as verified, partial, planned, or unsupported.
- Identify hidden credentials, product-repository dependencies, manual steps, and recovery gaps.

### 4. Security and operability

- Reconcile known auth, secret-storage, password-reset, tenant-isolation, SSRF, credential-leak, backup, migration, rollback, and recovery findings.
- Distinguish release blockers from accepted limitations and post-release improvements.
- Identify the exact clean-checkout verification matrix required for the selected edition.

### 5. Documentation and release operations

- Audit quick start, concepts, architecture, authoring, data/auth, self-hosting, deployment, upgrade, troubleshooting, contributing, security reporting, and support boundaries.
- Audit package versions, changelog/release notes, tags, registry ownership, publishing automation, and rollback.
- Identify the clean-room adoption test and owner acceptance needed before release.

## Required output

Complete this table with links to repository evidence:

| Area | Current truth | Evidence | Release blocker? | Required action |
|---|---|---|---|---|
| Product scope | Pending audit | — | Unknown | Audit claims and choose first edition |
| Packages | Pending audit | — | Unknown | Test external pack/install |
| Cloudflare self-host | Pending audit | — | Unknown | Reproduce clean path |
| Other self-host paths | Pending audit | — | Unknown | Classify support honestly |
| Security | Pending audit | — | Unknown | Reconcile known findings |
| Operability | Pending audit | — | Unknown | Audit migration/recovery/observability |
| Documentation | Pending audit | — | Unknown | Audit complete adopter journey |
| Release operations | Pending audit | — | Unknown | Define version/publish/rollback path |

Then add:

1. **Recommended first public edition and release label.**
2. **Included capabilities and explicit exclusions.**
3. **Ordered release backlog**, each item with priority, dependency, acceptance evidence, and owning package/document.
4. **Go/no-go statement** for proceeding to R1.
5. **Verification record**, including exact commands, results, skips, and environment constraints.

## Completion gate

Set this audit to `Complete` only when all required areas are evidence-backed, conflicting claims are reconciled or explicitly flagged, the recommended edition is decision-ready, and the backlog is executable. If the audit requires a new product choice, add it to `docs/DECISIONS.md` rather than silently treating the recommendation as accepted.

### 2026-09-18 customer-journey continuation

Codex owns CL-6 customer-journey tests and launch-tracker evidence following the owner go-ahead. Starting point: clean main at 3fdc876, matching remote main. Scope: browser/API journey coverage, reproducible verification, and truthful acceptance gaps; no CF-22 restart or release declaration. The owner selected Stripe test-mode staging for payment acceptance. R0 remains in progress; local tests do not replace deployed provider or operations evidence.

Continuation result (2026-09-21): the isolated Cloud journey passed the two-customer sandbox acceptance surface, including payment activation, Supabase datasource connection, Builder edit/save/publish, public TLS rendering, payment failure/recovery/renewal handling, reset delivery and portal cancellation at period end. A Stripe subscription-item period compatibility fix is covered by the cloud billing gate and deployed to the isolated Worker. A later CL-7 continuation added deterministic operations tooling, public health evidence and an isolated rollback/roll-forward rehearsal. These results do not close R0, backup/restore, spam-safe deliverability, external alert/support ownership, live production acceptance, or public-framework release gates.

## 2026-09-06 Cloud-first session claim

Owner selected framework-only paid Cloud with Supabase database/auth and the existing Stripe catalog (A-26). Cloud assessment and the ordered evidence-linked launch backlog live in [CLOUD-LAUNCH.md](../CLOUD-LAUNCH.md). This session owns that document, the A-26 synchronization edits, and the confirmed wildcard deployment fix in compiler/scripts/tests. No ownership is claimed over the original product's unfamiliar untracked files.

R0 remains **In progress**, not complete: external package install, clean-room self-host, and release-operations evidence are outstanding. These are public-framework gates; they must not be confused with Cloud billing and Supabase launch work.

Session continuation result (2026-09-09): the separate public/community topology is implemented and `public-community-engine` is deployed; domain helper tests pin `app.<zone>` to the platform Worker and `*.<zone>/*` to the community Worker. Stripe checkout/portal requests return live Stripe URLs, and a dedicated live webhook endpoint covers activation, payment failure, recovery and cancellation with durable idempotency. Unsupported add-ons fail closed. Console add-on selling was removed until entitlements exist. Backend mutation gates pass 23/23. A live checkout was initiated but not paid; full browser, delivery-from-Stripe, restore and release-operations evidence remain open. R0 is not marked complete.

## 2026-10-04 WordPress migration supporting claim

**Status:** In progress for the owner-authorized USA pilot; R0 remains in progress. **Assignee:** Codex WordPress recovery/migration session.

Owner authorized a study-in-usa.com pilot covering WordPress-to-Supabase reconciliation, no-code USA data selection and publication, a fresh Frontbase template and needed UI components, cache/security/CTA work, and intervening migration requirements. Original template conversion is not required; existing URLs and relevant content/SEO signals must be preserved. Studygram MCP connection and a test SQL query succeeded against project `uwzosvzynnpbxpnwqgkm`. This session owns `docs/plans/wordpress-migration-pilot.md`, USA-specific evidence/tooling and bounded pilot implementation, plus this supporting record. Implementation file ownership will be recorded before edits. Existing audit ownership, unrelated local diffs, and Cloud journey files are preserved. This supporting task does not complete R0, resume CF-22, adopt new architecture, or authorize production traffic cutover.

Implementation ownership (2026-10-04): `scripts/migration/`, `packages/console/src/components/builder/templates/pages/educationDirectoryTemplate.ts`, its focused test, and additive registration in the template registry/palette. The owner selected a local draft. A loopback-only pilot uses the existing engine; an isolated private Supabase staging schema preserves source identity/content without changing CRM provider agreements or exposing raw recovered content. Production publication remains gated by reconciliation and SEO/media acceptance.

Local-draft result: all 311 WordPress listing payloads preserved in private Supabase staging, with exact hash verification (0 missing/modified); all 258 published programs matched in the main programs table after one guarded missing-URL repair. Thirteen institution and 34 pathway mappings remain unresolved. The expanded snapshot draft selects 10,469 listings across programs/institutions/pathways/cities; all 310 original published listing routes return 200 through the unchanged engine. No-code draft filters/hero/layout export and WhatsApp/email CTAs work. Full live console publication integration, metadata/media/content equivalence, security-advisor remediation, caching/forms and cutover acceptance remain open. See [pilot evidence/backlog](../plans/wordpress-migration-pilot.md).

Verification: workspace check/build passed after locked dependency restoration; direct strict template typecheck passed; Python 12/12, template 4/4 (single thread), edge-core conformance/parity and existing mutation 2/2 passed; restored conformance rerun and local 310-route/filter/HTTP guards passed. Supabase anon/authenticated staging access is denied. The build refreshed tracked `examples/cf-full/api/cms.mjs`; no production deployment occurred. Supporting local draft is reviewable; the migration and R0 remain in progress, with existing unrelated work preserved and own changes uncommitted. Next executable task is canonical institution/pathway reconciliation and a reviewed website publication projection, followed by full URL/SEO/media acceptance.

Relational-directory continuation claim (2026-10-04): the owner clarified institution-led browsing with separate institution and program pages, and supplied the original explore/UNLV/program URLs. The same implementation ownership now covers typed institution/program relationships, source metadata detail sections, directory filters and complete paginated institution programs. Each institution has one city; several institutions may share a city. Pathway/provider relationships retain their distinct cardinality. This is bounded consumer evidence, not a new release scope or production cutover. Status: in progress.

Relational-directory result: local continuation is reviewable; full pilot/R0 remain in progress. Default browsing is institutions (244 expanded / 18 original), with separate program/pathway views. Institutions have city/profile sections and full paginated program collections; program pages preserve source paths and link back to explicit parents. Source metadata populates detail facts/admissions with a review notice. Projection cardinality audit found zero issues across 10,011 programs, without merging the 13 unresolved source institutions by title or imposing city uniqueness. The local GET-filter adapter is consumer tooling, not an exported reusable filter widget or live publication integration. Exact commands/results and remaining field/city/SEO/media gates are recorded in the updated pilot plan. Workspace check/build and direct strict typing passed; Python 14/14, template 5/5, mutation 2/2, restored engine conformance and 310-route relational/guard checks passed. No deployment or CRM write occurred in this continuation. The generated CMS artifact and other own changes remain uncommitted; unfamiliar changes are preserved. Next: canonical relation reconciliation, then the reviewed publication projection and complete URL/SEO/media acceptance. No change to accepted release scope or CF-22 status.

2026-10-05 saved-directory configuration claim: owner authorized the proposed next step. Scope: a versioned browser-safe directory configuration contract in edge-core; a Directory page-settings panel and layout application helper in console; server-side validation on existing tenant-scoped page create/update/layout/publish/rollback routes; focused contract, UI and API persistence/isolation tests; bounded local configuration preview tooling and supporting evidence. Owned files: new `packages/edge-core/src/directory/`, isolated package subpath export `./directory/configuration`; new `packages/console/src/components/builder/directory/` and additive PageSettingsDrawer/template integration; an optional explicit-selection flag in DataSourceSelector; new backend directory-validation helper/test, bounded pages route hooks and additive test registration; existing migration local tooling and pilot/audit records. Existing six-package/one-engine boundaries, public release gates and CF-22 pause remain. Source CRM/media/blog migrations and production deployment are separate outstanding work, not completed by a settings panel. No unfamiliar files are reset or overwritten.

Saved-directory result (2026-10-05): bounded configuration/admin increment is complete and locally reviewable; full migration/R0 remain in progress. The settings contract is saved/versioned/rolled back through the existing page API. Actual drawer browser verification preserved explicit fixture datasource, institution ID/title/path/cover/city mapping, numeric USA scope 22 and page size 24 after reload. USA/Hungary reuse, unrelated-content preservation, validation, tenant isolation and publication refusal are covered by focused tests. Local review remains at http://127.0.0.1:4388/; fixture schema is not a live Studygram connection.

Verification: final `pnpm -r check` exited 0; `pnpm -r build` exited 0 after correcting the isolated subpath to match the existing artifact resolver. Existing chunk/dynamic-import warnings remain. Console's normal check excludes most UI; supplementary `tsc -p tsconfig.app.json --noEmit` retains 89 diagnostic lines outside the changed admin/template files (no diagnostics in those changed files after correcting the test fixture). UI/template Vitest passed 8/8. New backend directory persistence/version/rollback/two-destination/validation/isolation test passed. Backend conformance exited 0: 248 CONFORMS, 0 VIOLATES, 9 UNREACHABLE and 77 PRODUCT_VERIFIED_REFUSAL across 334 operations; unreachable/provider cases are not accepted as passing live integration. Tenant matrix passed 175/175. All 24 backend mutation assertions were observed RED on deliberate break across the interrupted runs and resumed final 9/9; two full-command attempts encountered Windows UNKNOWN errors while restoring files. Exact interrupted mutations were restored, and the unchanged remaining assertions ran from a protected temporary tail harness with bounded transient-write retries. This is aggregate assertion evidence, not a claim that the uninterrupted full mutation command passed. Engine mutation passed 2/2 (its deliberate page-path break produced an expected compiler failure); restored engine suite passed, including byte parity 15/15 and WYSIWYG 14/14. Final status shows no remaining deliberate source mutations. Review HTTP/layout 200, no-Origin JSON write 403 and noindex guard passed; `git diff --check` exited 0.

Modified surfaces: isolated edge-core contract/export; console Directory panel/helper/tests, PageSettingsDrawer, explicit datasource-selection option and reusable template; backend validation/routes/test registration; local admin harness and these pilot/audit records. Required build refreshed tracked `examples/cf-full/api/cms.mjs`. Changes remain uncommitted; unfamiliar Cloud journey/roadmap changes are preserved. No live provider/production checks, remote Supabase changes, media/blog import or deployment were performed. Accepted strategy, decisions, milestones and README scope remain unchanged. Next executable task: server-scoped query/relationship/detail-route compilation of saved settings, followed by source reconciliation and full URL/SEO/media acceptance.

Owner-authorized Git handoff (2026-10-05): commit and push the bounded WordPress pilot implementation/evidence on `codex/wordpress-pilot`. Include migration tooling, reusable template/admin contract and integration, tests, pilot plan, generated CMS artifact and only the pilot sections of this shared audit. Exclude the unrelated competitive-roadmap claim/plan, Claude settings ignore and Cloud journey helpers/tests. Verification above remains the current evidence; this handoff makes no new deployment/release/live-provider claim. Full pilot/R0 remain in progress; next task is server-scoped saved-configuration execution and source/SEO/media reconciliation.
