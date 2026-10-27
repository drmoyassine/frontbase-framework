import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableCellProps {
    value: any;
    columnName: string;
    row?: any;
    columnConfig?: {
        displayType?: string;
        dateFormat?: string;
        [key: string]: any;
    };
}

const getBadgeColor = (value: string) => {
    const colors = [
        "bg-red-100 text-red-800 hover:bg-red-100/80",
        "bg-orange-100 text-orange-800 hover:bg-orange-100/80",
        "bg-amber-100 text-amber-800 hover:bg-amber-100/80",
        "bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80",
        "bg-lime-100 text-lime-800 hover:bg-lime-100/80",
        "bg-green-100 text-green-800 hover:bg-green-100/80",
        "bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80",
        "bg-teal-100 text-teal-800 hover:bg-teal-100/80",
        "bg-cyan-100 text-cyan-800 hover:bg-cyan-100/80",
        "bg-sky-100 text-sky-800 hover:bg-sky-100/80",
        "bg-blue-100 text-blue-800 hover:bg-blue-100/80",
        "bg-indigo-100 text-indigo-800 hover:bg-indigo-100/80",
        "bg-violet-100 text-violet-800 hover:bg-violet-100/80",
        "bg-purple-100 text-purple-800 hover:bg-purple-100/80",
        "bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-100/80",
        "bg-pink-100 text-pink-800 hover:bg-pink-100/80",
        "bg-rose-100 text-rose-800 hover:bg-rose-100/80",
    ];

    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
};

export const DataTableCell: React.FC<DataTableCellProps> = ({ value, columnName, row, columnConfig }) => {
    // Handle related columns (e.g., "providers.provider_name")
    let actualValue = value;
    if (row && columnName.includes('.')) {
        // Debug logging for related columns
        // Debug logging for related columns - Log ALL dotted columns for debugging
        if (columnName.includes('.')) {
            console.log(`[DataTableCell] Accessing ${columnName}`, {
                valueProp: value,
                flattenedValue: row[columnName],
                nestedValue: row[columnName.split('.')[0]]?.[columnName.split('.')[1]],
                rowKeys: Object.keys(row).filter(k => k.includes('.')), // Only show relevant keys
                row: row
            });
        }

        // First, try flattened key format (sync API returns this): row["programs.degree_name"]
        if (row[columnName] !== undefined) {
            actualValue = row[columnName];
        } else {
            // Fallback: try nested object format (legacy API): row.programs.degree_name
            const [tableName, colName] = columnName.split('.');
            let relationData = row[tableName];

            // Case-insensitive lookup if direct access fails
            if (!relationData) {
                const lowerTableName = tableName.toLowerCase();
                const matchingKey = Object.keys(row).find(k => k.toLowerCase() === lowerTableName);
                if (matchingKey) {
                    relationData = row[matchingKey];
                }
            }

            if (Array.isArray(relationData)) {
                actualValue = relationData[0]?.[colName];
            } else {
                actualValue = relationData?.[colName];
            }
        }
    }

    if (actualValue === null || actualValue === undefined) {
        return <span className="text-muted-foreground">—</span>;
    }

    const displayType = columnConfig?.displayType || 'text';

    switch (displayType) {
        case 'badge':
            return <Badge variant="outline" className={cn("border-0 font-medium", getBadgeColor(String(actualValue)))}>{String(actualValue)}</Badge>;
        case 'boolean':
            // Render boolean as tick or X
            const boolVal = actualValue === true || actualValue === 'true' || actualValue === 1;
            return boolVal ? (
                <Check className="h-4 w-4 text-green-600" />
            ) : (
                <X className="h-4 w-4 text-red-500" />
            );
        case 'date':
            // Use custom date format if specified
            const dateFormat = columnConfig?.dateFormat || 'MMM dd, yyyy';
            const dateVal = new Date(actualValue);
            if (isNaN(dateVal.getTime())) return String(actualValue);

            if (dateFormat === 'relative') {
                // Relative date formatting
                const now = new Date();
                const diffMs = now.getTime() - dateVal.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                if (diffDays === 0) return 'Today';
                if (diffDays === 1) return 'Yesterday';
                if (diffDays < 7) return `${diffDays} days ago`;
                if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
                if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
                return `${Math.floor(diffDays / 365)} years ago`;
            }

            // Standard date formats using Intl
            const formatMap: Record<string, Intl.DateTimeFormatOptions> = {
                'MMM dd, yyyy': { month: 'short', day: '2-digit', year: 'numeric' },
                'dd/MM/yyyy': { day: '2-digit', month: '2-digit', year: 'numeric' },
                'MM/dd/yyyy': { month: '2-digit', day: '2-digit', year: 'numeric' },
                'yyyy-MM-dd': { year: 'numeric', month: '2-digit', day: '2-digit' },
                'dd MMM yyyy': { day: '2-digit', month: 'short', year: 'numeric' },
                'EEEE, MMM dd': { weekday: 'long', month: 'short', day: '2-digit' }
            };

            const options = formatMap[dateFormat] || formatMap['MMM dd, yyyy'];

            // Handle locale-specific formatting
            if (dateFormat === 'dd/MM/yyyy') {
                return dateVal.toLocaleDateString('en-GB', options);
            } else if (dateFormat === 'yyyy-MM-dd') {
                return dateVal.toISOString().split('T')[0];
            }

            return dateVal.toLocaleDateString('en-US', options);
        case 'currency':
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(Number(actualValue));
        case 'percentage':
            return `${(Number(actualValue) * 100).toFixed(1)}%`;
        case 'image':
            return (
                <img
                    src={String(actualValue)}
                    alt="Image"
                    className="w-8 h-8 rounded object-cover"
                />
            );
        case 'link':
            return (
                <a
                    href={String(actualValue)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                >
                    {String(actualValue)}
                </a>
            );
        default:
            if (typeof actualValue === 'object') {
                return <code className="text-xs">{JSON.stringify(actualValue)}</code>;
            }
            return String(actualValue);
    }
};
