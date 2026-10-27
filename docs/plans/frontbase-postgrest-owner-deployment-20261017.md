# Owner PostgreSQL + PostgREST replacement — 2026-10-17

Status: replacement deployed and verified; full Supabase service destroyed at the owner's explicit request. Translation HTTP persistence has since passed bounded acceptance; see the [HTTP delivery receipt](frontbase-translation-http-20261017.md). This receipt supersedes the active full-suite recommendation in the preceding Supabase deployment receipt.

## Active name correction — 2026-10-17

Owner requires the general-purpose name **studygram-selfhost**, anticipating moving other data here later. Active EasyPanel service is now frontbase / studygram-selfhost; endpoint https://frontbase-studygram-selfhost.4ky7uo.easypanel.host . The translations schema remains separate and public remains empty/reserved. No other source data has been migrated or exposed merely because of the broader service name.

EasyPanel renameService explicitly refuses Compose services. Bound the existing database volume by its exact external name (frontbase_translations-db_postgres-data), stopped the old service and verified no old running containers, then created the correctly named service using that volume and preserved credentials. Both new containers became healthy; HTTPS missing/invalid token401 and server health200 pass with publicObjects0/translationTables0. Inspected the actual new database mount to prove it uses the original volume. Only then removed the old translations-db service, whose source also marked that shared volume external; the new containers remain healthy. No database recreation or credential rotation. The legacy storage-volume identifier is intentionally retained to preserve data; it is not the app-facing service name.

The original deployment names/endpoint below are historical evidence, superseded by this section. Code tests were not renewed for this infrastructure/docs-only name correction. The subsequent [HTTP adapter/RPC receipt](frontbase-translation-http-20261017.md) records installed tables and real runtime acceptance; counts below describe the original pre-installation state.

## Active service

EasyPanel admin.frontbase.dev / frontbase / translations-db. Native PostgREST endpoint: https://frontbase-translations-db.4ky7uo.easypanel.host . Exactly two healthy containers: postgres:17.11-alpine and postgrest/postgrest:v14.18. PostgreSQL has no published host port; runtime access is certificate-verified HTTPS to PostgREST. The internal PostgREST-to-database connection stays inside the Compose network; edge apps need no TCP/socket/Hyperdrive capability. Persistent named postgres-data volume; server configuration has max_connections50, shared_buffers128MB and API pool10. Container memory limits1024MiB and256MiB are ceilings, not reservations.

The translations schema is owned by postgres and grants only USAGE/function execution to the non-login service_role used by PostgREST. Authenticator is a separate NOINHERIT login role and is not a superuser. No anonymous role is configured. No application tables exist yet. Public is empty and reserved; PostgREST exposes only translations. Narrow invoker health() returns version/schema/role/count metadata and is callable only with the server JWT. No generic SQL/execute endpoint, Auth/Studio/Realtime/Storage/pooler/Edge Functions service or API gateway is installed. Credentials are newly generated and independent of destroyed Supabase; only private deployment artifacts and the new EasyPanel environment hold values. SERVICE_ROLE_KEY is a signed JWT for server-side HTTP Authorization, not a Supabase opaque sb_secret key.

## Evidence

Both containers healthy. HTTPS health RPC: missing token401, invalid token401, server token200; PostgreSQL17.11, schema translations, role service_role, publicObjects0 and translationTables0. Sampled container RAM after replacement: PostgreSQL78.77MiB, PostgREST8.17MiB, total86.94MiB. This is a short idle sample, not load capacity or a guarantee. Old Supabase startup sample was1.88GiB; samples are not a controlled workload comparison.

Before destruction, queried old public/translations application objects through its existing protected admin API: zero tables/views/materialized views. Only after new service verification did destroyComposeService(frontbase, translations) succeed. A fresh listing confirms the old service absent, its container list empty and the two new containers still healthy. Existing other frontbase/management/tenants services were untouched. No existing source-data migration was necessary or performed. Docker image caches or unused volumes are not claimed purged; no server-wide prune was run.

EasyPanel initially failed to create its code directory, matching its earlier inline-create behavior; saving inline source explicitly initialized it, then deployment passed. The initial /rest/v1 proxy-prefix mapping returned404 after authentication; switched to a native root PostgREST URL and verified it. No TLS checks were disabled for credentialed requests; the installed certifi CA bundle was used. Health checks also verify public stayed empty.

## Next implementation

Replace the uncommitted direct PostgreSQL translation bridge with HTTP-only persistence using the existing Frontbase Supabase/PostgREST client setup, allowing an explicit native PostgREST base URL as well as Supabase's /rest/v1 URL. The old direct translation bridge is not the accepted runtime path. Each atomic job/CAS/completion operation must be a narrowly defined invoker RPC in translations, called over HTTPS. Do not add raw SQL RPCs or emulate a multi-request HTTP transaction. Add real HTTPS race, tenant, authorization, lease and rollback tests; then datasource selection, AI accounting and native localization UI. No whole-framework HTTP portability certification or completed translation integration is claimed here.

Backups/restore/load acceptance and the framework adapter correction are still open. Full Supabase deployment choices are historical, not current architecture. No production cutover, paid AI, npm publication, Git commit/push, public release or CF-22 action. This deployment changed infrastructure and docs, not framework source, so workspace code tests were not renewed.
