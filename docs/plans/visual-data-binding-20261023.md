# Shared Bind control and visual item composition — 2026-10-23



Owner scope: one Table/Saved View drilldown; ordinary composable Repeater items, full source-field/relationship discovery and reuse across other data elements. Work is isolated in codex/integrated-finalization-20261022. Existing source data, projection SQL/grants, saved-view filters, locale content and Block Versions are preserved.



## Implementation



- Shared LiveSourceSelector now owns the grouped Bind menu for Repeater/Table/Grid/Card/KPI/Chart/InfoList. Saved source table is read-only detail; empty Saved View branch disabled; unavailable selection and retry states remain explicit.

- Item template tree selects ordinary child nodes. New repeaters already seed an ordinary Card. Card can opt into single-record binding through the shared Repeater renderer. Per-instance source identity makes later SSR/hydrated rows select authored children; bound expression text cannot be overwritten with rendered record values.

- Shared useRecordFields and RecordFieldPicker expose all source columns and lazily traversed FK relationships to @/mapping and structured columns. Nested record scopes and inherited alternative structures remain separate.

- The existing tenant-scoped metadata route family exposes a read-only field catalog. Existing HTTP/SQL runners fetch only selected related fields with bounded FK batches; publication admission checks the exact reviewed authored paths. No arbitrary joins, private-field inference, source DDL or grant widening.

- KPI/InfoList reuse the live-list request transport for saved views; Chart has a typed saved-view aggregate operation using existing SQL capabilities. Bare PostgREST aggregation fails explicitly. See the [operator guide](../guides/visual-data-binding.md) for scope and limits.



## Verification

Final source300ada6/artifact9bd64e3 includes the @/canonical-content correction fromfffd612 and live-canvas remeasurement. Node22 workspace check/build pass;47 focused console tests across9files pass. Backend related-field catalog/projection, reviewed public admission, native PostgREST inspector and datasource-schema tests pass. Prior full serial framework tests and seven independent security faults remain passing evidence for the unchanged engine. The earlier parallel Windows native access violation is retained in the receipt; it was resolved by the exact test retry and full serial run, not hidden.

Native earlier staging acceptance proves the Bind submenu and all three saved views, cities.city rendering, ordinary nested Text insertion and institution-type rendering, plus program degree/tuition/intake field discovery. No owner draft or datasource record was saved. Public homes and four Explore variants return200, source/copy versions and37link hrefs per language are preserved, and anonymous editing/admin inventory are denied. A separate concurrent Arabic publication changes only the header brand label and translation hash; this stream made no translation write.

Final live testing identified the asynchronous geometry gap: records can hydrate inside a fixed-size body without triggering its ResizeObserver. Canvas content/resource observers now use the existing frame-coalesced refresh, restamp template identities, ignore their own attribute stamps and disconnect on document replacement. Regressions cover delayed record targets, delayed images, stamp-loop avoidance and teardown. Final source is pushed and deployed as image31c5046b768f5ca5711847cb92cf11ad4c18a941f572b18833c1a2d39e3ae798 at2026-10-23 22:20:29UTC. Native builder confirms current hydrated drop geometry, Text insertion inside the repeated Container, actual @ selection of institutions.type, and switching the same Text content mapping to cities.city. Real Language School/Private University values and Cleveland/San Rafael/Melbourne/etc. render; the Text content editor contains the canonical expression. Reload discards all temporary authoring edits. Final public preservation/access checks pass. Scoped task complete.

The full console application retains historical type debt outside its scoped check; no full-console TypeScript pass is claimed. This task is not public package publication, production WordPress cutover or completion of unrelated release gates. Datasource translation completeness remains excluded. See the sanitized [receipt](../reports/visual-data-binding-20261024.json).
