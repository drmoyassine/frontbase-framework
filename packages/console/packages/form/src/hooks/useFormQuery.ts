import { useQuery, useMutation } from '@tanstack/react-query';
import type { FormBinding, ColumnSchema } from '../types';

interface UseFormQueryProps {
    mode: 'builder' | 'edge';
    binding: FormBinding;
    recordId?: string;
    initialData?: Record<string, any> | null;
    enabled?: boolean;
}

interface FormQueryResult {
    record: Record<string, any> | null;
    columns: ColumnSchema[];
}

export function useFormQuery({
    mode,
    binding,
    recordId: propsRecordId,
    initialData,
    enabled = true
}: UseFormQueryProps) {
    const tableName = binding.tableName;
    const recordId = propsRecordId || binding.recordId;
    const dataRequest = binding.dataRequest;
    const isEditMode = !!recordId;

    return useQuery<FormQueryResult>({
        queryKey: ['form-data-v2', mode, binding.dataSourceId, tableName, recordId],
        queryFn: async (): Promise<FormQueryResult> => {
            if (!tableName) {
                return { record: null, columns: binding.columns || [] };
            }

            // In Builder mode, we call FastAPI directly to get schema and data
            if (mode === 'builder') {
                const dataSourceId = binding.dataSourceId;

                // 1. Fetch table schema
                const schemaEndpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema/`
                    : `/api/database/table-schema/${tableName}/`;

                const schemaResponse = await fetch(schemaEndpoint);
                if (!schemaResponse.ok) throw new Error('Failed to fetch schema');
                const schemaResult = await schemaResponse.json();
                const tableSchema = schemaResult.data || schemaResult;

                // Extract columns
                const columns: ColumnSchema[] = [];
                if (tableSchema && tableSchema.columns) {
                    for (const col of tableSchema.columns) {
                        columns.push({
                            name: col.name || col.column_name,
                            type: col.type || col.data_type || 'text',
                            nullable: col.nullable ?? true,
                            primary_key: col.primary_key ?? false,
                            default: col.default,
                            is_foreign: col.isForeign || col.is_foreign || false,
                            foreign_table: col.foreignTable || col.foreign_table,
                            foreign_column: col.foreignColumn || col.foreign_column,
                        });
                    }
                }

                // 2. If edit mode, fetch the record
                let record: Record<string, any> | null = null;
                if (isEditMode) {
                    const filtersParam = encodeURIComponent(JSON.stringify([{ field: 'id', operator: '==', value: recordId }]));
                    const dataEndpoint = dataSourceId && dataSourceId !== 'backend'
                        ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/data/?filters=${filtersParam}&limit=1`
                        : `/api/database/table-data/${tableName}/?filters=${filtersParam}&limit=1`;

                    const dataResponse = await fetch(dataEndpoint);
                    if (dataResponse.ok) {
                        const result = await dataResponse.json();
                        record = result.records?.[0] || result.rows?.[0] || result.data?.[0] || null;
                    }
                }

                return { record, columns };
            }

            // In Edge mode, we use the `dataRequest` definition injected at publish time
            if (mode === 'edge') {
                // If we have binding columns, use them directly (schema already baked)
                const columns = binding.columns || [];

                // For edit mode with dataRequest
                if (isEditMode && dataRequest) {
                    if (dataRequest.fetchStrategy === 'proxy') {
                        const res = await fetch('/api/data/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                ...dataRequest,
                                body: {
                                    ...dataRequest.body,
                                    query: `SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`,
                                    params: [recordId],
                                },
                            }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const result = await res.json();
                        const rec = result.rows?.[0] || result.data?.[0];
                        return { record: rec || null, columns };
                    } else {
                        const res = await fetch(dataRequest.url, {
                            method: dataRequest.method || 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(dataRequest.headers || {}),
                            },
                            body: JSON.stringify({
                                ...dataRequest.body,
                                filters: [{ column: 'id', filterType: 'equal', value: recordId }],
                                page_size: 1,
                            }),
                        });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const result = await res.json();
                        const rec = result.rows?.[0] || result.data?.[0];
                        return { record: rec || null, columns };
                    }
                }

                // Edge fallback for edit mode
                if (isEditMode) {
                    const res = await fetch(`/api/data/${tableName}/${recordId}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const result = await res.json();
                    return { record: result.data || result || null, columns };
                }

                // Create mode — just return columns, no record
                return { record: null, columns };
            }

            return { record: null, columns: binding.columns || [] };
        },
        initialData: initialData !== undefined ? { record: initialData, columns: binding.columns || [] } : undefined,
        staleTime: 5 * 60 * 1000,
        enabled: enabled && !!tableName,
    });
}

/**
 * Hook for submitting form data (create or update)
 */
export function useFormSubmit(binding: FormBinding, mode: 'builder' | 'edge') {
    const tableName = binding.tableName || '';
    const dataSourceId = binding.dataSourceId;

    return useMutation({
        mutationFn: async ({ data, recordId }: { data: Record<string, any>; recordId?: string }) => {
            const isEditMode = !!recordId;

            if (mode === 'builder') {
                // Builder: call FastAPI directly
                const endpoint = dataSourceId && dataSourceId !== 'backend'
                    ? isEditMode
                        ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/records/${recordId}`
                        : `/api/sync/datasources/${dataSourceId}/tables/${tableName}/records`
                    : isEditMode
                        ? `/api/database/tables/${tableName}/records/${recordId}`
                        : `/api/database/tables/${tableName}/records`;

                const response = await fetch(endpoint, {
                    method: isEditMode ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data }),
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ detail: 'Failed to save record' }));
                    throw new Error(error.detail || 'Failed to save record');
                }

                return response.json();
            } else {
                // Edge: use edge data API
                const res = await fetch(`/api/data/${tableName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                    throw new Error(err.error || err.detail || 'Failed to create record');
                }

                return res.json();
            }
        },
    });
}
