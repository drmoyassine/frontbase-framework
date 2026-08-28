import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ChevronDown } from 'lucide-react';
import { databaseApi } from '@/services/database-api';
import { FilterInputProps } from './types';

export const MultiselectFilterInput: React.FC<FilterInputProps> = ({ filter, tableName, dataSourceId, onValueChange }) => {
    const [fetchedOptions, setFetchedOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const selectedValues = (filter.value as string[]) || [];

    // Use provided options if available, otherwise use fetched options
    const options = filter.options || fetchedOptions;

    useEffect(() => {
        // Skip fetch if options are already provided
        if (filter.options) return;

        if (filter.column) {
            setLoading(true);
            let queryTable = tableName;
            let queryColumn = filter.column;

            if (filter.column.includes('.')) {
                const [relTable, relCol] = filter.column.split('.');
                queryTable = relTable;
                queryColumn = relCol;
            }

            // Use external datasource API if dataSourceId is provided and valid
            if (dataSourceId && dataSourceId !== 'backend') {
                fetch(`/api/sync/datasources/${dataSourceId}/tables/${queryTable}/distinct/${queryColumn}`)
                    .then(res => res.json())
                    .then(result => {
                        if (result.success) {
                            setFetchedOptions(result.data || []);
                        }
                        setLoading(false);
                    })
                    .catch(() => setLoading(false));
            } else {
                // Use internal database API
                databaseApi.fetchDistinctValues(queryTable, queryColumn)
                    .then((result) => {
                        if (result.success) {
                            setFetchedOptions(result.data || []);
                        }
                        setLoading(false);
                    })
                    .catch(() => setLoading(false));
            }
        }
    }, [filter.column, tableName, filter.options, dataSourceId]);

    const toggleValue = (val: string) => {
        if (selectedValues.includes(val)) {
            const newVals = selectedValues.filter(v => v !== val);
            onValueChange(newVals.length > 0 ? newVals : undefined);
        } else {
            onValueChange([...selectedValues, val]);
        }
    };

    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayLabel = filter.label || filter.column;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 w-40 justify-between px-2">
                    <div className="flex items-center gap-1 truncate">
                        {selectedValues.length === 0 ? (
                            <span className="text-muted-foreground">{displayLabel}</span>
                        ) : (
                            <span className="text-xs">{selectedValues.length} selected</span>
                        )}
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-0" align="start">
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8"
                        />
                    </div>
                </div>
                <ScrollArea className="h-[180px]">
                    <div className="p-2 space-y-1">
                        {loading && !filter.options ? (
                            <div className="text-sm text-muted-foreground p-2">Loading...</div>
                        ) : (
                            filteredOptions.map((opt) => (
                                <label
                                    key={opt}
                                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-muted rounded cursor-pointer"
                                >
                                    <Checkbox
                                        checked={selectedValues.includes(opt)}
                                        onCheckedChange={() => toggleValue(opt)}
                                    />
                                    <span className="text-sm truncate">{opt}</span>
                                </label>
                            ))
                        )}
                        {!loading && filteredOptions.length === 0 && (
                            <div className="text-sm text-muted-foreground p-2 text-center">No results</div>
                        )}
                    </div>
                </ScrollArea>
                {selectedValues.length > 0 && (
                    <div className="p-2 border-t">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => onValueChange(undefined)}
                        >
                            Clear all
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
};
