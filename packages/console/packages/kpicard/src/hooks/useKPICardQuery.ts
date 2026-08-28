import { useQuery } from '@tanstack/react-query';
import type { ComponentDataBinding } from '../types';

interface UseKPICardQueryProps {
    mode: 'builder' | 'edge';
    binding: ComponentDataBinding;
    initialData?: any[];
    enabled?: boolean;
}

function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    } else {
        return template;
    }
}

async function fetchFromBuilder(binding: ComponentDataBinding) {
    const params = new URLSearchParams();
    params.append('limit', '1');
    params.append('offset', '0');

    if (binding.sorting?.column) {
        params.append('sort', binding.sorting.column);
        params.append('order', binding.sorting.direction || 'asc');
    }

    if (binding.filtering?.filters) {
        const filterList = Object.entries(binding.filtering.filters)
            .filter(([_, v]) => v != null && v !== '')
            .map(([field, value]) => ({
                field,
                operator: '==',
                value: typeof value === 'object' && 'value' in value ? (value as any).value : value,
            }));
        if (filterList.length > 0) {
            params.append('filters', JSON.stringify(filterList));
        }
    }

    const response = await fetch(
        `/api/sync/datasources/${binding.dataSourceId}/tables/${binding.tableName}/data?${params}`
    );

    if (!response.ok) {
        throw new Error('Failed to fetch data');
    }

    const result = await response.json();
    return result.records || [];
}

async function fetchFromEdge(binding: ComponentDataBinding) {
    const dataRequest = binding.dataRequest;
    if (!dataRequest) {
        return [];
    }

    const queryConfig = dataRequest.queryConfig;
    const strategy = dataRequest.fetchStrategy || 'proxy';

    const queryBody: Record<string, any> = {
        table_name: queryConfig?.tableName || binding.tableName,
        columns: queryConfig?.columns || '*',
        joins: queryConfig?.joins || [],
        page: 1,
        page_size: 1,
        filters: [],
    };

    if (binding.sorting?.column) {
        queryBody.sort_col = binding.sorting.column;
        queryBody.sort_dir = binding.sorting.direction || 'asc';
    }

    if (strategy === 'direct') {
        const url = resolveEnvVars(dataRequest.url);
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(dataRequest.headers || {})) {
            headers[key] = resolveEnvVars(value as string);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(queryBody),
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch data (HTTP ${response.status})`);
        }

        const result = await response.json();
        return result.rows || result.data || [];
    } else {
        const datasourceId = dataRequest.datasourceId || binding.dataSourceId;
        const response = await fetch('/api/data/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataRequest: {
                    fetchStrategy: 'proxy',
                    datasourceId,
                    method: 'POST',
                    queryConfig: dataRequest.queryConfig || {},
                    body: queryBody,
                    resultPath: dataRequest.resultPath || 'rows',
                    flattenRelations: dataRequest.flattenRelations ?? false,
                },
            }),
        });

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch data');
        }
        return result.data?.rows || result.data || [];
    }
}

export function useKPICardQuery({
    mode,
    binding,
    initialData,
    enabled = true,
}: UseKPICardQueryProps) {
    return useQuery({
        queryKey: ['kpicard-data-v2', mode, binding.dataSourceId, binding.tableName, binding.sorting, binding.filtering],
        queryFn: async () => {
            if (!binding.tableName) return [];
            if (mode === 'builder') {
                return fetchFromBuilder(binding);
            } else {
                return fetchFromEdge(binding);
            }
        },
        initialData: initialData,
        enabled: enabled && !!binding.tableName,
        staleTime: 5 * 60 * 1000,
        refetchInterval: binding.refreshInterval && binding.refreshInterval > 0
            ? binding.refreshInterval * 1000
            : false,
    });
}
