/**
 * Cloud DataProviders — D1 / Turso / Postgres (Neon). Each is a thin `DbRunner`
 * over the same `createSqlDataProvider` base. They are **credential-gated**
 * (Decision A-17 §2): interface-conformant and contract-verified on every
 * commit; exercised against a live endpoint only where credentials are present.
 *
 * Because the tenant predicate (A-17) lives in the query's `execute` SQL and
 * runs through the shared base path, the SQLite isolation test is authoritative
 * for these too — enabling a cloud provider runs the IDENTICAL gates.
 */
import type { SiteManifest } from '@frontbase/edge-core';
import { createSqlDataProvider } from './base.js';
import type { DbRunner, DataProviderWithClient } from './types.js';

// ---- Cloudflare D1 (REST API) ----
export interface D1ProviderOptions {
    manifest: SiteManifest;
    accountId: string;
    databaseId: string;
    apiToken: string;
}
export function d1DataProvider(opts: D1ProviderOptions): DataProviderWithClient {
    const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`;
    const headers = { authorization: `Bearer ${opts.apiToken}`, 'content-type': 'application/json' };
    const db: DbRunner = {
        async query(sql, params = []) {
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql, params }) });
            const json = await res.json() as { success: boolean; result?: Array<{ results: Record<string, unknown>[] }>; errors?: unknown[] };
            if (!json.success) throw new Error('d1_query_failed');
            return json.result?.[0]?.results ?? [];
        },
        async exec(sql, params = []) { await db.query(sql, params); },
    };
    return createSqlDataProvider({ kind: 'd1', manifest: opts.manifest, db });
}

// ---- Turso / libsql (HTTP) ----
export interface TursoProviderOptions {
    manifest: SiteManifest;
    url: string;            // libsql://...
    authToken: string;
}
export function tursoDataProvider(opts: TursoProviderOptions): DataProviderWithClient {
    // @libsql/client is already a dep (sqlite.ts); reuse it for the remote client.
    // Dynamic to keep this module loadable in tests without a remote URL.
    let cached: DbRunner | null = null;
    const db: DbRunner = {
        async query(sql, params = []) {
            cached ??= await makeLibsqlRunner(opts.url, opts.authToken);
            return cached.query(sql, params);
        },
        async exec(sql, params = []) {
            cached ??= await makeLibsqlRunner(opts.url, opts.authToken);
            await cached.exec(sql, params);
        },
    };
    return createSqlDataProvider({ kind: 'turso', manifest: opts.manifest, db });
}
async function makeLibsqlRunner(url: string, authToken: string): Promise<DbRunner> {
    const { createClient } = await import('@libsql/client');
    const client = createClient({ url, authToken });
    return {
        async query(sql, params = []) { return (await client.execute({ sql, args: params as never[] })).rows as Record<string, unknown>[]; },
        async exec(sql, params = []) { await client.execute({ sql, args: params as never[] }); },
    };
}

// ---- Postgres (Neon serverless, Hyperdrive-compatible) ----
export interface PostgresProviderOptions {
    manifest: SiteManifest;
    connectionString: string;
}
export function postgresDataProvider(opts: PostgresProviderOptions): DataProviderWithClient {
    let cached: DbRunner | null = null;
    const db: DbRunner = {
        async query(sql, params = []) {
            cached ??= await makePgRunner(opts.connectionString);
            return cached.query(sql, params);
        },
        async exec(sql, params = []) {
            cached ??= await makePgRunner(opts.connectionString);
            await cached.exec(sql, params);
        },
    };
    // Postgres uses $1/$2 params; the runner translates `?` placeholders so the
    // SAME execute SQL runs on SQLite and Postgres unchanged (A-17 portability).
    const wrap: DbRunner = {
        async query(sql, params = []) { return db.query(toPgParams(sql), params); },
        async exec(sql, params = []) { await db.exec(toPgParams(sql), params); },
    };
    return createSqlDataProvider({ kind: 'postgres', manifest: opts.manifest, db: wrap });
}
function toPgParams(sql: string): string {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}
async function makePgRunner(connectionString: string): Promise<DbRunner> {
    const mod = await import('@neondatabase/serverless');
    const Pool = (mod as { Pool: new (cfg: { connectionString: string }) => { query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } }).Pool;
    const pool = new Pool({ connectionString });
    return {
        async query(sql, params = []) { return (await pool.query(sql, params)).rows; },
        async exec(sql, params = []) { await pool.query(sql, params); },
    };
}
