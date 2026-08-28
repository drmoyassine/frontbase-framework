import React from 'react';
import { Plus, X, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ColumnInfo } from '@/hooks/data/useBindingColumns';
import { ColumnSelect } from './ColumnSelect';
import { STALE } from '@/lib/queryCache';
import { VariableInput } from '@/components/builder/VariableInput';
import { HiddenFilter, HiddenFilterOperator } from '@/hooks/data/useSimpleData';

const OPERATORS: { value: HiddenFilterOperator; label: string }[] = [
    { value: 'eq', label: 'Equals' },
    { value: 'neq', label: 'Not equals' },
    { value: 'gt', label: 'Greater than' },
    { value: 'gte', label: 'Greater or equal' },
    { value: 'lt', label: 'Less than' },
    { value: 'lte', label: 'Less or equal' },
    { value: 'contains', label: 'Contains' },
    { value: 'in', label: 'In list (comma separated)' },
    { value: 'is_null', label: 'Is empty' },
    { value: 'not_null', label: 'Is not empty' },
    { value: 'is_before', label: 'Is before (ISO date)' },
    { value: 'is_after', label: 'Is after (ISO date)' },
    { value: 'is_on_or_before', label: 'Is on or before (ISO date)' },
    { value: 'is_on_or_after', label: 'Is on or after (ISO date)' },
    { value: 'is_within_last_days', label: 'Is within last N days' },
    { value: 'is_today', label: 'Is today' },
];

interface HiddenFiltersEditorProps {
    tableName: string;
    dataSourceId: string;
    columns: ColumnInfo[];
    value: HiddenFilter[];
    onChange: (filters: HiddenFilter[]) => void;
}

export const HiddenFiltersEditor: React.FC<HiddenFiltersEditorProps> = ({
    tableName,
    dataSourceId,
    columns,
    value,
    onChange,
}) => {
    // Fetch datasources to check type
    const { data: datasources = [] } = useQuery<{ id: string; type: string }[]>({
        queryKey: ['datasources'],
        queryFn: async () => {
            const response = await fetch('/api/sync/datasources/');
            if (!response.ok) return [];
            return response.json();
        },
        staleTime: STALE.DEFAULT,
    });

    const isSupabase = datasources.find(ds => ds.id === dataSourceId)?.type === 'supabase';

    const addFilter = () => {
        onChange([
            ...(value || []),
            { id: crypto.randomUUID(), column: '', operator: 'eq', value: '' }
        ]);
    };

    const updateFilter = (index: number, updates: Partial<HiddenFilter>) => {
        const newFilters = [...(value || [])];
        newFilters[index] = { ...newFilters[index], ...updates };
        onChange(newFilters);
    };

    const removeFilter = (index: number) => {
        const newFilters = [...(value || [])];
        newFilters.splice(index, 1);
        onChange(newFilters);
    };

    return (
        <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
                <Label className="font-semibold block">Hidden Filters</Label>
                <Button variant="outline" size="sm" onClick={addFilter} className="h-7 text-xs">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
            </div>

            <p className="text-xs text-muted-foreground">
                Hidden filters apply by default to all data fetches for this component. They are not visible to the user.
            </p>

            {isSupabase && (
                <div className="flex items-start gap-2 p-2 bg-blue-50 text-blue-800 text-xs rounded-md border border-blue-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>
                        For direct Supabase connections, hidden filters provide scope but are not a security boundary. Use Row Level Security (RLS) to enforce data access rules.
                    </p>
                </div>
            )}

            {(value || []).length > 0 && (
                <div className="space-y-3 pt-2">
                    {(value || []).map((filter, idx) => (
                        <div key={filter.id} className="flex gap-2 items-start bg-muted/20 p-2 rounded-md border">
                            <div className="flex-1 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <ColumnSelect
                                        value={filter.column}
                                        columns={columns}
                                        placeholder="Select column"
                                        className="h-8 text-xs bg-background"
                                        onChange={(val) => updateFilter(idx, { column: val })}
                                    />
                                    <Select
                                        value={filter.operator}
                                        onValueChange={(val: HiddenFilterOperator) => updateFilter(idx, { operator: val })}
                                    >
                                        <SelectTrigger className="h-8 text-xs bg-background">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OPERATORS.map((op) => (
                                                <SelectItem key={op.value} value={op.value} className="text-xs">
                                                    {op.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {filter.operator !== 'is_null' && filter.operator !== 'not_null' && filter.operator !== 'is_today' && (
                                    filter.operator === 'is_within_last_days' ? (
                                        <Input
                                            type="number"
                                            value={filter.value || ''}
                                            onChange={(e) => updateFilter(idx, { value: e.target.value })}
                                            placeholder="Number of days (e.g. 7)"
                                            className="h-8 text-xs bg-background"
                                            min="1"
                                        />
                                    ) : (
                                        <VariableInput
                                            value={filter.value || ''}
                                            onChange={(val) => updateFilter(idx, { value: val })}
                                            syntaxContext="scalar"
                                            placeholder={filter.operator === 'in' ? "val1, val2 (or @ for variables)" : "Value (or @ for variables)"}
                                            className="h-8 text-xs bg-background"
                                            allowedGroups={['page', 'user', 'visitor', 'system', 'url', 'local', 'session', 'cookies']}
                                        />
                                    )
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                onClick={() => removeFilter(idx)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
