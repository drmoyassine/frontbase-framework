# Owner Supabase deployment — 2026-10-17

**Historical: this Supabase service has been destroyed at the owner’s request.** The [two-container PostgreSQL/PostgREST replacement](frontbase-postgrest-owner-deployment-20261017.md) is the active deployment. Credentials and hostname below belong to the retired instance.

Owner-authorized infrastructure deployment, separate from framework release or completed translation integration. EasyPanel MCP confirms admin.frontbase.dev, not the other newpanel.studygram.me instance. Owner selects generated HTTPS hostname and subsequently requires a dedicated translations schema, reserving public for future use.

## Delivered

New frontbase / translations Compose service, pinned official self-hosted/v0.8.3 (release October16). URL: https://frontbase-translations.4ky7uo.easypanel.host . Eleven upstream services run; analytics/log collection are omitted by upstream default. All eleven containers reached healthy. Unique generated legacy/asymmetric/opaque credentials reside only in the service environment and private owner evidence directory, never this repository. Studio requires generated Basic Auth; credentials are available in EasyPanel environment as DASHBOARD_USERNAME / DASHBOARD_PASSWORD. No public database/pooler ports; only the API gateway has an HTTPS domain. Signups/email/phone/anonymous users disabled; no SMTP provider or paid AI configured.

Named volumes preserve PostgreSQL data/config, storage, snippets, functions and Deno cache. Upstream configuration/init files from the pinned tag are embedded as Compose configs. Initial missing code-directory error was corrected through saving inline source explicitly. Initial startup then failed because Docker could not create a nested config mount under Studio's read-only functions volume; that parent mount was corrected to writable (individual config files remain read-only). Final deployment succeeded. No pre-existing service, hosted source records or pilot publication was modified.

## Schema and access verification

Created only an empty translations schema, owned by postgres. Revoked schema access from PUBLIC, anon and authenticated; service_role has USAGE. Default table privileges revoke public/visitor grants. The schema is not added to exposed PostgREST schemas. Public object count before/after was0/0; no translation table was created in public. Supabase's internal schemas are unchanged. Translation-engine migrations and the actual PostgreSQL runner acceptance suite have not yet run against this instance.

Verified certificate-checked HTTPS: anonymous Studio401, correct dashboard login200, REST missing/invalid key401, publishable access to OpenAPI root403 (intentional upstream gateway policy), secret OpenAPI200, Auth health200, Storage status200. An initial Python default Windows trust-store check reported expired chain; the installed certifi CA bundle verifies the endpoint. Public certificate metadata confirms wildcard leaf validity October16,2026–January14,2027. No verification-disabled request transmitted credentials.

## Resource observation and pending architecture discussion

Host before deployment:4 cores,15992MiB RAM,7065MiB reported free,137.8GB disk free. Shortly after deployment:5831MiB reported free and129.5GB disk free. Per-container startup sample totals about1.9GiB, with PostgreSQL plus PostgREST about192MiB. This is startup/idle evidence, not a production capacity benchmark; cache/host overhead and later workloads differ. Some supplied per-container limits leave limited headroom and should be reconsidered if retaining the full stack.

Owner now asks whether PostgreSQL plus PostgREST would have been more resource-efficient. Yes: the current translation engine uses direct PostgreSQL and does not require the other Supabase services; PostgREST is optional HTTP access. A lean deployment is recommended for this use case. No container removal, service replacement, volume deletion or downsize has been performed in response to that question. Existing data volumes and schema must be preserved if proceeding.

## Remaining

Decide whether to retain the complete suite or replace it with a lean PostgreSQL/PostgREST deployment. Then verify real adapter transaction/race/RLS/recovery gates in translations and configure the chosen datasource. Backups/restore, capacity/load tests and SMTP remain unconfigured; do not treat persistence volumes as backups. No WordPress/source-data migration, translation spend, production cutover, public release or CF-22 action. This docs-only receipt does not renew workspace code tests; source was not changed for deployment.
