import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database, Table, BarChart3 } from 'lucide-react';
import { DataList } from './DataList';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';

interface AdminAppProps {
  className?: string;
}

export const AdminApp: React.FC<AdminAppProps> = ({ className }) => {
  console.log('[AdminApp] Component initialized');
  
  const { connected, tables, tablesError, tablesLoading, initialize, syncConnectionStatus, fetchTables } = useDataBindingStore();
  const [selectedTable, setSelectedTable] = useState<string>('');

  console.log('[AdminApp] State:', { 
    connected, 
    tablesCount: tables.length, 
    tablesLoading, 
    tablesError,
    selectedTable
  });

  useEffect(() => {
    console.log('[AdminApp] Initializing data binding store');
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (tables.length > 0 && !selectedTable) {
      console.log(`[AdminApp] Auto-selecting first table: ${tables[0].name}`);
      setSelectedTable(tables[0].name);
    }
  }, [tables, selectedTable]);

  if (tablesLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Loading Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading database tables...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (tablesError) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Admin Dashboard Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-destructive mb-4">{tablesError}</p>
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

  if (!connected) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Database not connected</p>
            <Button onClick={initialize} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Connect
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (tables.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No tables found in your database</p>
            <Button onClick={async () => { 
              await fetchTables(); 
            }} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Database Admin Dashboard
              <Badge variant="secondary">{tables.length} tables</Badge>
            </CardTitle>
            <Button onClick={async () => { 
              await fetchTables(); 
            }} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTable} onValueChange={setSelectedTable}>
            <TabsList className="grid w-full grid-cols-auto">
              {tables.slice(0, 8).map((table) => (
                <TabsTrigger key={table.name} value={table.name} className="flex items-center gap-2">
                  <Table className="h-3 w-3" />
                  {table.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {tables.map((table) => (
              <TabsContent key={table.name} value={table.name} className="mt-6">
                <DataList 
                  resource={table.name}
                  title={`${table.name} Data`}
                  perPage={25}
                  actions={{
                    create: false,
                    edit: false,
                    show: true,
                    delete: false
                  }}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};