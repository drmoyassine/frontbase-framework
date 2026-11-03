# Template binding consolidation — November 2, 2026

Current status: source-contract retirement is implemented and locally qualified. The historical open items below describe earlier checkpoints and are superseded by the canonical retirement receipt at the end. Legacy serialized formats and the v1 API view remain supported compatibility interfaces; they are not independent runtime mapping authorities. Live provider deployment and wider release acceptance remain separate gates.

Owner authorized implementation after the dependency review. This is not permission to weaken publication scopes, replace published sites or declare public release.

## Dependency findings

- `packages/backend/src/compat/booking-template.ts` creates six standard-node drafts but still attaches legacy directory queries and shared role references.
- `packages/compiler/src/queries/directory.ts` consumes the shared table/field mappings and enforces institution → city and program → institution → city scope checks. These relationships currently affect record admission, not just display.
- `packages/backend/src/compat/catalog-route-inventory.ts`, publication preparation and manifest validation consume the same mappings for original routes and captured records.
- `packages/backend/src/compat/frontend-records.ts` uses active captured mappings to resolve canonical write destinations. Replacing those with browser-supplied destinations would be unsafe.
- Translation and published-record identities must remain stable; visual bindings alone do not replace record identity and URL policy.
- Existing ordinary Bind/@, saved views, relationships and template URL policy are reusable surfaces. No new independent collection system is approved or needed.

Source commits: `a3e85f4b` (relationship editor repairs), `08a5a2fa` (installer, diagnostics and identity/URL ownership), on `codex/native-template-publication-20261102`. These are source qualification receipts, not deployed acceptance receipts. Follow-up source `112c8b51` adds element diagnostics; `2bfe2861` documents deployed upgrades.

## Initial changes in this branch

1. Installer Choose → Review → explicit confirmation → Install. No second data mapping form. Existing backend installer input/configuration, review digest, atomic writes and uncertain-operation receipts are preserved.
2. Actionable diagnostics reuse every existing readiness key; publication returns a bounded named error and setting diagnostics before capture. No remote raw SQL/credential/error text is exposed.
3. Progressive diagnostics link to General, existing Data Studio fields or shared route settings. Missing datasource/table hides downstream UI noise only; backend checks remain complete. Diagnostics do not mutate configuration.
4. Record ID/original-URL selection is now in the reusable template's URLs panel, including before first publication. It writes the existing revision-checked shared configuration, preserving scope, other roles and media mappings. Data Studio hides those controls only when a unique reusable template exists; legacy/no-template sites retain their existing editor. Ambiguous diagnostic links require choosing the intended template, never guessing.
5. Two pre-existing relationship UI crashes found by the broader type review are repaired: selected schema is passed into RelationshipsView; RelationshipModal defines its editing flag before using it. Numeric datasource IDs are normalized only for APIs requiring strings.
6. Existing sites, serialized configuration, publication captures, scopes, original paths and frontend write routing remain unchanged. No data migration or deployed-site mutation has been performed.

## Historical migration backlog — superseded by the retirement receipt

1. Replace legacy semantic query dependencies with explicit authoritative source/identity/filter references using existing datasource and saved-view contracts. Keep the legacy reader until equivalence is demonstrated. Do not infer arbitrary title/URL fields or loosen parent filters.
2. Complete live qualification of the moved identity/path controls and eventual per-template source ownership. Current persisted ownership remains shared by semantic role; moving the controls does not create independent per-template data contracts. The URL panel GET works with zero published records; record-specific overrides naturally require record inventory.
3. Derive publication requirements from selected layouts, bindings and referenced relationships. The legacy validator still requires the complete institution/program/city bundle. Do not merely remove those checks while compiler queries continue to depend on them.
4. Selected-page ordinary binding diagnostics are implemented in `112c8b51`, including Block Versions, related fields, schema discovery and saved-view checks. Extend qualification to the replacement source/capture contract and unselected captured pages during the legacy migration.
5. Prove compatibility of existing routes, translation identities and source/translated record edits, plus atomic failure/retry behavior.
6. Verify UI-driven clean CF/Vercel installs and English/Arabic publication on desktop/mobile; native-button evidence cannot be replaced by managed CLI fixtures.

No full-consolidation or cloud acceptance claim is made by the initial patch. Keep this work separate from the self-hosted PostgREST helper prerequisite and broader release gates.

## Verification

- Workspace `pnpm -r check` and `pnpm -r build`: PASS. Expanded focused installer/configuration type gate: PASS, including the final compatibility safeguard. Final changed-console build: PASS.
- Backend `site-publication.mjs`: PASS, including incomplete binding rejection, role denial, no-store/no-secret response, no draft mutation, existing publication behavior.
- Backend `site-publication-mutation.mjs`: PASS, **30/30** intentional faults detected; restored baselines green.
- Backend `template-install.mjs`: PASS, including atomic/uncertain operation behavior and actual English/Arabic rendering.
- Final UI run: **50 tests across 10 files PASS**, covering explicit installer review/reopen, uncertain status-only recovery, legacy fallback, identity URL writes preserving scopes/other roles, unsaved and revision-conflict behavior, unambiguous template links, existing preparation and relationship editors.
- Broader exploratory type checking of PagesWorkspace/TemplateUrls exposes existing dependency debt. A compiler-host comparison with HEAD returned 22 baseline / 19 candidate diagnostics and **zero new diagnostic signatures** (before the relationship fixes). The committed focused gate is expanded over installer, readiness, configuration, identity and preparation components. It does not certify the full console tree. Remaining known debt includes VariablePicker/lib target, analytics config, generated project/variable types and builder slices; do not hide it with casts or claim a globally clean console type tree.
- Node 26.7.0 was used; examples declare Node 22.x and emit an engine warning. Console chunk-size/dynamic-import warnings remain.
- No live CF/Vercel deployment, new cloud resources, source-record edits, template installation or browser/mobile acceptance was performed for this patch. Generated `examples/cf-full/api/cms.mjs` and pre-existing `.gitignore` drift remain unstaged.

## Historical next-task recommendation — completed at source

Inventory each legacy semantic query use in the six installed layouts and record-edit/publication paths. Design a versioned compatibility reader that maps existing saved configuration into existing source/view contracts without changing record identity, original URLs or scope predicates. Add equivalence tests before retiring any old controls or relaxing the fixed-role readiness checks. Reuse the delivered element/schema diagnostics in the replacement writer and perform the fresh UI acceptance matrix. This patch is an initial authoring consolidation, not completion of the entire migration.


## Follow-up: per-element diagnostics and deployed updates

Publication preparation now checks ordinary bound data elements on the selected owned pages. Each issue identifies page, binding-owner element and Default/Block Version. It checks the existing binding schema, owned saved view, datasource/table/schema agreement and fields through the same `fields/` catalog as the @ picker, including explicit expansion of deeper relationship paths. Metadata reads are cached within the request; raw provider errors/credentials are never returned. Existing configuration validation keeps its original precedence. Failed checks do not prepare or publish a version.

The UI lists these issues with links to the owning builder page. Nested bound components retain their own record scope; their fields do not become requirements of the parent. The report is bounded to 100 issues. It covers selected authored ordinary bindings, not a certification of legacy directory queries, every unselected captured layout, or provider availability after publication.

The legacy dependency inventory is conclusive: the v1/v2 captured artifact stores semantic aliases and role-bound record sets. Its compiler, route admission, active source-write lineage and translation identity all read that contract. It cannot be retired by deleting configuration checks or replacing aliases in a query alone. A replacement must version the artifact and route/source lineage contracts, keep v1/v2 readers for existing captures and prove scope, URL, translation and write equivalence before enabling new writers. That work remains OPEN; no retirement or task-close claim is justified by the diagnostics change.

See [updating a deployed installation](../guides/updating-deployed-frontbase.md). Framework main promotion does not synchronize deployment-button Git copies. Update the installation's linked repository to reviewed source, preserve configuration/secrets/state, then use its existing CF/Vercel Git rebuild. Docker/EasyPanel image deployments need a versioned image rebuild/pull and redeploy. Content/template updates remain separate from framework updates.

Qualification: workspace check/build, focused TypeScript, 10 preparation UI tests and the new standalone metadata diagnostics suite pass. The diagnostics suite covers Default/alternative versions, nested record scopes, deleted fields, deeper relations, view ownership/mismatch, cached reads and redacted provider failures. Existing publication functional suite passes. Publication mutation rerun: PASS, 30/30 faults detected and restored baselines green. The actual prepare API also proves viewer denial, tenant-bound lookup, no-store error responses and no capture writes. Saved-view schema inheritance and malformed layouts have explicit regression coverage. No cloud/browser deployment was performed in this follow-up.

Integration receipt: remote `main` and `codex/native-template-publication-20261102` were both verified at `4c0c733ef63ed2cd4500dd55efd962fd23f4b219` after a non-force atomic fast-forward push. Final workspace build PASS: full CF worker 804.9 KB gzip, Vercel artifact 1055.4 KB gzip; client prohibited-symbol exclusion PASS. This integrates the qualified initial authoring and diagnostics changes only. Legacy contract retirement, fresh cloud/browser acceptance and the overall task remain OPEN. Existing deployments were not upgraded. Only pre-existing `.gitignore` and generated `api/cms.mjs` drift remain uncommitted.


## Canonical source-contract retirement — implementation follow-up

The original inventory correctly identified the coupling; subsequent implementation found a smaller compatible replacement than a new public routing format. The shared source contract is in `packages/edge-core/src/directory/source-contract.ts`. It uses the existing binding concepts (`dataSourceId`, `tableName`, `fieldMapping`, a typed equality selection predicate). This does not add a new datasource system, a second editor, arbitrary SQL or a new credential store.

- New authoring writes and atomic template installation persist a strict v2 envelope containing site metadata and exactly one source-binding copy. The existing tenant-owned settings slot, revision sequence, raw-value CAS and installer locks remain unchanged.
- The public v1 API DTO and its editable controls remain compatibility projections. Existing v1 records decode without writes; the next explicit save writes v2. There is no bulk rewrite or implicit revision bump.
- Scoped compiler queries, completeness checks, route inventory, editorial adapters, workspace content actions, live-view planning, related-field lineage, listing policies and frontend source writes all resolve bindings through the common contract. Direct legacy `.collections` reads are forbidden outside the adapter by a regression scan.
- New chunked captures carry an immutable source-binding snapshot. Admission rejects any mismatch with the compatibility metadata. Active source writes use the captured snapshot; later authoring changes cannot redirect an old page's edit. Older compact/chunked captures retain their bytes, hashes, indexes, approvals and records. Their absent snapshot is resolved by the compatibility adapter; no capture is rewritten on read.
- Translation resources/keys, record IDs, aliases and original paths are unchanged. English/Arabic source and translated record routing remain distinct. Legacy compact publication and API formats remain supported readers/interfaces, not independent mapping authorities.
- Existing Booking for X profile completeness/parent-scope requirements remain intentional template admission rules. This change does not invent unsupported per-template source selection, multi-source joins or new filter operators.

Verification PASS: lossless round-trip and zero-valued predicates; strict malformed/secret rejection; tenant/CAS and canonical persistence; old manifest byte/hash preservation; source edits from both capture formats with identical write identities despite changed authoring targets; actual English/Arabic save/public reload with old/new captures; shared translation units; route/list/publication integration; workspace check/build; 51 UI tests.

Fault checks PASS: source contract 3, installer 5, live-view policy 4, shared configuration 3, editorial approval 7, source writes 4, manifest 8, template artifact 8, related fields 3 and publication 30 — **75 total**. Every source-mutating suite restored its baseline; template artifact additionally checked restored source hashes. Source contract/compatibility tests are in the ordinary backend test chain and have named scripts (`test:source-contract`, `test:source-contract-mutation`).

The frontend-record test initially completed its assertions but hit a transient Windows EBUSY during fixture cleanup. Bounded cleanup retries plus explicit temporary-directory checks were added; the rerun passed. No product authorization or data checks were weakened.

This closes the bounded legacy source dependency retirement at source. It does not claim a new generic multi-source publication format, arbitrary filter operators, new provider grants, a live cloud rollout or public release.

Migration guidance is in [updating deployed installations](../guides/updating-deployed-frontbase.md). No live cloud data, existing site configuration or deployed application was changed by local qualification.


## Current integration and remaining acceptance — November 2

Source retirement is closed and integrated: implementation `ac78bc5f`, qualification/documentation `e9b0e985`; the preceding integration receipt verified remote main and the working branch at full SHA `e9b0e985f94b63cbfb0323b9d08a9e00d9694b44`. No deployed app was updated. Earlier open migration inventories in this file describe the work before this receipt and must not be reused as current backlog.

Next: qualify the changed installer and lazy v1 → v2 settings save on disposable native CF/Vercel installations, including six editable drafts, UI bindings/diagnostics, English/Arabic publication and edits, desktop/mobile, and ordinary upgrade/recovery. Preserve existing installations and data. Keep managed/API/assisted evidence distinct from native uninterrupted browser proof. Wider package/security/distribution gates and execution order are in the [current overall plan](frontbase-public-release-finalization-20261024.md#current-checkpoint--2026-11-02).
