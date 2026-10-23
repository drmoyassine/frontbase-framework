# Shared Bind control and visual item composition — 2026-10-23



Owner scope: one Table/Saved View drilldown; ordinary composable Repeater items, full source-field/relationship discovery and reuse across other data elements. Work is isolated in codex/integrated-finalization-20261022. Existing source data, projection SQL/grants, saved-view filters, locale content and Block Versions are preserved.



## Implementation



- Shared LiveSourceSelector now owns the grouped Bind menu for Repeater/Table/Grid/Card/KPI/Chart/InfoList. Saved source table is read-only detail; empty Saved View branch disabled; unavailable selection and retry states remain explicit.

- Item template tree selects ordinary child nodes. New repeaters already seed an ordinary Card. Card can opt into single-record binding through the shared Repeater renderer. Per-instance source identity makes later SSR/hydrated rows select authored children; bound expression text cannot be overwritten with rendered record values.

- Shared useRecordFields and RecordFieldPicker expose all source columns and lazily traversed FK relationships to @/mapping and structured columns. Nested record scopes and inherited alternative structures remain separate.

- The existing tenant-scoped metadata route family exposes a read-only field catalog. Existing HTTP/SQL runners fetch only selected related fields with bounded FK batches; publication admission checks the exact reviewed authored paths. No arbitrary joins, private-field inference, source DDL or grant widening.

- KPI/InfoList reuse the live-list request transport for saved views; Chart has a typed saved-view aggregate operation using existing SQL capabilities. Bare PostgREST aggregation fails explicitly. See the [operator guide](../guides/visual-data-binding.md) for scope and limits.



## Verification



Engineering evidence is being finalized before deployment. Focused console suite:33/33 tests across selector source reset/empty branches, repeated child identities, browsing controls, locale transport and Block Version inheritance. Related fields integration covers forward/reverse/nested paths, multiple FKs, composite-FK omission, exact selected output and injection/overflow refusal. Reviewed public integration covers virtual projection lineage, live rendered related fields, saved-filter aggregate correctness and anonymous metadata/private/unpublished path denial. Seven independent in-memory security faults (four existing admission/CAS, three new field guards) are caught by behavioral assertions with source untouched.



Node22 workspace check/build pass (707.0 KB gzip Worker; client prohibited-symbol gate passes). Native PostgREST selected-profile field discovery/enrichment and saved-view schema pinning pass over the existing injected HTTP adapter, GET/HEAD only and no SQL RPC. The first cumulative run hit a Windows native access violation in translation-live-list; the exact test passes in isolation and the rest of its backend chain passes. A complete serial rerun and deployed native builder/public preservation are still pending. The full console application has historical type debt outside its scoped check; inspect changed-file diagnostics explicitly rather than claiming a full console type pass.



This feature is not a public package publication, production WordPress cutover, unrestricted relationship permission grant or completion of unrelated release gates. Datasource translation completeness remains excluded.

