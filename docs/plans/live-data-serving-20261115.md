# Live data serving — owner-directed replacement

Status: implementation open. The previous content-snapshot release is superseded, not published. This is the active architecture decision, not a completed runtime claim.

## Contract

Publish layout, component configuration, Actions, binding references, query parameters and access policies. Resolve records through existing datasource adapters on each request. Record edits must not require preparing or publishing a site capture. This includes lists, details, articles, relationships, route membership, SEO, counts, search, pagination and record translations.

New eligible records appear and deleted or ineligible records disappear without republishing. Current datasource/view scope and publication/status fields govern eligibility. Private drafts and foreign tenant data remain inaccessible. Layout history remains; historical content captures are audit/migration inputs only, never a public fallback. Upstream failure produces an explicit unavailable response. Request-local batching and deduplication are allowed; persistent record copies are excluded.

## Ordered implementation

1. Separate the published layout contract from captured records, membership indexes and content hashes. Preserve layout, menu, Actions and translation identities. Retire capture prerequisites from publication diagnostics.
2. Resolve routes, details and lists through existing authorization, adapters, view filters and relationships. Bound fields and pagination, parallelize independent reads and deduplicate identical reads.
3. Read translation heads live. Source-language edits go to their source record; translated-record edits go to translation storage; layout-copy edits go to state storage. Preserve source-change and revision checks.
4. Reduce request CPU using reusable layout-only processing and the shared renderer. Retire exported record HTML and content-dependent pre-render proofs. No browser-only data replacement or required hosted service.
5. Retire legacy capture runtime/authoring entry points after migration coverage. Preserve historical audit receipts and source data; synchronize UI and documentation.
6. Verify production-sized English/Arabic privately, then deploy, publish and verify Study-in-USA.

## Required acceptance evidence

- Publish once, then update/insert/delete eligible records: list, detail, SEO, routes and relationships change with the same layout pointer.
- Current status/scope changes exclude records immediately. Tenant, field and query restrictions remain enforced.
- Current translation edits change only the appropriate locale without replacing the layout pointer.
- Search, sorting, counts and paging use live rows. Missing/deleted details and duplicate routes fail safely.
- Contradictory historical captures or exported HTML cannot influence responses. Upstream failure never falls back to saved records.
- Frontend editing, navigation and sitemaps work in English/Arabic, desktop/mobile.
- Measure cold/warm Free CPU for home, list/search/paging, detail and long article routes. HTTP 200 above the budget is not a pass.
- Run workspace check/build and affected authorization, tenant, SSRF, publication, translation and mutation gates. Record host/adapter boundaries precisely.

## Implementation and evidence

`published-live-query.ts` already dispatches through `/api/data/execute` and deduplicates only simultaneous anonymous reads. Reuse that boundary. The authenticated authoring `createDirectoryQueries` retains its principal requirement; `createLiveDirectoryQueries` uses the tenant-owned published binding contract.

The working tree contains a strict v3 layout-only store, current adapter-backed route/list/detail/SEO resolution, current translation heads, live frontend edit routing, sitemaps and the layout publication UI/API. The Worker public path no longer calls the historical captured-content or exported-record renderer. Legacy authoring retirement and production migration remain open.

Node 22 workspace check/build, the edge-core suite, focused live serving/translation/route tests and frontend edit tests passed during development. The directory-binding mutation harness subsequently passed all 16 break checks using the installed package manager; its earlier environmental download failure is superseded.

Isolated version `89a41a9e-7d67-4500-bab4-edf11376882f` served English/Arabic routes through PostgREST with 18 institutions, 293 programs, 17 cities and 957 articles. A direct database edit changed public content without changing the layout pointer. CPU was 10–47 ms, so Free acceptance remained open.

Isolated version `fe1ab080-37d7-419c-beeb-1276ee4732e7` additionally passed English and Arabic frontend editor inventory → save → public read. Both edits changed public output with the same layout publication hash. Home/list/search/paging/detail/article requests returned 200. Sampled public CPU remained 12–59 ms. Both isolated Workers and their databases were removed.

Profiling identified repeated whole-configuration validation, unnecessary anonymous audience settings reads, whole-hydrated-layout JSON scans, unnecessary English translation inventory, repeated per-row binding validation, and repeated CSS/plural-rule processing. Repairs now also normalize a translation batch's shared locale once and batch current page settings without retaining them across requests.

Isolated version `59cf3fb3-4a90-479d-8bf7-76a5b22e2b93` passed current-source and English/Arabic frontend edits with the same layout hash. Some English details sampled 7–8 ms, while Arabic/list/article samples exceeded 10 ms. Follow-up `11cc8360-a1d7-4b5f-b410-4e30ddbebf09` also passed all tested routes and both editor flows; sampled public CPU ranged 10–55 ms. Neither run proves the Free CPU budget. Both fixture Workers and local fixture databases were removed. The subsequent page-settings batching and renderer-promise reduction still require remote measurement.

Snapshot prepare/publish entry points return 410 after a live layout is active; historical reads remain available for audit. The translation UI switches to live-edit guidance. Thirteen focused UI tests pass. The approved editorial migration uses a revision-CAS status transition and refuses changed or unapproved source content; its existing six editorial and seven approval mutation controls pass. No production article status has changed.

The expired Supabase connection was renewed through its existing browser account with unchanged recipient/scope. Its production datasource now passes HTTPS/schema checks. No source record was edited. The six layouts were privately prepared through authenticated routes; local preview cannot decrypt the production accounts using a different session key, so verification uses a non-active Worker version with its retained secrets.

Operational correction: the first preview wrapper accidentally invoked `deploy`, briefly promoting `e7f20be1-4231-4022-974a-ce40ecbfc944`. It was immediately rolled back to `6451e8cf-39ae-4ec3-bd13-126d825931fb`; Cloudflare confirmed 100% on the original version and the datasource test passed afterward. No active layout pointer or source record changed. The wrapper was inspected and corrected to `versions upload`; future production promotion remains gated.

Isolated versions `45b7398a-d798-43f3-898b-7b47a7db00cf` and `583ad610-693b-4d05-9e67-0991e04ffa74` passed all tested live routes and English/Arabic record edits with an unchanged layout hash. Both fixtures were removed. The former sampled 6–28 ms public CPU; the latter 7–37 ms. Request-local settings batching and compiler-query batching pass focused tests, but Free-budget acceptance remains open. Nine frontend-edit and four source-write mutation controls passed (the changed record-identity anchor was repaired and rerun).

The isolated `b9f5f9a9-98a9-42b8-8910-201850b39d66` run again passed source mutation and both frontend editor languages without republishing; the fixture Worker and Docker resources were removed. Public CPU still exceeded 10 ms on several routes (including Arabic 11–42 ms), so this is functional evidence, not Free-budget qualification.

Private production-data preview version `ae04b05f-b774-436e-a3a8-3a13441736d6` passed authenticated account access and five EN/AR home/list/detail variants with `X-Frontbase-Data: live`. The six-layout hash is `d71b1017daaf74582335ab8c7abc0f4b6ff7ba89f714d57edc9060e47360e5f9`; it is prepared, not active. This exposed a separate middleware bug: the OAuth relay origin guard was mounted on every route. It is now scoped to `/api/provider-oauth/*`; all 26 relay mutation controls pass, including unrelated-route access and refusal of OAuth proof requests from an incorrect origin. Production traffic remains on the restored version.

Further CPU repairs remove asynchronous recursion for ordinary nested field bindings, share identical compiled SQL only inside one page request, batch current favicon settings, and avoid deep-copying live rows just to attach navigation. Whole-workspace Node 22 check/build passed before the final navigation change; focused live tests and the renderer suite passed during this iteration. Final rebuilt-host measurements and remaining gates are still required. Historical publication reads remain available and are explicitly tested; capture writes stay retired after migration.

The full Worker local CPU profile identified repeated structured-cloning of the verified authored layout as a major remaining cost. Verified layouts are now frozen and reused by tenant/runner/hash; the current pointer is still read per request. Date-formatters are bounded and reused without caching record values. Isolated version `f1ef4e87-847b-48da-b5bd-3d9d1f05eef1` passed source and EN/AR frontend edits with an unchanged pointer; warm English samples were 5–13 ms and Arabic 9–14 ms, with a cold Arabic article sample at 37 ms. This still does not pass the Free CPU gate. The fixture was removed.

Further changes use copy-on-write translation projection and bounded locale normalization. Frozen-input, nested-row, inherited Block Version and unchanged-reference tests pass. Node 22 full workspace check/build, the full edge-core suite, all live-layout tests, and translation HTTP/localization mutation controls pass. A fresh isolated measurement is running; production has not been promoted.

## Next executable work

Finish and measure the CPU repairs, retire remaining legacy capture authoring dependencies, migrate only eligible reviewed article source statuses, run security/conformance gates, privately verify the full English/Arabic release, then commit/push/deploy/publish and verify Study-in-USA. Production remains unchanged until these checks pass. No general-release or Workers Free acceptance claim is made yet.
