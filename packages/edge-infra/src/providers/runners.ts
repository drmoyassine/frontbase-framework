/**
 * DbRunner factories (M-DB.0, Decision B1/B9) — the single seam every host uses
 * to obtain a DbRunner, regardless of backend. The console store, migrations,
 * and the public-data providers all consume these. RULE 6: one source of truth —
 * no hand-rolled drivers elsewhere.
 *
 *   sqliteRunner(url)            — :memory: / file: / libsql:// (Turso) via @libsql/client
 *   d1RunnerFromBinding(binding) — a Cloudflare D1 binding (env.DB), the CF default
 *   d1RunnerFromRest(opts)       — D1 REST API (accountId/databaseId/apiToken)
 *   supabaseRunner(opts)         — Supabase Postgres via PostgREST (CF-20)
 *
 * `exec` returns affected-rows count where the driver reports it (A-17 portable).
 */
import { createClient, type Client } from '@libsql/client';
import { PostgrestClient } from '@supabase/postgrest-js';
import type { DbRunner } from './types.js';

/** A libsql client as a DbRunner (:memory:, file:, libsql://). */
export function sqliteRunner(url: string, authToken?: string): DbRunner {
    return libsqlRunner(createClient({ url, authToken }));
}

/** Build a DbRunner from an existing libsql client (shared by sqliteRunner + turso). */
export function libsqlRunner(client: Client): DbRunner {
    return {
        async query(sql, params = []) {
            const res = await client.execute({ sql, args: params as never[] });
            return res.rows as Record<string, unknown>[];
        },
        async exec(sql, params = []) {
            const res = await client.execute({ sql, args: params as never[] });
            return res.rowsAffected ?? 0;
        },
    };
}

/** A Cloudflare D1 binding (env.DB) as a DbRunner — the CF default (B2/B3). */
export function d1RunnerFromBinding(binding: D1Database): DbRunner {
    return {
        async query(sql, params = []) {
            const ps = binding.prepare(sql);
            const stmt = params.length ? ps.bind(...params) : ps;
            const { results } = await stmt.all();
            return (results ?? []) as Record<string, unknown>[];
        },
        async exec(sql, params = []) {
            const ps = binding.prepare(sql);
            const stmt = params.length ? ps.bind(...params) : ps;
            const res = await stmt.run();
            // The CF runtime returns meta.changes as a NUMBER; some @cloudflare
            // /workers-types versions type it as { count }. Handle both so the
            // affected-row count is correct at runtime (the old `.changes.count`
            // silently returned 0 against the real number-shaped runtime).
            const changes = res.meta?.changes as number | { count?: number } | undefined;
            return (typeof changes === 'number' ? changes : changes?.count) ?? 0;
        },
    };
}

export interface D1RestOpts { accountId: string; databaseId: string; apiToken: string; }

/** D1 over the REST API (when no binding is available, e.g. from a non-Worker host). */
export function d1RunnerFromRest(opts: D1RestOpts): DbRunner {
    const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;
    const headers = { authorization: `Bearer ${opts.apiToken}`, 'content-type': 'application/json' };
    return {
        async query(sql, params = []) {
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql, params }) });
            const json = await res.json() as { success: boolean; result?: Array<{ results: Record<string, unknown>[] }> };
            if (!json.success) throw new Error('d1_query_failed');
            return json.result?.[0]?.results ?? [];
        },
        async exec(sql, params = []) {
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql, params }) });
            const json = await res.json() as { success: boolean; result?: Array<{ meta?: { changes?: { count?: number } } }> };
            if (!json.success) throw new Error('d1_exec_failed');
            return json.result?.[0]?.meta?.changes?.count ?? 0;
        },
    };
}

/** Supabase Postgres connection options (CF-20). */
export interface SupabaseOpts {
    /** Supabase project URL: https://<ref>.supabase.co */
    url: string;
    /** Supabase service role key (or anon key for limited operations) */
    serviceKey: string;
    /** Optional JWT bearer token for RLS (defaults to service key) */
    jwt?: string;
    /** Postgres schema to use (default: public) */
    schema?: string;
}

/**
 * Supabase Postgres via PostgREST (CF-20) — edge-safe HTTP adapter.
 *
 * Uses the Supabase PostgREST client to execute queries over HTTP.
 * For raw SQL execution, requires a PostgreSQL function in the database:
 *
 *   ```sql
 *   CREATE OR REPLACE FUNCTION execute_sql(query_sql text, query_params jsonb = '[]'::jsonb)
 *   RETURNS TABLE(result jsonb)
 *   LANGUAGE plpgsql
 *   SECURITY DEFINER
 *   AS $$
 *   DECLARE
 *     result_jsonb jsonb;
 *   BEGIN
 *     -- Execute the dynamic SQL with parameters
 *     EXECUTE format('%s', query_sql)
 *     USING SELECT jsonb_array_elements(query_params)::text AS param
 *     INTO result_jsonb;
 *     RETURN QUERY SELECT result_jsonb AS result;
 *   END;
 *   $$;
 *
 *   -- For simpler SELECT queries that return rows:
 *   CREATE OR REPLACE FUNCTION execute_query(query_sql text, query_params jsonb = '[]'::jsonb)
 *   RETURNS TABLE(result jsonb)
 *   LANGUAGE plpgsql
 *   SECURITY DEFINER
 *   AS $$
 *   DECLARE
 *     rows_jsonb jsonb;
 *   BEGIN
 *     -- Execute and return rows as JSON
 *     EXECUTE format('%s', query_sql)
 *     USING SELECT jsonb_array_elements(query_params)::text AS param
 *     INTO rows_jsonb;
 *     RETURN QUERY SELECT rows_jsonb AS result;
 *   END;
 *   $$;
 *   ```
 *
 * Alternatively, use table-specific CRUD via the PostgREST client directly
 * (`.from()`, `.select()`, etc.) for typed operations.
 */
/**
 * execute_query / execute_sql are declared `RETURNS TABLE(result jsonb)`, so a
 * PostgREST rpc() returns an ARRAY of rows: `[{ result: <jsonb> }, ...]` (NOT a
 * bare `{result}`). PostgREST decodes the jsonb column into a parsed JS value, so
 * `.result` is already an object/array/number (defensive JSON.parse if a string).
 * Returns null when the column is absent or the aggregate was empty.
 */
export function extractRpcResult(data: unknown): unknown {
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
    const val = row?.result;
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
    }
    return val;
}

/**
 * Inline `$1, $2, …` placeholders as properly-escaped SQL literals.
 *
 * Why: execute_query / exec_sql CONCATENATE the query string (`EXECUTE 'SELECT
 * json_agg(t) FROM (' || query || ') t'`) and never bind `$N` parameters, so any
 * parameterized SQL (the framework's postgres introspection — `WHERE table_name=$1`,
 * filtered data queries, FK lookups) hits an unresolved placeholder and throws.
 * Unlike a real prepared statement, the values must be embedded.
 *
 * Safety: every value here is a VALUE (a table/column name used in a WHERE clause,
 * already validated against the live schema via validateIdentifier, or a filter
 * literal) — never a raw identifier spliced into the SQL skeleton. Strings are
 * single-quote-escaped (doubling `'` → `''`), the standard PG literal escape;
 * numbers/booleans pass unquoted; null → NULL. Exported for unit testing.
 */
export function inlinePgParams(sql: string, params: unknown[]): string {
    if (!params.length) return sql;
    return sql.replace(/\$(\d+)/g, (match, digits) => {
        const idx = Number(digits) - 1;
        if (idx < 0 || idx >= params.length) return match; // unknown placeholder — leave it
        const v = params[idx];
        if (v === undefined || v === null) return 'NULL';
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        return `'${String(v).replace(/'/g, "''")}'`;
    });
}

export function supabaseRunner(opts: SupabaseOpts): DbRunner {
    const headers: Record<string, string> = {
        apikey: opts.serviceKey,
        Authorization: `Bearer ${opts.jwt ?? opts.serviceKey}`,
    };
    if (opts.schema) {
        headers['Accept-Profile'] = opts.schema;
        headers['Content-Profile'] = opts.schema;
    }

    const client = new PostgrestClient(`${opts.url}/rest/v1`, {
        headers,
        schema: opts.schema ?? 'public',
    });

    return {
        async query(sql, params = []) {
            // For SELECT queries, use RPC to call execute_query if available
            // Otherwise, fall back to direct execution via the client
            try {
                const { data, error } = await client.rpc('execute_query', {
                    query_sql: inlinePgParams(sql, params as unknown[]),
                    query_params: '[]' as never,
                });

                if (error) throw new Error(`[Supabase] query failed: ${error.message}`);

                // execute_query is RETURNS TABLE(result jsonb) → PostgREST gives
                // [{result: <rows>}] where <rows> is the json_agg array (already parsed).
                const rows = extractRpcResult(data);
                return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
            } catch (e) {
                // If execute_query function doesn't exist, provide clear guidance
                if ((e as Error).message.includes('execute_query')) {
                    throw new Error(
                        '[Supabase] execute_query function not found. Create it in your Supabase SQL editor:\n' +
                        'CREATE OR REPLACE FUNCTION execute_query(query_sql text, query_params jsonb = \'[]\'::jsonb)\n' +
                        'RETURNS TABLE(result jsonb) LANGUAGE plpgsql SECURITY DEFINER AS $$\n' +
                        'DECLARE rows_jsonb jsonb; BEGIN EXECUTE format(\'%s\', query_sql) USING ' +
                        'SELECT jsonb_array_elements(query_params)::text AS param INTO rows_jsonb; ' +
                        'RETURN QUERY SELECT rows_jsonb AS result; END; $$;'
                    );
                }
                throw e;
            }
        },

        async exec(sql, params = []) {
            // For INSERT/UPDATE/DELETE, use execute_sql to get affected rows
            try {
                const { data, error } = await client.rpc('execute_sql', {
                    query_sql: inlinePgParams(sql, params as unknown[]),
                    query_params: '[]' as never,
                });

                if (error) throw new Error(`[Supabase] exec failed: ${error.message}`);

                // execute_sql is RETURNS TABLE(result jsonb) → [{result: <jsonb>}];
                // value is a rowCount number or {rowCount} object (already parsed).
                const parsed = extractRpcResult(data);
                if (typeof parsed === 'number') return parsed;
                if (parsed && typeof parsed === 'object' && 'rowCount' in (parsed as Record<string, unknown>)) {
                    return (parsed as { rowCount: number }).rowCount;
                }
                return 0;
            } catch (e) {
                if ((e as Error).message.includes('execute_sql')) {
                    throw new Error(
                        '[Supabase] execute_sql function not found. Create it in your Supabase SQL editor:\n' +
                        'CREATE OR REPLACE FUNCTION execute_sql(query_sql text, query_params jsonb = \'[]\'::jsonb)\n' +
                        'RETURNS TABLE(result jsonb) LANGUAGE plpgsql SECURITY DEFINER AS $$\n' +
                        'DECLARE result_jsonb jsonb; BEGIN EXECUTE format(\'%s\', query_sql) USING ' +
                        'SELECT jsonb_array_elements(query_params)::text AS param INTO result_jsonb; ' +
                        'RETURN QUERY SELECT result_jsonb AS result; END; $$;'
                    );
                }
                throw e;
            }
        },
    };
}
