import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { databaseApi } from '@/services/database-api';
import { SupabaseTable } from '@/services/database-api';
import { STALE } from '@/lib/queryCache';

// Types
export interface GlobalSchema {
    tables: any[];
    foreign_keys: {
        table_name: string;
        column_name: string;
        foreign_table_name: string;
        foreign_column_name: string;
    }[];
    definitions?: any;
}

export interface TableDataParams {
    page?: number;
    pageSize?: number;
    filters?: Record<string, any>;
    sort?: { column: string; direction: 'asc' | 'desc' } | null;
}

// Hooks

export function useGlobalSchema() {
    return useQuery({
        queryKey: ['globalSchema'],
        queryFn: async () => {
            const result = await databaseApi.advancedQuery('frontbase_get_schema_info', {});
            // Handle the wrapper { success: true, data: { ... } } or direct
            const schemaData = result.data || result;
            return {
                tables: schemaData.tables || [],
                foreign_keys: schemaData.foreign_keys || [],
                definitions: schemaData.definitions || {}
            } as GlobalSchema;
        },
        staleTime: STALE.SCHEMA, // 1 hour (schema rarely changes)
        retry: 2,
    });
}

export function useTables() {
    return useQuery({
        queryKey: ['tables'],
        queryFn: async () => {
            const result = await databaseApi.fetchTables();
            // fetchTables returns { tables: ... } (unwrapped/validated)
            return result.tables || [];
        },
        staleTime: STALE.STANDARD, // 5 minutes
    });
}

export function useTableSchema(tableName: string | null) {
    return useQuery({
        queryKey: ['tableSchema', tableName],
        queryFn: async () => {
            if (!tableName) return null;
            return await databaseApi.fetchTableSchema(tableName);
        },
        enabled: !!tableName,
        staleTime: STALE.SCHEMA, // 1 hour for schema (rarely changes)
    });
}

export function useTableData(tableName: string | null, params: TableDataParams = {}) {
    const { data: globalSchema } = useGlobalSchema();

    return useQuery({
        queryKey: ['tableData', tableName, params],
        queryFn: async () => {
            if (!tableName) return { data: [], total: 0 };

            // Build joins from global schema
            const joins: string[] = [];
            if (globalSchema?.foreign_keys) {
                globalSchema.foreign_keys.forEach(fk => {
                    if (fk.table_name === tableName) {
                        // Fetch all columns from related table to ensure we get the display data
                        // e.g. "providers(*)" ensures row.providers is { id, provider_name, ... }
                        joins.push(`${fk.foreign_table_name}(*)`);
                    }
                });
            }

            const queryJoins = Array.from(new Set(joins));

            // Build PostgREST select clause with embedded joins
            // e.g., "*,providers(*),categories(*)"
            const selectParts = ['*', ...queryJoins];
            const selectClause = selectParts.join(',');

            const queryParams = new URLSearchParams();
            queryParams.append('select', selectClause); // Key fix: embed joins in select
            if (params.page) queryParams.append('page', params.page.toString());
            if (params.pageSize) queryParams.append('limit', params.pageSize.toString());
            if (params.sort) {
                queryParams.append('orderBy', params.sort.column);
                queryParams.append('orderDirection', params.sort.direction);
            }
            if (params.filters) queryParams.append('filters', JSON.stringify(params.filters));

            // Calculate offset based on page (1-indexed?)
            // Assuming API expects offset/limit or page/pageSize?
            // database-api queryData passes params directly.
            // Database router expects: limit, offset, sort, order, filters, joins.
            if (params.page && params.pageSize) {
                const offset = (params.page - 1) * params.pageSize;
                queryParams.append('offset', offset.toString());
            }

            const result = await databaseApi.queryData(tableName, queryParams);
            // Ensure result has expected shape { data, total, success }
            // result might be wrapped { success: true, data: { data: [], total: 0 } }
            // or unwrapped if I changed databaseApi (I didn't change queryData return much?)

            const tableData = result.data?.data ? result.data : result; // Handle wrapper

            return {
                rows: tableData.data || [],
                total: tableData.total || 0
            };
        },
        enabled: !!tableName && !!globalSchema,
        placeholderData: keepPreviousData,
        staleTime: STALE.REALTIME,
    });
}

export function useRpcData(rpcName: string | undefined, params: any = {}) {
    return useQuery({
        queryKey: ['rpcData', rpcName, params],
        queryFn: async () => {
            if (!rpcName) return { rows: [], total: 0 };

            // Params are passed directly to the RPC via advancedQuery
            // The database-api handles 'advanced-query' endpoint which expects { rpcName, params }
            // So we pass the entire params object as the 'params' property
            const result = await databaseApi.advancedQuery(rpcName, params);

            // Result format: { success: true, rows: [], total: ... }
            const rpcResult = result.data || result;

            return {
                rows: rpcResult.rows || [],
                total: rpcResult.total || 0
            };
        },
        enabled: !!rpcName,
        placeholderData: keepPreviousData,
        staleTime: STALE.REALTIME,
    });
}
