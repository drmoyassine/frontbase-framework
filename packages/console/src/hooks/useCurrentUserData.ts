import { useMemo } from 'react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { useUserContactConfig } from './useUserContactConfig';
import { useAuthStore } from '@/stores/auth';

export function useCurrentUserData() {
  const { user } = useAuthStore();
  const { config, isConfigured } = useUserContactConfig();
  const { queryData } = useDataBindingStore();

  const binding = useMemo(() => {
    if (!isConfigured || !config || !config.columnMapping || !user) return null;

    return {
      componentId: 'current-user-data',
      tableName: config.contactsTable,
      dataSourceId: 'backend',
      query: {
        table: config.contactsTable,
        select: '*',
        filters: [
          {
            column: config.columnMapping.authUserIdColumn,
            operator: 'eq' as const,
            value: user.id
          }
        ],
        limit: 1
      },
      refreshInterval: 0,
      pagination: { enabled: false, pageSize: 1, page: 1 },
      sorting: { enabled: false, defaultSort: [] },
      filtering: { searchEnabled: false, filters: {} },
      columnOverrides: {}
    };
  }, [config, isConfigured, user]);

  const result = useMemo(() => {
    if (!binding) {
      return {
        data: null,
        loading: false,
        error: null,
        isConfigured: false
      };
    }

    // Get cached data directly from store
    const { dataCache, loadingStates, errors } = useDataBindingStore.getState();
    const data = dataCache.get(binding.componentId);
    const loading = loadingStates.get(binding.componentId) || false;
    const error = errors.get(binding.componentId) || null;

    // Trigger data fetch if not already cached
    if (!data && !loading) {
      queryData(binding.componentId, binding);
    }

    return { data, loading, error };
  }, [binding, queryData]);

  return {
    ...result,
    isConfigured,
    config,
    currentUser: result.data?.[0] || null
  };
}