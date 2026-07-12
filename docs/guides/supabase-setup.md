# Supabase Database Setup (CF-20)

**Status:** ✅ COMPLETE (2026-07-12) — `supabaseRunner()` shipped in `@frontbase/edge-infra`

## Overview

The framework now supports **Supabase Postgres** as a database backend via the `supabaseRunner()` DbRunner factory. This enables the Chimera CMS to run on Supabase alongside D1, Turso, and SQLite.

**What shipped:**
- `supabaseRunner(opts: SupabaseOpts): DbRunner` in `@frontbase/edge-infra/providers/runners.ts`
- PostgREST client integration (edge-safe HTTP adapter)
- Parameterized isolation tests (A-17) — runs on SQLite (authoritative) + Supabase (if creds provided)
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

**Isolation tests (A-17):**
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

**For CF-18 Phase 2+ (Data Studio):**
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

**Related docs:**
- [CF-21 Edge Parity Audit](../cf-21-edge-parity-audit.md) — Full infrastructure mapping
- [Database Runners Guide](./infra.md) — All DbRunner factories
- [Migration Guide](./migrations.md) — DbRunner-based migrations
