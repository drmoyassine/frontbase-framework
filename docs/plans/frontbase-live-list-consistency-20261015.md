# Live List Component consistency — 2026-10-15

Status: committed/pushed as `8be7c4b` and pagination correction `0d99995`; isolated staging deployed and verified at 2026-10-15 12:32:16 UTC. See the [deployment and open-delta review](frontbase-live-list-deployment-review-20261015.md). Generic frozen snapshots are out of scope by owner direction. Existing published pilot captures are preserved as compatibility data; no owner draft or publication pointer was changed.

## Delivered

- One live datasource/table/saved-view selector in Repeater, DataTable and Grid. Source/view changes clear old schema-dependent mappings, filters, paging and compiled request artifacts. New bindings offer live sources; existing captured Repeater bindings retain an explicit switch to live data.
- One shared live query transport and normalization contract, with typed visible/hidden predicates, bounded pages, search, sorting and accurate totals. Saved views always use the existing server-owned view resolver, including canvas mode; credentials and authorization stay on their existing paths.
- Grid now has actual visitor search, ordering, visible filters, pagination, counts and refresh rather than settings without corresponding controls. Grid Options reuse the Table panel. Table/Grid share filter widgets, configurable count/refresh visibility, labels, state messages and pagination placement. Repeater retains its Card/layout controls and gains the same standard visible-filter widgets and optional refresh button alongside existing custom controls.
- Cache identity includes datasource, table, saved view, request definition, version and query state. Requests receive AbortSignal; late records cannot replace the active view. SSR seed records are restricted to their initial query and the initial rendered page is preserved on mount. Source changes reset visitor state.
- Fixed zero/false filter handling, a missing date-range widget, stale initial totals replacing zero results, and loss of controls when Grid results are empty. Errors remain visible rather than returning fabricated empty records.
- Direct legacy get/search RPC requests use their distinct declared signatures. That search RPC does not accept sort parameters; Table/Grid disable sorting and show an explanation while using it. The SQL path supports simultaneous sorting/search. No provider functions, grants or policies were changed.

## Verification

- Final `pnpm -r check`: exit 0.
- Final `pnpm -r build`: exit 0. Hydrate 1,167.19 KB raw / 326.77 KB gzip; existing bundle-size warnings remain. CF-full 581.0 KB gzip; host-size and no-prohibited-symbol checks pass.
- `pnpm exec vitest run --pool=threads --maxWorkers=1 src/lib/live-list-consistency.test.tsx src/components/builder/data-binding/LiveSourceSelector.test.tsx src/lib/repeater-controls.test.tsx src/components/builder/data-binding/HiddenFiltersEditor.test.tsx`: 20/20 pass. Includes all three actual properties panels, Grid Options, matching Table/Grid saved-view bodies, typed predicates, direct RPC signatures, cancellation, refresh, zero counts and initial-page preservation.
- Grid standalone TypeScript check passes. Table TypeScript check with `--rootDir .` passes; its existing standalone config otherwise reports TS6059 for shared source imports outside its package root. The workspace check covers its configured scope and is not a claim that all legacy console type debt is resolved.
- `node packages/backend/test/live-list-consistency.mjs`: pass against synthetic SQLite through actual API handlers. Proves builder/public saved views, sort plus search, page boundaries, hidden numeric zero, empty totals, live updates, raw-table reads and cross-owner refusal.
- `node packages/backend/test/live-list-consistency-mutation.mjs`: 3/3 faults caught, by behavioral assertions, for dropped view ID, hidden predicates and sort. Faults exist only in an in-memory compiled module. The first sort fixture had coincident ID/score order; adding non-monotonic fixture data made the mutation distinguish the behaviors.
- Existing `node packages/backend/test/single-binding-filters.mjs`: pass, including shared conditions, SQLite reads/counts, column/size guards and owner isolation.
- `git diff --check`: pass. Runtime checks/test logs and source receipt are private local artifacts, not repository secrets or runtime configuration.

The default Vitest forks pool hit a sandbox temporary-file rename restriction before tests. An elevated rerun initially passed 10 tests; a later elevated request was refused when automatic approval review reached its usage limit. The final 20-test run used the supported threads pool inside the normal sandbox, avoiding the forks temporary-file copying requirement. No privileged workaround was used.

## First deployment package (historical; superseded by r2)

Private source package: `frontbase-live-list-consistency-20261015.zip`, SHA-256 `dada926fc6c42013d6b2ef973c059f1378d54f4eb1debe8245beb779eab491bc`, 5,962,458 bytes. Exactly 25 owned source/test files overlay reviewed `frontbase-block-versions-20261015-r4.zip` (base SHA-256 `cea9e606c9f572b202efafc25688eaaebfa2aa0d7ee4be6f7c6f13437b832d66`). These overlays match the initial source checkpoint `8be7c4b`; r2 includes the subsequent correction. The reviewed worker and unrelated workflow/email files remain from the baseline; generated bundles, databases, credentials and owner drafts are not imported from this checkout. Docker build gates include the new integration and in-memory mutation proofs.

The initial approval-review usage limit was cleared in the next authorized turn. Both source checkpoints are pushed and the correction package is deployed; exact package/image identity, clean-image checks and browser evidence are in the [deployment review](frontbase-live-list-deployment-review-20261015.md). The earlier prepared-package paragraph is the first-image receipt, superseded there by r2. No owner draft or publication pointer was changed.

## Next executable task

Migrate the existing pilot catalog listings to intentionally filtered live saved views, including publication integration; the existing captured-site validation currently refuses mutable bindings. Current public pilot pages still use their approved catalog. Preserve content dispositions, URLs/media and owner drafts; do not treat the new selector alone as completing this migration. Real configured-user acceptance, generic lead-flow acceptance and production cutover remain separate. See the ordered evidence-linked backlog in the deployment review. Generic snapshots remain excluded and CF-22 remains paused.

Contract reference: [Supabase RPC documentation](https://supabase.com/docs/reference/javascript/rpc); exact legacy function signatures come from the repository's existing setup SQL. The skill's lightweight changelog fetch returned an unsupported Markdown content-type error; no remote Supabase feature/schema change was made or inferred from that failed fetch.
