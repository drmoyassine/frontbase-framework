import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, Search, RefreshCw } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useDashboardStore } from '@/stores/dashboard';

interface TableSelectorDropdownProps {
  selectedTable: string;
  onTableChange: (tableName: string) => void;
}

export const TableSelectorDropdown: React.FC<TableSelectorDropdownProps> = ({
  selectedTable,
  onTableChange
}) => {
  const { tables, tablesLoading, fetchTables } = useDataBindingStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTables = tables.filter(table =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTableData = tables.find(table => table.name === selectedTable);

  return (
    <div className="flex items-center gap-4 w-full">
      <div className="flex-1">
        <Select value={selectedTable} onValueChange={onTableChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedTable ? (
                <div className="flex items-center gap-2">
                  <Table className="h-4 w-4" />
                  <span>{selectedTable}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">Select a table</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-[400px]">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="max-h-[300px] overflow-auto">
              {filteredTables.length > 0 ? (
                filteredTables.map((table) => (
                  <SelectItem key={table.name} value={table.name}>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <Table className="h-4 w-4" />
                        <span>{table.name}</span>
                      </div>
                      <Badge variant="outline" className="text-xs ml-2">
                        Table
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground">
                  No tables found
                </div>
              )}
            </div>
          </SelectContent>
        </Select>
      </div>
      
      <Button
        onClick={async () => { 
          await fetchTables(); 
        }}
        variant="outline"
        size="sm"
        disabled={tablesLoading}
        className="flex-shrink-0"
      >
        <RefreshCw className={`h-4 w-4 ${tablesLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};