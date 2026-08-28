import { useState, useEffect } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';

export type ColumnInfo = { name: string; type: string };

export function useBindingColumns(tableName?: string, dataSourceId?: string) {
    const { globalSchema } = useDataBindingStore();
    const [columns, setColumns] = useState<ColumnInfo[]>([]);

    useEffect(() => {
        if (!tableName) return;

        const fetchColumns = async () => {
            const allColumns: ColumnInfo[] = [];

            if (dataSourceId && dataSourceId !== 'backend') {
                try {
                    const response = await fetch(
                        `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    );
                    if (response.ok) {
                        const schemaData = await response.json();
                        (schemaData.columns || []).forEach((col: any) => {
                            allColumns.push({
                                name: col.column_name || col.name,
                                type: col.data_type || col.type || 'text',
                            });
                        });
                    }
                } catch (error) {
                    console.error('[useBindingColumns] Failed to fetch schema:', error);
                }
            } else {
                const gTable = globalSchema?.tables?.find((t: any) => t.table_name === tableName);
                if (gTable && gTable.columns) {
                    gTable.columns.forEach((c: any) => {
                        allColumns.push({ name: c.column_name, type: c.data_type });
                    });
                }
            }
            setColumns(allColumns);
        };

        fetchColumns();
    }, [tableName, dataSourceId, globalSchema]);

    return columns;
}
