import { useState, useEffect } from 'react';
import { databaseApi } from '@/services/database-api';
import { UserContactConfig } from '@/types/builder';

export const useFilterOptions = (config: UserContactConfig | null, isConfigured: boolean) => {
    const [filterOptions, setFilterOptions] = useState<Record<string, string[]>>({});

    useEffect(() => {
        if (!config?.frontendFilters || !isConfigured || !config?.columnMapping) return;

        const fetchOptions = async () => {
            const newOptions: Record<string, string[]> = {};

            for (const filter of config.frontendFilters || []) {
                if ((filter.filterType === 'dropdown' || filter.filterType === 'multiselect') && filter.column) {
                    try {
                        // Determine join parameters based on column type
                        let rpcParams: any = {};

                        if (filter.column.startsWith('auth_') || filter.column === 'last_sign_in_at') {
                            // Fetching from Auth, joined with Contacts
                            // Target: auth.users (email/created_at)
                            // Join: contacts (auth_user_id)
                            const colName = filter.column === 'auth_email' ? 'email' : filter.column.replace('auth_', '');
                            rpcParams = {
                                target_table: 'auth.users',
                                target_col: colName,
                                join_table: config.contactsTable,
                                target_join_col: 'id', // auth.users.id
                                join_table_col: config.columnMapping.authUserIdColumn // contacts.auth_user_id
                            };
                        } else {
                            // Fetching from Contacts, joined with Auth
                            // Target: contacts (status/role)
                            // Join: auth.users (id)
                            // Logic: distinct contact.col inner join auth on contact.auth_id = auth.id
                            rpcParams = {
                                target_table: config.contactsTable,
                                target_col: filter.column,
                                join_table: 'auth.users',
                                target_join_col: config.columnMapping.authUserIdColumn, // contacts.auth_user_id
                                join_table_col: 'id' // auth.users.id
                            };
                        }

                        const result = await databaseApi.advancedQuery('frontbase_get_distinct_values', rpcParams);

                        if (result.success && result.rows) {
                            // Result can be flat array of strings/numbers or array of objects depending on RPC
                            // parse safely
                            const values = result.rows.map((row: any) => {
                                if (typeof row === 'object' && row !== null) {
                                    // If object, try 'val' property (from alias) or first value
                                    return row.val || Object.values(row)[0];
                                }
                                return row;
                            }).filter((v: any) => v !== null && v !== undefined && v !== '');

                            newOptions[filter.id] = values as string[];
                        }
                    } catch (e) {
                        console.error('Failed to fetch options for', filter.column, e);
                    }
                }
            }
            setFilterOptions(newOptions);
        };

        fetchOptions();
    }, [config?.frontendFilters, config?.contactsTable, isConfigured]);

    return filterOptions;
};
