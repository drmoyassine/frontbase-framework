/**
 * executeQuery — shared structured-query executor (Phase 0)
 *
 * Consolidates the direct/proxy fetch branching duplicated across the Chart,
 * DataTable (builder + edge) hooks. Given a binding (carrying the publish-time
 * `dataRequest`) and a `StructuredQuery` (rows or aggregate), it routes:
 *
 *  - direct-rpc : browser → the baked Supabase RPC URL/headers (anonKey is public)
 *  - proxy      : browser → POST /api/data/execute (edge resolves credentials)
 *
 * Hooks that adopt this replace their inline `if (strategy === 'direct') {...} else {...}`
 * with a single `executeQuery(binding, query, { tenantSlug })` call. Hidden filters
 * are expected to already be merged into `query.filters` by the caller (the hooks
 * resolve them today; a shared resolver can follow).
 */

import type {
    StructuredQuery,
    RowsResult,
    AggregateResultItem,
    QueryResult,
} from './index';

export interface ExecuteQueryBinding {
    /** The publish-time baked request (url/headers/strategy/datasourceId). */
    dataRequest?: {
        fetchStrategy?: string;
        url?: string;
        headers?: Record<string, string>;
        datasourceId?: string | null;
        resultPath?: string;
        queryConfig?: Record<string, unknown> | null;
        [key: string]: unknown;
    } | null;
    dataSourceId?: string;
}

export interface ExecuteQueryOptions {
    /** Edge endpoint (default '/api/data/execute'). */
    endpoint?: string;
    /** Tenant slug forwarded to the edge (proxy mode). */
    tenantSlug?: string;
    /** Override the mode; otherwise derived from `dataRequest.fetchStrategy`. */
    mode?: 'direct-rpc' | 'proxy';
    /** Custom fetch (testing). Defaults to global fetch. */
    fetchImpl?: typeof fetch;
}

function resolveResultPath(binding: ExecuteQueryBinding): string {
    return binding.dataRequest?.resultPath || 'rows';
}

function extractRows(result: unknown, resultPath: string): { rows: unknown[]; total: number } {
    const obj = (result ?? {}) as Record<string, unknown>;
    const rows = (obj[resultPath] ?? obj.rows ?? obj.data ?? []) as unknown[];
    const total = (obj.total ?? (Array.isArray(rows) ? rows.length : 0)) as number;
    return { rows: Array.isArray(rows) ? rows : [], total };
}

/**
 * Execute a structured query against the binding's datasource.
 *
 * For a RowsQuery → returns `{ rows, total }`.
 * For an AggregateQuery → returns the array of `{ category, value }`.
 */
export async function executeQuery(
    binding: ExecuteQueryBinding,
    query: StructuredQuery,
    opts: ExecuteQueryOptions = {}
): Promise<QueryResult> {
    const fetchImpl = opts.fetchImpl || fetch;
    const dr = binding.dataRequest || {};
    const mode = opts.mode || (dr.fetchStrategy === 'direct' ? 'direct-rpc' : 'proxy');
    const resultPath = resolveResultPath(binding);

    if (mode === 'direct-rpc') {
        if (!dr.url) throw new Error('executeQuery: direct-rpc requires dataRequest.url');
        const response = await fetchImpl(dr.url, {
            method: 'POST',
            headers: dr.headers || { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
        });
        if (!response.ok) {
            throw new Error(`executeQuery: direct-rpc failed (${response.status})`);
        }
        const json = await response.json();
        if (query.kind === 'aggregate') return (json as AggregateResultItem[]) || [];
        const { rows, total } = extractRows(json, resultPath);
        return { rows, total } as RowsResult;
    }

    // proxy → edge /api/data/execute
    const datasourceId = dr.datasourceId || binding.dataSourceId;
    const endpoint = opts.endpoint || '/api/data/execute';
    const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            dataRequest: {
                fetchStrategy: 'proxy',
                datasourceId,
                method: 'POST',
                queryConfig: dr.queryConfig || {},
                body: query,
                resultPath,
                flattenRelations: false,
            },
            ...(opts.tenantSlug ? { tenant_slug: opts.tenantSlug } : {}),
        }),
    });
    if (!response.ok) {
        throw new Error(`executeQuery: proxy failed (${response.status})`);
    }
    const json = (await response.json()) as Record<string, unknown>;
    if (query.kind === 'aggregate') return (json.data as AggregateResultItem[]) || [];
    const data = (json.data ?? []) as unknown[];
    const total = (json.total ?? (Array.isArray(data) ? data.length : 0)) as number;
    return { rows: Array.isArray(data) ? data : [], total } as RowsResult;
}
