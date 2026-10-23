# Staging Data API acceptance hold — 2026-10-23

The exact repair source `27fab67` is deployed on USA staging as image `sha256:1331fea46b48d5313ba1ba58d11de20d2ec30ed732190409197c280ac88a0c74`. The image build succeeded at 2026-10-22 23:44:13 UTC. Current English and Arabic public routes return503, so staging acceptance and task closeout remain open. A successful container build is not a successful site acceptance.

## Established evidence

- The deployed container's Node22 native fetch and DNS-pinned transport reach public HTTPS. The separate native PostgREST translation endpoint responds to unauthenticated GET/POST with401.
- The source datasource's actual `mergeAccountConfig` → `datasourceRunner` path was exercised using `SELECT 1 AS ok`, without printing credentials or reading business rows. Native and guarded HTTP both receive `Could not query the database for the schema cache. Retrying.` The configured project reference and URL agree.
- Bounded provider PostgREST service logs show repeated `Failed to load the schema cache` with SQLSTATE57014: `canceling statement due to statement timeout`. This is an upstream Data API initialization failure; the app's safe serving boundary returns503 rather than publishing stale/unverified data.
- Management SQL became available again. The configured four exposed schemas and extra search-path schemas exist. No manual authenticator schema override was found. Read-only activity checks did not show a blocking transaction backlog. Catalog estimates/dead-tuple counts do not establish severe catalog bloat; no speculative vacuum, statistics rewrite or JIT/configuration change was performed.
- The authenticator's existing8s statement timeout was inspected, not changed. Historical metadata-query statistics include successful queries near that deadline; this does not prove a specific capacity or query-plan cause for the current failures.
- One standard `NOTIFY pgrst, 'reload schema'` was issued. Service logs confirm receipt; public delivery remained503. No DDL, business-data write, grant, key rotation, exposed-schema removal, project restart or timeout relaxation was performed.
- Supabase reports a concurrent [API gateway incident](https://status.supabase.com/incidents/01M5J8ZQ04EZXAYF10Q75MGC1T), including this region. Correlation is recorded; it is not proof that the platform incident caused this project's schema-cache timeout.

## Retained acceptance

Both existing CF and Vercel fixtures run this exact source. Original sessions, datasource metadata and publications survive the upgrades; private anonymous access is denied. Multi-field frontend saves appear in anonymous HTML, stale tokens are rejected, and exact original text is restored on both hosts. A real fresh Node process proves the same ordinary-page path, persistence and restart/session preservation. The earlier native English/Arabic staging editor receipt remains historical evidence, not a fresh success under today's failed Data API.

Staging's independent visual workflow path also completed a manual-only test and persisted its execution and labeled version. That fixture is unpublished; no AI/mail/business-data/remote workflow dispatch was performed.

A full browser reload after27fab67 retained the original signed-in session and unpublished one-node fixture. Opening Versions showed the same persisted v1 label and the corrected explicit-snapshot wording. This independently verifies the deployed console and local state while the external Data API is unavailable.

## Next executable acceptance

1. Restore the shared source project's healthy PostgREST schema-cache load through provider/operator investigation of SQLSTATE57014. Inspect the catalog-query execution/plan under the existing authenticator deadline and shared compute/request pressure; distinguish this from ordinary table/RPC query failures. Do not restart the shared database, alter its safety limits, remove other applications' exposed schemas, or change credentials merely to make this acceptance green. If the provider cannot reload its cache within those bounds, escalate the fixed-code/timestamp evidence through its support/incident process; no support message has been sent here.
2. Re-run the minimal exact-adapter read, then the English/Arabic public comparison against the retained visible-text hashes and37 links per language. Recheck current-session native editing, responsive menu staging/cancellation and the language dropdown/localized links on the deployed source.
3. Record actual results in the [repair receipt](../reports/frontbase-repair-finalization-20261023.json) and clear this operational hold only after successful delivery. Datasource record-translation completeness remains outside scope.

References: [Supabase schema-cache failure guidance](https://supabase.com/kb/troubleshooting/postgrest-error-pgrst002-could-not-query-the-database-for-the-schema-cache), [supported schema refresh](https://supabase.com/kb/troubleshooting/refresh-postgrest-schema), [PostgREST cache and timeout behavior](https://docs.postgrest.org/en/v16/references/schema_cache.html). Private diagnostic logs remain outside Git; only fixed error codes and bounded outcomes are published here.
