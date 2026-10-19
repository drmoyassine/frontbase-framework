# Study in USA: autonomous translation delivery stream

Prepared 2026-10-20, Asia/Kuwait. Status: ready for a separate execution session; implementation has not started under this handoff. This is the owner-requested complete task contract, not a completion receipt.

## Mission and authority

Deliver the remaining translation workstream 1–14 end-to-end, using **Study in USA as the only real customer/site target**. Work autonomously through implementation, verification, focused commits, pushes, staging deployment, review and remediation. Do not stop after a foundation, a demo, a passing unit test or one translated page. Do not repeatedly ask the owner to say “go on.” Continue independent work around an external blocker and report exact remaining gates honestly.

Product outcome: **Frontbase understands your pages and data, translates them with AI, and lets you refine and publish every language visually.** The administrator enables a language, selects pages and fields, generates with context, refines visually, previews and publishes. Source data remains live.

The user specifically excludes every other WordPress site. Reusable framework code and synthetic multi-tenant/multi-project fixtures remain required; another real customer's site is not an acceptance dependency. Do not provision, crawl, translate, deploy, publish or migrate another site. Do not restart Booking for X expansion, reservations, availability, payments, generic pilot residue or paused CF-22.

This mission authorizes necessary reversible engineering and existing Study in USA staging delivery, within tool and repository policies. It does not supply missing credentials, invent spend limits, waive required action-time confirmations, authorize destructive deletion, DNS changes or unconditional registry publication. Prepare production cutover and release artifacts completely before surfacing a concrete unavoidable approval gate. Keep working on all other acceptance items. A gated operation is not “delivered” merely because its preparation is complete.

## Read first; durable state outranks chat

Read repository `AGENTS.md`, [strategy](../history/PUBLIC-RELEASE-STRATEGY.md), [audit](../history/PUBLIC-RELEASE-AUDIT.md), [milestones](../history/MILESTONES.md), [decisions](../history/DECISIONS.md) and [README](../../README.md). Then:

- [Active implementation plan](frontbase-ai-native-translation-implementation-20261016.md) and [architecture](frontbase-ai-native-translation-architecture-20261016.md). Their older M0–M7 text contains dated partial statuses; do not repeat finished work or treat historical next steps as current blockers.
- [Homepage/public-navigation evidence](frontbase-homepage-arabic-publication-20261019.md).
- [Latest admin-session delivery](frontbase-admin-session-recovery-20261020.md).
- [Schema selection](frontbase-datasource-schema-selection-20261019.md), [native PostgREST](frontbase-native-postgrest-datasource-20261019.md), [pilot accounting](frontbase-translation-first-pilot-20261019.md) and [visual preview](frontbase-translation-visual-preview-20261019.md).
- Existing package/runtime/storage/job/allowance/provider receipts linked from those documents, plus their source and reproducible test commands.

At handoff preparation, branch `codex/wordpress-pilot` is synchronized through `dd2a9db`; source fix `a5b8589` is deployed. Fetch and use the later commit containing **this handoff** as the execution base. Record exact SHA rather than relying on these short hashes indefinitely. R0 is already completed historical evidence, not an instruction to restart its audit or override this specific owner-authorized stream. Existing release gates still apply.

## Isolate the parallel session before editing

The original checkout contains substantial unrelated staged deletions, staged changes and generated output from other sessions. Some files marked deleted in its index still exist on disk. Never clean, stash, reset, broadly stage or overwrite this checkout to start work.

1. Inspect status and attached worktrees. Create a separate managed worktree/branch, suggested `codex/study-in-usa-translations`, from the committed handoff base. Do not copy the original dirty index or build output.
2. Verify the clean branch has the required source/docs. If an uncommitted dependency is truly needed, identify its owner and exact diff rather than importing the shared checkout wholesale.
3. Claim the stream and current milestone in the audit **in your worktree**. Maintain a dedicated progress receipt with per-task states: not started, active, verified, or externally gated. A claim is not verified completion.
4. The execution agent owns translation package/backend/console integrations and tests required by this stream. Keep unrelated improvements out. Re-read shared roadmap/decision documents immediately before changing them; integrate upstream doc changes without erasing another session's claims.
5. Commit coherent slices and push your branch normally. No force-push/rebase/reset without explicit authorization. Record changed files, skipped tests, failures and source/image identities.
6. Before each shared staging deployment, check current action, service configuration and running image. Use a durable audit claim as a deployment lock with owner, base image, intended source and status. An active claim by another session is a conflict to coordinate, not permission to overwrite it. Never deploy an archive from the dirty original checkout.

## Baseline to preserve and reverify

- Arabic Homepage has 85/85 published display/accessibility/metadata units, native review/preview/publication and RTL. Two initial units came from the provider; the remaining completion used manual revisions. This is **not** proof of automated whole-site translation.
- Header language switcher is a dropdown. Current-page/query switching and `/ar/` menus, cards, search destinations and nested routes work. External links, API paths, assets and downloads stay unchanged. Non-Homepage bodies remain source-language fallback with source canonical until genuinely translated.
- Existing Settings support connected OpenAI/OpenRouter accounts and searchable model/language choices. Inspect the saved current free OpenRouter selection rather than hardcoding a guessed model. No paid fallback.
- Storage may be the content datasource or a separate destination. Actual destination is the saved **Transo** connection to owner infrastructure **studygram-selfhost**, through native PostgREST HTTP and schema **translations**. Preserve **public** for the owner's future use. Do not reinstall full Supabase or add TCP to the edge runtime.
- Two earlier provider attempts are settled; one remains uncertain. Obsolete unsent work was cancelled. Retain that history without declaring unknown usage zero, reviving cancelled jobs, or letting it unnecessarily block independently reviewed publication. Follow the existing accounting protocol for new dispatch.
- The latest session fix validates cookies through `/api/auth/me`, coordinates same-origin 401 recovery, preserves mounted drafts and requires the same user/tenant/role to resume. Do not replay writes, force shared-tab logout, weaken auth or regress safe returns.
- Previous check/build passed. Broad App/auth imports retain 74 baseline diagnostics, zero new for that slice; a passing scoped gate does not establish a clean entire-console type surface. Re-establish your own baseline.

## Real target inventory and access

| Resource | Intended use |
|---|---|
| `https://studygram-usa-frontbase-staging.fir7vq.easypanel.host/` | Primary implementation and visual acceptance target |
| `/frontbase-admin/settings?tab=translations` | Existing native settings/review entry |
| `/frontbase-admin/data-studio/datasources` | Saved connections, Inspector, schema/view selection |
| `https://study-in-usa.com/sitemap.xml` | Source WordPress URL inventory |
| `https://study-in-usa.com/ar/sitemap.xml` | Initial translated URL inventory |
| EasyPanel `https://newpanel.studygram.me`, project `studygram`, app `usa-frontbase-staging` | Existing app deployment; use the matching connector |
| Separate `admin_frontbase_easypanel` connector | Owner database infrastructure; discover exact resources before mutations |

Initial language acceptance is English/Arabic. Discover other **Study in USA** published locales from its own configuration/sitemaps and explicitly inventory their coverage; do not infer an estate-wide language list or automatically activate unreviewed languages. English/Arabic must be complete; any additional discovered locale must have an explicit migration/readiness state rather than disappear from the report.

Latest known staging action `cmvfqwo7i00a907qq0dgu1omk` completed healthy, image `sha256:803f1745bc107abd240bc59aef3ae1d42d607e851a6e3941833568e8fec73b81`. Treat as a historical checkpoint, not proof the service has not changed since. Discover connector tools anew in the execution session; browser/tool grants and variable bindings may not carry across chats. Never print environment variables, tokens, cookies, signed deploy URLs or connection secrets. Use existing connected-account/credential resolvers.

## Required implementation patterns

- Extend `packages/translation/src/{identity,contracts,rich-text,revisions,jobs,accounting,sitemap-comparison}.ts` and existing adapter ports. Inspect the files before deciding what needs implementation. Do not create a replacement engine/store/job queue.
- Reuse backend extraction, reviewed-batch, preview, publication and guarded HTTP translation integrations; find current files with `rg --files`/`rg`. Retain SQL protocol versioning, transactional fences and owner/project scoping.
- Reuse Connected Accounts and canonical guarded HTTP AI transport for OpenAI/OpenRouter. No inline browser secrets, runtime provider calls on anonymous page requests or duplicated SDK client.
- Reuse current List Component binding/query/filter contracts for Repeaters, Tables and Grids, existing @ variable scope, shared conditions and Block Versions. Alternatives inherit only directly from Default. An inherited field shares source identity; an explicit override has distinct owned identity. Verify inherited and overridden changes rather than deriving identity from rendered position.
- One renderer across builder/preview/SSR/hydration. Expose controls visually through existing properties/editor patterns; no hidden Study in USA-only runtime configuration as a substitute.
- Source records are live. Immutable translation revisions/publication artifacts are allowed; frozen source-record snapshots are out of scope.
- Reuse the accepted message/runtime decision if evidence establishes it. Close any still-open runtime/protected-token/rich-text contracts through measured tests; do not choose i18next or build another formatter merely by preference.
- Keep existing package boundaries. The owner-approved standalone `@frontbase/translation` is the accepted seventh candidate; do not add more packages without an accepted architectural decision.

## Complete delivery sequence: tasks 1–14

### 1. Stable translation references

Inventory existing contracts first. Extend stable refs for saved page fields, shared menus, Default/alternative block fields and datasource/schema/table/stable record key/field. Preserve identity when a component moves or a list is reordered; source text changes update freshness, not silently create unrelated units. Handle composite keys and explicit replacement/deletion. Use batched resolvers. Prove tenant/project separation and version inheritance with fixtures.

**Exit:** the same record field reuses an approved translation in Repeater, Table and Grid; reordering and pagination cannot attach it to a different record; overridden block text has independent review while inherited text follows Default.

### 2. Complete discovery and contextual extraction

Inventory every owned Study in USA page/template/menu and selected live field, using complete pagination rather than first-page sampling. Distinguish translatable display text from IDs, source bindings, URLs, scripts and secrets. Include field role, nearby text, page purpose and approved terminology as context. Preserve placeholders, rich markup and @ bindings. Add a coverage report with explicit exclusions and reasons.

**Exit:** every in-scope surface has a stable inventory/ref, source fingerprint and translatability decision; no private/unselected fields enter prompts. Resolve the previous “only 16 institutions” class of truncation through actual view/membership/count evidence, not a guessed larger limit.

### 3. Reliable contextual AI generation

Extend existing durable plans/attempts/leases/allowances to complete selected scopes. Persist progress before dispatch, resume safely after restart, preserve successful drafts, support cancel/retry/skip/backoff and reject stale late results. Respect manual heads. Keep free-provider failures recoverable without paid routing or fabricated accounting. Validate representative real provider output separately from fake-provider/fault tests. Use configured limits; missing allowance is a concrete gate to new dispatch, not grounds to stop all engineering.

**Exit:** an actual representative multi-unit Study in USA batch completes through native UI with honest provenance; failure/restart does not lose completed text or blindly resend uncertain attempts.

### 4. Visual translation authoring

Extend existing builder locale picker/preview/editor for arbitrary selected elements and Block Versions; support Generate/Regenerate, manual corrections, missing/outdated markers and accessible editing. Add Data Inspector selected-field/per-record locale review through existing panels. Provide read-only locale/direction @ context where missing. Keep source design/data untouched and previews private.

**Exit:** an administrator creates or edits a page/Card Repeater visually, binds live data and refines Arabic in place; preview matches the actual renderer without hand-editing JSON or SQL.

### 5. History, terminology and reuse

Expose existing immutable revision/provenance history, compare/restore and manual protection. Add scoped glossary/memory through current ports where absent, with deterministic applicability and invalidation. Restore creates an auditable revision, not destructive history rewrites. Shared memory requires explicit authorization; project-private is safe default.

**Exit:** manual corrections survive regeneration/model changes; permitted terminology is consistent; another tenant/project cannot read or infer translations through memory/history.

### 6. General preview and publication

Generalize existing Homepage preparation/CAS activation to selected pages, menus, Block Versions and collections. Present Save Draft → Preview → Publish/discard; expose rollback and locale deactivation. Implement explicit per-unit missing/outdated policy. A changed record must not silently invalidate all unrelated published language content. Fresh source membership/permissions always take precedence over cached translation availability.

**Exit:** draft text is never anonymously visible; incomplete/conflicting preparation cannot replace the active release; publish/rollback/deactivation work with the external store; source changes and concurrent edits have tested outcomes.

### 7. Live translations in all List Components

Apply authorized live source projection and batched approved translation lookup consistently to Repeaters, Tables and Grids, mapped fields, refresh, detail links and status messages. Support new/changed/deleted/revoked records without a page redesign or manual duplicate translations. Retain existing controls and builder/public parity.

**Exit:** the same authorized record renders the same approved text everywhere; no N+1 per-card store calls, stale deleted records or hidden special Explore implementation. Display-only localization is not completion of task 8.

### 8. Correct localized queries

Extend the shared query contract with explicit source/localized semantics. For supported same-store queries use authorized joins/protocol capabilities; for separate stores implement an incremental, recoverable localized index or another evidenced exact query plan. Intersect current source authorization/membership before count/sort/pagination. Define deterministic tie order, readiness/watermarks/tombstones and source-update behavior. Never fetch one source page and pretend filtering its translated rows is full-dataset search.

**Exit:** Arabic matches beyond source page one are found; all controls, exact totals and final/empty pages agree across three List Components and same/separate stores; revoked data cannot leak through text, counts or stale indexes. Unsupported semantics refuse clearly rather than returning invented exact results. Benchmark bounded work on the complete Study in USA catalog.

### 9. Complete language routing and switcher behavior

Extend existing dropdown/current-page navigation to generalized equivalent-page routing, translated slugs, aliases, conflicts, query/anchor preservation and preference behavior. URL remains authoritative; no forced preference redirects. Generate canonical/hreflang/sitemaps only for genuinely published equivalent content from the same route registry. Preserve external/API/asset/download destinations and source identifiers.

**Exit:** hard reload, SSR, hydrated links, GET forms, nested routes and language switching agree; unpublished/fallback pages do not acquire false language SEO; staging stays noindex. A standalone placement option uses existing component/menu registration rather than a parallel switcher.

### 10. Remaining surfaces, formatting and RTL

Cover forms, validation, empty/loading/error states, alt/aria/placeholder labels, rich articles, metadata and supported structured display fields. Test dates/numbers/plurals, mobile/desktop, long text, mixed LTR/RTL, keyboard and accessibility. Do not translate IDs, executable code, binding expressions or monetary values as prose.

**Exit:** the in-scope rendered/accessibility/SEO inventory is covered or has a justified explicit exclusion; English remains functional; builder/private preview/public output agree on representative full flows.

### 11. Storage portability and operational recovery

Retain optional same/separate storage, HTTP-only edge runtime, translations schema and owner-reserved public. Reuse current writable adapter contracts; certify each supported path independently or document a capability refusal. Use synthetic projects for isolation/multiple-site fixtures, never another real WP site. Verify relocation/export, retention/reference protection, backup/restore, outage/default-language resilience, source/index rebuilds, caching and restart/dispatch recovery.

**Exit:** the deployed Study in USA configuration can be restored from a verified backup and translation/index state recovers without source data changes; selected storage modes have reproducible evidence. Do not claim all datasource types writable because one PostgREST destination passed.

### 12. Study in USA WordPress migration inventory

Fetch its source and locale sitemap trees, including nested/compressed maps with bounded safe transport. Preserve exact observed URLs. Always compare translated slugs—even if USA currently appears prefix-only. Correlate with trustworthy source relationships/content metadata and existing redirects; never use positional matching or AI guesses as accepted mappings. Missing inventories are unknown, not empty. Optional authorized Search Console observations supplement published sitemaps and are not a complete URL census or a hard dependency.

**Exit:** a reviewable Study in USA source↔locale mapping manifest records proven/candidate/ambiguous/missing/conflicting routes, evidence and redirects. Report untranslated/discovered extra locales explicitly. No other site's sitemaps or content are collected.

### 13. Migration rehearsal and Study in USA cutover

Apply reviewed mappings in staging, verify all inventoried routes with bounded automated checks and representative native flows, compare content/SEO/link/forms and establish a recoverable predecessor. Prepare deploy, domain/DNS, GTranslate retirement, monitoring and rollback steps against exact resources. Do not disable WordPress/GTranslate or modify production DNS before the applicable concrete authorization and access gates are satisfied.

**Exit:** rehearsal and restore pass; every inventoried URL has a declared outcome; production activation, if authorized and executed, has source/image/config/route receipts and post-cutover monitoring. If externally gated, deliver the exact ready-to-run package/runbook and label production cutover pending—never call staging a completed production migration.

### 14. Package/product acceptance and distribution readiness

Repack and independently install the coherent seven-library graph outside workspace links; verify strict types, exports, runtime, dependency/license notices and host boundaries. Prove clean installation, upgrade/backup/rollback and supported HTTP/edge/self-host behavior. Reuse release/security/conformance/behavior/no-leak gates and retain genuine failures. Update framework documentation/claim matrix with this stream's exact supported capabilities. Keep Developer Preview scope and paused CF-22; Study in USA success does not establish every provider/host or GA.

**Exit:** independently reproducible candidates and release evidence; any registry/tag/distribution step uses approved exact artifacts/versions and existing release authorization. Resolve blockers introduced or required by this stream; identify unrelated framework-wide blockers in the release ledger instead of starting an uncontrolled feature sprint or weakening gates. Distribution pending approval remains explicitly pending.

## Verification and rollout contract

After each code-bearing slice run `pnpm -r check`, `pnpm -r build`, meaningful focused package/backend/console integration tests, and affected existing mutation/conformance/security/isolation/SSRF/no-leak gates. New authentication, publication, identity, query or storage boundaries require positive and counterfactual failure coverage. Do not rewrite ledgers or narrow denominators to hide failures. Report baseline and newly introduced diagnostics separately.

Before deployment capture current source/image/service settings, active source/locale releases and recoverable state. Build the allowlisted artifact from the isolated committed branch; omit secrets, private SQL, sync-conflict copies and unrelated generated output. Verify healthy replacement, unchanged intended settings, native administrator behavior and public English/Arabic routes. Never deploy while another session owns the staging lock. Release it with outcome and exact identities.

Keep native visual evidence for design/preview/public parity, not only HTML string assertions. Test complete dataset coverage and representative translated long-tail routes, source update/deletion, permissions, concurrency, provider/store outage and rollback. Use a disposable fixture for destructive/expiry tests rather than logging out shared user tabs or altering source records for convenience.

## Autonomous working and completion record

Maintain one execution ledger for all 14 tasks with dependencies, next action, commit, test evidence, deployment evidence and residuals. Keep progressing across context compactions; Git and receipts are memory. Send concise meaningful progress updates while active. Never leave a UI action at “attempted”; verify its outcome. Do not suppress or conceal external failures because a free provider is unreliable.

The only reasons to request owner input are genuinely missing required information/access, an applicable action-time approval, or a material product decision whose safe reversible default cannot satisfy the agreed requirement. Do not ask for routine implementation choices or repeat existing approvals. A blocked provider or production gate does not block fixture development, UI, package, migration inventory or other independent work.

At completion deliver: task-by-task verified/gated status; source/branch/commits and deployment identities; Study in USA page/record/locale coverage and exclusions; real-provider versus manual provenance; uncertainty accounting; storage/backup/restore results; route mapping and cutover status; independent package/host evidence; screenshots/runbooks; uncommitted state and precise remaining approvals. Do not claim all 14 delivered with external gates or failed acceptance items hidden.

## Launch prompt for the separate session

> Work autonomously end-to-end on `docs/plans/frontbase-study-in-usa-translation-autonomous-handoff-20261020.md`. This is the owner-authorized 1–14 translation stream. Study in USA is the only real site target; do not target any other WordPress site. Start from the committed handoff base in an isolated worktree, claim the stream, revalidate existing evidence, then implement and verify every remaining task using Frontbase's existing patterns. Commit/push coherent slices, coordinate shared staging deployments through the audit lock and continue without routine supervision. Preserve live source data, optional same/separate translation storage, pure HTTP transport and existing security/accounting boundaries. Prepare unavoidable production/distribution approvals concretely while completing independent work; report any gated items honestly. Do not stop at the next small milestone or ask me to keep saying “go on.”
