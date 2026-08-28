/**
 * useDynamicOptions - Fetches dynamic options for select fields
 * 
 * Handles 'datasources' and 'tables' dynamic option types.
 */

import { useState, useEffect } from 'react';
import { datasourcesApi } from '@/modules/dbsync/api/datasources';

interface SelectOption {
    value: string;
    label: string;
}

interface UseDynamicOptionsResult {
    options: SelectOption[];
    loading: boolean;
    error: string | null;
}

export function useDynamicOptions(
    optionType: string | SelectOption[] | undefined,
    dependsOnValue?: string // e.g., selected datasource ID for fetching tables
): UseDynamicOptionsResult {
    const [options, setOptions] = useState<SelectOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If options is already an array, use it directly
        if (Array.isArray(optionType)) {
            setOptions(optionType);
            return;
        }

        // If no option type or it's an empty string, return empty
        if (!optionType) {
            setOptions([]);
            return;
        }

        const fetchOptions = async () => {
            setLoading(true);
            setError(null);

            try {
                switch (optionType) {
                    case 'datasources': {
                        const response = await datasourcesApi.list();
                        const datasources = response.data || [];
                        setOptions(
                            datasources.map((ds: any) => ({
                                value: String(ds.id),
                                label: ds.name,
                            }))
                        );
                        break;
                    }

                    case 'tables': {
                        if (!dependsOnValue) {
                            setOptions([]);
                            return;
                        }
                        const response = await datasourcesApi.getTables(dependsOnValue);
                        const tables = response.data || [];
                        setOptions(
                            tables.map((table: string) => ({
                                value: table,
                                label: table,
                            }))
                        );
                        break;
                    }

                    default:
                        setOptions([]);
                }
            } catch (err: any) {
                console.error('Failed to fetch dynamic options:', err);
                setError(err.message || 'Failed to fetch options');
                setOptions([]);
            } finally {
                setLoading(false);
            }
        };

        fetchOptions();
    }, [optionType, dependsOnValue]);

    return { options, loading, error };
}
