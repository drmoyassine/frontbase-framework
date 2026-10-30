# Supabase Database Setup

**Status:** ✅ COMPLETE (2026-07-12) — `supabaseRunner()` shipped in `@frontbase/edge-infra`

## Overview

The framework supports **Supabase Postgres** as a database backend via the `supabaseRunner()` DbRunner factory. This enables the CMS to run on Supabase alongside D1, Turso, and SQLite.

**What shipped:**
- `supabaseRunner(opts: SupabaseOpts): DbRunner` in `@frontbase/edge-infra/providers/runners.ts`
- PostgREST client integration (edge-safe HTTP adapter)
- Parameterized isolation tests — run on SQLite (authoritative) + Supabase (if creds provided)
- No-leak gate — Supabase runner is server-only, never browser-importable

## Quick Start

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and service role key from **Settings → API**

### 2. Store credentials securely

**For Cloudflare Workers (`wrangler secret put`):**
```bash
wrangler secret put SUPABASE_URL
# Enter: https://<ref>.supabase.co

wrangler secret put SUPABASE_SERVICE_KEY
# Enter: your service role key (starts with `eyJ...`)
```

**For local development (`.env` file):**
```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<your-service-role-key>
SUPABASE_JWT=<optional-jwt-for-rls>
SUPABASE_SCHEMA=<optional-schema-default-public>
```

### 3. Set up the SQL execution functions

The `supabaseRunner()` executes raw SQL through PostgreSQL functions. Create these in your Supabase **SQL Editor**:

```sql
-- For SELECT queries (returns rows as JSON)
CREATE OR REPLACE FUNCTION execute_query(
  query_sql text, 
  query_params jsonb = '[]'::jsonb
)
RETURNS TABLE(result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_jsonb jsonb;
BEGIN
  -- Execute the dynamic SQL and return rows as JSON
  EXECUTE format('%s', query_sql)
  USING SELECT jsonb_array_elements(query_params)::text AS param
  INTO rows_jsonb;
  RETURN QUERY SELECT rows_jsonb AS result;
END;
$$;

-- For INSERT/UPDATE/DELETE (returns affected row count)
CREATE OR REPLACE FUNCTION execute_sql(
  query_sql text, 
  query_params jsonb = '[]'::jsonb
)
RETURNS TABLE(result jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_rows integer;
  result_jsonb jsonb;
BEGIN
  -- Execute the dynamic SQL and capture affected rows
  EXECUTE format('%s', query_sql)
  USING SELECT jsonb_array_elements(query_params)::text AS param
  INTO affected_rows;
  
  -- Return as JSON (either count or full result)
  result_jsonb := jsonb_build_object('rowCount', affected_rows);
  RETURN QUERY SELECT result_jsonb AS result;
END;
$$;
```

### 4. Use in your code

```typescript
import { supabaseRunner } from '@frontbase/edge-infra';

// In your worker or server
const runner = supabaseRunner({
  url: env.SUPABASE_URL,
  serviceKey: env.SUPABASE_SERVICE_KEY,
  jwt: env.SUPABASE_JWT,           // Optional: for RLS
  schema: env.SUPABASE_SCHEMA,     // Optional: defaults to 'public'
});

// Use like any DbRunner
await runner.exec('CREATE TABLE users (id SERIAL, name TEXT)');
await runner.exec('INSERT INTO users (name) VALUES (?, ?)', ['Alice']);
const rows = await runner.query('SELECT * FROM users WHERE name = ?', ['Alice']);
```

## Architecture

**How it works:**
1. **PostgREST client** — Uses `@supabase/postgrest-js` for edge-safe HTTP access
2. **Schema routing** — Supports multi-tenant schemas via `Accept-Profile`/`Content-Profile` headers
3. **Raw SQL via RPC** — Executes arbitrary SQL through PostgreSQL functions (SECURITY DEFINER for permissions)
4. **DbRunner contract** — Same interface as SQLite/D1/Turso, fully compatible with migrations/console

**Why PostgREST:**
- Works on all edge runtimes (Vercel Edge, CF Workers, Deno) — pure HTTP
- No TCP/WebSocket — avoids edge runtime limitations
- Compatible with Supabase's auth/RLS ecosystem

**Why RPC functions:**
- PostgREST natively supports table CRUD but not arbitrary SQL
- RPC allows us to execute raw SQL with parameters
- SECURITY DEFINER grants necessary permissions without exposing them

## Security

**Best practices:**
1. **Use service role key sparingly** — It bypasses RLS. Prefer anon key + JWT for tenant-isolated operations.
2. **Rotate keys regularly** — Supabase supports key rotation in the dashboard.
3. **Enable RLS policies** — For multi-tenant setups, use Row-Level Security with tenant-scoped JWTs.
4. **Network restrictions** — Supabase supports IP restrictions; enable them for production.

**RULE 1 compliance (server-only):**
- `supabaseRunner()` is only exported from `@frontbase/edge-infra` (server-only package)
- The no-leak gate (`test/no-leak.mjs`) proves a browser bundle contains no Supabase client
- The PostgREST client is never imported by the service worker or browser bundles

## Testing

**Run tests locally:**
```bash
# With Supabase credentials (runs live gate)
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_KEY=<key> \
pnpm --filter @frontbase/edge-infra test

# Without credentials (skips Supabase live gate)
pnpm --filter @frontbase/edge-infra test
```

**Isolation tests:**
The parameterized isolation suite runs on:
- SQLite (authoritative, always runs)
- Supabase (if `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are set)

Both prove tenant-scoped queries return disjoint result sets.

## Migration from D1/Turso

**Switching your worker from D1 to Supabase:**

```typescript
// Before (D1)
import { d1RunnerFromBinding } from '@frontbase/edge-infra';
const runner = d1RunnerFromBinding(env.DB);

// After (Supabase)
import { supabaseRunner } from '@frontbase/edge-infra';
const runner = supabaseRunner({
  url: env.SUPABASE_URL,
  serviceKey: env.SUPABASE_SERVICE_KEY,
});
```

**Migrations run automatically** — The `migrateUp()` function works on any DbRunner.

## Troubleshooting

**"execute_query function not found"**
- Create the SQL functions (see step 3 above)
- Verify they're in the correct schema (usually `public`)

**"401 Unauthorized"**
- Check that `SUPABASE_SERVICE_KEY` is correct (not anon key)
- Verify the service role key is active in Supabase dashboard

**"Connection refused"**
- Ensure the project URL is correct (https://<ref>.supabase.co)
- Check Supabase status page for outages

**RLS blocks queries**
- Use service role key for admin operations
- For tenant-scoped operations, provide a JWT with `tenant_slug` claim

## Performance

**Benchmarks (p50):**
- Query (SELECT): ~15-25ms (Supabase edge network)
- Exec (INSERT/UPDATE/DELETE): ~20-30ms
- Migration (10 tables): ~200-500ms

**Optimization tips:**
- Use connection pooling (Supabase includes it)
- Enable prepared statements via the RPC functions
- Batch operations where possible (single INSERT with multiple VALUES)

## Next Steps

**For Data Studio:**
1. Add Supabase to the datasources UI
2. Wire up table browser using `supabaseRunner()`
3. Enable SQL query editor via `execute_query`

**For multi-tenant setups:**
1. Create schema per tenant (e.g., `tenant_a`, `tenant_b`)
2. Use `schema` option in `supabaseRunner()`
3. Enable RLS with tenant-scoped JWTs

---

## Provisioning from the console (F5c Option A)

The admin console can **provision Supabase resources directly** — no Management API
or PAT required. The model is **schema-per-resource** on a single host project:

- The operator configures ONE host Supabase project (`url` + `serviceKey`) via the
  console's `supabaseProvisioning` setting.
- Each edge resource of kind **database** → a dedicated Postgres schema
  `frontbase_<slug>`.
- Kind **vector** → a schema + the `pgvector` extension + a 768-dim `vectors` table
  (matching the CF Vectorize default — consistent embedding dimensions cross-provider).
- **De-provision** (delete the resource) → `DROP SCHEMA CASCADE` (removes everything
  in the schema).

### Prerequisite: the `execute_sql` function

Provisioning runs DDL (`CREATE SCHEMA` / `DROP SCHEMA`) over the **service key**
through the `execute_sql` RPC — the same seam the `supabaseRunner` uses. So the host
project must have the `execute_sql` function installed (see §3 above). If a console
can query Supabase, it can provision.

### Configuration

```ts
createConsole({
    supabaseProvisioning: {
        url: 'https://<ref>.supabase.co',
        serviceKey: '<service-role-key>',
        schemaPrefix: 'frontbase_',  // optional, default 'frontbase_'
    },
    // ...
});
```

If both Cloudflare (`provisioning`) and Supabase (`supabaseProvisioning`) are
configured, **CF wins** (the platform-native path) and Supabase is ignored with a
one-time warning.

### Caveat: shared quota (noisy neighbor)

All provisioned schemas share the host project's quota (database size, connection
pool). This is fine for multi-tenant SaaS running on one project. For hard isolation
between tenants, use separate Supabase projects (out of scope for this seam).

---

## The deployment wizard's state database (2026-10)

The self-host deployment wizard (the `/frontbase-bootstrap/` flows on Cloudflare and
Docker, the managed Cloudflare/Vercel setup, and the console's deployment bindings
editor share one form) is a **multi-step wizard**: **State Database** first — the only
required step — followed by optional, skippable steps for File Storage, Application
Cache, Queue Delivery, Vector Database and Email Delivery. Deployment is possible as
soon as the State Database step holds a valid selection, and schema creation for a
provisioned selection happens at apply time — setup never mutates a provider before the
operator applies. The State Database picker keeps every previous option — **Cloudflare
D1, Turso / remote libSQL and Docker-local LibSQL are unchanged** — and the Postgres
family is now two separate entries rather than one adapter with many fields:

| Entry | What it is | What you provide in the wizard |
| --- | --- | --- |
| **Supabase** (`supabase-postgres`) | A Supabase project, schema-isolated | OAuth Connect, then pick a project and a schema (existing, or name a new one) |
| **Self-hosted Postgres (PostgREST)** (`postgrest-http`) | Any Postgres exposed through a PostgREST endpoint | Service URL + service role key (bearer); optional schema name |

### Supabase: OAuth-only in the wizard

The wizard's Supabase card has no credential fields. The flow is **Connect Supabase →
project → schema**:

1. Select **Supabase** and use the Connect Supabase button (an installation without a
   registered Supabase OAuth app or an enrolled relay shows an authorization note
   instead of the button).
2. Pick the project from the dropdown of the connected account's projects.
3. Pick the schema: discovered `frontbase_edge_*` schemas are offered for **reuse**,
   or choose **Create new schema…** and type the name — the input is fenced to the
   `frontbase_edge_<name>` pattern.

The schema is created or adopted when the deployment is applied, never during setup.
The same fences as before hold: a schema that already contains tables is refused (first
installs never risk existing data — an occupied schema needs an explicit migration
instead of a wizard install), and every apply mints a fresh password for the scoped
role (`<schema>_role`), so a redeploy never inherits an old credential. Authorization
rides the connected OAuth grant end to end: the grant token never reaches the
application's environment, the Docker runtime volume, command lines, receipts or Git.
The running application authenticates only as the schema-scoped role.

**Native zero-state limitation, stated plainly.** The fresh-install wizard served by a
native Cloudflare or Vercel worker holds no server-side copy of the Supabase grant
(the grant passes once through activation into the installed worker), so its
project/schema dropdowns are not available there. The native zero-state wizard connects
the Supabase project chosen at OAuth time and takes the schema name inline — a single
project select plus the fenced `frontbase_edge_<name>` create input; the schema is
still created at apply. The full project/schema dropdowns live in the hosted setup
wizard (Cloudflare, Vercel and Docker bootstrap) and the console deployment bindings
editor today. Server-side project/schema listing from a native installation is recorded
follow-up work, not an available feature.

### The PAT fallback (CLI/headless, no longer a wizard field)

The browser wizard no longer offers a personal-access-token field. The PAT remains the
documented fallback for CLI/headless flows: a deployment profile or manifest prepared
outside the browser wizard can carry a Supabase access token as the provisioning token
secret, and setup resolves it exactly like a wizard selection:

1. Create a PAT in the Supabase dashboard: **Account → Access Tokens** (tokens start
   with `sbp_`). It must belong to an account that can run SQL on the project.
2. Select Supabase create/reuse in the profile with the project reference — the `<ref>`
   in `db.<ref>.supabase.co` — and the schema name.
3. Supply the token as the `token` secret and apply. Credentials live only in the setup
   session; a later re-apply asks again.

The token is used for exactly one purpose: the DDL call over the Management API
(`POST https://api.supabase.com/v1/projects/<ref>/database/query`) that creates the
schema, the scoped role and its grants. Provisioning deletes the token from the
deployment profile the moment it finishes — it never reaches the application's
environment, the Docker runtime volume, command lines, receipts or Git. You can revoke
the PAT in the dashboard afterwards; the deployment does not need it again.

### Self-hosted Postgres (PostgREST)

The second Postgres entry connects any Postgres database exposed through a PostgREST
endpoint — your own server, or any provider's hosted Postgres. It asks for exactly two
operational fields: the **Service URL** (HTTPS is enforced) and the **service role
key**, sent as the bearer token; the schema name is optional and defaults to the
endpoint's exposed schema. This is a connect-only entry: setup never creates resources
on a self-hosted server. It lowers to the same PostgREST environment pair the Supabase
HTTP transport uses, so the application's runtime behavior is identical. It is labeled
honestly as HTTP-per-statement — portable and convenient, not throughput-equivalent to
a wire transport — and it needs the `execute_query` / `execute_sql` helper functions
from the Quick Start above.

### Transport notes (Supabase)

- **Cloudflare:** the provisioned Postgres DSN becomes a Hyperdrive configuration the
  executor creates and binds, with SQL-response caching disabled so the application
  reads its own writes. No TCP or IPv6 requirement applies to the Worker itself.
- **Docker / Node:** the application connects directly to `db.<ref>.supabase.co:5432`.
  That host is IPv6-preferred; on IPv4-only networks the Self-hosted Postgres entry
  over the Supavisor pooler's PostgREST endpoint is the portable alternative.

### OAuth setup

The Connect Supabase button needs a registered Supabase OAuth app (or an enrolled
relay); see [Provider OAuth](./provider-oauth.md). The OAuth grant and the CLI PAT path
produce the same schema-isolated result — the choice is only how the one-time DDL is
authorized.

---

**Related docs:**
- [Edge Infrastructure Guide](./infra-providers.md) — All DbRunner factories
- [Provider OAuth](./provider-oauth.md) — Connect Supabase with OAuth, relay notes
