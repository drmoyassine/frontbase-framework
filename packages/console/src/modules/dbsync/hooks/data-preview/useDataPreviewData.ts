import { useMemo } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryCache';
import { datasourcesApi } from '../../api';

interface UseDataPreviewDataProps {
    isOpen: boolean;
    datasourceId?: number | string;
    selectedTable?: string;
    appliedFilters: any[];
    showDataSearchResults: boolean;
    dataSearchQuery: string;
}

export const useDataPreviewData = ({
    isOpen,
    datasourceId,
    selectedTable,
    appliedFilters,
    showDataSearchResults,
    dataSearchQuery
}: UseDataPreviewDataProps) => {
    const queryClient = useQueryClient();

    // Queries
    const { data: tables } = useQuery({
        queryKey: ['datasourceTables', datasourceId],
        queryFn: () => datasourcesApi.getTables(datasourceId!).then(r => r.data),
        enabled: isOpen && !!datasourceId,
        staleTime: STALE.STANDARD, // 5 minutes
    });

    const { data: schemaData } = useQuery({
        queryKey: ['tableSchema', datasourceId, selectedTable],
        queryFn: () => datasourcesApi.getTableSchema(datasourceId!, selectedTable!).then(r => r.data),
        enabled: isOpen && !!datasourceId && !!selectedTable,
        staleTime: STALE.SCHEMA, // 1 hour for schema
    });

    // Infinite query for paginated table data
    const PAGE_SIZE = 50;
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
        queryKey: ['tableData', datasourceId, selectedTable, appliedFilters],
        queryFn: async ({ pageParam = 0 }) => {
            const response = await datasourcesApi.getTablesData(datasourceId!, selectedTable!, PAGE_SIZE, pageParam, appliedFilters);
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
        queryKey: ['datasourceSearch', datasourceId, dataSearchQuery],
        queryFn: () => datasourcesApi.searchDatasource(datasourceId!, dataSearchQuery).then(r => r.data),
        enabled: isOpen && !!datasourceId && showDataSearchResults && !!dataSearchQuery.trim(),
        staleTime: STALE.STANDARD, // Cache search results for 5 minutes
    });

    const refreshSchemaMutation = useMutation({
        mutationFn: () => datasourcesApi.refreshTableSchema(datasourceId!, selectedTable!),
        onSuccess: (data) => {
            queryClient.setQueryData(['tableSchema', datasourceId, selectedTable], data.data);
        },
    });

    return {
        tables,
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
