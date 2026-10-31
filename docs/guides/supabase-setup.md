# Supabase and self-hosted PostgREST state

The hosted Cloudflare and Vercel wizard uses **HTTPS/PostgREST for application state**. Project discovery and Supabase provisioning also use HTTPS. This path does not require a PostgreSQL connection string or Cloudflare Hyperdrive.

Current implementation and acceptance boundaries are recorded in [the dated delivery plan](../plans/hosted-postgres-state-20261031.md). Local PostgreSQL and host fixtures pass; live qualification of this new hosted path is still pending. Earlier Supabase OAuth receipts certify connection and discovery, not state provisioning.

## Hosted Supabase setup

1. Deploy Frontbase and open its private owner setup link.
2. In **State Database**, choose **Supabase** and **Connect Supabase**. Authorize the appropriate organization, then choose an existing project.
3. Select an existing empty `frontbase_edge_*` schema, or **Create new schema** and enter a new name with that prefix. Source-data schemas and populated application schemas cannot be adopted as fresh state.
4. Configure or skip optional services, then **Review configuration**. Discovery and Review do not create schemas or bindings.
5. **Activate Frontbase** applies the reviewed selection once, provisions the selected schema and its protected RPCs, and activates the host through the existing deployment pipeline.
6. Create the first administrator in the secure form. Application tables and migrations belong to the selected state schema.

The connected grant needs project/database access and permission to read server API keys (`secrets:read` under older OAuth scope names). Project discovery alone does not establish these permissions. No new Supabase project or paid plan is created.

### Credentials and schema boundaries

Apply obtains an existing server API key from the selected project. Modern secret keys and legacy `service_role` keys are supported. Publishable/anonymous keys are not substitutes. The runtime key stays in encrypted host configuration; manifests and receipts contain references rather than its value.

This server key can have **project-wide privileged access**. A dedicated application schema is not the same security boundary as a schema-scoped PostgreSQL login. Do not give an untrusted installation a production project's server key. Use a separate project for stronger infrastructure separation.

The management token is removed from the transformed state profile. An owner-authorized OAuth connection may separately remain encrypted in Connected Accounts under the existing connection contract. Revoking a personal setup token does not revoke the runtime API key.

Apply creates three uniquely named functions in the already-exposed `public` RPC namespace. Existing functions and exposed-schema settings are preserved. The names start with `fb_state_<installation/schema hash>_`. They use `SECURITY INVOKER` and a fixed application `search_path`; PUBLIC and inherited default-role execution grants are removed, then the selected server role receives execution permission. Application tables remain in the dedicated schema. An ownership marker and empty-state check are committed atomically.

The migration RPC runs Frontbase's existing migration plan in one transaction under its PostgreSQL advisory lock. Separate HTTP requests cannot keep a database transaction open; the runner does not emulate that with a process-local lock.

## Hosted self-hosted Postgres setup

1. Expose the database through HTTPS PostgREST. Configure a private server credential and the SQL helpers described below.
2. Choose **Self-hosted Postgres (PostgREST)**, enter the Service URL and server key, then **Test connection and fetch schemas**.
3. Select an existing empty dedicated schema, or **Create new schema** and enter its name. `public`, system schemas and `pg_*` names are reserved for this provisioning path. Legacy connect-only profiles retain their earlier behavior.
4. Review, then Activate. Testing/schema discovery is read-only; provisioning happens only during Apply.

Changing the URL or key invalidates the test and selection. Stale responses cannot certify different credentials. Missing helpers, DDL permission or HTTPS reachability are prerequisites to resolve before Apply.

### SQL helper prerequisite

The existing setup adapter calls `public.execute_query(query_sql text, query_params jsonb)` and `public.execute_sql(query_sql text, query_params jsonb)`. These are operator-installed capabilities, not standard PostgREST endpoints. They must execute as the authenticated server role and allow schema inspection and creation of the selected schema/functions. Anonymous, ordinary authenticated-user and authenticator roles are refused as provisioning roles.

The runner substitutes parameters safely before sending SQL; helpers receive an empty parameter array. The query helper returns a `result` JSON array of row objects. The execution helper returns a `result` object with `rowCount`. After provisioning, runtime uses the new per-installation query, exec and migration functions.

Do not install unrestricted `SECURITY DEFINER` SQL helpers with PUBLIC, `anon` or `authenticated` execute permission. Revoking only PUBLIC is insufficient when default privileges also grant execution explicitly to other roles. Inspect and revoke those grants too. The canonical [installation SQL](../../scripts/deployment-setup/postgres-http-state.mjs) demonstrates the invoker/ACL handling used here. The wizard does not replace existing helpers.

## Runtime adapter

The server-only `supabaseRunner` remains in `@frontbase/edge-infra`. The installed HTTP profile lowers to:

| Setting | Purpose |
| --- | --- |
| `APP_DB_POSTGREST_URL` | Selected HTTPS REST endpoint |
| `APP_DB_POSTGREST_TOKEN` | Encrypted server API credential |
| `APP_DB_POSTGRES_SCHEMA` | Application schema |
| `APP_DB_POSTGREST_RPC_SCHEMA` | `public` for generated functions |
| `APP_DB_POSTGREST_RPC_PREFIX` | Installation-specific function prefix |

Do not switch these values on a populated installation to migrate providers. That requires separate data migration/recovery. First-install support does not certify automatic D1/Turso-to-Postgres migration.

The shared HTTP client sends modern opaque Supabase secret keys in `apikey`; legacy JWT service keys also use bearer authorization. Credentials and SQL transport code never enter browser bundles.

## Existing local/headless and resource APIs

The local launcher, Docker path and headless manifests retain their prior contracts. Their Supabase provisioner can create a scoped PostgreSQL role and choose the previously supported wire transport. This hosted HTTP implementation does not change those paths.

A Supabase personal access token remains a headless provisioning fallback where the existing executor supports it. Use its private secret channel, never command-line arguments, public manifests or chat. This management token is different from the runtime PostgREST API key.

The separate `createConsole({supabaseProvisioning: {url, serviceKey, schemaPrefix}})` resource API uses an operator-configured project and privileged SQL helpers. Database/vector resource schemas share the project's quotas. Its destructive resource deletion is separate from hosted state installation. See the [infra provider guide](infra-providers.md) before enabling that surface.

## Verification and troubleshooting

After building, run `pnpm test:hosted-postgres-state`. Supplying an isolated fixture through `FRONTBASE_TEST_POSTGRES_URL` additionally enables real SQL/concurrency/ACL tests and all seven provisioning mutations. Without it those real-database checks are skipped. For an actual local PostgREST server, additionally supply FRONTBASE_TEST_POSTGREST_URL (loopback only) and FRONTBASE_TEST_POSTGREST_KEY through the private test environment. That covers real HTTP JSONB formats, bootstrap provisioning and runtime queries. Neither local transport is a live Supabase/CF/Vercel receipt; exact evidence is in the delivery plan.

- **Projects appear but Apply refuses:** check SQL/server-key read permissions, selected-project access and API health.
- **Connection/schema test fails:** confirm HTTPS, the server key, SQL helper availability and role permissions. Private/loopback URLs and unsafe redirects are refused by the existing egress policy.
- **Schema is occupied or changed:** select a new empty dedicated schema. Do not delete existing tables to force fresh installation.
- **RPC missing immediately after provisioning:** schema cache reload is requested. Inspect provider health and the recorded operation before retrying; uncertain Apply must not repeat writes.
- **Private setup link fails:** follow only the installation's supported recovery procedure. Native hosted binding-link renewal is a [recorded open task](../plans/hosted-setup-access-renewal-20261031.md). Rotating the bootstrap/encryption root or resetting a claim is not a safe substitute.

See [provider OAuth](provider-oauth.md) and the [support matrix](deployment-support-matrix.md) for host, credential and recovery limits.
