# Full publishing integration — 2026-10-11

Status: step 1 complete for implemented API/admin/runtime integration and disposable end-to-end verification. The saved local CMS is updated; actual USA content approval, activation and launch remain separate.

## Delivered behavior

The existing `/frontbase-admin` Page Settings workflow prepares, reopens, previews, reviews and activates one immutable site version. It accepts a chunked catalog alongside the older bounded v1 format. No additional admin or renderer is introduced.

The new version captures shared configuration, saved role templates, an original-path/parent index, public data chunks, exact editorial approval references, and selected ordinary saved pages. Directory tabs, title search and pagination load the requested records through registered queries. Program pages resolve their captured parent institution; institution pages resolve related programs. Blog lists, article details and generic editorial pages use the same component projection. Selected saved Home/Apply layouts are copied without changing their source pages. Previously published ordinary pages can be captured; shared role templates must remain unpublished.

Every public page uses the captured origin, metadata and version identity. Filtered pages remain `noindex, follow`. Sitemap and HEAD handling use the same active generation. Missing/corrupt content is terminal and cannot fall back to mutable pages. Sitemap verification checks all captured chunks and editorial approvals; individual pages load their selected chunks. Requests do not read the canonical datasource.

Exact editorial snapshots are required at preparation, review, activation and when editorial records are served. A matching revision/fingerprint reference cannot authorize a changed public payload. Unapproved canonical drafts are never included by the bulk approval option. Selecting the latest approved revision does not imply the latest canonical draft is approved.

Activation and rollback share the existing owner-scoped generation/hash conditional update. The admin requires successful live-state read and explicit confirmation. Lost responses trigger observation rather than blind replay. Old reviewed v1 captures remain readable, servable and rollback targets.

## Admin use

1. Save shared configuration and the directory, institution, program, article-index, article and editorial page templates that the site needs.
2. For generic content, select **Pages** in the connected-data preview, open a detail, add its editable detail template, and edit/review content through the existing editor. The editorial role uses `directory.page.detail` and semantic body blocks.
3. In **Prepare a site version**, load saved templates. Choose all mapped catalog listings, all approved editorial snapshots, or explicitly selected listings/articles. Select ordinary saved pages such as Home and Apply separately.
4. Prepare privately, save the version ID, and search its captured titles/URLs to inspect any page. Lists are bounded in the UI; search reaches records beyond the displayed first 50.
5. Complete whole-version review, check live state, and explicitly publish the selected reviewed hash. Reopen an earlier reviewed hash to roll back.

Records without an original URL are excluded from bulk catalog capture with explicit counts. Invalid paths, collisions, orphaned parents, unsupported media and missing required templates refuse preparation. This is not permission to silently omit a WordPress original: the migration audit still governs original-URL coverage.

## Contracts and boundaries

- Existing preparation endpoint accepts `format: "chunked"`, expected configuration revision, role-template IDs, ordinary-page IDs, selected paths/approval references, and `includeMappedCatalog` / `includeApprovedEditorial` flags. Caller-supplied public records are rejected.
- Chunked preparation input is bounded to 8 MiB. Legacy preparation retains its 64 KiB input bound; review/preview/read and the separate 4 KiB activation boundary remain bounded.
- Manifest limits remain 8 MiB, 2,048 chunks, 256 MiB aggregate chunk bytes, 20,000 records per collection and 1,000 selected ordinary pages. This is bounded capacity, not an unlimited-catalog claim.
- `@frontbase/compiler/queries` exposes the existing lean query registrar without pulling Node-only build/CLI tools into an edge worker.
- Generic page authoring reuses the configured editorial table with fixed `page`/source-origin/destination predicates. Existing revision, archive-trigger, owner and secret boundaries remain intact.
- Canonical data, media binaries, migration evidence and template styling retain their existing ownership. Final core/template packaging classification remains a separate owner review.
- Live-state read reports the reviewed pointer and capture metadata, not a comprehensive storage-health result. Public content reads and full sitemap verification detect unavailable stored content. Related programs on an institution detail use the configured bounded list window; full program routes and directory pagination are captured independently.

## Verification

Final results:

- `pnpm -r build` and `pnpm -r check`: PASS. Refreshed the staged console with `pnpm --filter @frontbase/example-cf-full build --refresh-console`. CF/Vercel/Deno gzip sizes: 543.6/542.8/543.7 KB; prohibited client symbols: zero. Existing bundle-size/dynamic-import warnings remain. This is build evidence, not deployment parity or a load test.
- `node packages/backend/test/site-publication-chunk-integration.mjs`: PASS after the final build. Real disposable-SQLite HTTP preparation/reopen/private preview/review/CAS activation/rollback; >1 MiB/121 programs; directory/detail/parent/blog/editorial/Home/Apply/SEO/sitemap/HEAD; selective immutable reads; forged editorial payload refusal; missing/corrupt chunk refusal; v1 rollback. A second synthetic 10,049-program catalog renders offset 10,032 and passes active namespace audit.
- New `site-publication-chunk-integration-mutation.mjs`: 8/8 deliberately broken guarantees detected, with restored/rebuilt GREEN after each. Existing mutation suites: publication 29/29, controls 12/12, SEO 8/8, manifest 6/6, chunks 3/3, editorial 6/6, editorial approval 7/7 and directory bindings 16/16. All eight suites exit 0 and finish restored. Total: 95 fault checks including the new suite.
- Admin component tests: 35/35 across preparation, publication, query preview, editorial editor and template insertion. Core renderer suite and compiler query tests PASS. Capture inventory four synthetic controls and namespace five controls PASS.
- `node examples/cf-full/dist/smoke-publication.mjs`: PASS for the actual compiled one-engine host, including self-host Home/Apply/approved generic page/121-program dispatch, SEO/sitemap, infrastructure/admin/auth boundaries, terminal missing-chunk refusal, legacy update/rollback and cloud owner isolation.
- `compat-security.mjs`, `directory-configuration.mjs`, `site-page-reference.mjs`: PASS. `compat-tenant-matrix.mjs`: 175/175 isolated operations. Strict `compat-conformance.mjs --gate`: PASS, 334 operations classified as 257 conforming and 77 verified refusals, zero violations/unreachable/missing schema.
- The additional `--gate --behavior --behavior-gate` run exits 1 against the unchanged historical behavior ledger: functional 271 / shape-only 46 / external-disabled 17. This broader release-gate drift is already documented in the public-release audit; it is not a publishing acceptance pass and the ledger was not rewritten. CF-22 remains paused.

Local runtime: backed up the existing SQLite database privately, verified the original listener/process before restarting, and reused the existing launch configuration/secret. Updated CMS responds HTTP 200 on port 4389 (PID 31512 at verification). Exact ordered rows for all nine saved pages, one datasource and 18 settings are unchanged; comparison SHA-256 is `7d4a696dd5a258917a5f620c45e90b5336406679261a34fe7f7881bc68306cd2`. Private backup/state evidence remains outside Git. No live-browser visual acceptance or real-USA publication preparation is claimed.

Initial failures were corrected: stale package declarations, a Node-only compiler barrel import, a direct-import initialization cycle, an empty legacy-blog sitemap regression, the shared browsing state's old page limit, a test fixture setup/syntax error and literal mutation matching after Windows newline conversion. The final host build initially exposed a subpath-resolution mismatch; the lean query index fixes it without importing Node tooling. The first preservation comparison used dictionaries against the backup's row arrays; comparison in the original row representation proves exact equality. No failing proof is counted as a pass; the behavior-ledger failure remains explicit.

## Scope and next step

All activation, content approval and page changes in these proofs use disposable synthetic state. The owner's local CMS runtime/assets are updated, with saved data/settings and Apply form preserved exactly. No Supabase/media write, actual publication, deployment, Git checkpoint or migration-complete/public-release claim follows. Source/test/docs changes remain uncommitted alongside the preserved prior Claude-review work. No build/mutation process remains active.

Next executable task: apply the accepted Claude/primary original-route dispositions to the USA draft and verify the original-path manifest, including generic pages and the preserved Apply URL. Then close blocking content/media/link dependencies and run intended staging/cutover review. Optional covers and form upgrades remain owner-deferred. Final core/template packaging classification and broader public-release gates remain distinct; do not restart the broader installer or release backlog for this checkpoint.
