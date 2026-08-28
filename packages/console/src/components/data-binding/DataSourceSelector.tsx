import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { STALE } from '@/lib/queryCache';

interface Datasource {
  id: string;
  name: string;
  type: string;
  last_test_success?: boolean | null;
}

interface DataSourceSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function DataSourceSelector({
  value,
  onValueChange,
  label = "Data Source",
  placeholder = "Select a data source",
  disabled = false
}: DataSourceSelectorProps) {
  // Fetch datasources from API
  const { data: datasources = [], isLoading, error } = useQuery<Datasource[]>({
    queryKey: ['datasources'],
    queryFn: async () => {
      const response = await fetch('/api/sync/datasources/');
      if (!response.ok) throw new Error('Failed to fetch datasources');
      return response.json();
    },
    staleTime: STALE.DEFAULT, // Cache for 30 seconds
  });

  // Auto-select first datasource if none selected
  React.useEffect(() => {
    if (!value && datasources.length > 0 && !isLoading) {
      onValueChange(datasources[0].id);
    }
  }, [datasources, value, isLoading, onValueChange]);

  const selectedDatasource = datasources.find(ds => ds.id === value);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || ''}
        onValueChange={onValueChange}
        disabled={disabled || isLoading || datasources.length === 0}
      >
        <SelectTrigger>
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent>
          {datasources.map((ds) => (
            <SelectItem key={ds.id} value={ds.id}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${ds.last_test_success === true ? 'bg-green-500' :
                    ds.last_test_success === false ? 'bg-red-500' :
                      'bg-yellow-500'
                  }`} />
                <span>{ds.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({ds.type})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-sm text-destructive">
          Failed to load datasources. Please check your connection.
        </p>
      )}
      {!isLoading && datasources.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          No datasources configured. Add one in Data Studio.
        </p>
      )}
    </div>
  );
}