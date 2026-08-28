import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCw, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STALE } from '@/lib/queryCache';

interface TableSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  /** Sync datasource ID — uses /api/sync/datasources/{id}/tables */
  dataSourceId?: string;
  /** Provider account ID — uses /api/edge-providers/accounts/{id}/tables */
  providerAccountId?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showRefresh?: boolean;
  variant?: 'default' | 'compact';
}

export function TableSelector({
  value,
  onValueChange,
  dataSourceId,
  providerAccountId,
  label = "Table",
  placeholder = "Select a table",
  disabled = false,
  showRefresh = true,
  variant = 'default'
}: TableSelectorProps) {
  const [open, setOpen] = useState(false);

  // Determine which ID and URL to use
  const activeId = providerAccountId || dataSourceId;
  const apiUrl = providerAccountId
    ? `/api/edge-providers/accounts/${providerAccountId}/tables`
    : dataSourceId
      ? `/api/sync/datasources/${dataSourceId}/tables`
      : null;

  // Fetch tables from the appropriate endpoint
  const { data: tables = [], isLoading, error, refetch } = useQuery<string[]>({
    queryKey: ['datasource-tables', activeId, providerAccountId ? 'provider' : 'sync'],
    queryFn: async () => {
      if (!apiUrl) return [];
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch tables');
      return response.json();
    },
    enabled: !!activeId,
    staleTime: STALE.DEFAULT, // Cache for 30 seconds
  });

  const hasSource = !!activeId;

  // Reset table selection when datasource changes
  React.useEffect(() => {
    if (value && tables.length > 0 && !tables.includes(value)) {
      onValueChange('');
    }
  }, [activeId, tables, value, onValueChange]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refetch();
  };

  const errorMessage = error instanceof Error ? error.message : 'Failed to load tables';

  // Common trigger button content
  const triggerContent = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn(
        "justify-between font-normal",
        variant === 'compact' ? "flex-1 h-9" : "w-full",
        !value && "text-muted-foreground"
      )}
      disabled={disabled || isLoading || !hasSource}
    >
      <span className="truncate">
        {!hasSource
          ? "Not connected to database"
          : isLoading
            ? "Loading tables..."
            : value || placeholder}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const selector = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search tables..." />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Loading...' : 'No tables found.'}
            </CommandEmpty>
            <CommandGroup>
              {tables.map((table) => (
                <CommandItem
                  key={table}
                  value={table}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === table ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {table}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 w-full">
        {selector}
        {showRefresh && activeId && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh tables"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {showRefresh && activeId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-6 w-6 p-0 hover:bg-transparent"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            <span className="sr-only">Refresh</span>
          </Button>
        )}
      </div>
      {selector}
      {!isLoading && !hasSource && (
        <p className="text-sm text-muted-foreground">
          Please connect to a database to view available tables.
        </p>
      )}
      {!isLoading && hasSource && tables.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          No tables found.
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}
