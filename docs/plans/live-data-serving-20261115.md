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


### 2026-11-15 publication-time execution plans - authorized implementation

The owner approved compiling authored layout and translation bindings at publication, with current records and saved translation heads resolved once per request through existing adapters. This supersedes the runtime rediscovery approach in the first live-only candidate. Preserve stable resource identities, source freshness, multilingual SEO and frontend edit routing. No record values or translated record text enter the publication artifact. Existing layout publications must remain readable while gaining a derived plan; newly prepared publications persist the validated plan. Implementation and cold/warm Workers Free qualification are active and incomplete. Production remains unchanged pending end-to-end evidence.


### Publication instructions implementation (November 15; qualification active)

Implemented a serializable, deduplicated display program and safe interpolation bytecode in the existing edge-core path. New layout publications persist these instructions; older immutable layouts derive them once without changing their hash. Loading checks the persisted instructions against the authored layout, preventing a forged plan from broadening the record-field surface. No current record values or saved translations enter the artifact. Full Liquid programs retain the existing execution path.

The live request now uses the compiled field selection and interpolation instructions, resolves current saved translations in one batch, shares that field list with translation application and localized SEO, and copies only changed translation subtrees. Relationship aliases are shared only within one render request. The existing PostgREST adapter exposes an optional current-value read projection through the same batch RPC: scope, ordered keys, source/head versions, source/context fingerprints and current text remain checked; unused editorial metadata is not parsed by the public renderer. Other adapters retain their existing batch-reader behavior. No SQL upgrade or credential change is required.

Intermediate isolated evidence: the first compiled-display candidate served the production-sized fixture and English/Arabic source/edit mutations without changing the layout pointer. Tail samples (not complete request accounting) were EN n=27 median 8 ms/max 25 ms and AR n=23 median 10 ms/max 17 ms. The next interpolation/current-read candidate also passed the live functional flow, but sampled EN n=29 median 8/max 34 and AR n=25 median 11/max 32. Both disposable Workers were removed. These are uncontrolled cold/warm distributions, not proof of a particular percentage improvement. The strict CPU gate remains OPEN; deduplicated instructions and final security/build verification are still being qualified. Production remains on its prior version and source editorial statuses remain unchanged.

### Deduplicated instruction candidate — isolated receipt

Isolated Worker version `3d8afdcc-eec4-4c8c-8c3a-7c6b073ff3b1` completed 108 HTTP checks against 18 institutions, 293 programs, 17 cities and 957 articles (~9.7 MB article content). English/Arabic browsing, search, pagination, details, long articles, direct source changes and both frontend record-edit flows passed; the layout pointer stayed unchanged. No Error 1102 was observed. The Worker and disposable database/tunnel fixtures were removed successfully.

Cloudflare tail samples excluding API/health: English n=48, median 8 ms, max 28 ms, 14 over 10 ms; Arabic n=46, median 13 ms, max 30 ms, 35 over 10 ms. These are sampled requests, not a controlled cold/warm benchmark. Compilation is functionally correct but has NOT resolved the CPU gate. Do not promote this candidate based on its HTTP success. Production remains `6451e8cf-39ae-4ec3-bd13-126d825931fb` and no source editorial status or active layout pointer changed.

Node 22 full workspace check/build, focused compiled display/interpolation, publication, live translation, PostgREST adapter and English/Arabic frontend editing tests pass. The final directory-binding mutation rerun passes 16/16 and source-write mutation rerun passes 4/4. The final frontend-editor mutation rerun passes 9/9 with source restoration, including the previously failed compare-and-set baseline. The harness now prints underlying baseline stdout/stderr on a future failure. The earlier interrupted runs and restored-baseline failure are not counted as passing evidence.

Remaining work is explicit: isolate and measure request-time identity/fingerprint validation, response parsing, generic SSR and cold publication-load validation independently; move further immutable work out of the request only where equivalent safety checks can be proven. The current projection reduces validation work but still receives the existing full batch RPC payload. It is not a compact-wire protocol or a fully precompiled HTML renderer. No record snapshot or stale-value cache is an acceptable workaround.

Compatibility review also found that malformed JSON literals admitted by the legacy simple-binding grammar could throw during compilation. The compiler now declines those expressions and preserves the existing evaluator path; regression cases cover invalid numbers and string escapes. This final compatibility-only change requires no provider, schema or credential migration. The isolated CPU receipt above predates this narrow invalid-literal fallback; no performance improvement is attributed to it.


### Request CPU stage measurements and shared renderer changes

The baseline replay on isolated version `a6d29f2e-9ef4-4e7b-a0a6-abea6207a542` reproduced the issue (English 9 ms median and 26 ms maximum, Arabic 13 ms median and 32 ms maximum). Cloudflare's profile endpoint returned 10393 even with replay traffic; its tail supplied per-invocation measurements but no function attribution. Local Node 22 stage measurements use elapsed time with preloaded fixture data and no network. Median of five repeated batches, milliseconds per operation:

| Stage | Baseline | Candidate |
| --- | ---: | ---: |
| Directory checks and projection | 1.464 | 1.195 |
| Directory rendering, identical HTML | 3.205 | 2.154 |
| JSON parsing, 100 populated translation heads | 1.550 | — |
| Runtime schema validation, 100 populated translation heads | 4.121 | — |
| Source fingerprint, 100 distinct populated fields | 11.116 | — |

These are targeted local measurements, not a breakdown of Cloudflare billed CPU or an assertion that the deployment has 100 translated fields on each page.

Reuse compiled directory projection instructions for each loaded immutable layout. Schedule the independent listing count with initial reads. Projects and record queries remain tenant scoped. The shared renderer executes synchronous components without per-node scheduling and retains async execution for Liquid, visibility, and provider-dependent components. Request-local translation identity and fingerprint reuse retains freshness checks; stale heads are refused before hashing. Navigation rewrites copy only affected branches.

First candidate `422be7e5-fec0-49c8-ab6c-740e6be6a34c` passed 108 requests including both live edit paths and source changes with an unchanged publication. English CPU samples n=29, median 9 ms, max 28 ms, 7 over 10 ms; Arabic n=22, median 10.5 ms, max 27 ms, 11 over 10 ms. Baseline and candidate tails are incomplete and not a paired cold/warm benchmark. Both fixtures were removed. Directory mutation suite passed all 16 controls.

The follow-up removes per-request construction of an engine router for an already resolved public document. It invokes the existing shared document renderer after resolving the same scoped route, settings, audience, and live data. The Cloudflare host emits the frontend editor script in that document shell so it can avoid decoding and rewriting its HTML response. Existing engine routes retain their own authorization and query-scope checks.


The final direct-render version `28dfe23d-7f0e-4479-a43d-3163317c894a` passed 108 HTTP requests, including current source mutation, English and Arabic frontend edits, unchanged layout pointer, and exactly one editor script per tested page. No Error 1102 was observed. The test Worker and its disposable fixtures were removed. Tail samples were English n=28, median 6.5 ms, max 25 ms, 4 over 10 ms, and Arabic n=27, median 12 ms, max 28 ms, 15 over 10 ms. Arabic overages were concentrated on home, Explore, blog index and longer articles. This does not establish Workers Free CPU headroom. Production was not promoted.

Final Node 22 workspace build and check, full edge-core functional suite, live layout suite and frontend editing suite passed. Directory mutation controls passed 16/16 on the unchanged directory implementation before the final renderer wiring. The end-to-end CPU attribution remains open because the Cloudflare function profile was unavailable. The local measurements establish specific avoidable costs, while the hosted replays establish that removing them did not close the CPU gate. The current saved head payload still uses the existing RPC contract.


### Per-layout publication and sparse translation reads

New publication IDs address an immutable index of route metadata and layout digests. Preparation validates the full release, compiles display instructions, writes and verifies each layout artifact, then writes the index. Serving reads the current pointer and index, selects the live route, and verifies the exact bytes and envelope of only the selected artifact. The release still contains layout and binding configuration only. Older monolithic versions remain readable. If rolling back to a Worker predating the split, restore the previous compatible publication pointer before deploying that binary.

The existing PostgREST batch function adds a public-current operation. An empty result is a two-byte JSON array. Populated results carry only scoped identity, current text, and source/head freshness fields. The adapter verifies the response and falls back to the existing dense read only when the installed RPC explicitly rejects the new operation as unsupported. Install the additive SQL upgrade before production rollout to avoid that fallback.

The editorial query adapter validates semantic article bodies once and freezes the validated data. The request-local reader preserves that verified object when cloning the rest of the row. The projector still validates unverified inputs, and source edits are read live.

The local PostgREST fixture measured a 4,090-byte index plus 17,424 bytes for homepage, 7,983 bytes for Explore, or 4,120 bytes for the article template. Compared with the previous 46,506-byte whole-release response, cold index-plus-artifact reads were 21,514, 12,073, and 8,210 bytes respectively. All three empty translation batches returned 2 bytes, down from 12,696, 15,870, and 14,076 bytes respectively. These are decoded payload sizes, separate from CPU.


Isolated Workers Free version `0adb7408-c289-4b70-b6d1-6dfde776805b` passed all 108 HTTP requests, including direct source changes and both frontend edit flows with the same published layout pointer. The Arabic save exercised a populated sparse head through the real SQL RPC. No Error 1102 was observed. Tail samples were English 47 (median 7 ms, maximum 26 ms, 6 over 10 ms) and Arabic 46 (median 11 ms, maximum 32 ms, 25 over 10 ms). Sampling and cache state differ from prior runs. The fixture was removed. The CPU gate remains open and no production rollout or SQL upgrade was performed.

Workspace type checks, the Worker build, live layout and editor tests, translation transport and adapter tests, and the five HTTP adapter mutation controls passed. Cold-store coverage verifies selection of exactly one artifact, tamper refusal, and legacy publication readability. The revised lookup is confirmed to cut payload size, but the hosted data do not establish enough CPU headroom for production.
The semantic article mutation gate also passed, detecting removal of the executable-property refusal.

### Precomputed translation identities and sparse rendering

New bilingual layout artifacts include stable IDs for authored display fields. The IDs use the existing writer algorithm and match only the published page and current tenant/translation project. Records and managed menus still resolve their IDs from live inputs. Artifacts without the optional identity plan, including earlier split releases, still work. Existing publications gain precomputed IDs when their layouts are next prepared; record/translation changes require no layout preparation. To roll back to a Worker predating these IDs, restore a compatible previous publication pointer before changing the Worker version.

The current-head adapter returns a map containing only existing heads. The renderer patches those fields only, while retaining the source and context freshness checks and the fallback source text. Dense reads remain available to older callers and servers; the sparse HTTP path uses the existing batch RPC upgrade. New live detail projections carry the same record identity as lists, so editing a detail title routes English to the source datasource and Arabic to its translation record. Older reviewed locale publications keep their original projection behavior.

The captured Study-in-USA layouts produced 47 prepared IDs on the homepage, nine on Explore, and four to six on each index or detail template. These are publication counts, not the count of current records or saved translations.

Workers Free replay `0a7e29a7-be46-4baa-a27f-cdac2c99d291`: 72 requests through nine representative routes in English and Arabic. Every page returned HTTP 200; no Error 1102 occurred. Cloudflare reported CPU for all 72. Cold requests forced both the layout index and selected artifact out of the in-memory caches in the same Worker; this measures layout-cache misses, not isolate startup.

| Locale | Layout cache | Requests | Median CPU | Max CPU | Over 10 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| English | Warm | 18 | 7 ms | 15 ms | 3 |
| English | Cold | 18 | 9 ms | 16 ms | 5 |
| Arabic | Warm | 18 | 10 ms | 19 ms | 7 |
| Arabic | Cold | 18 | 13 ms | 18 ms | 13 |

The documented Free limit is 10 ms per HTTP request. Repeated cold Arabic overruns, along with warm homepage overruns, block production promotion. Keep live records and translations; isolate cold artifact decoding and validation from request-time projection and HTML rendering in the next CPU comparison. The existing production Worker still responds to its health probe (HTTP 200). No production pointer, Worker version or translation schema was changed.

Live edit verification on disposable Workers Free version `980583f3-ab25-4678-85d7-bdcf9b1483f0` passed: a direct source change appeared on reload; an English frontend edit updated the source row; an Arabic frontend edit updated the localized view and left the English row unchanged; a later source change hid the now-stale Arabic head. The publication hash stayed unchanged. The earlier fixture intentionally refused the write when the exposed table lacked a primary key; this run exercised the existing write guard with a keyed table. Both replay Workers and their disposable state were removed.

Node 22 workspace build and type checks, the final affected package/Worker builds, edge-core functional tests, backend live layout and frontend editing tests, and the sparse adapter/HTTP bridge tests passed. The adapter mutation suite passed, including scope and key mismatch refusals. This completes the identity and sparse-rendering changes; the Workers Free CPU gate remains open.

### Warm Arabic homepage CPU and fresh Worker qualification

The current baseline profile used 250 warm Arabic homepage requests against the captured production-sized layout and replayed live HTTP responses. The shared renderer accounted for 1,981 of 4,090 serving samples (48%); localization and template projection were next. Those sample counts show attribution, not Cloudflare billed CPU. The renderer now reuses CSS declaration work only for deeply immutable authored styles and retained landing settings, skips Row/Column work for other components, and reuses equivalent responsive CSS calculations without changing output. Dynamic values, selectors, filters and visibility remain request-local. A paired projection/render benchmark on the captured layout with Arabic context improved from 4.08 to 3.11 ms median with byte-identical HTML and current rows; it is not a Workers Free qualification result.

The Cloudflare replay used 24 measured uncached requests. Four specimens were witnessed as the first request on four different isolates after four version rotations. Each response was HTTP 200 and `no-store`; searches verified current results from the datasource.

| Specimen | English CPU | Arabic CPU |
| --- | ---: | ---: |
| Warm homepage | 13 ms | 16 ms |
| First-time program search on warm Worker | 11 ms | 16 ms |
| Homepage, first request on fresh isolate | 121 ms | 89 ms |
| First-time program search, first request on fresh isolate | 73 ms | 137 ms |

The replay also verified that newly written rows show up on a never-run search and that English and Arabic frontend edits are visible without moving the publication pointer. The isolated Worker and database were removed. The sub-10 ms acceptance criterion failed; Study-in-USA production was not changed.

A separate control on an initialized and migrated disposable installation (Worker version `129cce5f-0639-4772-8ebc-80280f85eb51`) measured `/health` at 35 ms CPU on invocation one and 1 ms on invocation two of the same isolate. Neither response rendered a page. This isolates a first-request startup cost; it does not attribute the remainder of the other isolates' numbers by subtraction. The current Worker initializes the full CMS before handling public URLs. Next, profile that setup and test a smaller public serving entry for initialized installations that reuses the same auth, scoped adapters and renderer. Independently reduce warm homepage/search rendering, since their requests also exceeded budget. Continue to require first-invocation and first-time-search evidence with current data and HTML caching off before promotion.

Node 22 workspace check/build and the Worker no-leak build passed. The edge-core, live-layout and targeted style tests passed, including fifteen byte-parity and fourteen WYSIWYG cases. All five template landing mutation controls detected their broken guarantees.

### Platform versus Frontbase initialization

This comparison separates the CPU used to load the bundle from work the application does before answering an HTTP request. It uses a minimal Worker, the full Frontbase bundle answering before CMS initialization, and normal Frontbase health on migrated disposable state.

The three-arm disposable replay used matched Worker settings and witnessed each recorded cold invocation as ordinal one. Cloudflare reports CPU in whole milliseconds; zero means below the reporting resolution. Wrangler deployment startup validation is a separate metric from the handler's invocation CPU.

| Health specimen | Fresh invocation CPU (ms) | Paired warm CPU (ms) | Wrangler startup validation (ms) |
| --- | --- | --- | --- |
| Minimal Worker | 0, 0 | 0, 0 | 1, 1 |
| Full Frontbase bundle, before CMS init | 0, 0, 0 | 0 | 70, 72 |
| Normal Frontbase health, migrated state | 37, 73, 64 | 1 | 64, 114 |

All twelve HTTP probes returned 200. Two repeats were observed on new isolates and classified as fresh instead of warm. The fixture Worker and database were removed. Loading the full module adds startup-validation work; running the CMS boot on the first handler invocation is the avoidable cost that the minimal and before-CMS arms do not show.

The Cloudflare self-host entry now attempts direct live rendering for anonymous GETs on its configured public origin when the exact migration ledger is current and an explicit session secret is present. It uses the same live renderer and scoped adapters as the full CMS. Health, setup, privileged or session-bound requests, managed cloud tenants, and pending administrator/provider imports keep the original startup path. Where a page needs the compatibility Saved View handler, that handler initializes lazily and retains its normal guards. Missing publication or unproven readiness keeps the normal path. No public HTML, rows, or translation heads are cached by the new entry.

The warmer render path also reuses URL normalization within one render, avoids copying unchanged element properties and keeps untouched branches of the language switcher tree. In a paired Node 22 benchmark on the captured Arabic homepage, the first two changes improved median projection plus render from 3.734 ms to 3.421 ms (8.4%) over eight alternating batches of 550 renders. HTML was byte-identical and a current-row edit appeared in the output. The benchmark measures local projection and rendering only.

Same-artifact Cloudflare replay (built Worker SHA-256 `dee820969875b2f03266c157596ce4e4baf7d70245dde17ed516be304e27b2cf`). A harmless cookie forced the full CMS arm without signing the visitor in. Version rotations and isolate invocation counters separated first requests from warm repeats. Entries are observed CPU in milliseconds, not percentiles.

| Request | Direct, fresh | Direct, warm | Full CMS, fresh | Full CMS, warm |
| --- | ---: | ---: | ---: | ---: |
| English homepage | 43 | 10 | 140 | 17 |
| Arabic homepage | 60, 84 | 21 | 81 | 13 |
| New English program search | 64 | 12 | 65 | 7 |
| New Arabic program search | 91 | 15 | 107, 100 | 13 |

All 18 requests returned HTTP 200 and HTML with `Cache-Control: no-store`. The paired documents matched byte for byte on all four routes. The CMS boot log was absent in the direct arm and present on the full arm's first requests. Ten fresh and eight warm observations show a clear removal of CMS startup work, especially in the English homepage pair. They do not establish a consistent percentage improvement across routes. The remaining cold render exceeds the Free limit, and some warm requests still exceed it. Keep production unchanged and profile the first live render separately from CMS startup before another promotion attempt.

Node 22 workspace build and type checks passed, along with the edge-core suite, fifteen byte-parity cases, backend live layout/translation checks, and the host startup, session and state tests. The tenant matrix passed 175/175; action navigation and state resolver mutation checks detected all three and two faults respectively.

The same isolated Worker verified a direct database update, a new English search and a new Arabic search, an English frontend edit written to its source row, and an Arabic frontend edit written only to its translation. Changing the source afterward correctly hid the stale Arabic translation. The publication hash stayed unchanged; all reads served current data without HTML caching. The disposable Worker and database were removed. No production deployment or publication was changed.
