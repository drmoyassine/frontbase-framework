# Per-request datasource schema selection — 2026-10-19

The owner approves browsing and querying exposed schemas through one connection, retaining its default schema and pinning the selected schema to saved views and bindings.

## User workflow

Open Data → Datasources → Inspect Data. **Schema** starts with the connection default. Its suggestions include the default and schemas referenced by saved views; enter another exposed schema and select **Apply schema**. The API validates metadata before switching. Changing schema clears the current table selection and draft table-specific configuration. Choose a table, configure filters and save the view.

Saved View Inspector exposes the same control. Changing its schema requires choosing a table and saving before loading results for the new selection. The shared source selector for Repeaters, Tables and Grids carries the selected schema into table discovery, column mapping and live reads. Choosing a saved view uses its persisted schema. Existing connection settings remain unchanged.

## Implementation

- Reuse the shared Supabase/native PostgREST metadata reader, HTTP client, guarded transport, bounded reads, saved-filter compiler and tenant-owned account resolution. No new adapter/package, SQL RPC, database grant or API exposure.
- Request-local `schema` on owned Inspector reads controls PostgREST profiles. Native endpoints retain their REST root; Supabase retains `/rest/v1`. Unsupported schemas fail; there is no fallback to `public`.
- Application migration25 adds nullable `datasource_views.source_schema`. New Supabase/PostgREST views pin the explicit selection or current connection default; saved view edits preserve the pin. Existing null-schema views retain their previous default behavior until saved. No guessed backfill of encrypted/custom connection schemas.
- Authored `sourceSchema` is accepted by the publication binding contract and carried into shared browser/server list reads. The server derives saved-view scope from its owned definition, refuses caller mismatches, and retains published-view policy checks including any authored schema pin. Non-admin raw selected-schema requests are denied.
- Row/schema/table/search query keys, persisted layouts and table sessions separate connection/schema/table identity. The Inspector remounts on scope changes; column loading and schema validation fence stale responses.
- Scoped reads use GET/HEAD through existing protocol bounds. Unsupported selected-schema mutations are refused before transport rather than accidentally writing another schema. Existing standard Supabase/public editing remains on its legacy path. Native write/aggregate/join capabilities remain separate.
- Translation source extraction still has a public-schema record identity contract. Nonpublic saved views are withheld/refused there rather than silently reading `public`; generalizing translation source identity is a separate task. Translation destination remains `translations` and is unaffected.

## Local evidence

- Full `pnpm -r check` and `pnpm -r build`: both pass; final build retains prohibited-client-symbol verification.
- `packages/backend/test/datasource-schema.mjs`: actual application migration/routes, both endpoint formats, identical table names in two schemas, profile headers, separate sessions, denied/invalid schemas, persisted pins, changed connection defaults, saved-view proxy bindings, override/tenant denial and unsupported mutation refusal.
- Sixteen new/retained backend suites pass: datasource-schema, postgrest-inspector, postgrest-connection, providers-supabase, sdk-http, compat-security, compat-database-security, compat-sync-functional, compat-tenant-matrix, compat-conformance `--gate`, translation-storage, translation-view-inputs, pilot-live-lists, pilot-live-lists-mutation, live-list-consistency and live-list-consistency-mutation.
- Twenty-six focused UI cases pass across schema picker/cache/layout/race tests, saved view editing, shared Repeater/Table/Grid source selection and existing live list controls.
- Four deliberate compiled faults are rejected and exactly restored: dropped profile scope, dropped view pin, shared session key and caller schema override. Seven additional in-memory published/list faults are caught by the retained mutation suites. Private receipts: `schema-gates.json`, `schema-faults.json`, `schema-ui-final.log`.
- The initial UI command forwarded a literal separator and launched the broad suite; it was stopped and replaced with the explicit focused invocation. This is not evidence that the full console test suite passes. Legacy full-console type debt and the release-wide functional-coverage gate remain open.

## Delivery

Source commits: `3d4eaa4` (schema implementation) and `313036c` (active-scope/error/read-only UI corrections and retained publication mutation hook). The final immutable clean Git archive contains2,019 entries/6,639,421 bytes, SHA256 `905b415dcf8a22128b5b7707fe5ce6cf4d5f9f62bb21335d8d8abd3c9e83ac59`; inherited private/cache/sync-conflict exclusions remain, with no working-tree bundle overlay.

Uploaded to existing newpanel.studygram.me → studygram/usa-frontbase-staging. Final action `cmvf3n2ba005507qqh3kw679g` completed **2026-10-19 10:17:27 UTC /13:17:27 Kuwait**. Docker/client symbol gates pass. Healthy container `4a88831aa20efaa89b3df33113d7c8f11634e17b4fecf432afcf1ec89475f2c3`, image `sha256:ed7d348b4e1cc1a8de9578d3daf1e4dacafbd9ec0af945df5583ecf1690ca01e`. Every service configuration field except the intended source archive matches its before value. Eight public-page/auth-denial status/byte/SHA256 results match the pre-deployment receipt.

Actual authenticated browser verification: Transo starts at active/default `translations`, lists six tables, and opens `protocol` with columns id/version and stored row1/1. Attempting `public` returns a visible exposure/permission refusal while the active scope remains translations; reverting clears the warning and the stored row still loads. Final native read-only rows have zero Edit Record actions. Studygram DB starts at public and its table discovery also succeeds. Only translations is exposed on the native instance: a real two-exposed-schema switch was not attempted by granting access; that separation is proven in the actual-route fixtures.

Private screenshots: `schema-inspector-final-staging-20261019.png`, `schema-public-refused-staging-20261019.png` and `schema-supabase-tables-staging-20261019.png`; private delivery/gate receipts are `schema-deployment.json`, `schema-archive.json`, `schema-gates.json`, `schema-publication-gates.json` and `schema-faults.json`. No datasource configuration, keys, grants, live records, saved view definitions, AI settings or publication were changed during verification. The Inspector's normal session/layout state was used. Agent tabs were closed; existing user tabs were preserved.

Scoped source commits preserve1,843 unrelated Git index entries (SHA256 `3a20a2577ded3c7cd07117c591a64d0874a93fd9ebc290c3e114bed4d0c72c48`). The shared worktree still has unrelated staged/recovered changes and its generated CMS rebuild; these were not swept into this delivery.

## Remaining boundaries

PostgREST metadata is schema-specific; the UI does not claim to enumerate every database schema. It offers known values plus validated entry. A schema must already be exposed and permitted by the API. `public` on studygram-selfhost remains reserved/unexposed. Multi-schema source translation, native record editing/joins/aggregates, clean Vercel artifact renewal and broader release gates remain separate. Developer Preview scope and paused CF-22 are unchanged.
