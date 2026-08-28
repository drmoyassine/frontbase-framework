import { useState, useMemo, useEffect } from 'react';
import { SearchResult } from '../../types/data-preview';
import { datasourcesApi } from '../../api';

interface UseDataPreviewFiltersProps {
    initialFilters?: { field: string; operator: string; value: string }[];
    datasourceId?: number | string;
    datasourceName?: string;
    showDataSearchResults: boolean;
    data: any;
    availableFields: string[];
}

export const useDataPreviewFilters = ({
    initialFilters,
    datasourceId,
    datasourceName,
    showDataSearchResults,
    data,
    availableFields
}: UseDataPreviewFiltersProps) => {
    // State
    const [filters, setFilters] = useState<{ field: string; operator: string; value: string }[]>(initialFilters || []);
    const [appliedFilters, setAppliedFilters] = useState<{ field: string; operator: string; value: string }[]>(initialFilters || []);
    const [globalSearch, setGlobalSearch] = useState('');
    const [dataSearchQuery, setDataSearchQuery] = useState('');
    const [globalSearchStatus, setGlobalSearchStatus] = useState<'idle' | 'searching_datasource' | 'searching_all'>('idle');
    const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);

    // Match Navigation
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [allMatches, setAllMatches] = useState<{ colKey: string; rowIndex: number }[]>([]);

    // Filter Logic
    const filteredRecords = useMemo(() => {
        if (!data?.records) return [];

        // 1. Apply column filters
        let results = data.records;
        if (filters.length > 0) {
            results = results.filter((record: any) => {
                return filters.every(f => {
                    if (!f.field) return true;
                    // Allow empty value only for is_empty/is_not_empty
                    if (f.value === '' && !['is_empty', 'is_not_empty'].includes(f.operator)) return true;

                    const val = record[f.field];
                    const recordVal = String(val ?? '').toLowerCase();
                    const filterVal = f.value.toLowerCase();

                    switch (f.operator) {
                        case '==': return recordVal === filterVal;
                        case '!=': return recordVal !== filterVal;
                        case '>': return Number(val) > Number(f.value);
                        case '<': return Number(val) < Number(f.value);
                        case 'contains': return recordVal.includes(filterVal);
                        case 'not_contains': return !recordVal.includes(filterVal);
                        case 'is_empty': return val === null || val === undefined || String(val).trim() === '';
                        case 'is_not_empty': return val !== null && val !== undefined && String(val).trim() !== '';
                        case 'in': {
                            const list = f.value.split(',').map(v => v.trim().toLowerCase());
                            return list.includes(recordVal);
                        }
                        case 'not_in': {
                            const list = f.value.split(',').map(v => v.trim().toLowerCase());
                            return !list.includes(recordVal);
                        }
                        default: return true;
                    }
                });
            });
        }

        // 2. Apply global full-text search
        if (globalSearch.trim()) {
            const searchLower = globalSearch.toLowerCase();
            results = results.filter((record: any) => {
                return Object.values(record).some(val => {
                    const stringVal = typeof val === 'object' && val !== null
                        ? JSON.stringify(val)
                        : String(val ?? '');
                    return stringVal.toLowerCase().includes(searchLower);
                });
            });
        }

        return results;
    }, [data, filters, globalSearch]);

    // Calculate all matches for navigation
    useEffect(() => {
        if (!globalSearch || filteredRecords.length === 0) {
            setAllMatches([]);
            setCurrentMatchIndex(0);
            return;
        }

        const matches: { colKey: string; rowIndex: number }[] = [];
        const searchLower = globalSearch.toLowerCase();

        // Get fields from the first record to avoid circular dependency with availableFields
        const recordFields = filteredRecords[0] ? Object.keys(filteredRecords[0]) : [];

        filteredRecords.forEach((record: any, rowIndex: number) => {
            recordFields.forEach(colKey => {
                const val = record[colKey];
                const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                if (strVal.toLowerCase().includes(searchLower)) {
                    matches.push({ colKey, rowIndex });
                }
            });
        });
        setAllMatches(matches);
        setCurrentMatchIndex(0);
    }, [globalSearch, filteredRecords]); // Only depend on globalSearch and filteredRecords

    // Actions
    const addFilter = () => setFilters([...filters, { field: '', operator: '==', value: '' }]);
    const removeFilter = (index: number) => setFilters(filters.filter((_, i) => i !== index));
    const updateFilter = (index: number, f_key: 'field' | 'operator' | 'value', value: string) => {
        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], [f_key]: value };
        setFilters(newFilters);
    };

    const runRemoteSearch = () => {
        const finalFilters = [...filters];
        if (globalSearch.trim()) {
            finalFilters.push({ field: 'search', operator: 'contains', value: globalSearch });
            setGlobalSearch('');
            setFilters(finalFilters);
        }
        setAppliedFilters(finalFilters);
    };

    const searchOtherCollections = async () => {
        if (!globalSearch.trim()) return;
        setGlobalSearchStatus('searching_datasource');
        try {
            const response = await datasourcesApi.searchDatasource(datasourceId!, globalSearch);
            const counts = response.data.reduce((acc: any, m: any) => {
                acc[m.table] = (acc[m.table] || 0) + 1;
                return acc;
            }, {});
            const summary = Object.entries(counts).map(([table, count]) => ({
                table,
                count: count as number,
                datasource_name: datasourceName || '',
                datasource_id: String(datasourceId)
            }));
            setGlobalResults(summary as any);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setGlobalSearchStatus('idle');
        }
    };

    const searchAllDatasources = async () => {
        if (!globalSearch.trim()) return;
        setGlobalSearchStatus('searching_all');
        try {
            const response = await datasourcesApi.searchAll(globalSearch);
            const groups = response.data.reduce((acc: any, m: any) => {
                const key = `${m.datasource_name}:${m.table}`;
                if (!acc[key]) acc[key] = { datasource_name: m.datasource_name, table: m.table, count: 0 };
                acc[key].count++;
                return acc;
            }, {});
            setGlobalResults(Object.values(groups) as any);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setGlobalSearchStatus('idle');
        }
    };

    const handleNextMatch = (scrollToColumn: (col: string) => void, setActiveRecord?: (record: any) => void) => {
        if (allMatches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % allMatches.length;
        setCurrentMatchIndex(nextIndex);
        const match = allMatches[nextIndex];

        if (setActiveRecord) {
            const recordAtMatch = filteredRecords[match.rowIndex];
            if (recordAtMatch) setActiveRecord(recordAtMatch);
        }

        scrollToColumn(match.colKey);
    };

    const handlePrevMatch = (scrollToColumn: (col: string) => void, setActiveRecord?: (record: any) => void) => {
        if (allMatches.length === 0) return;
        const prevIndex = (currentMatchIndex - 1 + allMatches.length) % allMatches.length;
        setCurrentMatchIndex(prevIndex);
        const match = allMatches[prevIndex];

        if (setActiveRecord) {
            const recordAtMatch = filteredRecords[match.rowIndex];
            if (recordAtMatch) setActiveRecord(recordAtMatch);
        }

        scrollToColumn(match.colKey);
    };

    return {
        filters, setFilters,
        appliedFilters, setAppliedFilters,
        globalSearch, setGlobalSearch,
        dataSearchQuery, setDataSearchQuery,
        globalSearchStatus, setGlobalSearchStatus,
        globalResults, setGlobalResults,
        filteredRecords,
        currentMatchIndex, setCurrentMatchIndex,
        allMatches, setAllMatches,
        addFilter, removeFilter, updateFilter,
        runRemoteSearch, searchOtherCollections, searchAllDatasources,
        handleNextMatch, handlePrevMatch
    };
};
