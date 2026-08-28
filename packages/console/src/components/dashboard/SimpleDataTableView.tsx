import React, { useEffect, useState } from 'react';
import { debug } from '@/lib/debug';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, Database, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface TableData {
  data: Record<string, any>[];
  columns: { column_name: string; data_type: string }[];
  total: number;
}

export const SimpleDataTableView: React.FC = () => {
  const {
    tables,
    tablesLoading,
    tablesError,
    fetchTables,
    connected
  } = useDataBindingStore();

  const { connections } = useDashboardStore();

  const [selectedTable, setSelectedTable] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  // Optimized effects with reduced logging
  useEffect(() => {
    if (connected) {
      fetchTables();
    }
  }, [connected, fetchTables]);

  useEffect(() => {
    if (selectedTable) {
      fetchTableData();
    }
  }, [selectedTable, offset]);

  // Simplified auto-selection with stable dependencies
  useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      const firstTable = tables[0].name;
      setSelectedTable(firstTable);
      debug.log('SIMPLE_TABLE_VIEW', 'Auto-selecting first table:', firstTable);
    }
  }, [tables.length, selectedTable]);

  const fetchTableData = async () => {
    if (!selectedTable) return;

    setDataLoading(true);
    setDataError(null);

    try {
      const url = `/api/database/table-data/${selectedTable}?limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch table data: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch table data');
      }

      // Get schema for columns
      const schemaResponse = await fetch(`/api/database/table-schema/${selectedTable}`, {
        credentials: 'include'
      });

      let columns: { column_name: string; data_type: string }[] = [];
      if (schemaResponse.ok) {
        const schemaResult = await schemaResponse.json();
        if (schemaResult.success && schemaResult.data) {
          columns = schemaResult.data.columns || schemaResult.columns || schemaResult.data || [];
        }
      }

      // If no schema from API, infer from data
      if (columns.length === 0 && result.data && Array.isArray(result.data) && result.data.length > 0) {
        const firstRow = result.data[0];
        columns = Object.keys(firstRow).map(key => ({
          column_name: key,
          data_type: typeof firstRow[key]
        }));
      }

      // Ensure we have valid data before setting state
      const validData = result.data && Array.isArray(result.data) ? result.data : [];

      setTableData({
        data: validData,
        columns,
        total: result.total || validData.length
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch table data';
      setDataError(errorMessage);
    } finally {
      setDataLoading(false);
    }
  };

  const handleTableChange = (tableName: string) => {
    setSelectedTable(tableName);
    setOffset(0);
    setSearchQuery('');
  };

  const handlePrevious = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    setOffset(offset + limit);
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

  const filteredData = tableData?.data.filter(row =>
    Object.values(row).some(value =>
      String(value || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  ) || [];

  const handleOpenInSupabase = () => {
    if (connections.supabase.url && selectedTable) {
      const baseUrl = connections.supabase.url.replace('/rest/v1', '');
      const projectRef = baseUrl.split('//')[1]?.split('.')[0];
      if (projectRef) {
        window.open(`https://supabase.com/dashboard/project/${projectRef}/editor/${selectedTable}`, '_blank');
      }
    }
  };

  if (tablesError) {
    return (
      <Card className="w-full max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">{tablesError}</p>
            <Button onClick={fetchTables} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (tables.length === 0 && !tablesLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No tables found in your Supabase database</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Table Viewer
            {tables.length > 0 && (
              <Badge variant="secondary">{tables.length} tables</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedTable && (
              <Button
                onClick={handleOpenInSupabase}
                variant="outline"
                size="sm"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in Supabase
              </Button>
            )}
            <Button
              onClick={fetchTables}
              variant="outline"
              size="sm"
              disabled={tablesLoading}
            >
              <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <Select value={selectedTable} onValueChange={handleTableChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.name} value={table.name}>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {table.name}
                      <Badge variant="outline" className="text-xs">
                        {table.schema}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
      </CardHeader>

      <CardContent>
        {tablesLoading ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading tables...</p>
          </div>
        ) : dataLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : dataError ? (
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{dataError}</p>
            <Button onClick={fetchTableData} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : selectedTable && tableData ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {filteredData.length} of {tableData.total} rows
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={offset === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={tableData.data.length < limit}
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
                        <TableHead key={column.column_name} className="min-w-[150px] whitespace-nowrap sticky-column">
                          <div className="flex flex-col">
                            <span>{column.column_name}</span>
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
            <p className="text-muted-foreground">Select a table to view its data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};