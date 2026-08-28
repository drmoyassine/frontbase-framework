import { SearchResult } from '../../types/data-preview';
import { Search, Database, Globe, CheckCircle, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import React from 'react';

interface SearchBannersProps {
    globalSearch: string;
    filteredRecords: any[];
    isLoading: boolean;
    selectedTable: string;
    datasourceName: string;
    globalSearchStatus: 'idle' | 'searching_datasource' | 'searching_all';

    runRemoteSearch: () => void;
    searchOtherCollections: () => Promise<void>;
    searchAllDatasources: () => Promise<void>;

    globalResults: SearchResult[];
    setSelectedTable: (table: string) => void;
    setGlobalResults: (results: SearchResult[]) => void;
    setFilters: (filters: any[]) => void;
    setAppliedFilters: (filters: any[]) => void;
    setGlobalSearch: (search: string) => void;
}

export const SearchBanners: React.FC<SearchBannersProps> = ({
    globalSearch,
    filteredRecords,
    isLoading,
    selectedTable,
    datasourceName,
    globalSearchStatus,
    runRemoteSearch,
    searchOtherCollections,
    searchAllDatasources,
    globalResults,
    setSelectedTable,
    setGlobalResults,
    setFilters,
    setAppliedFilters,
    setGlobalSearch
}) => {
    return (
        <>
            {/* No local results banner */}
            {/* Tiered Search Banners */}
            {globalSearch && filteredRecords.length === 0 && !isLoading && (
                <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-2">
                    {/* Tier 1: Local Table Search (Already no results) */}
                    <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-lg text-primary-600">
                                <Search className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-primary-900 dark:text-primary-100 leading-none">No matches in <u>{selectedTable}</u></p>
                                <p className="text-[10px] text-primary-600 mt-1">Shall we query the datasource for "{globalSearch}"?</p>
                            </div>
                        </div>
                        {/* handleNextMatch is a function expecting `scrollToColumn`, so we use the wrapper */}
                        <button
                            onClick={runRemoteSearch}
                            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-primary-500/20 transition-all flex items-center gap-2"
                        >
                            <RefreshCw size={14} /> Run <u>{selectedTable}</u> Search
                        </button>
                    </div>

                    {/* Tier 2: Search Other Collections in this Datasource */}
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 rounded-xl flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg text-orange-600">
                                <Database className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-orange-900 dark:text-orange-100 leading-none">Search all collections in <u>{datasourceName}</u></p>
                                <p className="text-[10px] text-orange-600 mt-1">Look for "{globalSearch}" across all tables in this datasource.</p>
                            </div>
                        </div>
                        <button
                            onClick={searchOtherCollections}
                            disabled={globalSearchStatus !== 'idle'}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 group"
                        >
                            {globalSearchStatus === 'searching_datasource' ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />}
                            Search Datasource
                        </button>
                    </div>

                    {/* Tier 3: Search All Datasources */}
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg text-purple-600">
                                <Globe className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-purple-900 dark:text-purple-100 leading-none">Search all datasources</p>
                                <p className="text-[10px] text-purple-600 mt-1">Experimental: Scan every connected source for "{globalSearch}".</p>
                            </div>
                        </div>
                        <button
                            onClick={searchAllDatasources}
                            disabled={globalSearchStatus !== 'idle'}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2 group"
                        >
                            {globalSearchStatus === 'searching_all' ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                            Global Search
                        </button>
                    </div>

                    {/* Global Results Display */}
                    {globalResults.length > 0 && (
                        <div className="mt-4 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm">
                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                                <CheckCircle size={12} className="text-green-500" />
                                Matches found in other locations:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {globalResults.map((res, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            // If it's another table in the same datasource, we can just switch
                                            // If it's a different datasource, we might need more logic or just stay here
                                            setSelectedTable(res.table);
                                            setGlobalResults([]);
                                            setFilters([]);
                                            // Trigger actual search on new table
                                            setAppliedFilters([{ field: 'search', operator: 'contains', value: globalSearch }]);
                                            // We need to pass the search string back if needed, but logic handles it
                                            setGlobalSearch(globalSearch);
                                        }}
                                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900/30 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg text-left transition-all border border-transparent hover:border-primary-200"
                                    >
                                        <div className="truncate">
                                            <div className="text-[10px] font-bold text-gray-700 dark:text-gray-200 truncate">{res.table}</div>
                                            <div className="text-[8px] text-gray-400 capitalize">{res.datasource_name}</div>
                                        </div>
                                        <span className="text-[10px] font-bold text-primary-600 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded shadow-sm">
                                            {res.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};
