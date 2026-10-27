import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Search, ArrowUpDown } from 'lucide-react';
import { useSimpleData } from '@/hooks/useSimpleData';
import { cn } from '@/lib/utils';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { FilterConfig } from '@/hooks/data/useSimpleData';
import { FilterBar } from './FilterBar';
import { DataTableCell } from './table/DataTableCell';
import { ColumnSettingsPopover } from './table/ColumnSettingsPopover';
import { useTableColumns } from '@/hooks/useTableColumns';

interface ComponentDataBinding {
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
}

interface UniversalDataTableProps {
  componentId: string;
  binding?: ComponentDataBinding | null;
  className?: string;
  style?: React.CSSProperties;
  onConfigureBinding?: () => void;
  onColumnOverrideChange?: (columnName: string, updates: any) => void; // For builder mode column editing
  title?: string;
}

export function UniversalDataTable({
  componentId,
  binding: bindingProp,
  className,
  style,
  onConfigureBinding,
  onColumnOverrideChange,
  title
}: UniversalDataTableProps) {
  // Detect builder mode
  const isBuilderMode = typeof window !== 'undefined' && window.location.pathname.startsWith('/builder');
  // Get binding from store as fallback if props don't have it
  const { getComponentBinding } = useDataBindingStore();
  const binding = bindingProp || getComponentBinding(componentId);

  const {
    data,
    count,
    loading,
    error,
    schema,
    refetch,
    setFilters,
    setSorting,
    setPagination,
    setSearchQuery,
    currentSorting,
    currentPagination
  } = useSimpleData({
    componentId,
    binding,
    autoFetch: true
  });

  const [searchInput, setSearchInput] = useState('');
  const [runtimeFilters, setRuntimeFilters] = useState<FilterConfig[]>([]);

  // Sync runtimeFilters with binding.frontendFilters
  useEffect(() => {
    if (binding?.frontendFilters) {
      setRuntimeFilters(binding.frontendFilters);
    }
  }, [binding?.frontendFilters]);

  // Update filters when runtime filter values change
  const handleFilterValuesChange = (updatedFilters: FilterConfig[]) => {
    setRuntimeFilters(updatedFilters);
    // Convert to format expected by setFilters: { [column]: value }
    const filterRecord: Record<string, any> = {};
    updatedFilters.forEach(f => {
      if (f.column && f.value !== undefined && f.value !== null && f.value !== '') {
        filterRecord[f.column] = { filterType: f.filterType, value: f.value };
      }
    });
    setFilters(filterRecord);
  };

  const handleSort = (column: string) => {
    console.log('[UniversalDataTable] handleSort triggered for:', column, 'currentSorting:', currentSorting);
    if (!binding?.sorting.enabled) return;

    // Use currentSorting from useSimpleData (local state) instead of binding prop
    const currentDirection = currentSorting?.column === column ? currentSorting?.direction : undefined;
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    console.log('[UniversalDataTable] Toggle:', currentDirection, '->', newDirection);
    setSorting(column, newDirection);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchQuery(value);
  };

  const { visibleColumns, getColumnDisplayName } = useTableColumns(schema, binding);

  // Render loading state if schema is fetching
  if (binding?.tableName && !schema) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          {title !== '' && (
            <CardTitle className="flex items-center justify-between">
              {title === undefined ? 'Data Table' : title}
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Loading table schema...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!binding || !binding.tableName) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          {title !== '' && (
            <CardTitle className="flex items-center justify-between">
              {title === undefined ? 'Data Table' : title}
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No data source configured. Select this component to configure data binding.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          {title !== '' && (
            <CardTitle className="flex items-center justify-between">
              {title === undefined ? 'Data Table' : title}
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center text-destructive py-8">
            Error loading data: {error}
            <div className="mt-2">
              <Button variant="outline" onClick={refetch}>
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }



  if (visibleColumns.length === 0) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          {title !== '' && (
            <CardTitle>
              {title === undefined ? 'Data Table' : title}
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No columns visible. Configure columns in the properties panel.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)} style={style}>
      <CardHeader>
        {title !== '' && (
          <CardTitle className="flex items-center justify-between">
            {title === undefined ? 'Data Table' : title}
          </CardTitle>
        )}

        {binding.filtering?.searchEnabled && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </CardHeader>

      {/* Filter Bar */}
      {runtimeFilters.length > 0 && (
        <div className="px-6 pb-4">
          <FilterBar
            filters={runtimeFilters}
            tableName={binding.tableName}
            dataSourceId={binding.dataSourceId}
            onFilterValuesChange={handleFilterValuesChange}
          />
        </div>
      )}

      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-max" style={style}>
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map((column: any) => (
                      <TableHead key={column.name} className="whitespace-nowrap group">
                        <ColumnSettingsPopover
                          columnName={column.name}
                          columnConfig={binding?.columnOverrides?.[column.name]}
                          onColumnOverrideChange={onColumnOverrideChange!}
                          isBuilderMode={isBuilderMode}
                          isHeader={true}
                        >
                          <div className="flex items-center space-x-1">
                            <span>{getColumnDisplayName(column.name)}</span>
                            {binding.sorting?.enabled && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0"
                                onClick={(e) => { e.stopPropagation(); handleSort(column.name); }}
                              >
                                <ArrowUpDown className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </ColumnSettingsPopover>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/50">
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length} className="text-center py-8">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((row, index) => (
                      <TableRow key={index} className="h-12">
                        {visibleColumns.map((column: any) => (
                          <TableCell key={column.name} className="max-w-[200px] truncate whitespace-nowrap py-2">
                            <DataTableCell
                              value={row[column.name]}
                              columnName={column.name}
                              row={row}
                              columnConfig={binding?.columnOverrides?.[column.name]}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {binding.pagination?.enabled && (
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 px-2 py-4">
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const page = currentPagination.page;
                    const pageSize = currentPagination.pageSize;
                    const start = count === 0 ? 0 : page * pageSize + 1;
                    const end = Math.min((page + 1) * pageSize, count);
                    const totalPages = Math.ceil(count / pageSize);

                    return (
                      <>
                        {/* Mobile/Tablet: Short format */}
                        <span className="md:hidden">{`${start}-${end} of ${count}`}</span>
                        {/* Desktop: Full format */}
                        <span className="hidden md:inline">{`Showing ${start}-${end} of ${count} entries (Page ${page + 1} of ${totalPages || 1})`}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(Math.max(0, currentPagination.page - 1))}
                    disabled={currentPagination.page === 0 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden md:inline">Previous</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPagination(currentPagination.page + 1)}
                    disabled={(currentPagination.page + 1) * currentPagination.pageSize >= count || loading}
                  >
                    <span className="hidden md:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
