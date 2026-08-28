import React from 'react';
import type { FilterConfig } from '../types';
import { SearchableSelect } from './SearchableSelect';
import { SearchableMultiSelect } from './SearchableMultiSelect';
import { cn } from '../lib/utils';

interface FilterBarProps {
    filters: FilterConfig[];
    filterValues: Record<string, any>;
    fetchedOptions: Record<string, { label: string; value: string }[]>;
    onFilterChange: (column: string, value: any) => void;
    onClearAll: () => void;
    className?: string;
}

/**
 * Filter bar component for DataTable
 * Renders filters based on their filterType configuration
 */
export function FilterBar({
    filters,
    filterValues,
    fetchedOptions,
    onFilterChange,
    onClearAll,
    className,
}: FilterBarProps) {
    if (!filters || filters.length === 0) return null;

    const hasActiveFilters = Object.keys(filterValues).length > 0;

    return (
        <div className={cn('flex flex-wrap gap-3 p-3 rounded-md border bg-muted/30', className)}>
            {filters.map((filter) => {
                const label =
                    filter.label ||
                    filter.column.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const value = filterValues[filter.column];
                const rawOptions = fetchedOptions[filter.column] || filter.options || [];
                // Normalize to { label, value }[] — filter.options may be a plain string[].
                const options: { label: string; value: string }[] = rawOptions.map((opt) =>
                    typeof opt === 'string' ? { label: opt, value: opt } : opt
                );

                return (
                    <div key={filter.id} className="flex flex-col gap-1 min-w-[150px]">
                        <label className="text-xs font-medium text-muted-foreground">
                            {label}
                        </label>

                        {filter.filterType === 'text' && (
                            <input
                                type="text"
                                value={value || ''}
                                onChange={(e) => onFilterChange(filter.column, e.target.value)}
                                placeholder={`Filter ${label}...`}
                                className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        )}

                        {filter.filterType === 'dropdown' && (
                            <SearchableSelect
                                value={value || ''}
                                onChange={(v) => onFilterChange(filter.column, v)}
                                options={options}
                                placeholder="All"
                            />
                        )}

                        {filter.filterType === 'multiselect' && (
                            <SearchableMultiSelect
                                value={Array.isArray(value) ? value : []}
                                onChange={(v) => onFilterChange(filter.column, v)}
                                options={options}
                                placeholder="Select..."
                            />
                        )}

                        {filter.filterType === 'boolean' && (
                            <select
                                value={value === undefined ? '' : String(value)}
                                onChange={(e) =>
                                    onFilterChange(
                                        filter.column,
                                        e.target.value === '' ? undefined : e.target.value === 'true'
                                    )
                                }
                                className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                                <option value="">All</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                        )}

                        {filter.filterType === 'number' && (
                            <input
                                type="number"
                                value={value || ''}
                                onChange={(e) =>
                                    onFilterChange(
                                        filter.column,
                                        e.target.value ? Number(e.target.value) : ''
                                    )
                                }
                                placeholder={`Filter ${label}...`}
                                className="px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                        )}
                    </div>
                );
            })}

            {hasActiveFilters && (
                <button
                    onClick={onClearAll}
                    className="self-end px-3 py-1.5 text-xs rounded border border-input hover:bg-muted"
                >
                    Clear Filters
                </button>
            )}
        </div>
    );
}
