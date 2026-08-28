import React from 'react';
import { Search, Plus, Trash2, Filter, ChevronDown, RefreshCw, X } from 'lucide-react';
import { ColumnsDropdown } from './ColumnsDropdown';

interface DataPreviewToolbarProps {
    filters: { field: string; operator: string; value: string }[];
    updateFilter: (index: number, f_key: 'field' | 'operator' | 'value', value: string) => void;
    removeFilter: (index: number) => void;
    addFilter: () => void;
    setAppliedFilters: (filters: any[]) => void;
    availableFields: string[];
    recordCount: number;
    totalRecords: number;
    globalSearch: string;
    setGlobalSearch: (search: string) => void;
    allMatches: { colKey: string; rowIndex: number }[];
    currentMatchIndex: number;
    handlePrevMatch: (scrollToColumn: (col: string) => void) => void;
    handleNextMatch: (scrollToColumn: (col: string) => void) => void;
    scrollToColumn: (col: string) => void;
    isColumnsDropdownOpen: boolean;
    setIsColumnsDropdownOpen: (open: boolean) => void;
    columnSearch: string;
    setColumnSearch: (search: string) => void;
    availableTableFields: string[];
    visibleColumns: string[];
    toggleVisibility: (col: string) => void;
    setVisibleColumns: (cols: string[]) => void;
    pinnedColumns: string[];
    columnOrder: string[];
    togglePin: (col: string) => void;
    setColumnOrder: (order: string[]) => void;
}

export const DataPreviewToolbar = ({
    filters,
    updateFilter,
    removeFilter,
    addFilter,
    setAppliedFilters,
    availableFields,
    recordCount,
    totalRecords,
    globalSearch,
    setGlobalSearch,
    allMatches,
    currentMatchIndex,
    handlePrevMatch,
    handleNextMatch,
    scrollToColumn,
    isColumnsDropdownOpen,
    setIsColumnsDropdownOpen,
    columnSearch,
    setColumnSearch,
    availableTableFields,
    visibleColumns,
    toggleVisibility,
    setVisibleColumns,
    pinnedColumns,
    columnOrder,
    togglePin,
    setColumnOrder
}: DataPreviewToolbarProps) => {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gray-50/50 dark:bg-gray-900/10 border-b border-gray-100 dark:border-gray-700">
            {/* Left: Filters */}
            <div className="flex flex-wrap items-center gap-2">
                {filters.map((filter, index) => (
                    <div key={index} className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded border border-gray-200 shadow-sm animate-in fade-in slide-in-from-left-2">
                        <select
                            value={filter.field}
                            onChange={(e) => updateFilter(index, 'field', e.target.value)}
                            className="px-2 py-1 text-[10px] bg-transparent outline-none font-medium min-w-[80px]"
                        >
                            <option value="">Select Field...</option>
                            {availableFields.map(f => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                        <select
                            value={filter.operator}
                            onChange={(e) => updateFilter(index, 'operator', e.target.value)}
                            className="px-1 py-1 text-[10px] font-mono text-primary-600 bg-gray-50 dark:bg-gray-900 rounded"
                        >
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                            <option value=">">{`>`}</option>
                            <option value="<">{'<'}</option>
                            <option value="contains">contains</option>
                            <option value="not_contains">does not contain</option>
                            <option value="in">in list</option>
                            <option value="not_in">not in list</option>
                            <option value="is_empty">is empty</option>
                            <option value="is_not_empty">is not empty</option>
                        </select>
                        {!['is_empty', 'is_not_empty'].includes(filter.operator) && (
                            <input
                                type="text"
                                placeholder="Value"
                                value={filter.value}
                                onChange={(e) => updateFilter(index, 'value', e.target.value)}
                                className="w-24 px-2 py-1 text-[10px] outline-none border-l border-gray-100 pl-2"
                            />
                        )}
                        <button onClick={() => removeFilter(index)} className="p-1 hover:text-red-500 rounded text-gray-400">
                            <Trash2 size={10} />
                        </button>
                    </div>
                ))}
                <button
                    onClick={addFilter}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 border-dashed rounded-lg text-xs font-medium text-gray-500 hover:text-primary-600 transition-all"
                >
                    <Plus size={12} />
                    Add Filter
                </button>
                {filters.length > 0 && (
                    <button
                        onClick={() => setAppliedFilters([...filters])}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                        <Filter size={12} />
                        Apply Filters
                    </button>
                )}
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-3 ml-auto">

                <div className="relative group/search">
                    <Search className="absolute left-2.5 top-1.5 w-3.5 h-3.5 text-gray-400 group-focus-within/search:text-primary-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search current page..."
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        className="pl-8 pr-16 py-1.5 w-48 focus:w-64 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-400 transition-all outline-none"
                    />
                    {globalSearch && (
                        <div className="absolute right-1 top-1 flex items-center gap-0.5 bg-gray-50 dark:bg-gray-700 rounded p-0.5">
                            <button
                                onClick={() => handlePrevMatch(scrollToColumn)}
                                disabled={allMatches.length === 0}
                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-30"
                            >
                                <ChevronDown className="w-3 h-3 rotate-180" />
                            </button>
                            <span className="text-[9px] font-mono min-w-[2.5em] text-center text-gray-500">
                                {allMatches.length > 0 ? `${currentMatchIndex + 1}/${allMatches.length}` : '0/0'}
                            </span>
                            <button
                                onClick={() => handleNextMatch(scrollToColumn)}
                                disabled={allMatches.length === 0}
                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-30"
                            >
                                <ChevronDown className="w-3 h-3" />
                            </button>
                            <button
                                onClick={() => setGlobalSearch('')}
                                className="p-0.5 hover:bg-red-100 text-gray-400 hover:text-red-500 rounded"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    )}
                </div>

                <ColumnsDropdown
                    isColumnsDropdownOpen={isColumnsDropdownOpen}
                    setIsColumnsDropdownOpen={setIsColumnsDropdownOpen}
                    columnSearch={columnSearch}
                    setColumnSearch={setColumnSearch}
                    availableFields={availableTableFields}
                    visibleColumns={visibleColumns}
                    toggleVisibility={(col) => toggleVisibility(col)}
                    setVisibleColumns={setVisibleColumns}
                    tableData={null}
                    pinnedColumns={pinnedColumns}
                    columnOrder={columnOrder}
                    togglePin={togglePin}
                    setColumnOrder={setColumnOrder}
                />
            </div>
        </div>
    );
};
