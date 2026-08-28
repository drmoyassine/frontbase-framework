import React from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import type { ColumnOverride } from '../types';
import { formatHeader } from '../utils/formatHeader';
import { cn } from '../lib/utils';

interface TableHeaderProps {
    columns: string[];
    columnOverrides?: Record<string, ColumnOverride>;
    sortingEnabled?: boolean;
    sortColumn?: string | null;
    sortDirection?: 'asc' | 'desc';
    onSort?: (column: string) => void;
    className?: string;
    headerCellWrapper?: (columnName: string, children: React.ReactNode) => React.ReactNode;
}

/**
 * Table header component with sortable columns
 */
export function TableHeader({
    columns,
    columnOverrides,
    sortingEnabled = false,
    sortColumn,
    sortDirection,
    onSort,
    className,
    headerCellWrapper
}: TableHeaderProps) {
    return (
        <thead className={cn('[&_tr]:border-b', className)}>
            <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                {columns.map((col) => {
                    const override = columnOverrides?.[col];
                    const isSorted = sortColumn === col;

                    const InnerContent = (
                        <div className="flex items-center space-x-1">
                            <span>{formatHeader(col, override)}</span>
                            {sortingEnabled && (
                                <button
                                    className="h-auto p-1 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSort?.(col);
                                    }}
                                >
                                    {isSorted && sortDirection === 'asc' && <ChevronUp className="h-3 w-3" />}
                                    {isSorted && sortDirection === 'desc' && <ChevronDown className="h-3 w-3" />}
                                    {!isSorted && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                                </button>
                            )}
                        </div>
                    );

                    return (
                        <th
                            key={col}
                            className="h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap group [&:has([role=checkbox])]:pr-0"
                        >
                            {headerCellWrapper ? headerCellWrapper(col, InnerContent) : InnerContent}
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
}
