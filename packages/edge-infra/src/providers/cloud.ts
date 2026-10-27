/**
 * Cloud DataProviders — D1 / Turso / Postgres (Neon). Each is a thin `DbRunner`
 * (from runners.ts — RULE 6, one source of truth) over the shared
 * `createSqlDataProvider` base. Credential-gated (Decision A-17 §2): interface-
 * conformant on every commit; live-endpoint runs where credentials are present.
 *
 * The tenant predicate (A-17) lives in the query's `execute` SQL and runs through
 * the shared base path, so the SQLite isolation test is authoritative for these.
 */
import type { SiteManifest } from '@frontbase/edge-core';
import { createSqlDataProvider } from './base.js';
import type { DbRunner, DataProviderWithClient } from './types.js';
import { d1RunnerFromRest, libsqlRunner } from './runners.js';
import { createClient } from '@libsql/client';

// ---- Cloudflare D1 (REST API) ----
export interface D1ProviderOptions {
    manifest: SiteManifest;
    accountId: string;
    databaseId: string;
    apiToken: string;
}
export function d1DataProvider(opts: D1ProviderOptions): DataProviderWithClient {
    const db = d1RunnerFromRest(opts);
    return createSqlDataProvider({ kind: 'd1', manifest: opts.manifest, db });
}

// ---- Turso / libsql (HTTP) ----
export interface TursoProviderOptions {
    manifest: SiteManifest;
    url: string;            // libsql://...
    authToken: string;
}
export function tursoDataProvider(opts: TursoProviderOptions): DataProviderWithClient {
    // Lazy: build the remote client on first use so the module loads without a URL.
    let cached: DbRunner | null = null;
    const db: DbRunner = {
        async query(sql, params = []) { cached ??= libsqlRunner(createClient({ url: opts.url, authToken: opts.authToken })); return cached.query(sql, params); },
        async exec(sql, params = []) { cached ??= libsqlRunner(createClient({ url: opts.url, authToken: opts.authToken })); return cached.exec(sql, params); },
    };
    return createSqlDataProvider({ kind: 'turso', manifest: opts.manifest, db });
}

// ---- Postgres (Neon serverless, Hyperdrive-compatible) ----
export interface PostgresProviderOptions {
    manifest: SiteManifest;
    connectionString: string;
}
export function postgresDataProvider(opts: PostgresProviderOptions): DataProviderWithClient {
    let cached: DbRunner | null = null;
    const raw: DbRunner = {
        async query(sql, params = []) { cached ??= await makePgRunner(opts.connectionString); return cached.query(sql, params); },
        async exec(sql, params = []) { cached ??= await makePgRunner(opts.connectionString); return cached.exec(sql, params); },
    };
    // Postgres uses $1/$2; translate `?` placeholders so the SAME execute SQL runs
    // on SQLite and Postgres unchanged (A-17 portability).
    const wrap: DbRunner = {
        async query(sql, params = []) { return raw.query(toPgParams(sql), params); },
        async exec(sql, params = []) { return raw.exec(toPgParams(sql), params); },
    };
    return createSqlDataProvider({ kind: 'postgres', manifest: opts.manifest, db: wrap });
}
function toPgParams(sql: string): string {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}
async function makePgRunner(connectionString: string): Promise<DbRunner> {
    const mod = await import('@neondatabase/serverless');
    const Pool = (mod as unknown as { Pool: new (cfg: { connectionString: string }) => { query: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }> } }).Pool;
    const pool = new Pool({ connectionString });
    return {
        async query(sql, params = []) { return (await pool.query(sql, params)).rows; },
        async exec(sql, params = []) { return (await pool.query(sql, params)).rowCount ?? 0; },
    };
}
