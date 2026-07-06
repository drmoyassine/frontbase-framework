/**
 * DataProvider DI — the seam that makes the engine environment-blind (CHIMERA §4).
 * The engine NEVER sees SQL, connection strings, or secrets — only query IDs.
 */
import type { SiteManifest, QueryContext } from './manifest.js';

export interface DataProvider {
    /** Execute a registered query by ID. NEVER raw SQL. */
    query(queryId: string, params?: Record<string, unknown>, ctx?: QueryContext): Promise<Record<string, unknown>[]>;
    readonly kind: string;
}

/**
 * Cloud-edge provider: runs registered queries in-process (executor or baked
 * rows). Real database-backed executors are wired by @frontbase/edge-infra.
 */
export function directProvider(manifest: SiteManifest): DataProvider {
    return {
        kind: 'direct',
        async query(queryId, params = {}, ctx = {}) {
            const q = manifest.queries[queryId];
            if (!q) throw new Error(`unknown_query: ${queryId}`);
            if (q.execute) return q.execute(params, ctx);
            if (q.rows) return q.rows;
            throw new Error(`query_has_no_executor: ${queryId}`);
        },
    };
}

/**
 * Service-worker provider: delegates to the Edge Data Proxy over HTTP.
 * No secrets, no SQL, no executors in the browser.
 */
export function proxyProvider(baseUrl: string): DataProvider {
    return {
        kind: 'proxy',
        async query(queryId, params) {
            const res = await fetch(`${baseUrl}/${encodeURIComponent(queryId)}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(params ?? {}),
            });
            if (!res.ok) throw new Error(`proxy_error ${res.status}: ${queryId}`);
            return res.json();
        },
    };
}
