import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  ChevronUp, 
  ChevronDown, 
  Settings,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useSimpleData } from '@/hooks/useSimpleData';

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
    displayType?: 'text' | 'badge' | 'date' | 'currency' | 'percentage' | 'image' | 'link';
  }>;
}

interface SimpleDataTableProps {
  componentId: string;
  binding?: ComponentDataBinding | null;
  className?: string;
  onConfigureBinding?: () => void;
}

export const SimpleDataTable = React.memo(({ 
  componentId, 
  binding, 
  className,
  onConfigureBinding 
}: SimpleDataTableProps) => {
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
  } = useSimpleData({ 
    componentId, 
    binding,
    autoFetch: true 
  });

  const [searchInput, setSearchInput] = React.useState('');

  // Handle search input changes
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchQuery(value);
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (!binding?.sorting.enabled) return;
    
    const currentDirection = binding.sorting.column === column ? binding.sorting.direction : undefined;
    const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    setSorting(column, newDirection);
  };

  // Format cell values based on column configuration
  const formatValue = (value: any, columnName: string) => {
    if (value === null || value === undefined) return '-';
    
    const override = binding?.columnOverrides[columnName];
    const displayType = override?.displayType || 'text';
    
    switch (displayType) {
      case 'badge':
        return <Badge variant="secondary">{String(value)}</Badge>;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'currency':
        return new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD' 
        }).format(Number(value) || 0);
      case 'percentage':
        return `${(Number(value) * 100).toFixed(1)}%`;
      case 'image':
        return (
          <img 
            src={String(value)} 
            alt="Image" 
            className="h-8 w-8 rounded object-cover"
            onError={(e) => {
              e.currentTarget.src = '/placeholder.svg';
            }}
          />
        );
      case 'link':
        return (
          <a 
            href={String(value)} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {String(value)}
          </a>
        );
      default:
        return String(value);
    }
  };

  // Get visible columns based on configuration
  const getVisibleColumns = () => {
    if (!schema?.columns) return [];
    
    return schema.columns.filter(column => {
      const override = binding?.columnOverrides[column.name];
      return override?.visible !== false; // Show by default unless explicitly hidden
    });
  };

  // Get column display name
  const getColumnDisplayName = (columnName: string) => {
    const override = binding?.columnOverrides[columnName];
    return override?.displayName || columnName;
  };

  // Handle pagination
  const handlePreviousPage = () => {
    if (binding?.pagination.enabled && binding.pagination.page > 0) {
      setPagination(binding.pagination.page - 1);
    }
  };

  const handleNextPage = () => {
    if (binding?.pagination.enabled && data.length === binding.pagination.pageSize) {
      setPagination(binding.pagination.page + 1);
    }
  };

  // No binding configured
  if (!binding) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Settings className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Data Binding Configured</h3>
          <p className="text-muted-foreground text-center mb-4">
            Configure a data source and table to display data in this component.
          </p>
          {onConfigureBinding && (
            <Button onClick={onConfigureBinding}>
              Configure Data Binding
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (loading && data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading Data...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">Fetching data from {binding.tableName}...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={refetch} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const visibleColumns = getVisibleColumns();

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {binding.tableName} ({count} records)
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {onConfigureBinding && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConfigureBinding}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Search */}
        {binding.filtering.searchEnabled && (
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="max-w-sm"
            />
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((column) => (
                  <TableHead
                    key={column.name}
                    className={binding.sorting.enabled ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={() => binding.sorting.enabled && handleSort(column.name)}
                  >
                    <div className="flex items-center gap-1">
                      {getColumnDisplayName(column.name)}
                      {binding.sorting.enabled && binding.sorting.column === column.name && (
                        binding.sorting.direction === 'asc' ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell 
                    colSpan={visibleColumns.length} 
                    className="text-center py-8 text-muted-foreground"
                  >
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, index) => (
                  <TableRow key={index}>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.name}>
                        {formatValue(row[column.name], column.name)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {binding.pagination.enabled && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Page {binding.pagination.page + 1}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={binding.pagination.page === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={data.length < binding.pagination.pageSize || loading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});