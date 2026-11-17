import { useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { api, datasourcesApi } from '../../api';

interface UseDataPreviewDataProps {
    savedView?: {id:string;updated_at:string;target_table:string;source_schema?:string|null};
    sourceSchema?:string;
    isOpen: boolean;
    datasourceId?: number | string;
    selectedTable?: string;
    appliedFilters: any[];
    showDataSearchResults: boolean;
    dataSearchQuery: string;
}

export const useDataPreviewData = ({
    savedView,
    sourceSchema,
    isOpen,
    datasourceId,
    selectedTable,
    appliedFilters,
    showDataSearchResults,
    dataSearchQuery
}: UseDataPreviewDataProps) => {
    const queryClient = useQueryClient();

    // Queries
    const { data: tables, isLoading: isLoadingTables, isFetching: isFetchingTables, error: tablesError, refetch: refetchTables } = useQuery({
        queryKey: ['datasourceTables', datasourceId, sourceSchema],
        queryFn: () => datasourcesApi.getTables(datasourceId!, sourceSchema).then(r => r.data),
        enabled: isOpen && !!datasourceId,
        staleTime: STALE.STANDARD, // 5 minutes
        retry: false, // Surface connection failures immediately; the inspector offers a retry.
    });

    const { data: schemaData } = useQuery({
        queryKey: ['tableSchema', datasourceId, sourceSchema, selectedTable],
        queryFn: () => datasourcesApi.getTableSchema(datasourceId!, selectedTable!, sourceSchema).then(r => r.data),
        enabled: isOpen && !!datasourceId && !!selectedTable,
        staleTime: STALE.SCHEMA, // 1 hour for schema
    });

    // Infinite query for paginated table data
    const savedResults=savedView&&savedView.target_table===selectedTable&&(savedView.source_schema??undefined)===sourceSchema?savedView:undefined;
    const PAGE_SIZE = savedResults?25:50;
    const {
        data: infiniteData,
        isLoading,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isFetching: isFetchingData,
        refetch: refetchData
    } = useInfiniteQuery({
        queryKey: ['tableData', datasourceId, sourceSchema, selectedTable, appliedFilters, savedResults?.id,savedResults?.updated_at],
        queryFn: async ({ pageParam = 0 }) => {
            if(savedResults){
                const {data}=await api.post<{rows:Record<string,unknown>[];total:number;pageSize:number}>(`/views/${encodeURIComponent(savedResults.id)}/preview/`,{page:Math.floor(pageParam/PAGE_SIZE)+1});
                return {records:data.rows,total:data.total,offset:pageParam,limit:PAGE_SIZE,has_more:pageParam+data.rows.length<data.total};
            }
            const response = await datasourcesApi.getTablesData(datasourceId!, selectedTable!, PAGE_SIZE, pageParam, appliedFilters, sourceSchema);
            return response.data;
        },
        getNextPageParam: (lastPage) => {
            if (lastPage.has_more) {
                return lastPage.offset + lastPage.limit;
            }
            return undefined;
        },
        initialPageParam: 0,
        enabled: isOpen && !!datasourceId && !!selectedTable,
        staleTime: 1000 * 60 * 10, // custom TTL (not a STALE tier) — 10 minutes cache for data by default
    });

    // Flatten paginated data for use in the component
    const data = useMemo(() => {
        if (!infiniteData?.pages) return undefined;
        const allRecords = infiniteData.pages.flatMap(page => page.records);
        const lastPage = infiniteData.pages[infiniteData.pages.length - 1];
        return {
            records: allRecords,
            total: lastPage?.total || 0,
            timestamp_utc: lastPage?.timestamp_utc
        };
    }, [infiniteData]);


    const { data: searchResults, isFetching: isSearchingByQuery } = useQuery({
        queryKey: ['datasourceSearch', datasourceId, sourceSchema, dataSearchQuery],
        queryFn: () => datasourcesApi.searchDatasource(datasourceId!, dataSearchQuery, undefined, undefined, sourceSchema).then(r => r.data),
        enabled: isOpen && !!datasourceId && showDataSearchResults && !!dataSearchQuery.trim(),
        staleTime: STALE.STANDARD, // Cache search results for 5 minutes
    });

    const refreshSchemaMutation = useMutation({
        mutationFn: () => datasourcesApi.refreshTableSchema(datasourceId!, selectedTable!, sourceSchema),
        onSuccess: (data) => {
            queryClient.setQueryData(['tableSchema', datasourceId, sourceSchema, selectedTable], data.data);
        },
    });

    return {
        tables,
        isLoadingTables,
        isFetchingTables,
        tablesError,
        refetchTables,
        schemaData,
        data,
        isLoading,
        error,
        isFetchingData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetchData,
        searchResults,
        isSearchingByQuery,
        refreshSchemaMutation
    };
};
