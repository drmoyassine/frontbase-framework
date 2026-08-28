/**
 * RecordViewer - Displays records one at a time with navigation
 * 
 * Shows a key-value view of data with record selector for arrays.
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RecordViewerProps {
    data: Record<string, unknown> | unknown[];
    title?: string;
    className?: string;
}

export function RecordViewer({ data, title, className }: RecordViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Handle different data structures
    const isArray = Array.isArray(data);
    const records = isArray ? data : [data];
    const totalRecords = records.length;
    const currentRecord = records[currentIndex] as Record<string, unknown>;

    // Navigation handlers
    const goToPrevious = () => setCurrentIndex((i) => Math.max(0, i - 1));
    const goToNext = () => setCurrentIndex((i) => Math.min(totalRecords - 1, i + 1));

    if (!currentRecord || typeof currentRecord !== 'object') {
        return (
            <div className={cn("text-xs text-muted-foreground", className)}>
                {JSON.stringify(data)}
            </div>
        );
    }

    const entries = Object.entries(currentRecord);

    return (
        <div className={cn("text-xs", className)}>
            {/* Header with count and navigation */}
            <div className="flex items-center justify-between mb-2">
                {title && (
                    <span className="text-muted-foreground font-medium">{title}</span>
                )}

                {isArray && totalRecords > 1 && (
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={goToPrevious}
                            disabled={currentIndex === 0}
                        >
                            <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-mono px-1">
                            {currentIndex + 1} / {totalRecords}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={goToNext}
                            disabled={currentIndex === totalRecords - 1}
                        >
                            <ChevronRight className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {isArray && totalRecords === 1 && (
                    <span className="text-muted-foreground text-xs">1 record</span>
                )}

                {!isArray && (
                    <span className="text-muted-foreground text-xs">Object</span>
                )}
            </div>

            {/* Key-Value Display */}
            <div className="bg-background border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                    <tbody>
                        {entries.map(([key, value], idx) => (
                            <tr key={key} className={cn(
                                "border-b last:border-b-0",
                                idx % 2 === 0 ? "bg-muted/30" : ""
                            )}>
                                <td className="py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap w-1/3 border-r">
                                    {key}
                                </td>
                                <td className="py-1.5 px-2 break-all">
                                    <ValueDisplay value={value} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Helper component to display values with appropriate formatting
function ValueDisplay({ value }: { value: unknown }) {
    if (value === null) {
        return <span className="text-muted-foreground italic">null</span>;
    }
    if (value === undefined) {
        return <span className="text-muted-foreground italic">undefined</span>;
    }
    if (typeof value === 'boolean') {
        return <span className={value ? "text-green-600" : "text-red-500"}>{String(value)}</span>;
    }
    if (typeof value === 'number') {
        return <span className="text-blue-600 font-mono">{value}</span>;
    }
    if (typeof value === 'string') {
        // Truncate long strings
        const display = value.length > 100 ? value.slice(0, 100) + '...' : value;
        return <span>{display}</span>;
    }
    if (Array.isArray(value)) {
        return <span className="text-purple-600 font-mono">[{value.length} items]</span>;
    }
    if (typeof value === 'object') {
        return <span className="text-orange-600 font-mono">{'{...}'}</span>;
    }
    return <span>{String(value)}</span>;
}
