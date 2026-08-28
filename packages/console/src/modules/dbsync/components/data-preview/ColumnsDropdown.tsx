import React, { useMemo } from 'react';
import { CheckCircle, ChevronDown, Columns, Table, Pin, GripVertical, Eye, EyeOff } from 'lucide-react';
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
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ColumnsDropdownProps {
    isColumnsDropdownOpen: boolean;
    setIsColumnsDropdownOpen: (open: boolean) => void;
    visibleColumns: string[];
    availableFields: string[];
    columnSearch: string;
    setColumnSearch: (search: string) => void;
    setVisibleColumns: (cols: string[]) => void;
    tableData: any;
    toggleVisibility: (col: string, fields: string[]) => void;
    // New props for pinning and reordering
    pinnedColumns?: string[];
    togglePin?: (col: string) => void;
    columnOrder?: string[];
    setColumnOrder?: (cols: string[]) => void;
}

interface SortableColumnItemProps {
    col: string;
    isVisible: boolean;
    isPinned: boolean;
    onToggleVisibility: () => void;
    onTogglePin: () => void;
}

const SortableColumnItem: React.FC<SortableColumnItemProps> = ({
    col,
    isVisible,
    isPinned,
    onToggleVisibility,
    onTogglePin
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: col });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg transition-colors ${isPinned ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}`}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-grab active:cursor-grabbing text-gray-400"
            >
                <GripVertical size={12} />
            </button>

            {/* Pin Toggle */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin();
                }}
                className={`p-0.5 rounded transition-colors ${isPinned ? 'text-orange-500 hover:bg-orange-100' : 'text-gray-300 hover:bg-gray-200'}`}
                title={isPinned ? "Unpin Column" : "Pin Column"}
            >
                <Pin size={12} className={isPinned ? 'fill-current' : ''} />
            </button>

            {/* Visibility Toggle (Eye Icon) */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility();
                }}
                className={`p-0.5 rounded transition-colors ${isVisible ? 'text-primary-600 hover:bg-primary-50' : 'text-gray-300 hover:bg-gray-200'}`}
                title={isVisible ? "Hide Column" : "Show Column"}
            >
                {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>

            {/* Column Name */}
            <span className={`flex-1 text-[11px] font-semibold truncate ${isVisible ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
                {col}
            </span>
        </div>
    );
};

export const ColumnsDropdown: React.FC<ColumnsDropdownProps> = ({
    isColumnsDropdownOpen,
    setIsColumnsDropdownOpen,
    visibleColumns,
    availableFields,
    columnSearch,
    setColumnSearch,
    setVisibleColumns,
    tableData,
    toggleVisibility,
    pinnedColumns = [],
    togglePin,
    columnOrder = [],
    setColumnOrder
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Get ordered fields
    const orderedFields = useMemo(() => {
        const fields = availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {});

        // Apply column order if available
        if (columnOrder.length > 0) {
            const ordered = columnOrder.filter(f => fields.includes(f));
            const remaining = fields.filter(f => !columnOrder.includes(f));
            return [...ordered, ...remaining];
        }

        return fields;
    }, [availableFields, tableData, columnOrder]);

    // Filter by search
    const filteredFields = useMemo(() => {
        return orderedFields.filter(col => col.toLowerCase().includes(columnSearch.toLowerCase()));
    }, [orderedFields, columnSearch]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id && setColumnOrder) {
            const oldIndex = orderedFields.indexOf(active.id as string);
            const newIndex = orderedFields.indexOf(over.id as string);
            setColumnOrder(arrayMove(orderedFields, oldIndex, newIndex));
        }
    };

    const isColumnVisible = (col: string) => visibleColumns.length === 0 || visibleColumns.includes(col);

    return (
        <div className="relative">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    setIsColumnsDropdownOpen(!isColumnsDropdownOpen);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${isColumnsDropdownOpen ? 'bg-primary-600 border-primary-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-primary-400'} `}
            >
                <Columns size={14} />
                <span>Columns</span>
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded text-[10px] ml-1">
                    {visibleColumns.length === 0 ? availableFields.length : visibleColumns.length}/{availableFields.length}
                </span>
                <ChevronDown size={14} className={`transition-transform ${isColumnsDropdownOpen ? 'rotate-180' : ''} `} />
            </button>

            {isColumnsDropdownOpen && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2"
                >
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-lg px-2 py-1.5">
                            <Table size={12} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search columns..."
                                className="bg-transparent border-none outline-none text-xs w-full font-medium"
                                value={columnSearch}
                                onChange={(e) => setColumnSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50 dark:border-gray-700/50 mb-1">
                            <button
                                onClick={() => setVisibleColumns([])}
                                className="text-[10px] font-bold text-primary-600 hover:underline"
                            >
                                Show All
                            </button>
                            <button
                                onClick={() => {
                                    const fields = (availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {}));
                                    setVisibleColumns([fields[0] || 'id']);
                                }}
                                className="text-[10px] font-bold text-gray-400 hover:underline"
                            >
                                Hide All
                            </button>
                        </div>

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={filteredFields}
                                strategy={verticalListSortingStrategy}
                            >
                                {filteredFields.map(col => (
                                    <SortableColumnItem
                                        key={col}
                                        col={col}
                                        isVisible={isColumnVisible(col)}
                                        isPinned={pinnedColumns.includes(col)}
                                        onToggleVisibility={() => {
                                            const fields = (availableFields.length > 0 ? availableFields : Object.keys(tableData?.records?.[0] || {}));
                                            toggleVisibility(col, fields);
                                        }}
                                        onTogglePin={() => togglePin?.(col)}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>
            )}
        </div>
    );
};
