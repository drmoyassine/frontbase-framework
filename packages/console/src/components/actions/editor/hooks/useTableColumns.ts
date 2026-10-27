/**
 * useTableColumns - Fetches column names from table schema
 */

import { useState, useEffect } from 'react';
import { datasourcesApi } from '@/modules/dbsync/api/datasources';

export interface TableColumn {
    name: string;
    type: string;
    nullable?: boolean;
    isPrimaryKey?: boolean;
}

interface UseTableColumnsResult {
    columns: TableColumn[];
    loading: boolean;
    error: string | null;
}

export function useTableColumns(
    dataSourceId?: string,
    tableName?: string
): UseTableColumnsResult {
    const [columns, setColumns] = useState<TableColumn[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!dataSourceId || !tableName) {
            setColumns([]);
            return;
        }

        const fetchColumns = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await datasourcesApi.getTableSchema(dataSourceId, tableName);
                const schema = response.data;

                if (schema?.columns) {
                    setColumns(
                        schema.columns.map((col: any) => ({
                            name: col.name,
                            type: col.type,
                            nullable: col.nullable,
                            isPrimaryKey: col.is_primary_key || col.isPrimaryKey,
                        }))
                    );
                } else {
                    setColumns([]);
                }
            } catch (err: any) {
                console.error('Failed to fetch table schema:', err);
                setError(err.message || 'Failed to fetch columns');
                setColumns([]);
            } finally {
                setLoading(false);
            }
        };

        fetchColumns();
    }, [dataSourceId, tableName]);

    return { columns, loading, error };
}
