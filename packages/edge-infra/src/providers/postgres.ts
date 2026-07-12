/**
 * PostgresRunner (Phase 3 follow-ups / F7c) — Postgres via @neondatabase/serverless
 * (HTTP-flavored `neon()` query function). Works for Neon, Supabase Postgres, and
 * any PG reachable over HTTP. Dynamic-imported so the package builds without it and
 * the SDK only loads when a postgres datasource is actually used (matches the
 * optional-dep pattern; it's in the cf-full OPTIONAL stub list).
 *
 * The neon HTTP client: `neon(connectionString)` → `sql(text, params)` → row[].
 * `exec` returns affected-row count best-effort (the HTTP flavor returns the row
 * array, so count = array length for SELECT; for DML it may be 0 — acceptable for
 * the console's introspection/query use case).
 *
 * RULE 1: server-only — the connection string never enters a browser bundle.
 */
import type { DbRunner } from './types.js';

export interface PostgresOpts {
    /** Postgres connection string (Neon pooler URL, Supabase pooler URL, etc.). */
    connectionString: string;
}

/** Build a Postgres DbRunner over the neon HTTP client. */
export function postgresRunner(opts: PostgresOpts): DbRunner {
    let sqlPromise: Promise<(text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>> | null = null;
    const getSql = async () => {
        if (!sqlPromise) {
            sqlPromise = import('@neondatabase/serverless').then((m) => {
                const neon = (m as unknown as { neon: (s: string) => (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]> }).neon;
                return neon(opts.connectionString);
            });
        }
        return sqlPromise;
    };
    return {
        async query(text, params = []) {
            const sql = await getSql();
            return sql(text, params as unknown[]);
        },
        async exec(text, params = []) {
            const sql = await getSql();
            const rows = await sql(text, params as unknown[]);
            return Array.isArray(rows) ? rows.length : 0;
        },
    };
}
