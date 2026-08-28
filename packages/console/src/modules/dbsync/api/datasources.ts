import { api } from './client'
import { Datasource, TableSchema, DatasourceView } from '../types'
import { RelationshipDefinition, IndexedRelationship } from '../types/relationship'

export interface SearchMatch {
    table: string;
    datasource_id: string;
    datasource_name: string;
    record: Record<string, any>;
    matched_fields: string[];
    row_id: any;
}

export interface TableDataResponse {
    records: any[];
    total: number;
    offset: number;
    limit: number;
    has_more: boolean;
    timestamp_utc?: string;
    /** FK display lookups for columns with a user-defined display_column
     * (keyed by FK column name → { parent_table, display_column, lookup: id→label }). */
    fk_columns?: Record<string, { parent_table: string; display_column: string; lookup: Record<string, any> }>;
}

export interface Relationship {
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
}

export interface RelationshipsResponse {
    tables: string[];
    relationships: Relationship[];
}

export const datasourcesApi = {
    list: () => api.get<Datasource[]>('/datasources/'),
    get: (id: string) => api.get<Datasource>(`/datasources/${id}/`),
    create: (data: Partial<Datasource>) => api.post<Datasource>('/datasources/', data),
    update: (id: string, data: Partial<Datasource>) => api.put<Datasource>(`/datasources/${id}/`, data),
    delete: (id: string) => api.delete(`/datasources/${id}/`),
    test: (id: string) => api.post<{ success: boolean; message: string; tables?: string[]; error?: string; suggestion?: string }>(`/datasources/${id}/test/`),
    testRaw: (data: any) => api.post<{ success: boolean; message: string; tables?: string[]; error?: string; suggestion?: string }>('/datasources/test-raw/', data),
    testUpdate: (id: string, data: any) => api.post<{ success: boolean; message: string; tables?: string[]; error?: string; suggestion?: string }>(`/datasources/${id}/test-update/`, data),
    getTables: (id: string | number) => api.get<string[]>(`/datasources/${id}/tables/`),
    getTableSchema: (id: string | number, table: string) => api.get<TableSchema>(`/datasources/${id}/tables/${table}/schema/`),
    getTablesData: (id: string | number, table: string, limit: number = 50, offset: number = 0, filters?: any[]) =>
        api.get<TableDataResponse>(`/datasources/${id}/tables/${table}/data/`, {
            params: { limit, offset, filters: filters ? JSON.stringify(filters) : undefined }
        }),

    refreshTableSchema: (id: string | number, table: string) =>
        api.get<TableSchema>(`/datasources/${id}/tables/${table}/schema/`, { params: { refresh: true } }),
    getRelationships: (id: string | number, refresh?: boolean) =>
        api.get<RelationshipsResponse>(`/datasources/${id}/relationships/`, { params: refresh ? { refresh: true } : undefined }),
    // User-defined relationships (Google Sheets / REST)
    listUserRelationships: (id: string | number) =>
        api.get<{ relationships: IndexedRelationship[]; total: number }>(`/datasources/${id}/relationships/user-defined/`),
    createUserRelationship: (id: string | number, data: RelationshipDefinition) =>
        api.post<{ index: number; relationship: RelationshipDefinition }>(`/datasources/${id}/relationships/`, data),
    updateUserRelationship: (id: string | number, index: number, data: RelationshipDefinition) =>
        api.put<{ index: number; relationship: RelationshipDefinition }>(`/datasources/${id}/relationships/${index}/`, data),
    deleteUserRelationship: (id: string | number, index: number) =>
        api.delete<{ success: boolean }>(`/datasources/${id}/relationships/${index}/`),
    searchDatasource: (id: string | number, q: string, detailed?: boolean, limit?: number) =>
        api.get<SearchMatch[]>(`/datasources/${id}/search`, { params: { q, detailed, limit } }),
    searchAll: (q: string, detailed?: boolean, limit?: number) =>
        api.get<SearchMatch[]>('/datasources/search-all/', { params: { q, detailed, limit } }),
    saveSession: (id: string | number, table: string, data: any) =>
        api.post(`/datasources/${id}/tables/${table}/session/`, data),
    getSession: (id: string | number, table: string) =>
        api.get<any>(`/datasources/${id}/tables/${table}/session/`),
    clearSession: (id: string | number, table: string) =>
        api.delete(`/datasources/${id}/tables/${table}/session/`),

    // Google Sheets add-on connect flow
    issueSheetsConnect: (datasourceId?: string) =>
        api.post<{ token: string; addonInstallUrl: string; expiresAt: string }>(
            '/datasources/sheets/connect/issue/',
            datasourceId ? { datasource_id: datasourceId } : {}
        ),
    sheetsConnectStatus: (token: string) =>
        api.get<{ connected: boolean; accountId?: string; spreadsheetName?: string }>(
            '/datasources/sheets/connect/status/',
            { params: { token } }
        ),
}

export const viewsApi = {
    list: (datasourceId: string | number) => api.get<DatasourceView[]>(`/datasources/${datasourceId}/views/`),
    create: (datasourceId: string | number, data: Partial<DatasourceView>) => api.post<DatasourceView>(`/datasources/${datasourceId}/views/`, data),
    update: (id: string, data: Partial<DatasourceView>) => api.patch<DatasourceView>(`/views/${id}/`, data),
    delete: (id: string) => api.delete(`/views/${id}/`),
    patchRecord: (viewId: string, record: any, keyColumn: string = 'id') =>
        api.patch(`/views/${viewId}/records`, record, { params: { key_column: keyColumn } }),
    trigger: (viewId: string, payload: any) =>
        api.post<{ success: boolean; message: string; data: any }>(`/views/${viewId}/trigger/`, payload),
}
