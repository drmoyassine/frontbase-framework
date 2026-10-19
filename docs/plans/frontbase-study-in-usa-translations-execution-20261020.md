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

- (pending) EasyPanel connector availability for staging deploys.
- (pending) Browser tooling availability for native UI verification/screenshots.

## Execution log (append per slice)

- 2026-10-20: Stream claimed; worktree created from f8d7354; audit lock written; ledger created. `pnpm install` started. Next: baseline `pnpm -r check`/`build`, then codebase survey mapping tasks→surfaces.
