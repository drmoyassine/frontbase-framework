import { useQuery } from '@tanstack/react-query';
import type { InfoListBinding } from '../types';

interface UseInfoListQueryProps {
    mode: 'builder' | 'edge';
    binding: InfoListBinding;
    recordId?: string;
    initialData?: Record<string, any> | null;
    enabled?: boolean;
}

export function useInfoListQuery({
    mode,
    binding,
    recordId: propsRecordId,
    initialData,
    enabled = true
}: UseInfoListQueryProps) {
    const tableName = binding.tableName;
    const recordId = propsRecordId || binding.recordId;
    const dataRequest = binding.dataRequest;

    return useQuery({
        queryKey: ['infolist-data-v2', mode, binding.dataSourceId, tableName, recordId],
        queryFn: async () => {
            if (!tableName || !recordId) {
                return { record: null, columns: [] };
            }

            // In Builder mode, we call FastAPI directly to get schema and data
            if (mode === 'builder') {
                const dataSourceId = binding.dataSourceId;
                
                // 1. Fetch main table schema
                const schemaEndpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema/`
                    : `/api/database/table-schema/${tableName}/`;

                const schemaResponse = await fetch(schemaEndpoint);
                if (!schemaResponse.ok) throw new Error('Failed to fetch schema');
                const schemaResult = await schemaResponse.json();
                const tableSchema = schemaResult.data || schemaResult;

                // 2. Identify FK columns and fetch related schemas
                const expandedSchema: any[] = [];
                const relatedTables = new Map<string, string[]>();

                if (tableSchema && tableSchema.columns) {
                    for (const col of tableSchema.columns) {
                        expandedSchema.push(col);

                        const isForeign = col.isForeign || col.is_foreign;
                        const foreignTable = col.foreignTable || col.foreign_table;

                        if (isForeign && foreignTable) {
                            try {
                                const relSchemaEndpoint = dataSourceId && dataSourceId !== 'backend'
                                    ? `/api/sync/datasources/${dataSourceId}/tables/${foreignTable}/schema/`
                                    : `/api/database/table-schema/${foreignTable}/`;

                                const relSchemaResponse = await fetch(relSchemaEndpoint);
                                if (relSchemaResponse.ok) {
                                    const relSchemaResult = await relSchemaResponse.json();
                                    const relSchema = relSchemaResult.data || relSchemaResult;
                                    const relColumns: string[] = [];

                                    if (relSchema && relSchema.columns) {
                                        for (const relCol of relSchema.columns) {
                                            const relColName = relCol.name || relCol.column_name;
                                            if (['id', 'created_at', 'updated_at', 'deleted_at'].includes(relColName)) continue;
                                            if (relCol.isForeign || relCol.is_foreign) continue;

                                            relColumns.push(relColName);
                                            const relType = (typeof relCol.type === 'string' ? relCol.type : relCol.data_type) || 'text';
                                            expandedSchema.push({
                                                name: `${foreignTable}.${relColName}`,
                                                type: relType,
                                                nullable: relCol.nullable ?? true,
                                                primary_key: false,
                                                is_foreign: false,
                                                isRelated: true,
                                                relatedTable: foreignTable,
                                                relatedColumn: relColName,
                                            });
                                        }

                                        if (relColumns.length > 0) {
                                            relatedTables.set(foreignTable, relColumns);
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn(`Failed to fetch related schema for ${foreignTable}:`, e);
                            }
                        }
                    }
                }

                // 3. Build select param for embedded relations
                let selectParam = '*';
                if (relatedTables.size > 0) {
                    const embeddings: string[] = [];
                    relatedTables.forEach((cols, table) => {
                        embeddings.push(`${table}(${cols.join(',')})`);
                    });
                    selectParam = `*,${embeddings.join(',')}`;
                }

                // 4. Fetch record with embedded relations
                const filtersParam = encodeURIComponent(JSON.stringify([{ field: 'id', operator: '==', value: recordId }]));
                const dataEndpoint = dataSourceId && dataSourceId !== 'backend'
                    ? `/api/sync/datasources/${dataSourceId}/tables/${tableName}/data/?filters=${filtersParam}&limit=1&select=${encodeURIComponent(selectParam)}`
                    : `/api/database/table-data/${tableName}/?filters=${filtersParam}&limit=1`;

                const dataResponse = await fetch(dataEndpoint);
                if (!dataResponse.ok) throw new Error('Failed to fetch record');

                const result = await dataResponse.json();
                const rec = result.records?.[0] || result.rows?.[0] || result.data?.[0];
                return { record: rec || null, columns: expandedSchema };
            }

            // In Edge mode, we use the `dataRequest` definition injected at publish time
            if (mode === 'edge' && dataRequest) {
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
                    return { record: rec || null, columns: binding.columns || [] };
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
                    return { record: rec || null, columns: binding.columns || [] };
                }
            }

            // Edge fallback - old Edge behavior
            if (mode === 'edge') {
                const res = await fetch(`/api/data/${tableName}/${recordId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const result = await res.json();
                return { record: result.data || result || null, columns: binding.columns || [] };
            }

            return { record: null, columns: binding.columns || [] };
        },
        initialData: initialData !== undefined ? { record: initialData, columns: binding.columns || [] } : undefined,
        staleTime: 5 * 60 * 1000,
        enabled: enabled && !!tableName && !!recordId,
    });
}
