/**
 * Query registrar — collects `defineQueries()` definitions into the
 * `manifest.queries` map the engine consumes (a `Record<string, RegisteredQuery>`).
 *
 * Two projections:
 *   - `toEdgeQueries`     — full, with `execute` (server-side only).
 *   - `toBrowserQueries`  — `execute` STRIPPED; the SW sees only queryId/params/scope/ttl.
 *
 * Keys are sorted for deterministic output.
 */
import type { QueryContext, QueryRegistry } from './defineQueries.js';

/** A registered query as the edge DataProvider/Edge Data Proxy sees it. */
export interface EdgeRegisteredQuery {
    queryId: string;
    params?: unknown;
    scope?: 'public' | 'tenant' | 'user';
    ttlSeconds?: number;
    execute?: (params: Record<string, unknown>, ctx: QueryContext) => Promise<Record<string, unknown>[]>;
    rows?: Record<string, unknown>[];
}

/**
 * A registered query as the browser/SW sees it. NO `execute` (server-side only)
 * and NO `params` Zod schema — param validation happens exclusively at the Edge
 * Data Proxy (the SW just forwards params over HTTP). `hasParams` is a plain
 * boolean marker so the SW can know a query takes params without shipping the
 * (non-serializable, potentially logic-bearing) Zod schema.
 */
export interface BrowserRegisteredQuery {
    queryId: string;
    hasParams?: boolean;
    scope?: 'public' | 'tenant' | 'user';
    ttlSeconds?: number;
    rows?: Record<string, unknown>[];
}

function sortedKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj).sort();
}

/** Edge projection — `execute` retained (server-side only). */
export function toEdgeQueries(registry: QueryRegistry): Record<string, EdgeRegisteredQuery> {
    const out: Record<string, EdgeRegisteredQuery> = {};
    for (const queryId of sortedKeys(registry)) {
        const def = registry[queryId];
        if (!def) continue;
        out[queryId] = {
            queryId,
            ...(def.params ? { params: def.params } : {}),
            ...(def.scope ? { scope: def.scope } : {}),
            ...(def.ttlSeconds ? { ttlSeconds: def.ttlSeconds } : {}),
            ...(def.rows ? { rows: def.rows } : {}),
            execute: def.execute,
        };
    }
    return out;
}

/**
 * Browser/SW projection — pure serializable data only. Strips `execute`
 * (server-side) AND the `params` Zod schema (kept edge-side; the SW forwards
 * params to the proxy, which validates). Emits `hasParams: true` as a marker.
 */
export function toBrowserQueries(registry: QueryRegistry): Record<string, BrowserRegisteredQuery> {
    const out: Record<string, BrowserRegisteredQuery> = {};
    for (const queryId of sortedKeys(registry)) {
        const def = registry[queryId];
        if (!def) continue;
        out[queryId] = {
            queryId,
            ...(def.params ? { hasParams: true } : {}),
            ...(def.scope ? { scope: def.scope } : {}),
            ...(def.ttlSeconds ? { ttlSeconds: def.ttlSeconds } : {}),
            ...(def.rows ? { rows: def.rows } : {}),
        };
    }
    return out;
}
