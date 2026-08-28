import React from 'react';
import type { ColumnOverride } from '../types';
import { getCellValue } from '../utils/getCellValue';
import { renderCell } from '../utils/renderCell';
import { cn } from '../lib/utils';

interface TableBodyProps {
    data: any[];
    columns: string[];
    columnOverrides?: Record<string, ColumnOverride>;
    className?: string;
}

/**
 * Table body component with cell rendering
 */
export function TableBody({
    data,
    columns,
    columnOverrides,
    className,
}: TableBodyProps) {
    if (data.length === 0) {
        return (
            <tbody className={className}>
                <tr>
                    <td
                        colSpan={columns.length}
                        className="px-4 py-8 text-center text-muted-foreground"
                    >
                        No data available
                    </td>
                </tr>
            </tbody>
        );
    }

    return (
        <tbody className={cn("[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/50", className)}>
            {data.map((row, index) => (
                <tr
                    key={row.id || index}
                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted h-12"
                >
                    {columns.map((col) => {
                        const override = columnOverrides?.[col];
                        const value = getCellValue(row, col);

                        return (
                            <td key={col} className="p-4 align-middle [&:has([role=checkbox])]:pr-0 max-w-[200px] truncate whitespace-nowrap py-2">
                                {renderCell(value, override?.displayType, col)}
                            </td>
                        );
                    })}
                </tr>
            ))}
        </tbody>
    );
}
