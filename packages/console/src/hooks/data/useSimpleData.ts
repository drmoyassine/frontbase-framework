import { useCallback, useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useTableData, useTableSchema, useGlobalSchema, useRpcData } from '@/hooks/useDatabase';
import { debug } from '@/lib/debug';
import { resolveHiddenFilters } from '@/lib/data-binding/resolveHiddenFilters';

export interface FilterConfig {
    id: string;
    column: string;
    filterType: 'dropdown' | 'multiselect' | 'text' | 'number' | 'dateRange' | 'boolean';
    options?: string[];
    value?: any;
    label?: string;
}

export type HiddenFilterOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'in' | 'is_null' | 'not_null'
  | 'is_before' | 'is_after' | 'is_on_or_before' | 'is_on_or_after'
  | 'is_within_last_days' | 'is_today';

export interface HiddenFilter {
  id: string;
  column: string;
  operator: HiddenFilterOperator;
  value?: string;
  previewValue?: string;
}

export interface ComponentDataBinding {
    componentId: string;
    dataSourceId: string;
    tableName: string;
    refreshInterval?: number;
    pagination: {
        enabled: boolean;
        pageSize: number;
        page: number;
    };
    sorting: {
        enabled: boolean;
        column?: string;
        direction?: 'asc' | 'desc';
    };
    filtering: {
        searchEnabled: boolean;
        filters: Record<string, any>;
    };
    columnOverrides: Record<string, {
        displayName?: string;
        visible?: boolean;
        displayType?: 'text' | 'badge' | 'date' | 'boolean' | 'currency' | 'percentage' | 'image' | 'link';
        dateFormat?: string;
    }>;
    columnOrder?: string[];
    searchColumns?: string[];
    frontendFilters?: FilterConfig[];
    hiddenFilters?: HiddenFilter[];
    rpcName?: string;
    params?: Record<string, any>;
    fieldMapping?: Record<string, string>;
    chartConfig?: {
        /** Column to group by — the X-axis / pie-slice category. */
        category?: string;
        /** Aggregation applied per category. 'count' needs no value column. */
        aggregation?: 'count' | 'sum' | 'average' | 'min' | 'max';
        /** Numeric column to aggregate. Required for everything except 'count'. */
        value?: string;
        /** Sort categories by aggregated value. */
        sort?: 'none' | 'asc' | 'desc';
        variant?: 'vertical' | 'horizontal';
        maxRows?: number;
    };
}

export interface UseSimpleDataOptions {
    componentId: string;
    binding?: ComponentDataBinding | null;
    autoFetch?: boolean;
}

export interface UseSimpleDataResult {
    data: any[];
    count: number;
    loading: boolean;
    error: string | null;
    schema: any;
    currentSorting: { column?: string; direction?: 'asc' | 'desc' };
    currentPagination: { page: number; pageSize: number };
    refetch: () => Promise<void>;
    setFilters: (filters: Record<string, any>) => void;
    setSorting: (column: string, direction: 'asc' | 'desc') => void;
    setPagination: (page: number, pageSize?: number) => void;
    setSearchQuery: (query: string) => void;
}

export function useSimpleData({
    componentId,
    binding,
    autoFetch = true
}: UseSimpleDataOptions): UseSimpleDataResult {
    const { connected, initialize } = useDataBindingStore();

    // Local state
    const [filters, setFiltersState] = useState<Record<string, any>>({});
    const [sorting, setSortingState] = useState<{ column?: string; direction?: 'asc' | 'desc' }>({});
    const [pagination, setPaginationState] = useState({ page: 0, pageSize: 20 });
    const [searchQuery, setSearchQueryState] = useState('');

    // Initialize connection
    useEffect(() => {
        if (!connected) initialize();
    }, [connected, initialize]);

    // Derived params for React Query
    const queryParams = useMemo(() => {
        if (!binding?.tableName) return null;

        return {
            page: binding.pagination.enabled ? (pagination.page + 1) : undefined, // API is 1-based? API offset handled in hook
            pageSize: binding.pagination.enabled ? (binding.pagination.pageSize || pagination.pageSize) : undefined,
            sort: (sorting.column || binding.sorting.column) ? {
                column: sorting.column || binding.sorting.column!,
                direction: sorting.direction || binding.sorting.direction || 'asc'
            } : null,
            filters: {
                ...binding.filtering.filters,
                ...filters,
                ...(searchQuery && binding.filtering.searchEnabled ? {
                    // Search logic: needs to know columns. Hook logic simplistic? 
                    // databaseApi passes filters directly.
                    // Special 'search' filter? Or manual OR?
                    // Backend needs to handle 'search' key or we define it here.
                    // The original queryData handled search by client-side filtering? 
                    // NO, database-api passes search query?
                    // database-api router handles 'filters'.
                    // For search, we typically need to filter on specific columns.
                    // Passing 'search' key to backend if supported.
                    search: searchQuery
                } : {})
            }
        };
    }, [binding, filters, sorting, pagination, searchQuery]);

    const resolvedHiddenFilters = useMemo(() => {
        if (!binding?.hiddenFilters) return [];
        // Basic context for builder preview
        const ctx = {
            url: Object.fromEntries(new URLSearchParams(window.location.search)),
            system: {
                date: new Date().toISOString(),
            }
        };
        return resolveHiddenFilters(binding.hiddenFilters, ctx, { dropUnresolved: true });
    }, [binding?.hiddenFilters]);

    // React Query Hooks
    const {
        data: globalSchema,
        isLoading: isGlobalSchemaLoading,
        error: globalSchemaError
    } = useGlobalSchema();

    // Use datasource-specific API when dataSourceId is available
    const useDatasourceData = !!binding?.dataSourceId && binding.dataSourceId !== 'backend';

    // Decide which data hook to use (RPC mode for special functions)
    const isRpcMode = !!binding?.rpcName;

    // Fetch schema via datasource-specific API when needed
    const { data: datasourceSchema } = useQuery({
        queryKey: ['datasource-schema', binding?.dataSourceId, binding?.tableName],
        queryFn: async () => {
            if (!binding?.dataSourceId || !binding?.tableName) return null;
            const response = await fetch(
                `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/schema/`
            );
            if (!response.ok) return null;
            return response.json();
        },
        enabled: useDatasourceData && !!binding?.tableName,
        staleTime: STALE.SCHEMA, // 1 hour for schema
    });

    // Use datasource-specific schema if available, otherwise fallback to legacy
    const { data: legacySchema } = useTableSchema(!useDatasourceData ? binding?.tableName || null : null);
    const schema = useDatasourceData ? datasourceSchema : legacySchema;

    // React Query for datasource-specific data
    const {
        data: datasourceResult,
        isLoading: isDatasourceLoading,
        error: datasourceError,
        refetch: refetchDatasource
    } = useQuery({
        queryKey: ['datasource-data', binding?.dataSourceId, binding?.tableName, queryParams, binding?.columnOrder],
        queryFn: async () => {
            if (!binding?.dataSourceId || !binding?.tableName) {
                return { records: [], total: 0 };
            }

            const params = new URLSearchParams();
            params.append('limit', String(queryParams?.pageSize || 50));
            if (queryParams?.page && queryParams?.pageSize) {
                params.append('offset', String((queryParams.page - 1) * queryParams.pageSize));
            }

            // Add sorting
            if (queryParams?.sort?.column) {
                params.append('sort', queryParams.sort.column);
                params.append('order', queryParams.sort.direction || 'asc');
            }

            // Add search
            if (queryParams?.filters?.search) {
                params.append('search', queryParams.filters.search);
            }

            // Add search columns restriction (so backend only searches these columns)
            if (binding.searchColumns && binding.searchColumns.length > 0) {
                params.append('search_cols', JSON.stringify(binding.searchColumns));
            }

            // Add filters (excluding search which is handled separately)
            const filterList: any[] = [];
            if (queryParams?.filters) {
                Object.entries(queryParams.filters)
                    .filter(([k, v]) => k !== 'search' && v != null && v !== '')
                    .forEach(([field, value]) => {
                        // Handle filter object format { filterType, value }
                        if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
                            const filterObj = value as { value: unknown };
                            filterList.push({ field, operator: '==', value: filterObj.value });
                        } else {
                            filterList.push({ field, operator: '==', value });
                        }
                    });
            }

            // Append hidden filters
            if (resolvedHiddenFilters.length > 0) {
                filterList.push(...resolvedHiddenFilters);
            }

            if (filterList.length > 0) {
                params.append('filters', JSON.stringify(filterList));
            }

            // Build select param for related columns (format: "programs(degree_name,type)")
            // columnOrder may contain columns like "programs.degree_name" which need to be grouped
            if (binding.columnOrder && binding.columnOrder.length > 0) {
                const relatedColumnsMap = new Map<string, string[]>();
                binding.columnOrder.forEach((col: string) => {
                    if (col.includes('.')) {
                        const [table, column] = col.split('.');
                        if (!relatedColumnsMap.has(table)) {
                            relatedColumnsMap.set(table, []);
                        }
                        relatedColumnsMap.get(table)!.push(column);
                    }
                });

                if (relatedColumnsMap.size > 0) {
                    const selectParts: string[] = ['*'];
                    relatedColumnsMap.forEach((columns, table) => {
                        selectParts.push(`${table}(${columns.join(',')})`);
                    });
                    params.append('select', selectParts.join(','));
                }
            }

            // Debug logging for request construction
            console.log('[useSimpleData] Request Debug:', {
                bindingTableName: binding.tableName,
                columnOrder: binding.columnOrder,
                selectParam: params.get('select'),
                fullParams: params.toString()
            });

            const response = await fetch(
                `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/data?${params}`
            );
            if (!response.ok) throw new Error('Failed to fetch data');
            const result = await response.json();

            // Debug log to check if keys are present (e.g. contacts.case_summary)
            if (result.records && result.records.length > 0) {
                console.log('[useSimpleData] First record keys:', Object.keys(result.records[0]));
                // Check specifically for any dotted keys
                const dottedKeys = Object.keys(result.records[0]).filter(k => k.includes('.'));
                console.log('[useSimpleData] Dotted keys present:', dottedKeys);
            }

            return result;
        },
        enabled: useDatasourceData && !!binding?.tableName,
        staleTime: STALE.REALTIME,
    });

    // Call both hooks but only enable the relevant one
    const {
        data: tableResult,
        isLoading: isTableLoading,
        error: tableError,
        refetch: refetchTable
    } = useTableData(
        !isRpcMode && !useDatasourceData && binding?.tableName ? binding.tableName : null,
        queryParams || {}
    );

    const {
        data: rpcResult,
        isLoading: isRpcLoading,
        error: rpcError,
        refetch: refetchRpc
    } = useRpcData(
        isRpcMode ? binding!.rpcName : undefined,
        // For RPC, construct clean params with snake_case keys only
        isRpcMode ? {
            // Start with binding-specific params (table_name, auth_id_col)
            ...binding?.params,
            // Map standard queryParams to RPC snake_case (don't spread queryParams to avoid duplicates)
            page: queryParams?.page,
            page_size: queryParams?.pageSize,
            sort_col: queryParams?.sort?.column,
            sort_dir: queryParams?.sort?.direction,
            search_query: queryParams?.filters?.search || '',
            filters: JSON.stringify(queryParams?.filters || {}),
        } : {}
    );

    // Unify results - prioritize datasource-specific API
    const queryResult = useDatasourceData
        ? { rows: datasourceResult?.records || [], total: datasourceResult?.total || 0 }
        : isRpcMode
            ? rpcResult
            : tableResult;
    const queryError = useDatasourceData ? datasourceError : (isRpcMode ? rpcError : tableError);
    const isDataLoading = useDatasourceData ? isDatasourceLoading : (isRpcMode ? isRpcLoading : isTableLoading);
    const refetchQuery = useDatasourceData ? refetchDatasource : (isRpcMode ? refetchRpc : refetchTable);

    // Ensure array data
    const data = useMemo(() => Array.isArray(queryResult?.rows) ? queryResult.rows : [], [queryResult]);
    const count = queryResult?.total || 0;

    // Combine errors and loading states
    const error = (globalSchemaError instanceof Error ? globalSchemaError.message : null) ||
        (queryError instanceof Error ? queryError.message : null);

    const isLoading = isGlobalSchemaLoading || isDataLoading;

    // Actions
    const setFilters = useCallback((newFilters: Record<string, any>) => {
        setFiltersState(newFilters);
        setPaginationState(prev => ({ ...prev, page: 0 }));
    }, []);

    const setSorting = useCallback((column: string, direction: 'asc' | 'desc') => {
        setSortingState({ column, direction });
    }, []);

    const setPagination = useCallback((page: number, pageSize?: number) => {
        setPaginationState(prev => ({ page, pageSize: pageSize ?? prev.pageSize }));
    }, []);

    const setSearchQuery = useCallback((query: string) => {
        setSearchQueryState(query);
        setPaginationState(prev => ({ ...prev, page: 0 }));
    }, []);

    // Wrapper for refetch that returns Promise<void>
    const refetchWrapper = useCallback(async () => {
        await refetchQuery();
    }, [refetchQuery]);

    return {
        data,
        count,
        loading: isLoading,
        error,
        schema,
        currentSorting: sorting,
        currentPagination: pagination,
        refetch: refetchWrapper,
        setFilters,
        setSorting,
        setPagination,
        setSearchQuery
    };
}
