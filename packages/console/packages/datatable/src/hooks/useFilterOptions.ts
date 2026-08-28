import { useQuery } from '@tanstack/react-query';
import type { FilterConfig, DataRequest } from '../types';

/**
 * Resolve {{ENV_VAR}} placeholders in a string
 */
function resolveEnvVars(template: string): string {
    if (typeof window === 'undefined') {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
            return (process.env as Record<string, string>)[key] || '';
        });
    }
    return template;
}

interface UseFilterOptionsOptions {
    mode: 'builder' | 'edge';
    filters: FilterConfig[];
    tableName?: string;
    dataSourceId?: string;
    cascadingFilters?: Record<string, any>;
    searchQuery?: string;
    enabled?: boolean;
}

/**
 * Fetch filter options for dropdown/multiselect filters
 * Supports cascading filters (options update based on other filter values)
 */
export function useFilterOptions({
    mode,
    filters,
    tableName,
    dataSourceId,
    cascadingFilters = {},
    searchQuery,
    enabled = true,
}: UseFilterOptionsOptions) {
    return useQuery({
        queryKey: ['filter-options', mode, tableName, filters.map((f) => f.column), cascadingFilters, searchQuery],
        queryFn: async () => {
            const options: Record<string, { label: string; value: string }[]> = {};

            for (const filter of filters) {
                // Only fetch for dropdown/multiselect with dynamic options
                if (!['dropdown', 'multiselect'].includes(filter.filterType)) continue;
                if (!filter.optionsDataRequest) {
                    // Use static options if no data request
                    if (filter.options) {
                        options[filter.column] = (filter.options as any[]).map((opt: any) =>
                            typeof opt === 'string' ? { label: opt, value: opt } : opt
                        );
                    }
                    continue;
                }

                try {
                    // Build cascading filter context (exclude current filter)
                    const otherFilters = Object.entries(cascadingFilters)
                        .filter(([col]) => col !== filter.column)
                        .filter(([_, val]) => val !== undefined && val !== null && val !== '')
                        .map(([column, value]) => {
                            const filterConfig = filters.find((f) => f.column === column);
                            return {
                                column,
                                filterType: filterConfig?.filterType || 'text',
                                value,
                            };
                        });

                    // Build request body
                    const requestBody: Record<string, any> = {
                        ...filter.optionsDataRequest.body,
                        filters: otherFilters,
                    };

                    // Add search context if active
                    if (searchQuery?.trim()) {
                        requestBody.search_query = searchQuery;
                    }

                    let rawOptions: any[] = [];

                    if (mode === 'edge') {
                        // Edge mode: use /api/data/execute
                        const url = resolveEnvVars(filter.optionsDataRequest.url);
                        const headers: Record<string, string> = {};
                        for (const [k, v] of Object.entries(filter.optionsDataRequest.headers || {})) {
                            headers[k] = resolveEnvVars(v);
                        }

                        const response = await fetch('/api/data/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                dataRequest: {
                                    ...filter.optionsDataRequest,
                                    url,
                                    headers,
                                    body: requestBody,
                                },
                            }),
                        });

                        const result = await response.json();
                        if (result.success) {
                            rawOptions = result.data?.rows || result.data || [];
                        }
                    } else {
                        // Builder mode: fetch distinct values from FastAPI
                        const response = await fetch(
                            `/api/sync/datasources/${dataSourceId}/tables/${tableName}/columns/${filter.column}/distinct`
                        );
                        if (response.ok) {
                            const result = await response.json();
                            rawOptions = result.values || [];
                        }
                    }

                    // Normalize options
                    if (Array.isArray(rawOptions)) {
                        options[filter.column] = rawOptions.map((val: any) => {
                            const strVal =
                                val !== null && typeof val === 'object'
                                    ? (Object.values(val)[0] as string)
                                    : String(val);
                            return { label: strVal, value: strVal };
                        });
                    }
                } catch (e) {
                    console.error('Error fetching options for', filter.column, e);
                }
            }

            return options;
        },
        enabled: enabled && filters.length > 0,
        staleTime: 30_000, // 30 seconds
    });
}
