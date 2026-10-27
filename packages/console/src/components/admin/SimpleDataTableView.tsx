import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { debug } from '@/lib/debug';
import { Button } from '@/components/ui/button';
import { Database, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SimpleDataTable } from '@/components/data-binding/SimpleDataTable';
import { TableSelectorDropdown } from './TableSelectorDropdown';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';

export const SimpleDataTableView: React.FC = () => {
  const { connected, connectionError, tables, tablesError, tablesLoading, syncConnectionStatus, fetchTables } = useDataBindingStore();
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Get stable function reference - removed since fetchTables no longer exists

  // Auto-select first table when tables become available (only once)
  React.useEffect(() => {
    if (tables.length > 0 && !selectedTable && !hasAutoSelected && tables[0]?.name) {
      debug.log('SIMPLE_TABLE_VIEW', 'Auto-selecting first table:', tables[0].name);
      setSelectedTable(tables[0].name);
      setHasAutoSelected(true);
    }
  }, [tables, selectedTable, hasAutoSelected]);

  // Show connection error if any
  if (connectionError) {
    return (
      <Card className="w-full max-w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {connectionError}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Show error if tables failed to load
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
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-muted-foreground mb-4">{tablesError}</p>
            <Button onClick={async () => { 
              await fetchTables(); 
            }} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show no tables found message
  if (tables.length === 0 && !tablesLoading && connected) {
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
            <p className="text-muted-foreground mb-4">No tables found in your database</p>
            <Button onClick={async () => { 
              await fetchTables(); 
            }} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Tables
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show not connected message
  if (!connected) {
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
            <p className="text-muted-foreground">Database not connected</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Container 1: Table Controls Area */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Tables
              {tables.length > 0 && (
                <Badge variant="secondary">{tables.length} tables</Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {tablesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-3 text-muted-foreground" />
              <p className="text-muted-foreground">Loading tables...</p>
            </div>
          ) : tables.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <TableSelectorDropdown
                    selectedTable={selectedTable}
                    onTableChange={setSelectedTable}
                  />
                </div>
              </div>
              {selectedTable && (
                <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
                  <span>Viewing table: <strong>{selectedTable}</strong></span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No tables available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Container 2: Data Table */}
      {selectedTable && (
        <Card>
          <CardContent className="p-0">
            <SimpleDataTable 
              componentId={`table-${selectedTable}`}
              binding={{
                componentId: `table-${selectedTable}`,
                dataSourceId: "backend",
                tableName: selectedTable,
                refreshInterval: 30000,
                pagination: {
                  enabled: true,
                  pageSize: 25,
                  page: 1
                },
                sorting: {
                  enabled: true,
                  column: '',
                  direction: 'asc'
                },
                filtering: {
                  searchEnabled: true,
                  filters: {}
                },
                columnOverrides: {}
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};