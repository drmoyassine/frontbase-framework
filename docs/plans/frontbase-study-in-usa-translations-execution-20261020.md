# Study in USA translation stream — execution ledger (tasks 1–14)

Live execution record for [the autonomous handoff](frontbase-study-in-usa-translation-autonomous-handoff-20261020.md). Git and this receipt are memory; chat is not. Update per-task states truthfully: **not started / active / verified / externally gated**. A claim is not verified completion.

## Session identities

- Branch `codex/study-in-usa-translations`, worktree `.claude/worktrees/study-in-usa-translations`, execution base **`f8d7354dd61a7da9cbb8cca482cde20dce5b4b7b`** (= origin/codex/wordpress-pilot tip; verified 2026-10-20, no successor).
- Audit claim + staging deployment lock: entry "2026-10-20 … CLAIMED" at top of `docs/history/PUBLIC-RELEASE-AUDIT.md`.
- Toolchain: node v26.7.0, pnpm 10.15.1. Root scripts: `pnpm -r check`, `pnpm -r build`, `pnpm -r test`, `pnpm -r test:mutation`.

## Baseline facts (verified from f8d7354 docs/evidence)

- **Staging:** EasyPanel `newpanel.studygram.me` project `studygram` app `usa-frontbase-staging`; public `https://studygram-usa-frontbase-staging.firmbase…` (exact: `https://studygram-usa-frontbase-staging.fir7vq.easypanel.host/`); admin `/frontbase-admin/settings?tab=translations`; datasources `/frontbase-admin/data-studio/datasources`. Last healthy deploy: action `cmvfqwo7i00a907qq0dgu1omk`, image `sha256:803f1745bc107abd240bc59aef3ae1d42d607e851a6e3941833568e8fec73b81` (source `a5b8589`). Deploy recipe per receipts: clean `git archive` of committed branch → upload via EasyPanel → verify status/health/public hashes. **Connector tools (EasyPanel API/MCP) must be discovered in this session; not yet confirmed available.**
- **Published:** Arabic Homepage 85/85 fields, catalog `6f0ac447…`, source site generation 21, `/ar/` 200/RTL/noindex staging. Other page bodies = source fallback with source canonical. Header language switcher = dropdown, current-page + query preserving.
- **Translation storage:** Transo connection → owner infra `studygram-selfhost`, native PostgREST HTTP, schema `translations`, accounting protocol v1 installed; `public` reserved for owner. Native PostgREST is read-only paths; write/aggregate/join separate.
- **Provider:** saved OpenRouter free model selection in Settings (inspect saved value; do not hardcode). Host opt-in env `FRONTBASE_TRANSLATION_EXECUTION_ENABLED=1` already set on staging.
- **Held batch `05b7a503`:** 2 settled drafts, 1 failed/uncertain, 1 queued undispatched; maxConcurrent 1 blocks dispatch. Owner hold stands: do NOT resume, retry, reconcile or zero it.
- **Known baselines to preserve:** broad App/auth console type debt = 74 diagnostics (zero new allowed for App/auth slice); expanded builder import debt = 17 baseline diagnostics; conformance 257/334 + 77 documented refusals; CF artifact ≈620–621 KiB gzip with prohibited-client-symbol gate.
- **Real target URLs:** `https://study-in-usa.com/sitemap.xml`, `https://study-in-usa.com/ar/sitemap.xml` (observed 2026-10-16: 4 child maps each, 1,266 entries, all non-home match after /ar/ strip — historical evidence, re-verify).

## Task board

| # | Task | Status | Slice commits | Evidence | Gates/residuals |
|---|---|---|---|---|---|
| 1 | Stable translation references (pages, menus, Block Versions, datasource record fields) | not started | | | Exit: same record field reuses approved translation across Repeater/Table/Grid; reorder/pagination can't detach identity; override vs inherited review proven |
| 2 | Complete discovery and contextual extraction (all Study in USA pages/fields, coverage report) | not started | | | Exit: full inventory w/ stable refs + fingerprints + translatability decisions; "only 16 institutions" truncation resolved with real evidence |
| 3 | Reliable contextual AI generation (durable plans/leases/allowances, resume, cancel/retry) | not started | | | Exit: real multi-unit batch via native UI, honest provenance; free-provider failures recoverable; no paid routing |
| 4 | Visual translation authoring (builder locale picker/editor, Data Inspector per-record review) | not started | | | Exit: admin edits page/Card Repeater Arabic in place; preview = actual renderer |
| 5 | History, terminology and reuse (revision history UI, glossary/memory ports) | not started | | | Exit: manual corrections survive regeneration; tenant isolation of memory/history |
| 6 | General preview and publication (generalize Homepage prepare/CAS to pages/menus/versions) | not started | | | Exit: draft never anonymous; publish/rollback/deactivation; per-unit missing/outdated policy |
| 7 | Live translations in all List Components (Repeaters/Tables/Grids, batched lookup, no N+1) | not started | | | Exit: same record → same approved text everywhere; no hidden special cases |
| 8 | Correct localized queries (source vs localized semantics, same/separate store exact plans) | not started | | | Exit: Arabic matches beyond page 1; exact totals across 3 components + both store modes; benchmark on real catalog |
| 9 | Complete language routing and switcher (equivalent-page routing, translated slugs, canonical/hreflang) | not started | | | Exit: hard reload/SSR/hydrated links/forms agree; no false SEO for unpublished pages |
| 10 | Remaining surfaces, formatting and RTL (forms, states, aria, rich articles, dates/numbers/plurals) | not started | | | Exit: rendered/accessibility/SEO inventory covered or justified exclusions |
| 11 | Storage portability and operational recovery (backup/restore, outages, relocation) | not started | | | Exit: deployed config restorable from verified backup; certified paths only, no universal claims |
| 12 | Study in USA WordPress migration inventory (sitemap trees, source↔locale mapping manifest) | not started | | | Exit: reviewable manifest w/ proven/candidate/ambiguous/missing/conflicting routes; no other site touched |
| 13 | Migration rehearsal and cutover prep (staging rehearsal, runbook; production gated) | not started | | | Exit: rehearsal passes; production cutover packaged as ready-to-run runbook, labeled pending unless authorized |
| 14 | Package/product acceptance and distribution readiness (7-library graph, install proofs, claim matrix) | not started | | | Exit: independently reproducible candidates; distribution steps remain approval-gated |

Dependency notes: 1→(2,4,6,7); 2→3; 4→6; 6→7→8; 9 after 6; 12 independent; 13 after 12; 14 last. Cross-cutting per-slice verification: `pnpm -r check`, `pnpm -r build`, focused tests, affected mutation/conformance/security/isolation/SSRF/no-leak gates; baseline vs new diagnostics reported separately.

## Environment/tooling discoveries (append as found)

- **EasyPanel tooling (discovered 2026-10-20):** REST API documented at `<panel>/api/openapi.json`, bearer auth `authorization: <key>`. Key endpoints: `listProjectsAndServices`, `inspectAppService`, `uploadAppCodeArchive` (POST — how receipts' "immutable Git archive" uploads work), `deployAppService` (POST → returns action id), `getAction?id=` (poll; receipts' `cmv…` ids), `restartAppService`, `listDatabaseBackups`/`createDatabaseBackup`/`restoreDatabaseBackup`, `queryServiceLogs`. Helper scripts in temp dir `frontbase-sius/` (`easypanel.mjs`, sanitized).
- **CREDENTIAL GATE — staging deploys:** env has `EASYPANEL_API_KEY`/`EASYPANEL_API_URL` but they point at `admin.frontbase.dev` = the **owner database infra panel** (projects: `management`, `tenants`, `frontbase`; the `admin_frontbase_easypanel` connector). **No API key exists in this session for `newpanel.studygram.me` (project `studygram`, app `usa-frontbase-staging`).** → All staging deployments are EXTERNALLY GATED until the owner supplies the newpanel key. Implementation, fixtures, tests, migration inventory, packaging evidence all proceed independently. Infra panel's backup/restore endpoints are relevant to task 11 against owner DB.
- (pending) Browser tooling availability for native UI verification/screenshots.
- Scratch/temp cache lives OUTSIDE the repo at `C:/Users/drmoy/AppData/Local/Temp/frontbase-sius/` (worktree `.git` is a file, not a dir — cannot append local excludes; never commit raw sitemap downloads).
- Fresh-worktree gotcha: `pnpm -r check` fails at edge-core with `Cannot find module '@frontbase/translation'` until `pnpm -r build` has run once (dist types). Build-first ordering on fresh clones.

## Baseline verification (2026-10-20, this worktree at f8d7354+claim)

- `pnpm -r build`: **PASS**. CF worker artifact 2468.8 KB min / **621.5 KB min+gzip PASS** (<1024 limit); vercel 619.7 KB; deno 620.6 KB; prohibited-client-symbol gate PASS; console build OK (builder-sw 436.8 KB raw).
- `pnpm -r check`: **PASS** (after one-time build; fresh-clone ordering artifact noted above).
- **Locale discovery (site-origin evidence, 2026-10-20):** `study-in-usa.com` homepage HTTP 200, `og:locale=en_US`, **zero hreflang alternates**, generator = WordPress + Elementor 4.3.5 + Site Kit (no GTranslate meta on homepage). robots.txt declares only `/sitemap.xml` + 3 child maps; `/ar/robots.txt` = 200. Published locale set = **en (source) + ar (/ar/)**. No other locale sitemaps/robots exist. English/Arabic complete acceptance confirmed; additional locales: none discovered (explicit "none found" state, not hidden).
- **Sitemap inventory re-fetched 2026-10-20 (matches 2026-10-16 observation exactly):** source index 200 → sitemap-home.xml (1), sitemap-posts.xml (500), sitemap-posts.xml?page=2 (455), sitemap-custom-posts.xml?type=job_listing (310) = **1,266 entries**; ar index 200 → identical 1/500/455/310 = **1,266 entries**. Raw XML cached in temp dir. All non-home URLs historically matched after stripping `/ar/` (prefix-only mapping); positional inference still forbidden.

## Task 1 design (working notes, refined after survey)

**Current state (read firsthand):**
- `@frontbase/translation` contracts already define `resourceRef` with `component` (documentId/blockId/versionId/propertyPath), `record` (connectionId/collection/typed composite key/propertyPath), `system` kinds; unit ID = SHA-256 over canonical ref + scope; source changes bump `sourceVersion`/fingerprint without changing unit ID (identity.ts, contracts.ts).
- Backend Homepage flow (`translation-homepage.ts`): capture → fields → units(kind=component) → review(states missing/draft/outdated) → saveManual CAS → prepare release (catalog≤502, path='/') → activate via CAS pointer in `settings` table (`translation_homepage:active:v1:<locale>`). `projectHomepageLocale` overlays released text onto a fresh live capture.
- **Defect targeted by task 1:** `homepageDisplayFields` (edge-core/src/localization/surfaces.ts) keys Repeater live rows by rendered position `['props','initialRows',String(i),key]` — reordering re-binds translations to different records. Exit gate requires record-key identity.
- Block Versions refused today (`locale_alternate_versions_not_supported`), interactive lists refused (`localized_interactive_list_not_supported`), catalog capped at 502 fields, single page path '/'.
- Directory template (`edge-core/src/directory/bindings.ts`): `directoryQueryBindingSchema` (queryId+params), `recordBindings` (text/href/src/alt/ariaLabel columns), server-side projection `projectDirectoryRecords` through the same renderer. This is the Explore-specific path that must NOT remain the hidden general mechanism.
- Batch flow (`translation-batches.ts` + batches.ts contracts): 4-item admin-continuation batches, menu/record/view-record selection kinds exist; record extraction (`extractRecordInput`) already builds kind=record refs with single-column keys + saved-view membership predicate checks (`translation-inputs.ts`).

**Task 1 planned shape (extends, never replaces):**
1. New shared "translation surface" extractor for ANY published page (not just '/'): generalize `captureHomepage`→`capturePublishedPage(path)`, keeping homepage behavior as the path='/' case; extract from the SAME reviewed anonymous public source selection.
2. Repeater live-record fields: replace positional identity with `kind:'record'` refs — resolve each `initialRows[i]` to its stable record key via the Repeater's source binding (saved view/datasource+table+keyColumn already known to the binding contracts; composite keys supported by contracts). Field path stays `[field]`; block/row binding becomes record ref + owning block id (blockId retained in display metadata only, not identity).
3. Menus: already stable (menuId+itemId+field). Block Versions: allow explicit `versionId` identity — extract effective authored props for Default and alternatives, inherited fields follow Default ref, overridden fields own refs.
4. Inheritance rule: a field in an alternative version with no local override references the Default version's unit (shared identity); an explicit override creates its own unit. Verify both.
5. Fixtures: tenant isolation; reorder rows → identity follows record key, not position; pagination window change → same; override vs inherited review states differ; composite key records.

## Execution log (append per slice)

- 2026-10-20: Stream claimed; worktree created from f8d7354; audit lock written; ledger created. `pnpm install` OK.
- 2026-10-20: Commit `e4d1519` (claim + ledger). Baseline build PASS (621.5 KiB gzip, symbols clean). Sitemap + locale discovery re-verified. Codebase survey workflow launched (10 areas).
