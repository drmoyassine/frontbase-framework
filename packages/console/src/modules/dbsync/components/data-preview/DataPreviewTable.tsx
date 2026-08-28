import React from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Loader2, AlertCircle, GripHorizontal, Pin, EyeOff, CheckCircle, Database, ChevronRight, Globe, RefreshCw, Pencil } from 'lucide-react';

interface DataPreviewTableProps {
    data: any;
    isLoading: boolean;
    isSessionLoading: boolean;
    error: any;
    tableColumns: string[];
    setColumnOrder: (order: string[]) => void;
    pinnedColumns: string[];
    togglePin: (col: string) => void;
    toggleVisibility: (col: string, allFields: string[]) => void;
    availableFields: string[];
    filteredRecords: any[];
    globalSearch: string;
    allMatches: { colKey: string; rowIndex: number }[];
    currentMatchIndex: number;
    setEditingRecord: (record: any) => void;
    setActiveTab: (tab: 'table' | 'record' | 'linked' | 'api' | 'webhooks' | 'relationships') => void;
    globalSearchStatus: 'idle' | 'searching_datasource' | 'searching_all';
    globalResults: { datasource_name: string; table: string; count: number }[];
    setGlobalResults: (results: any[]) => void;
    setFilters: (filters: any[]) => void;
    setAppliedFilters: (filters: any[]) => void;
    setSelectedTable: (table: string) => void;
    searchOtherCollections: () => void;
    searchAllDatasources: () => void;
    datasourceName?: string;
    selectedTable?: string;
    showDataSearchResults: boolean;
    setShowDataSearchResults: (show: boolean) => void;
}

const SortableTableHeader = ({
    columnKey,
    columnMatches,
    isPinned,
    isActiveMatch,
    leftOffset,
    onHide,
    onPinToggle
}: {
    columnKey: string;
    columnMatches: boolean;
    isPinned: boolean;
    isActiveMatch: boolean;
    leftOffset?: number;
    onHide: (e: React.MouseEvent) => void;
    onPinToggle: (e: React.MouseEvent) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: columnKey });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 50 : (isPinned ? 30 : 'auto'),
        opacity: isDragging ? 0.8 : 1,
        ...(isPinned ? { left: leftOffset, minWidth: '150px', maxWidth: '150px' } : {})
    };

    return (
        <th
            ref={setNodeRef}
            id={`view-col-${columnKey}`}
            data-column-key={columnKey}
            className={`group/th px-4 py-3 text-[10px] font-bold uppercase border-b border-gray-100 whitespace-nowrap transition-all ${isActiveMatch ? 'bg-yellow-100 dark:bg-yellow-900/30' : columnMatches ? 'text-primary-600 bg-primary-50/30' : 'text-gray-400'} ${isPinned ? 'sticky z-30 bg-gray-50 dark:bg-gray-900 border-r border-gray-100/50 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]' : ''}`}
            style={style}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 truncate">
                    <button
                        {...attributes}
                        {...listeners}
                        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                        <GripHorizontal size={10} className="text-gray-400" />
                    </button>
                    <button
                        onClick={onPinToggle}
                        className={`p-0.5 rounded transition-colors ${isPinned ? 'text-orange-500 hover:bg-orange-100' : 'text-gray-300 hover:bg-gray-200 opacity-0 group-hover/th:opacity-100'}`}
                        title={isPinned ? "Unpin Column" : "Pin Column"}
                    >
                        <Pin size={10} className={isPinned ? 'fill-current' : ''} />
                    </button>
                    <span className="truncate">{columnKey}</span>
                </div>
                <button
                    onClick={onHide}
                    className="opacity-0 group-hover/th:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all transition-opacity"
                    title="Hide Column"
                >
                    <EyeOff size={10} />
                </button>
            </div>
        </th>
    );
};

const HighlightMatches: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    if (!query.trim()) return <>{text}</>;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={i} className="bg-yellow-200 dark:bg-yellow-600/30 dark:text-yellow-200 rounded-sm px-0.5 font-bold">
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    );
};

export const DataPreviewTable = ({
    data,
    isLoading,
    isSessionLoading,
    error,
    tableColumns,
    setColumnOrder,
    pinnedColumns,
    togglePin,
    toggleVisibility,
    availableFields,
    filteredRecords,
    globalSearch,
    allMatches,
    currentMatchIndex,
    setEditingRecord,
    setActiveTab,
    globalSearchStatus,
    globalResults,
    setGlobalResults,
    setFilters,
    setAppliedFilters,
    setSelectedTable,
    searchOtherCollections,
    searchAllDatasources,
    datasourceName,
    selectedTable,
    showDataSearchResults,
    setShowDataSearchResults
}: DataPreviewTableProps) => {

    const headerSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleTableHeaderDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = tableColumns.indexOf(active.id as string);
            const newIndex = tableColumns.indexOf(over.id as string);
            const newOrder = arrayMove(tableColumns, oldIndex, newIndex) as string[];
            setColumnOrder(newOrder);
        }
    };

    if (showDataSearchResults && globalSearch?.trim()) {
        return (
            <div className="p-6 space-y-4 h-full overflow-y-auto">
                {/* Tier 1: Search Current Table */}
                <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/40 rounded-lg text-primary-600">
                            <RefreshCw className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-primary-900 dark:text-primary-100 leading-none">Search in <u>{selectedTable}</u></p>
                            <p className="text-[10px] text-primary-600 mt-1">Found {data?.total || 0} matches in current table.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowDataSearchResults(false)}
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
                                        setSelectedTable(res.table);
                                        setGlobalResults([]);
                                        setFilters([]);
                                        setAppliedFilters([{ field: 'search', operator: 'contains', value: globalSearch }]);
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
        );
    }

    if (!data && (isLoading || isSessionLoading)) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <Loader2 className="animate-spin" />
                <p className="text-xs font-bold uppercase tracking-wider opacity-50">{isSessionLoading ? 'Restoring Session...' : 'Refetching Data...'}</p>
            </div>
        );
    }

    if (error) {
        return <div className="h-full flex flex-col items-center justify-center text-red-500 gap-2"><AlertCircle /><p className="text-xs">Error loading data.</p></div>;
    }

    return (
        <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-x-auto bg-white dark:bg-gray-800 table-container">
            <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-30">
                    <tr>
                        <DndContext
                            sensors={headerSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleTableHeaderDragEnd}
                        >
                            <SortableContext
                                items={tableColumns}
                                strategy={horizontalListSortingStrategy}
                            >
                                {tableColumns.map((key, j) => {
                                    // Check if any record's value for this key matches search (handle nested objects)
                                    const columnMatches = globalSearch && data?.records?.some((r: any) => {
                                        const val = r[key];
                                        const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                                        return strVal.toLowerCase().includes(globalSearch.toLowerCase());
                                    });
                                    const isPinned = pinnedColumns.includes(key);
                                    // Since pinned columns are now moved to the front, we calculate offset by its index
                                    const leftOffset = isPinned ? (j * 150) : undefined;

                                    return (
                                        <SortableTableHeader
                                            key={key}
                                            columnKey={key}
                                            columnMatches={!!columnMatches}
                                            isPinned={isPinned}
                                            leftOffset={leftOffset}
                                            isActiveMatch={!!(globalSearch && allMatches[currentMatchIndex]?.colKey === key)}
                                            onHide={(e) => {
                                                e.stopPropagation();
                                                const fields = (availableFields.length > 0 ? availableFields : Object.keys(data?.records?.[0] || {}));
                                                toggleVisibility(key, fields);
                                            }}
                                            onPinToggle={(e) => {
                                                e.stopPropagation();
                                                togglePin(key);
                                            }}
                                        />
                                    );
                                })}
                            </SortableContext>
                        </DndContext>
                    </tr>
                </thead>
                <tbody>
                    {filteredRecords.map((record, i) => (
                        <tr key={i} className="group hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors relative">
                            {tableColumns.map((key, j) => {
                                const displayValue = (() => {
                                    // 1. Try direct flattened key lookup
                                    let val = record[key];

                                    // 2. Fallback to nested lookup (e.g. programs.degree_name -> record.programs.degree_name)
                                    if (val === undefined && key.includes('.')) {
                                        const [table, col] = key.split('.');
                                        val = record[table]?.[col];
                                    }
                                    return val;
                                })();

                                // Resolve FK display value when this column has a user-defined
                                // display_column (e.g. show "Lincoln High" instead of school id).
                                const fk = data?.fk_columns?.[key];
                                const resolved = fk && displayValue != null ? fk.lookup?.[String(displayValue)] : undefined;
                                const strVal = resolved != null
                                    ? (typeof resolved === 'object' && resolved !== null ? JSON.stringify(resolved) : String(resolved))
                                    : (typeof displayValue === 'object' && displayValue !== null ? JSON.stringify(displayValue) : String(displayValue ?? ''));
                                const isFk = !!fk;
                                const cellMatches = globalSearch && strVal.toLowerCase().includes(globalSearch.toLowerCase());
                                const isPinned = pinnedColumns.includes(key);
                                const leftOffset = isPinned ? (j * 150) : undefined;

                                return (
                                    <td
                                        key={j}
                                        title={isFk ? `${key} → ${fk.parent_table}.${fk.display_column}` : undefined}
                                        className={`px-4 py-3 text-xs border-b border-gray-50 truncate transition-all ${cellMatches ? 'bg-yellow-50/50 dark:bg-yellow-900/10 text-gray-900 dark:text-white' : isFk ? 'text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-600 dark:text-gray-300'} ${isPinned ? 'sticky z-10 bg-white dark:bg-gray-800 border-r border-gray-100/50 group-hover:bg-primary-50/50 dark:group-hover:bg-primary-900/10' : 'max-w-xs'} `}
                                        style={isPinned ? { left: leftOffset, minWidth: '150px', maxWidth: '150px' } : {}}
                                    >
                                        <HighlightMatches text={strVal} query={globalSearch} />
                                    </td>
                                );
                            })}
                            {/* Floating Action Button at the end of the row */}
                            <td className="sticky right-0 w-0 p-0 border-none overflow-visible z-20">
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                                    <button
                                        onClick={() => {
                                            setEditingRecord(record);
                                            setActiveTab('record');
                                        }}
                                        className="p-2 bg-white dark:bg-gray-700 border border-primary-200 dark:border-primary-800 shadow-lg rounded-full text-primary-600 dark:text-primary-400 hover:scale-110 hover:bg-primary-600 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                        title="Edit Record"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
