import React, { useMemo } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { GridProps } from './types';
import { useGridQuery } from './hooks/useGridQuery';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function Grid({
    mode = 'builder',
    componentId,
    binding,
    className = '',
    style,
    columns = 3,
    initialData,
    onConfigureBinding,
    configureOverlay,
    cardWrapper,
}: GridProps) {
    // Cast to break cross-package csstype version incompatibility (see InfoList).
    const safeStyle = style as React.CSSProperties | undefined;
    const {
        data,
        isLoading: loading,
        error
    } = useGridQuery({
        mode,
        binding: binding || {
            componentId,
            dataSourceId: '',
            tableName: '',
            pagination: { enabled: false, pageSize: 6, page: 0 },
            sorting: { enabled: false },
            filtering: { searchEnabled: false, filters: {} },
            columnOverrides: {},
        },
        initialData,
        enabled: !!binding?.tableName,
    });

    const cardClass = "rounded-lg border bg-card text-card-foreground shadow-sm";
    const headerClass = "pb-3 p-6";
    const titleClass = "text-base font-semibold leading-none tracking-tight";
    const contentClass = "p-6 pt-0";

    // Build grid layout columns class safely
    const gridLayoutClass = useMemo(() => {
        const cols = Math.min(columns || 3, 4);
        if (cols === 1) return 'grid grid-cols-1 gap-4';
        if (cols === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4';
        if (cols === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';
        return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
    }, [columns]);

    // 1. Unconfigured State
    if (!binding?.tableName) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-muted-foreground text-sm">No data binding configured</p>
                    {configureOverlay as any}
                    {!configureOverlay && onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Configure Data
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // 2. Loading State (Matches SSR renderDataGrid exactly)
    if (loading && !data) {
        return (
            <div className={cn(gridLayoutClass, className)} style={safeStyle}>
                {Array.from({ length: columns || 3 }).map((_, index) => (
                    <div key={index} className={cn(cardClass)}>
                        <div className={headerClass}>
                            <div className="h-4 bg-muted rounded w-3/4 animate-pulse"></div>
                        </div>
                        <div className={contentClass}>
                            <div className="space-y-2">
                                <div className="h-3 bg-muted rounded w-1/2 animate-pulse"></div>
                                <div className="h-3 bg-muted rounded w-1/3 animate-pulse"></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // 3. Error State
    if (error) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center space-y-4">
                    <p className="text-destructive text-sm font-medium">Error loading data: {error instanceof Error ? error.message : String(error)}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-destructive text-destructive-foreground text-sm font-medium rounded-md hover:bg-destructive/90 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className="p-6 text-center text-muted-foreground text-sm">
                    No data available
                </div>
            </div>
        );
    }

    // Helper functions for formatting and schema columns
    const formatValue = (value: any, columnName: string) => {
        if (value === null || value === undefined) return '';
        const columnConfig = binding?.columnOverrides?.[columnName];
        
        switch (columnConfig?.displayType) {
            case 'badge':
                return (
                    <div className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        value === 'active' || value === true || String(value).toLowerCase() === 'true'
                            ? "bg-blue-100 text-blue-800 border-blue-200" 
                            : "bg-gray-100 text-gray-800 border-gray-200"
                    )}>
                        {value.toString()}
                    </div>
                );
            case 'date':
                try {
                    return new Date(value).toLocaleDateString();
                } catch {
                    return String(value);
                }
            case 'currency':
                try {
                    return new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: 'USD' 
                    }).format(Number(value));
                } catch {
                    return String(value);
                }
            case 'percentage':
                try {
                    return `${(Number(value) * 100).toFixed(1)}%`;
                } catch {
                    return String(value);
                }
            case 'image':
                return (
                    <img
                        src={String(value)}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border"
                    />
                );
            case 'cover':
                // Full-bleed card banner — rendered above the header, not in the
                // label/value list (excluded from secondary columns below).
                return (
                    <img
                        src={String(value)}
                        alt=""
                        className="w-full h-32 object-cover rounded-t-lg"
                    />
                );
            default:
                return value.toString();
        }
    };

    const getVisibleColumns = () => {
        if (!data[0]) return [];
        // Honor the panel column order; fall back to the row's key order.
        const allKeys = binding?.columnOrder?.length
            ? binding.columnOrder
            : Object.keys(data[0]);
        return allKeys.filter(col =>
            binding?.columnOverrides?.[col]?.visible !== false &&
            Object.prototype.hasOwnProperty.call(data[0], col)
        );
    };

    const getColumnDisplayName = (columnName: string) => {
        return binding?.columnOverrides?.[columnName]?.displayName ||
               columnName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const visibleColumns = getVisibleColumns();
    // A cover column renders as a full-bleed banner above the header and is
    // excluded from the primary/secondary label-value list.
    const coverColumn = visibleColumns.find(
        col => binding?.columnOverrides?.[col]?.displayType === 'cover'
    );
    const contentColumns = visibleColumns.filter(col => col !== coverColumn);
    const primaryColumn = contentColumns[0];
    const secondaryColumns = contentColumns.slice(1);

    return (
        <div className={cn(gridLayoutClass, className)} style={safeStyle}>
            {data.map((item: any, index: number) => {
                const cardContent = (
                    <div className={cn(cardClass, "hover:shadow-md transition-shadow h-full flex flex-col")}>
                        {coverColumn && item[coverColumn] != null && (
                            formatValue(item[coverColumn], coverColumn)
                        )}
                        <div className={headerClass}>
                            <h3 className={titleClass}>
                                {formatValue(item[primaryColumn], primaryColumn)}
                            </h3>
                        </div>
                        <div className={cn(contentClass, "flex-1")}>
                            <div className="space-y-2">
                                {secondaryColumns.map((column) => {
                                    const hideLabel = binding?.columnOverrides?.[column]?.showLabel === false;
                                    if (hideLabel) {
                                        return (
                                            <div key={column} className="text-sm">
                                                <span className="font-medium">
                                                    {formatValue(item[column], column)}
                                                </span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={column} className="flex justify-between items-center text-sm">
                                            <span className="text-muted-foreground">
                                                {getColumnDisplayName(column)}:
                                            </span>
                                            <span className="font-medium">
                                                {formatValue(item[column], column)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );

                // IoC: Let builder wrap individual cards if provided
                if (cardWrapper) {
                    return React.cloneElement(
                        cardWrapper(item, cardContent) as React.ReactElement,
                        { key: index }
                    );
                }

                return React.cloneElement(cardContent, { key: index });
            })}
        </div>
    );
}

export default Grid;
