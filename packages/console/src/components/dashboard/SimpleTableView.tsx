import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, Database, Eye, FileText, ExternalLink } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';
import { TableSchemaModal } from './TableSchemaModal';
import { TableDataModal } from './TableDataModal';

export const SimpleTableView: React.FC = () => {
  const {
    tables,
    tablesLoading,
    tablesError,
    fetchTables,
    connected
  } = useDataBindingStore();

  const {
    tableSchemaModalOpen,
    tableDataModalOpen,
    setTableSchemaModalOpen,
    setTableDataModalOpen,
    connections
  } = useDashboardStore();

  const [selectedTable, setSelectedTable] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (connected) {
      fetchTables();
    }
  }, [connected, fetchTables]);

  const filteredTables = tables.filter(table =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewSchema = (tableName: string) => {
    setSelectedTable(tableName);
    setTableSchemaModalOpen(true);
  };

  const handleViewData = (tableName: string) => {
    setSelectedTable(tableName);
    setTableDataModalOpen(true);
  };

  const handleOpenInSupabase = (tableName: string) => {
    if (connections.supabase.url) {
      const baseUrl = connections.supabase.url.replace('/rest/v1', '');
      const projectRef = baseUrl.split('//')[1]?.split('.')[0];
      if (projectRef) {
        window.open(`https://supabase.com/dashboard/project/${projectRef}/editor/${tableName}`, '_blank');
      }
    }
  };

  if (tablesError) {
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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Tables
              {tables.length > 0 && (
                <Badge variant="secondary">{tables.length}</Badge>
              )}
            </CardTitle>
            <Button
              onClick={fetchTables}
              variant="outline"
              size="sm"
              disabled={tablesLoading}
            >
              <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          {tables.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </CardHeader>

        <CardContent>
          {tablesLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading tables...</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTables.map((table) => (
                <Card key={table.name} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-medium text-sm">{table.name}</h3>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {table.schema}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewSchema(table.name)}
                        className="flex-1"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        Schema
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewData(table.name)}
                        className="flex-1"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Data
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenInSupabase(table.name)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TableSchemaModal
        open={tableSchemaModalOpen}
        onOpenChange={setTableSchemaModalOpen}
        tableName={selectedTable}
      />

      <TableDataModal
        open={tableDataModalOpen}
        onOpenChange={setTableDataModalOpen}
        tableName={selectedTable}
      />
    </>
  );
};