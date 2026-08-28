import { useMemo } from 'react';
import { UserContactConfig } from '@/types/builder';
import { ComponentDataBinding } from '@/hooks/data/useSimpleData';

export const useUserTableBinding = (
    config: UserContactConfig | null,
    isConfigured: boolean,
    filterOptions: Record<string, string[]>
): ComponentDataBinding | null => {
    return useMemo(() => {
        if (!isConfigured || !config || !config.columnMapping) return null;

        const createdAtCol = config.columnMapping.createdAtColumn || 'created_at';

        // Base Overrides
        const baseOverrides = {
            // Auth Columns from RPC
            'auth_email': {
                displayName: 'Auth Email',
                width: 250,
                sortable: true,
                hidden: false
            },
            'auth_created_at': {
                displayName: 'Joined (Auth)',
                width: 180,
                sortable: true,
                hidden: false,
                displayType: 'date',
                dateFormat: 'relative'
            },
            'last_sign_in_at': {
                displayName: 'Last Login',
                width: 180,
                sortable: true,
                hidden: false,
                displayType: 'date',
                dateFormat: 'relative'
            },

            // Mapped Columns from Contacts Table
            [config.columnMapping.authUserIdColumn]: {
                hidden: true,
                displayName: 'Auth Link ID',
                width: 200
            },
            [config.columnMapping.contactIdColumn]: {
                hidden: true,
                displayName: 'Contact ID',
                isPrimaryKey: true
            },
            [createdAtCol]: {
                displayName: 'Contact Created',
                hidden: true, // Prefer Auth created_at
                width: 150,
                sortable: true
            }
        };

        // User Saved Overrides (merge deeply/safely)
        const savedOverrides = config.columnOverrides || {};
        const mergedOverrides = { ...baseOverrides, ...savedOverrides };

        // Inject options into filters
        const enrichedFilters = (config.frontendFilters || []).map((f: any) => ({
            ...f,
            options: filterOptions[f.id] || undefined
        }));

        return {
            componentId: 'user-management-table',
            tableName: config.contactsTable,
            dataSourceId: 'backend',
            rpcName: 'frontbase_get_users_list',
            params: {
                table_name: config.contactsTable,
                auth_id_col: config.columnMapping.authUserIdColumn
            },
            query: {
                table: config.contactsTable,
                select: '*',
                filters: [],
                orderBy: [{ column: 'created_at', ascending: false }]
            },
            columnOverrides: mergedOverrides,
            columnOrder: config.columnOrder, // Use saved order if exists
            frontendFilters: enrichedFilters, // Use filters with options
            pagination: {
                pageSize: 10,
                enabled: true,
                page: 1
            },
            sorting: { enabled: true, defaultSort: [{ column: createdAtCol, direction: 'desc' }] },
            filtering: { searchEnabled: true, filters: {} },
            refreshInterval: 30000,
        };
    }, [config, isConfigured, filterOptions]);
};
