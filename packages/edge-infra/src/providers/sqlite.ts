/**
 * SQLite provider — the CI-verified reference DataProvider (Decision A-17 §1).
 * Uses @libsql/client (the product's own client) with `:memory:` for tests, or a
 * file/libsql URL in production. Real SQL, real `WHERE tenant` predicates.
 */
import { createClient } from '@libsql/client';
import type { SiteManifest } from '@frontbase/edge-core';
import { createSqlDataProvider } from './base.js';
import type { DataProviderWithClient } from './types.js';
import { libsqlRunner } from './runners.js';

export interface SqliteProviderOptions {
    manifest: SiteManifest;
    /** libsql URL: `:memory:` for tests, `file:./data.db` or `libsql://...` in prod. Default `:memory:`. */
    url?: string;
    /** Auth token for remote libsql (Turso). */
    authToken?: string;
}

export function sqliteDataProvider(opts: SqliteProviderOptions): DataProviderWithClient {
    const client = createClient({ url: opts.url ?? ':memory:', authToken: opts.authToken });
    return createSqlDataProvider({ kind: 'sqlite', manifest: opts.manifest, db: libsqlRunner(client) });
}
