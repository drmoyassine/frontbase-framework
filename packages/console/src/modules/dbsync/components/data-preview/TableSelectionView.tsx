import React from 'react';
import { Table, Search, Loader2, ChevronRight, X, RefreshCw } from 'lucide-react';

interface TableSelectionViewProps {
    tableSearch: string;
    setTableSearch: (search: string) => void;
    dataSearchQuery: string;
    setDataSearchQuery: (query: string) => void;
    handleDataSearch: () => void;
    isDataSearching: boolean;
    showDataSearchResults: boolean;
    setShowDataSearchResults: (show: boolean) => void;
    filteredTables: string[];
    groupedMatches: Record<string, number>;
    setSelectedTable: (table: string) => void;
    setCurrentStep: (step: 'tables' | 'records') => void;
    setGlobalSearch: (search: string) => void;
    setAppliedFilters: (filters: any[]) => void;
    setFilters: (filters: any[]) => void;
}

export const TableSelectionView: React.FC<TableSelectionViewProps> = ({
    tableSearch,
    setTableSearch,
    dataSearchQuery,
    setDataSearchQuery,
    handleDataSearch,
    isDataSearching,
    showDataSearchResults,
    setShowDataSearchResults,
    filteredTables,
    groupedMatches,
    setSelectedTable,
    setCurrentStep,
    setGlobalSearch,
    setAppliedFilters,
    setFilters,
}) => {
    return (
        <div className="flex-1 p-6 space-y-4 overflow-y-auto font-sans">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Search Datasource</h4>
                <div className="flex items-center gap-3">
                    <div className="relative group/search">
                        <Table className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-focus-within/search:text-primary-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Search Tables..."
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all w-48 shadow-sm"
                        />
                    </div>
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                    <div className="relative flex items-center">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search Data..."
                            value={dataSearchQuery}
                            onChange={(e) => setDataSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleDataSearch()}
                            className="pl-9 pr-12 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all w-64 shadow-sm"
                        />
                        <button
                            onClick={handleDataSearch}
                            disabled={isDataSearching || !dataSearchQuery.trim()}
                            className="absolute right-1 p-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-all"
                        >
                            {isDataSearching ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                        </button>
                    </div>
                    {showDataSearchResults && (
                        <button
                            onClick={() => {
                                setShowDataSearchResults(false);
                                setDataSearchQuery('');
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
                            title="Clear Results"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTables.map((t: string) => {
                    const matchCount = groupedMatches[t];
                    return (
                        <button
                            key={t}
                            onClick={() => {
                                setSelectedTable(t);
                                setCurrentStep('records');
                                // If we have a global search, apply it as a filter
                                if (showDataSearchResults && dataSearchQuery.trim()) {
                                    setGlobalSearch(dataSearchQuery);
                                    setAppliedFilters([{ field: 'search', operator: 'contains', value: dataSearchQuery }]);
                                } else {
                                    setFilters([]);
                                }
                            }}
                            className="group flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-primary-500 hover:shadow-lg transition-all text-left relative overflow-hidden"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center text-gray-400 group-hover:text-primary-500 group-hover:bg-primary-50 transition-colors">
                                    <Table size={20} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-gray-900 dark:text-white">{t}</div>
                                    <div className="text-[10px] text-gray-500">Table/Collection</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {matchCount !== undefined && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-primary-600 text-white rounded-full text-[10px] font-bold animate-in zoom-in duration-300">
                                        <Search size={10} />
                                        {matchCount}
                                    </div>
                                )}
                                <RefreshCw className="w-4 h-4 text-gray-300 group-hover:text-primary-500 group-hover:rotate-180 transition-all duration-500" />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div >
    );
};
