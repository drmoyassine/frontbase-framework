import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DataTableBinding, DataFetcherConfig, DataFetcherResult, DataRequest } from '../types';
import { resolveDateOperator } from '@frontbase/types';

/**
 * Resolve {{ENV_VAR}} placeholders in a string
 */
function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        // Server-side: use process.env
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    } else {
        // Client-side: env vars should already be resolved in pre-rendered HTML
        return template;
    }
}

/**
 * Resolves variables in a template string on the client using the global VariableStore.
 */
function resolveClientTemplate(template: string, store: { get(scope: string, key: string): any }): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr) => {
        const [scope, ...rest] = String(expr).trim().split('.');
        const val = store.get(scope, rest.join('.'));
        return val !== undefined && val !== null ? String(val) : '';
    });
}

/**
 * Fetch data from FastAPI (builder mode)
 */
async function fetchFromBuilder(config: DataFetcherConfig): Promise<DataFetcherResult> {
    const { binding, page, pageSize, sortColumn, sortDirection, filters, searchQuery } = config;

    const params = new URLSearchParams();
    params.append('limit', String(pageSize));
    params.append('offset', String(page * pageSize));

    if (sortColumn) {
        params.append('sort', sortColumn);
        params.append('order', sortDirection || 'asc');
    }

    if (searchQuery) {
        params.append('search', searchQuery);
    }

    if (binding.searchColumns?.length) {
        params.append('search_cols', JSON.stringify(binding.searchColumns));
    }

    // Add filters
    if (filters) {
        const filterList = Object.entries(filters)
            .filter(([k, v]) => k !== 'search' && v != null && v !== '')
            .map(([field, value]) => ({
                field,
                operator: '==',
                value: typeof value === 'object' && 'value' in value ? value.value : value,
            }));
        if (filterList.length > 0) {
            params.append('filters', JSON.stringify(filterList));
        }
    }

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/data?${params}`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const result = await response.json();
    return {
        data: result.records || [],
        total: result.total || 0,
    };
}

/**
 * Fetch data from Edge — routes based on fetchStrategy
 * - 'direct': browser → Supabase PostgREST (CORS-enabled, anonKey in headers)
 * - 'proxy': browser → edge /api/data/execute → datasource (credentials server-side)
 */
async function fetchFromEdge(config: DataFetcherConfig & { resolvedHiddenFilters?: any[] }): Promise<DataFetcherResult> {
    const { binding, page, pageSize, sortColumn, sortDirection, filters, searchQuery, resolvedHiddenFilters } = config;
    const dataRequest = binding.dataRequest;

    if (!dataRequest?.url && !dataRequest?.queryConfig) {
        return { data: [], total: 0 };
    }

    const queryConfig = dataRequest?.queryConfig;

    // Build filters for RPC
    const filterList = filters
        ? Object.entries(filters)
            .filter(([_, v]) => v !== undefined && v !== null && v !== '')
            .map(([column, value]) => {
                const filterConfig = binding.frontendFilters?.find((f) => f.column === column);
                return {
                    column,
                    filterType: filterConfig?.filterType || 'text',
                    value,
                };
            })
        : [];

    // Determine RPC name based on search
    const rpcName = searchQuery ? 'frontbase_search_rows' : 'frontbase_get_rows';
    const rpcUrl = (dataRequest?.url || '').replace('frontbase_get_rows', rpcName);

    // Build RPC body
    const rpcBody: Record<string, any> = {
        table_name: queryConfig?.tableName || binding.tableName,
        columns: queryConfig?.columns,
        joins: queryConfig?.joins || [],
        page: page + 1, // RPC uses 1-based pages
        page_size: pageSize,
        filters: [...filterList, ...(resolvedHiddenFilters || [])],
    };

    if (searchQuery) {
        rpcBody.search_query = searchQuery;
        rpcBody.search_cols = queryConfig?.searchColumns || [];
    } else {
        rpcBody.sort_col = sortColumn || queryConfig?.sortColumn || null;
        rpcBody.sort_dir = sortDirection || queryConfig?.sortDirection || 'asc';
    }

    // Strategy factory: route based on publish-time decision
    const strategy = dataRequest?.fetchStrategy || 'proxy';
    let response: Response;

    if (strategy === 'direct') {
        // Direct: browser → datasource (Supabase PostgREST, CORS-enabled)
        // Resolve env vars in URL and headers
        const url = resolveEnvVars(rpcUrl);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(dataRequest?.headers || {})) {
            headers[key] = resolveEnvVars(value);
        }

        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(rpcBody),
        });

        const result = await response.json();
        const rows = result.rows || result.data || [];
        const total = result.total ?? rows.length;
        return { data: rows, total };
    } else {
        // Proxy: browser → edge /api/data/execute → datasource
        // Only send datasourceId + query — credentials resolved server-side
        const datasourceId = (dataRequest as any)?.datasourceId || binding.dataSourceId;
        response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    queryConfig: dataRequest?.queryConfig || {},
                    body: rpcBody,
                    resultPath: dataRequest?.resultPath || 'rows',
                    flattenRelations: dataRequest?.flattenRelations ?? false,
                },
            }),
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }
        const rows = result.data?.rows || result.data || [];
        const total = result.data?.total ?? result.total ?? rows.length;
        return { data: rows, total };
    }
}

interface UseDataTableDataOptions {
    mode: 'builder' | 'edge';
    binding?: DataTableBinding | null;
    page: number;
    pageSize: number;
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
    filters?: Record<string, any>;
    searchQuery?: string;
    initialData?: any[];
    enabled?: boolean;
}

/**
 * React Query hook for DataTable data fetching
 * Works in both builder and edge modes
 */
export function useDataTableData({
    mode,
    binding,
    page,
    pageSize,
    sortColumn,
    sortDirection,
    filters,
    searchQuery,
    initialData,
    enabled = true,
}: UseDataTableDataOptions) {
    const [storeVersion, setStoreVersion] = useState(0);

    useEffect(() => {
        const store = typeof window !== 'undefined' ? (window as any).__VARIABLE_STORE__ : null;
        if (!store) return;
        return store.subscribe(() => {
            setStoreVersion((v) => v + 1);
        });
    }, []);

    const resolvedHiddenFilters = useMemo(() => {
        if (!binding) return [];
        const resolvedList = [...(binding._resolvedHiddenFilters || [])];
        const pendingList = binding._pendingHiddenFilters || [];
        const store = typeof window !== 'undefined' ? (window as any).__VARIABLE_STORE__ : null;

        for (const filter of pendingList) {
            const operator = filter.operator;
            if (operator === 'is_null' || operator === 'not_null') {
                resolvedList.push({
                    column: filter.column,
                    op: operator,
                });
                continue;
            }

            const value = filter.value;
            let resolvedVal: any = '';
            if (typeof value === 'string') {
                if (store) {
                    resolvedVal = resolveClientTemplate(value, store);
                } else {
                    resolvedVal = filter.previewValue || '';
                }
            } else {
                resolvedVal = value;
            }

            // Date operators desugar to lt/lte/gt/gte (UTC) via the shared helper,
            // which also emits the two-bound range for is_today.
            const dateExpanded = resolveDateOperator({ column: filter.column, op: operator, value: resolvedVal });
            if (dateExpanded !== null) {
                resolvedList.push(...dateExpanded);
                continue;
            }

            if (resolvedVal !== undefined && resolvedVal !== null && String(resolvedVal).trim() !== '') {
                if (operator === 'in') {
                    resolvedVal = String(resolvedVal).split(',').map((s: string) => s.trim()).filter(Boolean);
                }
                resolvedList.push({
                    column: filter.column,
                    op: operator,
                    value: resolvedVal
                });
            }
        }
        return resolvedList;
    }, [binding?._resolvedHiddenFilters, binding?._pendingHiddenFilters, storeVersion]);

    return useQuery({
        queryKey: [
            'datatable',
            mode,
            binding?.tableName,
            binding?.dataSourceId,
            page,
            pageSize,
            sortColumn,
            sortDirection,
            filters,
            searchQuery,
            resolvedHiddenFilters,
        ],
        queryFn: async () => {
            if (!binding) return { data: [], total: 0 };
            const config: DataFetcherConfig & { resolvedHiddenFilters?: any[] } = {
                mode,
                binding,
                page,
                pageSize,
                sortColumn: sortColumn || undefined,
                sortDirection,
                filters,
                searchQuery,
                resolvedHiddenFilters,
            };
 
            if (mode === 'builder') {
                return fetchFromBuilder(config);
            } else {
                return fetchFromEdge(config);
            }
        },
        initialData: initialData
            ? { data: initialData, total: initialData.length }
            : undefined,
        enabled: enabled && !!binding?.tableName,
        staleTime: 60_000, // 1 minute
        refetchInterval: binding?.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
}
