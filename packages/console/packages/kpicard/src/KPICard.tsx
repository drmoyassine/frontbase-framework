import type { CSSProperties } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { KPICardProps } from './types';
import { useKPICardQuery } from './hooks/useKPICardQuery';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function KPICard({
    mode = 'builder',
    componentId,
    binding,
    className = '',
    style,
    initialData,
    onConfigureBinding,
    configureOverlay,
}: KPICardProps) {
    // Cast to break cross-package csstype version incompatibility (see InfoList).
    const safeStyle = style as CSSProperties | undefined;
    const {
        data,
        isLoading: loading,
        error
    } = useKPICardQuery({
        mode,
        binding: binding || {
            componentId,
            dataSourceId: '',
            tableName: '',
            pagination: { enabled: false, pageSize: 1, page: 0 },
            sorting: { enabled: false },
            filtering: { searchEnabled: false, filters: {} },
            columnOverrides: {},
        },
        initialData,
        enabled: !!binding?.tableName,
    });

    const cardClass = "rounded-lg border bg-card text-card-foreground shadow-sm";
    const headerClass = "flex flex-row items-center justify-between space-y-0 pb-2 p-6";
    const titleClass = "text-sm font-medium capitalize";
    const contentClass = "p-6 pt-0";

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

    // 2. Loading State (Matches SSR renderKPICard exactly)
    if (loading && !data) {
        return (
            <div className={cn(cardClass, className)} style={safeStyle}>
                <div className={headerClass}>
                    <div className="h-4 bg-muted rounded w-1/3 animate-pulse"></div>
                </div>
                <div className={contentClass}>
                    <div className="text-2xl font-bold fb-skeleton" style={{ height: '2rem', width: '80px', borderRadius: '0.25rem' }}>&nbsp;</div>
                </div>
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

    // Calculate KPI value from data
    const kpiValue = data && data.length > 0 ? data[0] : {};
    const valueField = Object.keys(kpiValue)[0] || 'count';
    const value = kpiValue[valueField] !== undefined ? kpiValue[valueField] : 0;

    // Format value based on type
    const formatValue = (val: any) => {
        if (typeof val === 'number') {
            return val.toLocaleString();
        }
        return val?.toString() || '0';
    };

    // NOTE: Trend/period comparison is intentionally omitted. It requires a
    // second time-windowed query that we don't yet issue; rendering a hardcoded
    // percentage would present fabricated analytics as real data.

    return (
        <div className={cn(cardClass, className)} style={safeStyle}>
            <div className={headerClass}>
                <h4 className={titleClass}>
                    {valueField.replace(/_/g, ' ')}
                </h4>
            </div>
            <div className={contentClass}>
                <div className="text-2xl font-bold">{formatValue(value)}</div>
            </div>
        </div>
    );
}

export default KPICard;
