import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, Database, ChevronLeft, ChevronRight, Filter, SortAsc, SortDesc } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDataBindingStore } from '@/stores/data-binding-simple';

interface DataTableProps {
  tableName: string;
  title?: string;
  pageSize?: number;
  searchable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  className?: string;
}

interface TableColumn {
  column_name: string;
  data_type: string;
}

interface TableData {
  data: Record<string, any>[];
  columns: TableColumn[];
  total: number;
}

export const DataTable: React.FC<DataTableProps> = ({
  tableName,
  title,
  pageSize = 20,
  searchable = true,
  sortable = true,
  filterable = false,
  className
}) => {
  console.log(`[DataTable] Initializing for table: ${tableName}`);
  
  const { connected } = useDataBindingStore();
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const fetchData = async () => {
    if (!connected || !tableName) {
      console.log(`[DataTable] Skipping fetch - connected: ${connected}, tableName: ${tableName}`);
      return;
    }

    console.log(`[DataTable] Fetching data for ${tableName} - page: ${page}, pageSize: ${pageSize}`);
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', pageSize.toString());
      params.set('offset', (page * pageSize).toString());
      
      if (sortColumn && sortable) {
        params.set('orderBy', sortColumn);
        params.set('orderDirection', sortDirection);
      }

      // Add search filter
      if (searchQuery && searchable) {
        params.set('search', searchQuery);
      }

      const url = `/api/database/table-data/${encodeURIComponent(tableName)}?${params}`;
      console.log(`[DataTable] Fetching from: ${url}`);
      const response = await fetch(url, { credentials: 'include' });

      console.log(`[DataTable] Response status: ${response.status}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status}`);
      }

      const result = await response.json();
      console.log(`[DataTable] API result:`, { success: result.success, dataLength: result.data?.length });
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch table data');
      }

      // Get schema
      console.log(`[DataTable] Fetching schema for ${tableName}`);
      const schemaResponse = await fetch(`/api/database/table-schema/${encodeURIComponent(tableName)}`, {
        credentials: 'include'
      });

      let columns: TableColumn[] = [];
      if (schemaResponse.ok) {
        const schemaResult = await schemaResponse.json();
        console.log(`[DataTable] Schema result:`, { success: schemaResult.success, dataType: typeof schemaResult.data });
        if (schemaResult.success && schemaResult.data) {
          columns = schemaResult.data;
        }
      }

      // Fallback: infer columns from data
      if (columns.length === 0 && result.data && result.data.length > 0) {
        console.log(`[DataTable] Inferring columns from data`);
        const firstRow = result.data[0];
        columns = Object.keys(firstRow).map(key => ({
          column_name: key,
          data_type: typeof firstRow[key]
        }));
      }

      console.log(`[DataTable] Final columns:`, columns.map(c => c.column_name));
      setTableData({
        data: result.data || [],
        columns,
        total: result.total || result.data?.length || 0
      });

    } catch (err) {
      console.error(`[DataTable] Error fetching data for ${tableName}:`, err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
    } finally {
      console.log(`[DataTable] Fetch completed for ${tableName}`);
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log(`[DataTable] Effect triggered - table: ${tableName}, page: ${page}, sort: ${sortColumn}:${sortDirection}`);
    fetchData();
  }, [tableName, page, sortColumn, sortDirection, connected]);

  useEffect(() => {
    console.log(`[DataTable] Search query changed: "${searchQuery}"`);
    // Reset to first page when search changes
    const timeoutId = setTimeout(() => {
      if (page === 0) {
        fetchData();
      } else {
        console.log(`[DataTable] Resetting to page 0 due to search`);
        setPage(0);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSort = (column: string) => {
    if (!sortable) return;
    
    console.log(`[DataTable] Sort requested for column: ${column}`);
    if (sortColumn === column) {
      const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      console.log(`[DataTable] Toggling sort direction to: ${newDirection}`);
      setSortDirection(newDirection);
    } else {
      console.log(`[DataTable] Setting new sort column: ${column}`);
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (typeof value === 'object') {
      return <span className="text-muted-foreground">{JSON.stringify(value)}</span>;
    }
    const str = String(value);
    if (str.length > 100) {
      return <span title={str}>{str.substring(0, 100)}...</span>;
    }
    return str;
  };

  const filteredData = tableData?.data || [];

  if (!connected) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title || `Table: ${tableName}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">Database not connected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title || `Table: ${tableName}`}
            {tableData && (
              <Badge variant="secondary">{tableData.total} rows</Badge>
            )}
          </CardTitle>
          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        
        {searchable && (
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search table data..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={fetchData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : tableData ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredData.length} of {tableData.total} rows (page {page + 1})
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={filteredData.length < pageSize}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="border rounded-md">
              <ScrollArea className="h-96 w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tableData.columns.map((column) => (
                        <TableHead 
                          key={column.column_name} 
                          className="min-w-[150px] whitespace-nowrap sticky-column"
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <span>{column.column_name}</span>
                              {sortable && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-1"
                                  onClick={() => handleSort(column.column_name)}
                                >
                                  {sortColumn === column.column_name ? (
                                    sortDirection === 'asc' ? (
                                      <SortAsc className="h-3 w-3" />
                                    ) : (
                                      <SortDesc className="h-3 w-3" />
                                    )
                                  ) : (
                                    <Filter className="h-3 w-3 opacity-50" />
                                  )}
                                </Button>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground font-normal">
                              {column.data_type}
                            </span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={tableData.columns.length} className="text-center py-8">
                          <div className="text-muted-foreground">
                            {searchQuery ? 'No matching data found' : 'No data in this table'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map((row, index) => (
                        <TableRow key={index}>
                          {tableData.columns.map((column) => (
                            <TableCell key={column.column_name} className="min-w-[150px] max-w-[300px]">
                              <div className="truncate" title={String(row[column.column_name] || '')}>
                                {formatValue(row[column.column_name])}
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};