import React from 'react';

/**
 * Render cell content based on displayType
 * 
 * @param value - The cell value
 * @param displayType - Optional display type (image, link, badge, etc.)
 * @param columnKey - Optional column key for context
 */
export function renderCell(
    value: any,
    displayType?: string,
    columnKey?: string
): React.ReactNode {
    if (value === null || value === undefined) {
        return <span className="text-muted-foreground">—</span>;
    }

    const strValue = String(value);

    switch (displayType) {
        case 'image':
            return (
                <img
                    src={strValue}
                    alt=""
                    className="h-10 w-10 object-cover rounded-md"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            );

        case 'link':
            return (
                <a
                    href={strValue}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate max-w-xs block"
                >
                    {strValue}
                </a>
            );

        case 'badge':
            return (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    {strValue}
                </span>
            );

        case 'boolean':
            return (
                <span className={value ? 'text-green-600' : 'text-red-600'}>
                    {value ? '✓' : '✕'}
                </span>
            );

        case 'date':
            try {
                return new Date(value).toLocaleDateString();
            } catch {
                return strValue;
            }

        case 'currency':
            try {
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                }).format(Number(value));
            } catch {
                return strValue;
            }

        case 'percentage':
            try {
                return `${Number(value).toFixed(1)}%`;
            } catch {
                return strValue;
            }

        default:
            // Auto-detect image URLs
            if (
                strValue.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ||
                strValue.includes('supabase.co/storage')
            ) {
                return (
                    <img
                        src={strValue}
                        alt=""
                        className="h-10 w-10 object-cover rounded-md"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                );
            }

            return <span className="truncate max-w-xs block">{strValue}</span>;
    }
}
