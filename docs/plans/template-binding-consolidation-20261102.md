# Template binding consolidation — November 2, 2026

Owner authorized implementation after the dependency review. This is not permission to weaken publication scopes, replace published sites or declare public release.

## Dependency findings

- `packages/backend/src/compat/booking-template.ts` creates six standard-node drafts but still attaches legacy directory queries and shared role references.
- `packages/compiler/src/queries/directory.ts` consumes the shared table/field mappings and enforces institution → city and program → institution → city scope checks. These relationships currently affect record admission, not just display.
- `packages/backend/src/compat/catalog-route-inventory.ts`, publication preparation and manifest validation consume the same mappings for original routes and captured records.
- `packages/backend/src/compat/frontend-records.ts` uses active captured mappings to resolve canonical write destinations. Replacing those with browser-supplied destinations would be unsafe.
- Translation and published-record identities must remain stable; visual bindings alone do not replace record identity and URL policy.
- Existing ordinary Bind/@, saved views, relationships and template URL policy are reusable surfaces. No new independent collection system is approved or needed.

Source commits: `a3e85f4b` (relationship editor repairs), `08a5a2fa` (installer, diagnostics and identity/URL ownership), on `codex/native-template-publication-20261102`. These are not merged/deployed acceptance receipts.

## Initial changes in this branch

1. Installer Choose → Review → explicit confirmation → Install. No second data mapping form. Existing backend installer input/configuration, review digest, atomic writes and uncertain-operation receipts are preserved.
2. Actionable diagnostics reuse every existing readiness key; publication returns a bounded named error and setting diagnostics before capture. No remote raw SQL/credential/error text is exposed.
3. Progressive diagnostics link to General, existing Data Studio fields or shared route settings. Missing datasource/table hides downstream UI noise only; backend checks remain complete. Diagnostics do not mutate configuration.
4. Record ID/original-URL selection is now in the reusable template's URLs panel, including before first publication. It writes the existing revision-checked shared configuration, preserving scope, other roles and media mappings. Data Studio hides those controls only when a unique reusable template exists; legacy/no-template sites retain their existing editor. Ambiguous diagnostic links require choosing the intended template, never guessing.
5. Two pre-existing relationship UI crashes found by the broader type review are repaired: selected schema is passed into RelationshipsView; RelationshipModal defines its editing flag before using it. Numeric datasource IDs are normalized only for APIs requiring strings.
6. Existing sites, serialized configuration, publication captures, scopes, original paths and frontend write routing remain unchanged. No data migration or deployed-site mutation has been performed.

## Still required for the full authorized consolidation

1. Replace legacy semantic query dependencies with explicit authoritative source/identity/filter references using existing datasource and saved-view contracts. Keep the legacy reader until equivalence is demonstrated. Do not infer arbitrary title/URL fields or loosen parent filters.
2. Complete live qualification of the moved identity/path controls and eventual per-template source ownership. Current persisted ownership remains shared by semantic role; moving the controls does not create independent per-template data contracts. The URL panel GET works with zero published records; record-specific overrides naturally require record inventory.
3. Derive publication requirements from selected layouts, bindings and referenced relationships. The legacy validator still requires the complete institution/program/city bundle. Do not merely remove those checks while compiler queries continue to depend on them.
4. Add per-element/schema/view availability diagnostics, including Block Versions, relation fields and deleted fields. Current diagnostics describe shared configuration, not arbitrary element schema validity.
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

## Next executable task

Inventory each legacy semantic query use in the six installed layouts and record-edit/publication paths. Design a versioned compatibility reader that maps existing saved configuration into existing source/view contracts without changing record identity, original URLs or scope predicates. Add equivalence tests before retiring any old controls or relaxing the fixed-role readiness checks. Then add element/schema diagnostics and perform the fresh UI acceptance matrix. This patch is an initial authoring consolidation, not completion of the entire migration.
