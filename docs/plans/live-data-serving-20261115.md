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


Latest verification (November 15): `ff0c9271` caches only fully validated, immutable authored menu definitions; every request still reads tenant-owned menu presence/raw bytes and evaluates the current audience. All six menu mutation gates, Node 22 workspace check/build, and the rebuilt bundle no-leak check pass. Cloudflare's dashboard confirms Workers Free; no plan change was made.

Isolated version `ae173200-8ab1-45e6-b287-8acc17bc549e` passed home, list/search/pagination, details and long articles in English/Arabic, plus both frontend record-edit flows with the same layout pointer. No Error 1102 occurred. Warm English sampled 6–13 ms and Arabic 6–14 ms; cold Arabic reached 36 ms. This does not meet the strict CPU acceptance gate. The fixture Worker and database were removed. The next profile targets remaining costs rather than treating HTTP 200 as qualification.

Production remains on `6451e8cf-39ae-4ec3-bd13-126d825931fb`. Non-active version `dc64dfe7-3cfa-4f0f-ae10-0f89761587a6` passed five real-data EN/AR private routes. Read-only editorial inventory found 957 approved article records; no source status migration or active layout publication has occurred.

### Additional November 15 measurements

- `75358b04` removes unnecessary ICU plural-rule initialization for the exact English/Arabic integer cases; all other locales/fractions retain Intl. CLDR parity and five mutation checks pass.

- `f2339f11` reuses validated query definitions while injecting the runner, principal and parameters for each call. Six directory-preview mutation checks pass; no rows or credentials enter that cache.

- Isolated `df3bffa5-5f45-4dc6-92e8-d2993834b447` completed five English/Arabic route passes and direct/source-language/translated editor saves with the same published layout pointer. Warm English detail samples were 4-6 ms; Arabic and homepage samples still exceeded 10 ms (including 11-19 ms). No Error 1102 occurred, but this remains a CPU-gate failure. The fixture was removed.

- Copy-on-write chrome normalization was tested in isolated `1c2379a7-25e6-4e48-a941-875f183c29a3`; all route/edit checks again passed and cleanup completed. Arabic list/long-article samples still reached 11-19 ms. This is not Free acceptance.

- Non-active production version `3b2454ea-df01-4630-804a-e712af7d5ad6` passed five actual-data private EN/AR routes. A read-only comparison of the first/middle/last approved articles matched current revision 2 and all reviewed fields. This is a three-record dry check, not completion of the 957-record migration. No article status or active publication changed.

- `1bb431ec` bypasses promise scheduling for ordinary props and non-navbar favicon processing and avoids cloning plain article/text branches. Full Liquid expressions retain the async path. Node 22 full check/build, edge-core suite, two access-control mutation tests and six localization mutation tests pass. Isolated version `052590f2-de89-4091-ab7c-d1859a7bb766` completed 108 requests and both editor flows without republishing or Error 1102, then was removed. Warm English detail samples were 4-8 ms; Arabic samples still reached 12-25 ms (cold long article 29 ms). The CPU gate remains open. The local workerd profiler completed and its disposable containers were removed. Inspector samples include waits/debugger overhead and are not Cloudflare billed CPU measurements; do not quote their summed durations as phase CPU. No production promotion is authorized by these measurements alone.

## Root-cause analysis requested November 15

Scope: explain the remaining CPU overruns before further implementation. Candidate `1bb431ec`; live-only serving was introduced in `e3c9a57a`. No production change or new architectural acceptance is implied by this analysis.

### Five whys

1. **Why do some Arabic requests exceed 10 ms?** They execute the normal live SSR path plus a localization path that English skips. Actual Free Worker samples show English detail requests around 4-8 ms while Arabic list/article samples include 12-25 ms. English home/long-article requests can also exceed 10 ms; this is not exclusively an Arabic issue.
2. **Why is localization substantial work?** After current records are projected into components, `localizeLiveLayout` normalizes display chrome, inventories fields, constructs scoped message identities, reads current translation heads, validates their source/version/context, and projects changed text back into the tree. This is per displayed field, not merely a locale flag.
3. **Why rediscover fields from the component tree on every request?** The live path reuses `homepageDisplayLayout`, `homepageDisplayFields` and `applyHomepageDisplayFields`, also used by translation capture/review/editing. They enumerate the display surface and alternative Block Versions. Applying translations inventories the fields again; detail SEO calls `homepageDisplayFields` again in `localizedPolicyRecord`. The current identity cache saves some hashing but not these traversals and intermediate structures.
4. **Why has publication not eliminated this structural work?** Publication validates/freezes authored layouts and compiles shared site bindings, but does not compile a reusable display/translation execution plan. Runtime still projects records into UI, extracts their semantics for translation, patches UI, then extracts semantics for SEO. The live-data change reused safe existing primitives without first separating stable layout work from current-value work.
5. **Why was this not caught as a design issue first?** Functional correctness and safety tests proved tenant isolation, edit freshness and no republishing; they did not establish a per-stage cold/warm CPU budget on production-sized content before adopting that runtime composition. Later micro-optimizations treated individual costs while leaving the composition intact. This is an engineering sequencing/measurement gap, not a reason to weaken safety checks.

### Additional contributing design issues

- `PostgrestTranslationJobPersistence.readMany` is already batched, so this is not a separate network request per field. Its response is the persistence contract: complete source units plus revision/head metadata. Public rendering validates that larger contract even though it needs a smaller current-value/freshness result. Payload/validation cost is a credible contributor; exact production CPU share is not yet measured.
- Generic SSR and request-local record projection already use much of the Free budget. Repeated authored-tree transformations, parameter validation, binding resolution, temporary objects and garbage collection leave little headroom for localization. Existing caches only cover part of the stable work.
- Cold misses and garbage collection can explain variability, but neither is proven to explain every outlier. The profiler contains validation, traversal, allocation and serialization activity; its debugger timestamps include waiting and cannot establish precise millisecond attribution.

### Recommended structural correction (proposal, not shipped)

Compile immutable layout/binding/translation/SEO instructions at layout publication using existing component and binding contracts. Keep source records, eligibility, routes, counts and translation heads live. Resolve current data and localized semantic values once per request; share that request-local model with visible rendering, metadata and editing provenance. Introduce a small optional current-translation read projection through the existing adapter interface, preserving scope, source fingerprint, source version and context checks; retain the full persistence interface for authoring/audit. Avoid applying an all-versions review inventory to every public request, while preserving any client-switchable versions the page actually requires.

Before accepting a repair, run controlled same-layout/same-record comparisons: English versus Arabic; missing versus present translation heads; short versus long articles; increasing page size; cold versus warm. Count traversals, translation units, bytes, validations and hashes, then corroborate with actual Cloudflare CPU distributions. Keep unchanged-layout live EN/AR edit tests and all tenant/source-freshness/security mutation gates. No record snapshots, paid-plan change, broad renderer rewrite or disabled validation is proposed.

Confirmed: the repeated structural work and ordering above exist in the code. Not yet proven: the exact share of the 12-25 ms attributable to each stage, or that one change alone will meet the CPU gate. Production promotion and the 957-record migration remain pending.

## Next executable work

Finish and measure the CPU repairs, retire remaining legacy capture authoring dependencies, migrate only eligible reviewed article source statuses, run security/conformance gates, privately verify the full English/Arabic release, then commit/push/deploy/publish and verify Study-in-USA. Production remains unchanged until these checks pass. No general-release or Workers Free acceptance claim is made yet.
