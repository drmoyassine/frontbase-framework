import { useCallback, useEffect, useState } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';

export function useTableSchema(tableName?: string) {
    const { schemas, loadTableSchema, connected } = useDataBindingStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const schema = tableName ? schemas.get(tableName) : null;

    const loadSchema = useCallback(async (table: string) => {
        if (!connected) return;

        setLoading(true);
        setError(null);

        try {
            await loadTableSchema(table);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load schema');
        } finally {
            setLoading(false);
        }
    }, [connected, loadTableSchema]);

    useEffect(() => {
        if (tableName && connected && !schema) {
            loadSchema(tableName);
        }
    }, [tableName, connected, schema, loadSchema]);

    return {
        schema,
        loading,
        error,
        refetch: tableName ? () => loadSchema(tableName) : () => Promise.resolve(),
    };
}
