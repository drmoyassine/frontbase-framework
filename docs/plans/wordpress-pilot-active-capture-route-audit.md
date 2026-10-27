# Active capture URL audit integration

**Subsequent preparation guard:** [Preparation URL serialization guard](wordpress-pilot-preparation-url-serialization.md) refuses new candidates whose original path differs from browser pathname spelling, before capture persistence, without renaming URLs or changing saved-artifact compatibility. Original regression fails, repaired acceptance and publication mutation 27/27 pass; workspace/security/tenant/conformance/SEO/host/no-leak gates pass. Next: intended host reserved/fallback inventory and a bounded unpublished catalog inventory. Existing raw captures need separate review; broader grammar alignment, browser preview, state admission/recovery and all writers remain gates. No M2 or release clearance. Earlier receipts below remain historical.

**Subsequent route-policy increment:** [Preflight route repair and policy reconciliation](wordpress-pilot-route-policy-reconciliation.md) blocks builder/frontbase-setup/console routes before provider access, preserving original URLs and ordinary hyphenated names. Reproduced old 200-versus-422 failure; repaired acceptance, mutation 8/8, expanded route observations 8/8, workspace and security/tenant/conformance/SEO/host/no-leak gates pass. Next: preparation-time browser URL serialization acceptance and intended host reserved/fallback inventory. Full unpublished catalog, browser preview, state admission/recovery and all writers remain open; no M2 or release clearance. Earlier receipts below remain historical.

2026-10-10. Extends the [page-only admin increment](wordpress-pilot-page-route-audit-admin.md); no migration, install, publishing action or release clearance.

## Delivered boundary

[captureRouteInventory](../../packages/backend/src/compat/capture-route-inventory.ts) reads only the authenticated owner's active publication pointer and its exact hash-keyed artifact. It validates returned owner/key identity, duplicate rows, raw string/UTF-8 size, existing strict pointer/artifact schemas and recomputed artifact hash. Only exact original paths and record IDs are projected: directory, blog index when articles exist, institutions, programs and articles. City rows have no independent captured routes; template page IDs are not invented public URLs. Prepared inactive captures, authoring drafts and uncaptured datasource records are excluded.

This is query-only and uses no external provider, account credential or input-selected hash/owner. The pointer is limited to 1 KiB and capture to 1 MiB before JSON parsing; checks happen after the adapter returns rows, not as a transport streaming bound. Projection inherits capture's 48-row-per-family/1-MiB schema limits. Existing internal audit further bounds IDs/paths/reports and can refuse IDs outside its conservative grammar; it never rewrites them.

The existing admin endpoint adds `coverage: stored-pages-and-active-capture`, `publicRecordsChecked: true` and a strict capture hash/generation identity only when active capture paths are included. Without a capture it retains the prior page-only response. Failure to load/validate a pointer or artifact refuses the whole check instead of silently claiming a page-only pass. A repeated validated pointer read after the page audit refuses observed version changes. Equal reads do not establish atomic state, prevent ABA or certify writer/installer safety.

The existing console dialog validates coverage/identity consistency, displays the capture version and explains that drafts/uncaptured records are excluded. Content bodies, titles, datasource configuration and credentials are never included in the audit response. This is a core backend/console control, separate from the installable education template.

## Verification

- `pnpm -r check` and `pnpm -r build`: exit 0. Existing chunk/dynamic-import warnings persist. Host gzip CF 519.3 KiB, Vercel 519.9 KiB, Deno 520.9 KiB; prohibited client symbols zero.
- Registered `pnpm --filter @frontbase/backend run test:page-route-audit`: corrected end-to-end exit 0. Existing utility 11 groups/five controls, endpoint checks/four controls remain passing. New isolated SQLite acceptance covers all captured path families, preserved old parent paths, inactive/foreign exclusion, byte-identical settings reads, page/capture collision, bounded error redaction, duplicate/oversize/hash/owner refusal and pointer drift.
- Three independent collector source controls disable owner identity, hash integrity and size checks respectively; all are detected by refusal evidence. A fourth independent endpoint control disables pointer-drift refusal and is detected. Baselines run before/after in memory and original repository bytes remain unchanged.
- Console test file: 6/6, exit 0, including version display and inconsistent coverage refusal.
- Rebuilt in-process synthetic full-host route dispatch: exit 0; previous exact capture/legacy behavior unchanged.
- Existing compatibility security, database security and edge-infra no-leak: exit 0. Tenant matrix: 175/175, 29 tenant tables and two public-capability operations.

The first registered suite reached the new control harness and failed a syntax error (`await` in a non-async callback). Corrected the harness; targeted controls and the full registered command then pass. No production check was weakened. Initial out-of-order patch hunks did not apply; corrected ordered patches applied without discarding existing work.

No fresh WordPress/Supabase/storage audit, actual saved pilot state change, activation, live datasource call, deployed proxy/Cloudflare proof, browser preview success or full production mutation/conformance rerun occurred. Prior conformance evidence remains dated to the preceding page-only increment. Local preview remains unverified/offline. All work is uncommitted.

## Next executable work

Reconcile conservative audit classification with existing publication/preflight paths using explicit route-policy counterexamples, preserving original WordPress paths and refusing ambiguity. Then complete intended host reserved/fallback inventory and independent preview inspection. A full unpublished catalog needs a separately bounded owner-authorized datasource inventory; active capture coverage is not that inventory or fresh migration completeness. State adapter admission, trusted durable containment/recovery, every writer and installer coordination remain open. Six packages, one engine, existing admin, R1–R4 scope and paused CF-22 are unchanged; no accepted architecture/release decision is introduced.
