import { useCallback, useState } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { databaseApi } from '@/services/database-api';

export function useDataMutation(tableName?: string) {
    const [loading, setLoading] = useState(false);
    const { connected, invalidateCache } = useDataBindingStore();

    const insert = useCallback(async (data: Record<string, any>) => {
        if (!tableName || !connected) {
            throw new Error('Table name required and must be connected');
        }

        setLoading(true);
        try {
            const result = await databaseApi.insertRecord(tableName, data);

            if (result.success) {
                // Invalidate cache to trigger refetch
                invalidateCache();
                return result.data;
            } else {
                throw new Error(result.message || 'Insert failed');
            }
        } finally {
            setLoading(false);
        }
    }, [tableName, connected, invalidateCache]);

    const update = useCallback(async (id: any, data: Record<string, any>) => {
        if (!tableName || !connected) {
            throw new Error('Table name required and must be connected');
        }

        setLoading(true);
        try {
            const result = await databaseApi.updateRecord(tableName, id, data);

            if (result.success) {
                // Invalidate cache to trigger refetch
                invalidateCache();
                return result.data;
            } else {
                throw new Error(result.message || 'Update failed');
            }
        } finally {
            setLoading(false);
        }
    }, [tableName, connected, invalidateCache]);

    const remove = useCallback(async (id: any) => {
        if (!tableName || !connected) {
            throw new Error('Table name required and must be connected');
        }

        setLoading(true);
        try {
            const result = await databaseApi.deleteRecord(tableName, id);

            if (result.success) {
                // Invalidate cache to trigger refetch
                invalidateCache();
                return true;
            } else {
                throw new Error(result.message || 'Delete failed');
            }
        } finally {
            setLoading(false);
        }
    }, [tableName, connected, invalidateCache]);

    return {
        insert,
        update,
        remove,
        loading,
    };
}
