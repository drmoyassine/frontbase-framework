/**
 * SQL DataProvider base — turns a SQL runner (libsql/d1/neon) into a DataProvider
 * that executes registered queries. The provider is provider-agnostic; only the
 * `DbRunner` differs per driver. This is the shared code path that makes the
 * SQLite isolation test authoritative for every provider (A-17): the tenant
 * predicate lives in the query's `execute` SQL, which runs through this same
 * path regardless of driver.
 *
 * RULE 3: rows returned to callers are copies, never the driver's buffer.
 * RULE 4: driver errors are caught and surfaced opaquely.
 */
import type { DataProvider, QueryContext, SiteManifest } from '@frontbase/edge-core';
import type { DbRunner, DataProviderWithClient, EnrichedQueryContext } from './types.js';
import { copyRows } from './helpers.js';

export interface SqlDataProviderOptions {
    kind: string;
    manifest: SiteManifest;
    db: DbRunner;
}

export function createSqlDataProvider(opts: SqlDataProviderOptions): DataProviderWithClient {
    const { kind, manifest, db } = opts;

    async function query(queryId: string, params?: Record<string, unknown>, ctx?: QueryContext): Promise<Record<string, unknown>[]> {
        const q = manifest.queries[queryId];
        if (!q) throw new Error('unknown_query');
        const enriched: EnrichedQueryContext = { ...(ctx ?? {}), db };
        let rows: Record<string, unknown>[];
        try {
            rows = q.execute ? await q.execute(params ?? {}, enriched) : (q.rows ?? []);
        } catch (e) {
            // RULE 4: opaque — log server-side, caller sees a code not the driver error.
            console.error(`[edge-infra:${kind}] query "${queryId}" failed:`, (e as Error).message);
            throw new Error('query_execution_failed');
        }
        return copyRows(rows);
    }

    return { kind, query, db };
}

/** A DataProviderWithClient satisfies the edge-core DataProvider interface. */
export function asDataProvider(p: DataProviderWithClient): DataProvider {
    return { kind: p.kind, query: p.query };
}
