/**
 * PostgresRunner (Phase 3 follow-ups / F7c) — Postgres via @neondatabase/serverless
 * (HTTP-flavored `neon()` query function). Works for Neon and any PG endpoint that
 * actually speaks Neon's HTTPS /sql transport. Dynamic-imported so the package
 * builds without it and the SDK only loads when a postgres datasource is actually
 * used (matches the optional-dep pattern).
 *
 * The neon HTTP client: `neon(connectionString)` → `sql(text, params)` → row[].
 * `exec` returns affected-row count best-effort (the HTTP flavor returns the row
 * array, so count = array length for SELECT; for DML it may be 0 — acceptable for
 * the console's introspection/query use case).
 *
 * Supabase DSNs are REJECTED up front: their pooler (aws-*.pooler.supabase.com)
 * and direct (db.<ref>.supabase.co) endpoints are raw Postgres wire protocol on
 * 5432/6543 — there is no HTTPS /sql endpoint there. neon() would POST to
 * https://<host>:<port>/sql, the TLS handshake against a plaintext socket fails,
 * and under wrangler dev that failure kills workerd's outbound proxy (the whole
 * dev server exits). Route Supabase through the PostgREST RPC path instead
 * (supabaseRunner / the edge-database routes' httpRpc branch).
 *
 * RULE 1: server-only — the connection string never enters a browser bundle.
 */
import type { DbRunner } from './types.js';

export interface PostgresOpts {
    /** Postgres connection string (Neon pooler URL, etc. — not Supabase). */
    connectionString: string;
}

/** Supabase Postgres endpoints — wire protocol only, unreachable over HTTP(S). */
const SUPABASE_PG_HOST = /(^|\.)(pooler\.supabase\.com|supabase\.co)$/i;

/** Reject Supabase DSNs before any network I/O. Throws — see the header comment. */
function assertNotSupabaseDsn(connectionString: string): void {
    try {
        const { hostname } = new URL(connectionString);
        // aws-0-<region>.pooler.supabase.com (Supavisor) and db.<ref>.supabase.co (direct / PgBouncer).
        if (SUPABASE_PG_HOST.test(hostname)) {
            throw new Error(
                `Supabase endpoints (${hostname}) speak the Postgres wire protocol, not HTTPS — ` +
                'this edge runtime cannot query them directly. Use the Supabase project URL ' +
                '(https://<ref>.supabase.co) with a service key so schema operations run over ' +
                'the PostgREST RPC path, or a Neon connection string for direct HTTP SQL.',
            );
        }
    } catch (error) {
        if (error instanceof TypeError) return; // unparseable DSN — let the driver report it
        throw error;
    }
}

/** Build a Postgres DbRunner over the neon HTTP client. */
export function postgresRunner(opts: PostgresOpts): DbRunner {
    assertNotSupabaseDsn(opts.connectionString);
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
