/**
 * SQLite provider — the CI-verified reference DataProvider (Decision A-17 §1).
 * Uses @libsql/client (the product's own client) with `:memory:` for tests, or a
 * file/libsql URL in production. Real SQL, real `WHERE tenant` predicates.
 */
import { createClient, type Client } from '@libsql/client';
import type { SiteManifest } from '@frontbase/edge-core';
import { createSqlDataProvider } from './base.js';
import type { DbRunner, DataProviderWithClient } from './types.js';

export interface SqliteProviderOptions {
    manifest: SiteManifest;
    /** libsql URL: `:memory:` for tests, `file:./data.db` or `libsql://...` in prod. Default `:memory:`. */
    url?: string;
    /** Auth token for remote libsql (Turso). */
    authToken?: string;
}

function clientToRunner(client: Client): DbRunner {
    return {
        async query(sql, params = []) {
            const res = await client.execute({ sql, args: params as never[] });
            return res.rows as Record<string, unknown>[];
        },
        async exec(sql, params = []) {
            await client.execute({ sql, args: params as never[] });
        },
    };
}

export function sqliteDataProvider(opts: SqliteProviderOptions): DataProviderWithClient {
    const client = createClient({ url: opts.url ?? ':memory:', authToken: opts.authToken });
    return createSqlDataProvider({ kind: 'sqlite', manifest: opts.manifest, db: clientToRunner(client) });
}
