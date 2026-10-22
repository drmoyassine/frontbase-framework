/**
 * PostgresRunner (Phase 3 follow-ups / F7c) — Postgres via @neondatabase/serverless
 * (HTTP-flavored `neon()` query function). Works for Neon and any PG endpoint that
 * actually speaks Neon's HTTPS /sql transport. Dynamic-imported so the package
 * builds without it and the SDK only loads when a postgres datasource is actually
 * used (matches the optional-dep pattern).
 *
 * The pinned upstream serializer/parser has an internal client-scoped Fetch
 * extension. Never swaps neonConfig globals. Conventional calls use .query();
 * affected rows come only from validated full-result metadata.
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
    fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
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
    let sqlPromise: Promise<import('./vendor/neon-client.mjs').NeonClient> | null = null;
    const getSql = async () => {
        if (!sqlPromise) {
            sqlPromise = import('./vendor/neon-client.mjs').then(({neon}) => neon(opts.connectionString,{fullResults:true,arrayMode:false,fetchImpl:opts.fetchImpl,fetchOptions:opts.signal?{signal:opts.signal}:undefined}));
        }
        return sqlPromise;
    };
    const execute=async(text:string,params:unknown[])=>{
        try{return await(await getSql()).query(text,params);}catch(error){
            // SDK messages can echo a malformed DSN, SQL or provider response. Callers such as
            // Data Studio display .message, so preserve only fixed guard codes, never raw causes.
            const safe=new Set(['unsafe_provider_url','invalid_provider_url','provider_redirect_rejected','provider_request_redirect_replay_unsupported']);
            let cursor:unknown=error,code='postgres_http_failed';
            for(let depth=0;cursor instanceof Error&&depth<8;depth++,cursor=cursor.cause){const guard=[...safe].find(value=>cursor instanceof Error&&(cursor.message===value||cursor.message.endsWith(': '+value)));if(guard){code=guard;break;}}
            throw new Error(code);
        }
    };
    return {
        dialect:'postgres',
        async query(text, params = []) {
            const result=await execute(text,params);
            if(!Array.isArray(result.rows)||result.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw Error('postgres_result_invalid');
            return result.rows;
        },
        async exec(text, params = []) {
            const result=await execute(text,params),count=result.rowCount;
            if(count===null&&/^(?:CREATE|ALTER|DROP|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SET|GRANT|REVOKE|COMMENT)$/.test(result.command))return 0;
            if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0)throw Error('postgres_affected_rows_invalid');
            return count;
        },
    };
}
