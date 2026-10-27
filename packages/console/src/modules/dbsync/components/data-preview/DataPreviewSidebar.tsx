import React from 'react';
import { ChevronDown, Table, RefreshCw } from 'lucide-react';
import { useMutation, UseMutationResult } from '@tanstack/react-query';

interface DataPreviewSidebarProps {
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    tableSearch: string;
    setTableSearch: (search: string) => void;
    refreshSchemaMutation: UseMutationResult<any, any, void, unknown>;
    selectedTable?: string;
    tables: string[];
    setSelectedTable: (table: string) => void;
    handleManualUpdate: () => void;
    groupedMatches: Record<string, number>;
}

export const DataPreviewSidebar = ({
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    tableSearch,
    setTableSearch,
    refreshSchemaMutation,
    selectedTable,
    tables,
    setSelectedTable,
    handleManualUpdate,
    groupedMatches
}: DataPreviewSidebarProps) => {
    return (
        <div className={`${isSidebarCollapsed ? 'w-10' : 'w-64'} transition-all duration-300 border-r border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10 flex flex-col overflow-hidden relative group/sidebar`}>
            <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="absolute right-2 top-2 z-10 p-1 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-100 dark:border-gray-700 text-gray-400 hover:text-primary-600 transition-all opacity-50 hover:opacity-100"
            >
                <ChevronDown className={`w-3 h-3 transition-transform ${isSidebarCollapsed ? '-rotate-90' : 'rotate-90'} `} />
            </button>

            {!isSidebarCollapsed && (
                <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="relative font-sans">
                        <Table className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter tables..."
                            value={tableSearch}
                            onChange={(e) => setTableSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <button
                            onClick={() => refreshSchemaMutation.mutate()}
                            disabled={!selectedTable || refreshSchemaMutation.isPending}
                            className="absolute right-2 top-2.5 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                            title="Refresh current table schema"
                        >
                            <RefreshCw className={`w-3 h-3 ${refreshSchemaMutation.isPending ? 'animate-spin' : ''} `} />
                        </button>
                    </div>
                </div>
            )}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {tables?.filter((t: string) => !isSidebarCollapsed && t.toLowerCase().includes(tableSearch.toLowerCase())).map((t: string) => (
                    <button
                        key={t}
                        onClick={() => {
                            setSelectedTable(t);
                            setTimeout(handleManualUpdate, 0);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-all ${selectedTable === t
                            ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100'
                            : 'text-gray-600 hover:bg-white hover:shadow-sm hover:text-gray-900 border border-transparent'
                            }`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            <Table size={12} className={selectedTable === t ? 'text-primary-500' : 'text-gray-400'} />
                            <span className="truncate">{t}</span>
                        </div>
                        {groupedMatches[t] > 0 && (
                            <span className="bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full text-[9px] font-bold">
                                {groupedMatches[t]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};
