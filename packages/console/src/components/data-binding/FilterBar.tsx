import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Filter } from 'lucide-react';
import { FilterConfig } from '@/hooks/data/useSimpleData';
import { TextFilterInput } from './filters/TextFilterInput';
import { DropdownFilterInput } from './filters/DropdownFilterInput';
import { MultiselectFilterInput } from './filters/MultiselectFilterInput';
import { NumberFilterInput } from './filters/NumberFilterInput';
import { DateRangeFilterInput } from './filters/DateRangeFilterInput';
import { BooleanFilterInput } from './filters/BooleanFilterInput';
import { FilterInputProps } from './filters/types';

interface FilterBarProps {
    filters: FilterConfig[];
    tableName: string;
    dataSourceId?: string;  // For external datasources
    onFilterValuesChange: (updatedFilters: FilterConfig[]) => void;
}

// Main FilterBar component
export const FilterBar: React.FC<FilterBarProps> = ({
    filters,
    tableName,
    dataSourceId,
    onFilterValuesChange
}) => {
    // Only show filters that have a column configured
    const activeFilters = filters.filter(f => f.column);

    if (activeFilters.length === 0) {
        return null;
    }

    const handleValueChange = (filterId: string, value: any) => {
        const updatedFilters = filters.map(f =>
            f.id === filterId ? { ...f, value } : f
        );
        onFilterValuesChange(updatedFilters);
    };

    const clearAllFilters = () => {
        const clearedFilters = filters.map(f => ({ ...f, value: undefined }));
        onFilterValuesChange(clearedFilters);
    };

    const hasActiveValues = filters.some(f => f.value !== undefined && f.value !== null && f.value !== '');

    const renderFilterInput = (filter: FilterConfig) => {
        const props: FilterInputProps = {
            filter,
            tableName,
            dataSourceId,
            onValueChange: (value) => handleValueChange(filter.id, value)
        };

        switch (filter.filterType) {
            case 'text':
                return <TextFilterInput {...props} />;
            case 'dropdown':
                return <DropdownFilterInput {...props} />;
            case 'multiselect':
                return <MultiselectFilterInput {...props} />;
            case 'number':
                return <NumberFilterInput {...props} />;
            case 'dateRange':
                return <DateRangeFilterInput {...props} />;
            case 'boolean':
                return <BooleanFilterInput {...props} />;
            default:
                return <TextFilterInput {...props} />;
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-1.5 text-muted-foreground">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Filters:</span>
            </div>

            {activeFilters.map((filter) => (
                <div key={filter.id} className="flex items-center gap-1">
                    {renderFilterInput(filter)}
                </div>
            ))}

            {hasActiveValues && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    onClick={clearAllFilters}
                >
                    <X className="h-3 w-3 mr-1" />
                    Clear all
                </Button>
            )}
        </div>
    );
};
