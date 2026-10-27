export { useSimpleData } from './data/useSimpleData';
export type { UseSimpleDataOptions, UseSimpleDataResult, ComponentDataBinding } from './data/useSimpleData';
export { useTableSchema } from './data/useTableSchema';
export { useDataMutation } from './data/useDataMutation';

import { useState, useCallback, useEffect } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { databaseApi } from '@/services/database-api';

export function useDistinctValues(tableName?: string, columnName?: string) {
  const [values, setValues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connected } = useDataBindingStore();

  const fetchValues = useCallback(async () => {
    if (!tableName || !columnName || !connected) return;

    setLoading(true);
    setError(null);

    try {
      const result = await databaseApi.fetchDistinctValues(tableName, columnName);

      if (result.success) {
        setValues(result.data || []);
      } else {
        setError(result.message || 'Failed to fetch distinct values');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [tableName, columnName, connected]);

  useEffect(() => {
    fetchValues();
  }, [fetchValues]);

  return {
    values,
    loading,
    error,
    refetch: fetchValues,
  };
}