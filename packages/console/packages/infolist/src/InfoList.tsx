import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { InfoListProps, ColumnSchema, InfoListFieldOverride } from './types';
import { useInfoListQuery } from './hooks/useInfoListQuery';

// Local cn utility to avoid bringing in the whole lib
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Format column name to human-readable label */
function columnToLabel(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Get nested value from record supporting dotted paths */
function getNestedValue(rec: Record<string, any>, columnName: string): any {
    if (!columnName.includes('.')) {
        return rec[columnName];
    }
    // Flattened key format (e.g. "providers.name")
    if (rec[columnName] !== undefined) {
        return rec[columnName];
    }
    // Nested object format
    const parts = columnName.split('.');
    let value: any = rec;
    for (const part of parts) {
        if (value == null) return undefined;
        if (Array.isArray(value)) value = value[0];
        value = value[part];
        // Case-insensitive fallback
        if (value === undefined && typeof value === 'object') {
            const key = Object.keys(value).find(k => k.toLowerCase() === part.toLowerCase());
            if (key) value = value[key];
        }
    }
    return value;
}

/** Format a value for display based on column type */
function formatValue(column: ColumnSchema, value: any, override: InfoListFieldOverride = {}): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground italic">—</span>;
    }

    const type = (override.type || (typeof column.type === 'string' ? column.type : (column.type?.[0] || ''))).toLowerCase();

    // Image
    if (type === 'image') {
        return (
            <img
                src={String(value)}
                alt={column.name}
                className="object-cover rounded-md border"
                style={{
                    width: override.width || '100px',
                    height: override.height || 'auto'
                }}
            />
        );
    }

    // Badge(s)
    if (type === 'badge') {
        const badgeColors = [
            'bg-blue-100 text-blue-800 border-blue-200',
            'bg-green-100 text-green-800 border-green-200',
            'bg-purple-100 text-purple-800 border-purple-200',
            'bg-orange-100 text-orange-800 border-orange-200',
            'bg-pink-100 text-pink-800 border-pink-200',
            'bg-cyan-100 text-cyan-800 border-cyan-200',
            'bg-yellow-100 text-yellow-800 border-yellow-200',
            'bg-red-100 text-red-800 border-red-200',
        ];

        const getColorIndex = (str: string) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            return Math.abs(hash) % badgeColors.length;
        };

        const items = Array.isArray(value) ? value : (typeof value === 'string' && value.includes(',') ? value.split(',').map(s => s.trim()) : [value]);
        
        return (
            <div className="flex flex-wrap gap-1">
                {items.filter(Boolean).map((item, i) => {
                    const strItem = String(item);
                    return (
                        <div
                            key={i}
                            className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", badgeColors[getColorIndex(strItem)])}
                        >
                            {strItem}
                        </div>
                    );
                })}
            </div>
        );
    }

    // Link
    if (type === 'link') {
        return (
            <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {String(value)}
            </a>
        );
    }

    // Boolean display
    if (type.includes('bool') || type === 'tinyint(1)') {
        return (
            <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                value ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
            )}>
                {value ? 'Yes' : 'No'}
            </span>
        );
    }

    // Date/datetime formatting
    if (type.includes('date') || type.includes('timestamp')) {
        try {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                return type === 'date'
                    ? d.toLocaleDateString()
                    : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        } catch { /* fall through */ }
    }

    // JSON formatting
    if (Array.isArray(value) || typeof value === 'object') {
        return <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
    }

    // Long text truncation for basic text
    const str = String(value);
    const name = column.name.toLowerCase();
    
    // Auto-detect common link types if type not explicitly set
    if (!override.type) {
        if (name.includes('email')) {
            return <a href={`mailto:${str}`} className="text-primary underline">{str}</a>;
        }
        if (name.includes('phone') || name.includes('mobile')) {
            return <a href={`tel:${str}`} className="text-primary underline">{str}</a>;
        }
        if (name.includes('url') || name.includes('website') || name.includes('link')) {
            return <a href={str} target="_blank" rel="noopener noreferrer" className="text-primary underline">{str}</a>;
        }
    }

    if (str.length > 200) {
        return <span title={str}>{str.slice(0, 200)}…</span>;
    }

    return str;
}


export function InfoList({
    mode = 'builder',
    binding,
    tableName: propTableName,
    recordId: propRecordId,
    title,
    showCard = true,
    className,
    style,
    layout = '2',
    fieldSpacing = 'normal',
    fieldOverrides: propOverrides,
    columns: propColumns,
    initialData,
    fieldWrapper,
    onConfigureBinding,
}: InfoListProps) {
    const tableName = binding.tableName || propTableName || '';
    const recordId = binding.recordId || propRecordId || '';
    const fieldOverrides = propOverrides || binding.fieldOverrides || {};
    // Cast style to break cross-package csstype version incompatibility
    const safeStyle = style as React.CSSProperties | undefined;
    // Data fetching via TanStack query
    const {
        data: queryResult,
        isLoading: loading,
        error
    } = useInfoListQuery({
        mode,
        binding,
        recordId,
        initialData,
        enabled: !!tableName && !!recordId
    });

    const record = queryResult?.record;
    // In Builder mode, the hook fetches the schema dynamically. In Edge mode, it falls back to binding.
    const rawColumns = queryResult?.columns?.length ? queryResult.columns : (binding.columns || []);

    // Grid columns from layout or explicit prop
    const gridColumns = propColumns || (layout === 'list' || layout === '1' ? 1 : layout === '3' ? 3 : 2);

    // Spacing classes
    const spacingClass = fieldSpacing === 'compact' ? 'py-1.5' : fieldSpacing === 'relaxed' ? 'py-3' : 'py-2';

    // Derive visible columns (skip PKs and hidden fields, respect order)
    const visibleColumns = useMemo(() => {
        let cols = [...rawColumns];

        // Sort by fieldOrder if configured
        const fieldOrder = binding.fieldOrder || [];
        if (fieldOrder.length > 0) {
            const colMap = new Map(cols.map(c => [c.name, c]));
            const sorted: ColumnSchema[] = [];
            const seen = new Set<string>();
            for (const name of fieldOrder) {
                if (colMap.has(name)) { sorted.push(colMap.get(name)!); seen.add(name); }
            }
            for (const c of cols) { if (!seen.has(c.name)) sorted.push(c); }
            cols = sorted;
        }

        // Filter out hidden fields and PKs 
        cols = cols.filter(c =>
            !c.primary_key &&
            !fieldOverrides[c.name]?.hidden
        );

        // Exclude columns
        const excludes = binding.excludeColumns || [];
        if (excludes.length > 0) {
            const excludeSet = new Set(excludes);
            cols = cols.filter(c => !excludeSet.has(c.name));
        }

        return cols;
    }, [rawColumns, binding.fieldOrder, fieldOverrides, binding.excludeColumns]);


    // Early states (Empty Binding)
    if (!tableName || !recordId) {
        return (
            <div className={cn('rounded-md border p-8', className)} style={safeStyle}>
                <div className="text-center text-muted-foreground">
                    No table or record configured.
                    {onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="ml-1 text-primary hover:underline"
                        >
                            Configure binding
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)} style={safeStyle}>
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    Failed to load record: {error instanceof Error ? error.message : 'Unknown error'}
                </div>
            </div>
        );
    }

    // No columns baked — show helpful message
    if (rawColumns.length === 0 && !loading) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)} style={safeStyle}>
                <p className="text-sm text-muted-foreground">
                    {tableName
                        ? `No schema available for "${tableName}". Try re-publishing the page or check the configuration.`
                        : 'Select a table and record to display.'
                    }
                </p>
            </div>
        );
    }

    // Loading / skeleton
    if (loading && !record) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)} style={safeStyle}>
                {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
                <div className="space-y-3 animate-pulse" style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: '0 2rem' }}>
                    {Array.from({ length: Math.max(6, gridColumns * 2) }).map((_, i) => (
                        <div key={i} className={spacingClass} style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                            <div className="h-3 bg-muted rounded w-20 mb-1.5"></div>
                            <div className="h-4 bg-muted rounded w-32"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Spacing classes for list layout
    const spacingClasses = {
        'compact': 'gap-x-4 gap-y-1',
        'normal': 'gap-x-6 gap-y-2',
        'relaxed': 'gap-x-10 gap-y-3',
    };

    // Grid classes based on layout
    const gridClasses = {
        'list': `flex flex-wrap items-baseline ${spacingClasses[fieldSpacing] || spacingClasses['normal']}`,
        '1': 'grid grid-cols-1 gap-4',
        '2': 'grid grid-cols-1 gap-4 sm:grid-cols-2',
        '3': 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3',
    };

    // Rendering core content
    const content = (
        <dl className={gridClasses[layout] || gridClasses['2']}>
            {visibleColumns.map(column => {
                const override = fieldOverrides[column.name] || {};
                const label = override.label || columnToLabel(column.name);
                const value = record ? getNestedValue(record, column.name) : undefined;
                const isListLayout = layout === 'list';

                const fieldContent = (
                    <div
                        className={isListLayout ? 'flex items-baseline gap-1.5' : 'space-y-1'}
                    >
                        <dt className={cn("text-sm font-medium text-muted-foreground", isListLayout ? '' : '')}>
                            {label}{isListLayout ? ':' : ''}
                        </dt>
                        <dd className="text-sm">
                            {formatValue(column, value, override)}
                        </dd>
                    </div>
                );

                // IoC injection: wrap in builder toolings if provided
                if (fieldWrapper) {
                    return React.cloneElement(
                        fieldWrapper(column.name, fieldContent) as React.ReactElement, 
                        { key: column.name }
                    );
                }

                return React.cloneElement(fieldContent, { key: column.name });
            })}
        </dl>
    );

    if (showCard) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} style={safeStyle}>
                {title && (
                    <div className="flex flex-col space-y-1.5 p-6 pb-4">
                        <h3 className="text-lg font-semibold leading-none tracking-tight">{title}</h3>
                    </div>
                )}
                <div className="p-6 pt-0">
                    {content}
                </div>
            </div>
        );
    }

    return <div className={cn(className)} style={safeStyle}>{content}</div>;
}

export default InfoList;
