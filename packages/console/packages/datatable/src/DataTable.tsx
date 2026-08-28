import React, { useState, useMemo, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { DataTableProps, FilterConfig } from './types';
import { useDataTableData } from './hooks/useDataTableData';
import { useFilterOptions } from './hooks/useFilterOptions';
import { TableHeader } from './components/TableHeader';
import { TableBody } from './components/TableBody';
import { FilterBar } from './components/FilterBar';
import { Pagination } from './components/Pagination';
import { cn } from './lib/utils';

/**
 * Unified DataTable Component
 * 
 * Works in both builder and edge environments with consistent UI.
 * Uses React Query for data fetching and caching.
 */
export function DataTable({
    mode = 'builder',
    componentId,
    binding,
    initialData = [],
    initialTotal,
    className,
    style,
    onColumnOverrideChange,
    onConfigureBinding,
    headerCellWrapper,
    title,
}: DataTableProps) {
    // State
    const [currentPage, setCurrentPage] = useState(binding?.pagination?.page || 0);
    const [sortColumn, setSortColumn] = useState<string | null>(binding?.sorting?.column || null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(binding?.sorting?.direction || 'asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filterValues, setFilterValues] = useState<Record<string, any>>({});

    const pageSize = binding?.pagination?.pageSize || 20;
    const paginationEnabled = binding?.pagination?.enabled !== false;
    const sortingEnabled = binding?.sorting?.enabled !== false;

    // Debounce search
    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (debouncedSearch !== searchQuery) {
                setDebouncedSearch(searchQuery);
                setCurrentPage(0);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, debouncedSearch]);

    // Data fetching
    const {
        data: queryResult,
        isLoading,
        error,
    } = useDataTableData({
        mode,
        binding,
        page: currentPage,
        pageSize,
        sortColumn,
        sortDirection,
        filters: filterValues,
        searchQuery: debouncedSearch,
        initialData: initialData.length > 0 ? initialData : undefined,
        enabled: !!binding?.tableName,
    });

    const data = queryResult?.data || [];
    const totalCount = queryResult?.total || initialTotal || 0;

    // Filter options fetching
    const { data: fetchedOptions = {} } = useFilterOptions({
        mode,
        filters: binding?.frontendFilters || [],
        tableName: binding?.tableName,
        dataSourceId: binding?.dataSourceId,
        cascadingFilters: filterValues,
        searchQuery: debouncedSearch,
        enabled: !!binding?.tableName && (binding?.frontendFilters?.length || 0) > 0,
    });

    // Compute visible columns
    const columns = useMemo(() => {
        const order = binding?.columnOrder || [];
        if (order.length > 0) {
            return order.filter((col) => {
                const override = binding?.columnOverrides?.[col];
                return override?.visible !== false;
            });
        }
        // Auto-detect from first data row
        if (data.length > 0) {
            return Object.keys(data[0]).filter((key) => !key.startsWith('_') && key !== 'id');
        }
        return [];
    }, [binding?.columnOrder, binding?.columnOverrides, data]);

    // Handlers
    const handleSort = useCallback(
        (column: string) => {
            if (!sortingEnabled) return;
            const newDir = sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
            setSortColumn(column);
            setSortDirection(newDir);
            setCurrentPage(0);
        },
        [sortingEnabled, sortColumn, sortDirection]
    );

    const handleFilterChange = useCallback((column: string, value: any) => {
        setFilterValues((prev) => {
            const next = { ...prev };
            if (value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
                delete next[column];
            } else {
                next[column] = value;
            }
            return next;
        });
        setCurrentPage(0);
    }, []);

    const handleClearFilters = useCallback(() => {
        setFilterValues({});
        setCurrentPage(0);
    }, []);

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);

    // No binding state
    if (!binding || !binding.tableName) {
        return (
            <div className={cn('rounded-md border p-8', className)} style={style as any}>
                <div className="text-center text-muted-foreground">
                    No data source configured.
                    {onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="ml-1 text-primary hover:underline"
                        >
                            Configure binding
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={cn('rounded-md border border-red-200 bg-red-50 p-4', className)} style={style as any}>
                <div className="text-red-700">
                    {error instanceof Error ? error.message : 'Failed to load data'}
                </div>
            </div>
        );
    }

    // Initial loading state
    if (isLoading && data.length === 0) {
        return (
            <div className={cn('rounded-md border', className)} style={style as any}>
                <div className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <div>Loading data...</div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn('space-y-4', className)} style={style as any}>
            {/* Title */}
            {title && (
                <h3 className="text-lg font-semibold">{title}</h3>
            )}

            {/* Search bar */}
            {binding?.filtering?.searchEnabled && (
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {isLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                </div>
            )}

            {/* Filter bar */}
            {binding?.frontendFilters && binding.frontendFilters.length > 0 && (
                <FilterBar
                    filters={binding.frontendFilters}
                    filterValues={filterValues}
                    fetchedOptions={fetchedOptions}
                    onFilterChange={handleFilterChange}
                    onClearAll={handleClearFilters}
                />
            )}

            {/* Table */}
            <div className="rounded-md border overflow-auto relative">
                {isLoading && data.length > 0 && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}
                <table className="w-full text-sm">
                    <TableHeader
                        columns={columns}
                        columnOverrides={binding?.columnOverrides}
                        sortingEnabled={sortingEnabled}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        headerCellWrapper={headerCellWrapper as any}
                    />
                    <TableBody
                        data={data}
                        columns={columns}
                        columnOverrides={binding?.columnOverrides}
                    />
                </table>
            </div>

            {/* Pagination */}
            {paginationEnabled && (
                <Pagination
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalCount={totalCount}
                    loading={isLoading}
                    onPageChange={handlePageChange}
                />
            )}
        </div>
    );
}

export default DataTable;
