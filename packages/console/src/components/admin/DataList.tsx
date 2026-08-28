import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Search, Database, ChevronLeft, ChevronRight, Filter, SortAsc, SortDesc, Plus, Edit, Eye, Trash } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from './DataTable';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';

interface DataListProps {
  resource: string;
  title?: string;
  actions?: {
    create?: boolean;
    edit?: boolean;
    show?: boolean;
    delete?: boolean;
  };
  filters?: Record<string, any>;
  sort?: { field: string; order: 'ASC' | 'DESC' };
  perPage?: number;
  className?: string;
}

export const DataList: React.FC<DataListProps> = ({
  resource,
  title,
  actions = { create: true, edit: true, show: true, delete: true },
  filters = {},
  sort = { field: 'id', order: 'ASC' },
  perPage = 25,
  className
}) => {
  console.log(`[DataList] Initializing for resource: ${resource}`);
  
  const { connected, tables, tablesLoading, fetchTables } = useDataBindingStore();
  const [loading, setLoading] = useState(true);

  console.log(`[DataList] State:`, { 
    connected, 
    tablesCount: tables.length, 
    resource,
    tableExists: tables.some(t => t.name === resource)
  });

  useEffect(() => {
    console.log(`[DataList] Effect - connected: ${connected}, tablesLength: ${tables.length}`);
    if (connected && tables.length === 0 && !tablesLoading) {
      console.log('[DataList] Fetching tables');
      fetchTables().catch(error => {
        console.error('[DataList] Fetch failed:', error);
      });
    }
    setLoading(false);
  }, [connected, tables, tablesLoading, fetchTables]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title || `${resource} List`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
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
            {title || `${resource} List`}
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

  // Check if resource exists in tables
  const tableExists = tables.some(table => table.name === resource);
  
  if (!tableExists) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title || `${resource} List`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Table "{resource}" not found</p>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Available tables:</p>
              <div className="flex flex-wrap gap-2">
                {tables.map(table => (
                  <Badge key={table.name} variant="outline">
                    {table.name}
                  </Badge>
                ))}
              </div>
            </div>
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
              <Database className="h-5 w-5" />
              {title || `${resource} List`}
            </CardTitle>
            {actions.create && (
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable 
            tableName={resource}
            pageSize={perPage}
            searchable={true}
            sortable={true}
            filterable={true}
            className="border-0 shadow-none"
          />
        </CardContent>
      </Card>
    </div>
  );
};