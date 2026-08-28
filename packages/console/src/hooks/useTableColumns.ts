
import { useMemo } from 'react';

interface ColumnOverride {
    displayName?: string;
    visible?: boolean;
    hidden?: boolean;
    displayType?: 'text' | 'badge' | 'date' | 'boolean' | 'currency' | 'percentage' | 'image' | 'link';
    dateFormat?: string;
}

interface TableBinding {
    columnOverrides?: Record<string, ColumnOverride>;
    columnOrder?: string[];
}

interface TableSchema {
    columns: Array<{
        name: string;
        type: string;
        [key: string]: any;
    }>;
}

export function useTableColumns(
    schema: TableSchema | null,
    binding: TableBinding | null | undefined
) {
    const visibleColumns = useMemo(() => {
        if (!schema) return [];

        let columns: any[] = [];

        // 1. Get all potential columns (base + related from overrides)
        const allColumnsMap = new Map<string, any>();

        // Add base columns
        schema.columns.forEach((col: any) => {
            allColumnsMap.set(col.name, col);
        });

        // Helper to ensure related or virtual column exists in map
        const ensureVirtualColumn = (key: string) => {
            if (!allColumnsMap.has(key)) {
                if (key.includes('.')) {
                    const [tableName, columnName] = key.split('.');
                    allColumnsMap.set(key, {
                        name: key,
                        type: 'text',
                        relatedTable: tableName,
                        relatedColumn: columnName
                    });
                } else {
                    // Treat as virtual column (e.g. from RPC or calculated)
                    allColumnsMap.set(key, {
                        name: key,
                        type: 'text',
                        isVirtual: true
                    });
                }
            }
        };

        // Add virtual/related columns from overrides
        if (binding?.columnOverrides) {
            Object.keys(binding.columnOverrides).forEach(key => {
                ensureVirtualColumn(key);
            });
        }

        // 2. Determine visible columns based on overrides
        // Check if columnOverrides match current schema (detect stale overrides from previous table)
        const overrideKeys = Object.keys(binding?.columnOverrides || {});
        const schemaColumnNames = new Set(schema.columns.map((c: any) => c.name));
        const hasValidOverrides = overrideKeys.length > 0 && overrideKeys.some(key => schemaColumnNames.has(key.split('.')[0]));

        const isVisible = (key: string) => {
            // If no valid overrides for current schema, show all columns by default
            if (!hasValidOverrides) return true;

            const override = binding?.columnOverrides?.[key];
            if (override?.hidden !== undefined) return !override.hidden; // Respect 'hidden' prop if present
            if (override?.visible !== undefined) return override.visible;
            return true; // Default VISIBLE if no overrides set
        };

        const visibleKeys = new Set<string>();
        allColumnsMap.forEach((col, key) => {
            if (isVisible(key)) {
                visibleKeys.add(key);
            }
        });

        // 3. Sort based on columnOrder
        if (binding?.columnOrder && binding.columnOrder.length > 0) {
            // Add columns in order
            binding.columnOrder.forEach(key => {
                // Ensure related columns in order exist in map (robustness)
                ensureVirtualColumn(key);

                // Re-check visibility for potentially newly added columns
                if (isVisible(key)) {
                    // Note: We don't check visibleKeys here strictly because we might have just added it to map
                    const col = allColumnsMap.get(key);
                    if (col) {
                        columns.push(col);
                        visibleKeys.delete(key);
                    }
                }
            });
            // Add remaining visible columns (fallback for those not in order list)
            visibleKeys.forEach(key => {
                const col = allColumnsMap.get(key);
                if (col) columns.push(col);
            });
        } else {
            // Default order: Base columns then Related columns
            schema.columns.forEach((col: any) => {
                if (visibleKeys.has(col.name)) {
                    columns.push(col);
                    visibleKeys.delete(col.name);
                }
            });
            // Then remaining (foreign)
            visibleKeys.forEach(key => {
                const col = allColumnsMap.get(key);
                if (col) columns.push(col);
            });
        }

        return columns;
    }, [schema, binding?.columnOverrides, binding?.columnOrder]);

    const getColumnDisplayName = (columnName: string) => {
        const override = binding?.columnOverrides?.[columnName];
        return override?.displayName || columnName;
    };

    return {
        visibleColumns,
        getColumnDisplayName
    };
}
