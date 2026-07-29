/**
 * CF-22 Work A — Shared response shapes for `/api/sync/*` DB-Synchronizer handlers.
 * Ensures strict agreement with components.schemas in openapi.community.json.
 */

export function serializeDatasource(ds: {
    id: string;
    name: string;
    kind: string;
    created_at: string;
    updated_at: string;
}): Record<string, unknown> {
    return {
        id: ds.id,
        name: ds.name,
        project_id: null,
        type: ds.kind, // Spec mandates `type`, not `kind`
        host: null,
        port: 5432,
        database: null,
        username: null,
        api_url: null,
        table_prefix: 'wp_',
        is_active: true,
        last_tested_at: null,
        last_test_success: null,
        created_at: ds.created_at,
        updated_at: ds.updated_at,
        extra_config: null,
        views: [],
    };
}

export function serializeDatasourceView(v: {
    id: string;
    datasource_id: string;
    name: string;
    target_table: string;
    visible_columns: string[] | null;
    column_order: string[] | null;
    pinned_columns: string[] | null;
    filters: unknown[] | null;
    field_mappings: Record<string, unknown> | null;
    webhooks: unknown[] | null;
    linked_views: Record<string, unknown> | null;
    description: string | null;
    created_at: string;
    updated_at: string;
}): Record<string, unknown> {
    return {
        id: v.id,
        datasource_id: v.datasource_id,
        name: v.name,
        target_table: v.target_table,
        visible_columns: v.visible_columns ?? [],
        column_order: v.column_order ?? [],
        pinned_columns: v.pinned_columns ?? [],
        filters: v.filters ?? [],
        field_mappings: v.field_mappings ?? {},
        webhooks: v.webhooks ?? [],
        linked_views: v.linked_views ?? {},
        description: v.description ?? null,
        created_at: v.created_at,
        updated_at: v.updated_at,
    };
}
