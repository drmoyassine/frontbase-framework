import React from 'react';
import { ExpressionEditor } from './ExpressionEditor';
import { X, Info, Link as LinkIcon, Plus, RotateCcw, Check, Eye, Search, Pin, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { TableSchema } from '../types';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLayoutStore } from '../store/useLayoutStore';

interface RecordEditorProps {
    record: any;
    schema?: TableSchema;
    onSave: (fieldMappings: Record<string, string>) => void;
    onCancel: () => void;
    currentMappings?: Record<string, string>;
    datasourceName: string;
    tableName: string;
    columnSearch?: string;
    globalSearch?: string;
    availableFields: string[];  // NEW: Unified source of available fields
}

interface SortableFieldProps {
    fieldName: string;
    record: any;
    hasValueMatch: boolean;
    mappingValue?: string;
    onMappingChange: (fieldName: string, value: string) => void;
    allFieldNames: string[];
    HighlightValue: React.FC<{ text: string }>;
}

const SortableField: React.FC<SortableFieldProps> = ({
    fieldName,
    record,
    hasValueMatch,
    mappingValue,
    onMappingChange,
    allFieldNames,
    HighlightValue
}) => {
    const { pinnedColumns, togglePin, toggleVisibility } = useLayoutStore();
    const isPinned = pinnedColumns.includes(fieldName);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: fieldName });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div
            id={`field-${fieldName}`}
            ref={setNodeRef}
            style={style}
            className={`group flex flex-col gap-2 p-3 rounded-xl border transition-all ${hasValueMatch
                ? 'bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800 ring-1 ring-yellow-300/50'
                : isPinned
                    ? 'bg-primary-50/30 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800'
                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                }`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        {...attributes}
                        {...listeners}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-grab active:cursor-grabbing text-gray-400"
                    >
                        <GripVertical size={14} />
                    </button>
                    <div className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tight flex items-center gap-1.5">
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => toggleVisibility(fieldName, allFieldNames)}
                                className="p-1 rounded-md transition-all text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/30"
                                title="Hide field from output"
                            >
                                <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => togglePin(fieldName)}
                                className={`p-1 rounded-md transition-all ${isPinned
                                    ? 'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30'
                                    : 'text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                title={isPinned ? 'Unpin field' : 'Pin field to top'}
                            >
                                {isPinned ? <Pin className="w-3.5 h-3.5 fill-current" /> : <Pin size={14} />}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>{fieldName}</span>
                            <span className="text-gray-400 dark:text-gray-500 font-medium normal-case flex items-center gap-1">
                                <span className="opacity-50">:</span>
                                <HighlightValue text={typeof record[fieldName] === 'object' && record[fieldName] !== null ? JSON.stringify(record[fieldName]) : String(record[fieldName] ?? 'null')} />
                            </span>
                        </div>
                        {hasValueMatch && (
                            <span className="ml-1 px-1.5 py-0.5 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded text-[8px] font-bold">
                                MATCH
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="relative animate-in fade-in slide-in-from-top-1 duration-200">
                <ExpressionEditor
                    value={mappingValue || `{{ ${fieldName} }}`}
                    onChange={(val) => onMappingChange(fieldName, val)}
                    placeholder={`Mapping for ${fieldName}...`}
                    className="min-h-[40px] text-sm"
                    variables={allFieldNames.map((f: string) => ({
                        name: f,
                        label: f,
                        type: typeof record[f] === 'number' ? 'number' : 'string'
                    }))}
                />
            </div>
        </div>
    );
};

export const RecordEditor: React.FC<RecordEditorProps> = ({
    record,
    schema,
    onSave,
    onCancel,
    currentMappings = {},
    datasourceName,
    tableName,
    columnSearch = '',
    globalSearch = '',
    availableFields  // NEW: Use unified field source
}) => {
    const {
        pinnedColumns,
        columnOrder,
        visibleColumns,
        setColumnOrder
    } = useLayoutStore();

    const [mappings, setMappings] = React.useState<Record<string, string>>(currentMappings);
    const [filterByMatch, setFilterByMatch] = React.useState(false);
    const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);
    const [allMatches, setAllMatches] = React.useState<string[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Use availableFields directly instead of computing from schema/record
    const allFields = React.useMemo(() => {
        let fields = [...availableFields];

        if (columnOrder.length > 0) {
            const orderMap = new Map(columnOrder.map((name, index) => [name, index]));
            fields = [...fields].sort((a, b) => {
                const aIdx = orderMap.get(a) ?? 999;
                const bIdx = orderMap.get(b) ?? 999;
                return aIdx - bIdx;
            });
        }
        return fields;
    }, [availableFields, columnOrder]);

    const isFieldVisible = (fieldName: string) => visibleColumns.length === 0 || visibleColumns.includes(fieldName);

    const fieldMatchesGlobalSearch = React.useCallback((fieldName: string) => {
        const query = globalSearch.trim();
        if (!query) return false;

        const rawValue = record[fieldName];
        const value = typeof rawValue === 'object' && rawValue !== null
            ? JSON.stringify(rawValue)
            : String(rawValue ?? '');
        return value.toLowerCase().includes(query.toLowerCase());
    }, [globalSearch, record]);

    const sortedFields = React.useMemo(() => {
        let fields = [...allFields];

        if (columnSearch) {
            fields = fields.filter(f => f.toLowerCase().includes(columnSearch.toLowerCase()));
        }

        // Automatic narrowing when global search is active
        if (globalSearch.trim()) {
            // Show fields that match the search (even if hidden)
            fields = fields.filter(f => fieldMatchesGlobalSearch(f));
        } else {
            // Regular view: respect visibility and toggle
            if (filterByMatch) {
                fields = fields.filter(f => fieldMatchesGlobalSearch(f));
            }
            fields = fields.filter(f => isFieldVisible(f));
        }

        return fields.sort((a, b) => {
            const aPinned = pinnedColumns.includes(a);
            const bPinned = pinnedColumns.includes(b);
            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            if (globalSearch.trim()) {
                const aMatches = fieldMatchesGlobalSearch(a);
                const bMatches = fieldMatchesGlobalSearch(b);
                if (aMatches && !bMatches) return -1;
                if (!aMatches && bMatches) return 1;
            }

            return 0;
        });
    }, [allFields, columnSearch, filterByMatch, globalSearch, pinnedColumns, fieldMatchesGlobalSearch, visibleColumns]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = allFields.indexOf(active.id as string);
            const newIndex = allFields.indexOf(over.id as string);
            setColumnOrder(arrayMove(allFields, oldIndex, newIndex));
        }
    };

    // Match Navigation
    React.useEffect(() => {
        if (!globalSearch) {
            setAllMatches([]);
            setCurrentMatchIndex(0);
            return;
        }

        const matches = sortedFields.filter(f => fieldMatchesGlobalSearch(f));
        setAllMatches(matches);
        setCurrentMatchIndex(0);
    }, [globalSearch, sortedFields, fieldMatchesGlobalSearch]);

    const scrollToField = (fieldName: string) => {
        const el = document.getElementById(`field-${fieldName}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const handleNextMatch = () => {
        if (allMatches.length === 0) return;
        const nextIndex = (currentMatchIndex + 1) % allMatches.length;
        setCurrentMatchIndex(nextIndex);
        scrollToField(allMatches[nextIndex]);
    };

    const handlePrevMatch = () => {
        if (allMatches.length === 0) return;
        const prevIndex = (currentMatchIndex - 1 + allMatches.length) % allMatches.length;
        setCurrentMatchIndex(prevIndex);
        scrollToField(allMatches[prevIndex]);
    };

    const handleSave = () => onSave(mappings);

    const HighlightValue = ({ text }: { text: string }) => {
        const query = globalSearch.trim();
        if (!query) return <>{text}</>;
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return <>{text}</>;
        return (
            <>
                {text.slice(0, idx)}
                <span className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">{text.slice(idx, idx + query.length)}</span>
                {text.slice(idx + query.length)}
            </>
        );
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-primary-500" />
                        Record Mapper & Transformer
                    </h4>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {datasourceName} » {tableName}
                        {columnSearch && <span className="ml-2 text-primary-500">• Filtering by "{columnSearch}"</span>}
                        {globalSearch && (
                            <span className="ml-2 text-yellow-600 flex items-center gap-1">
                                • Searching "{globalSearch}"
                                {allMatches.length > 0 && (
                                    <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ml-1 flex items-center gap-1">
                                        {currentMatchIndex + 1}/{allMatches.length}
                                        <button onClick={handlePrevMatch} className="hover:text-yellow-900 dark:hover:text-yellow-200"><ChevronUp size={10} /></button>
                                        <button onClick={handleNextMatch} className="hover:text-yellow-900 dark:hover:text-yellow-200"><ChevronDown size={10} /></button>
                                    </span>
                                )}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setMappings(currentMappings)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-all"
                        title="Reset to initial mappings"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Apply Mappings
                    </button>
                    <button
                        onClick={onCancel}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            <div className="px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-800 flex items-center gap-2">
                <Info className="w-3 h-3 text-primary-600" />
                <span className="text-[10px] font-medium text-primary-700 dark:text-primary-300">
                    Map source fields to target sync values. Use <code>{`{{ field }}`}</code> to reference values or <code>@jinja</code> for transformations.
                </span>
            </div>

            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-4">
                    <span className="text-gray-500">
                        Showing <span className="font-bold text-gray-700 dark:text-gray-300">{sortedFields.length}</span> of {allFields.length} fields
                    </span>
                    {globalSearch && (
                        <span className="text-yellow-600 flex items-center gap-1">
                            <Search className="w-3 h-3" />
                            {sortedFields.filter(f => fieldMatchesGlobalSearch(f)).length} value matches
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {globalSearch && (
                        <button
                            onClick={() => setFilterByMatch(!filterByMatch)}
                            className={`px-2 py-1 rounded-md border transition-all font-bold uppercase tracking-wider ${filterByMatch
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-300'
                                }`}
                        >
                            {filterByMatch ? 'Showing Only Matches' : 'Filter by match'}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={sortedFields}
                        strategy={verticalListSortingStrategy}
                    >
                        {sortedFields.map(fieldName => (
                            <SortableField
                                key={fieldName}
                                fieldName={fieldName}
                                record={record}
                                hasValueMatch={fieldMatchesGlobalSearch(fieldName)}
                                mappingValue={mappings[fieldName]}
                                onMappingChange={(f: string, v: string) => setMappings(prev => ({ ...prev, [f]: v }))}
                                allFieldNames={allFields}
                                HighlightValue={HighlightValue}
                            />
                        ))}
                    </SortableContext>
                </DndContext>

                {sortedFields.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs">
                        No fields match your search criteria
                    </div>
                )}

                <button className="w-full py-3 border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-primary-500 hover:border-primary-200 transition-all text-xs font-medium">
                    <Plus className="w-4 h-4" />
                    Add Custom Computed Field
                </button>
            </div>
        </div>
    );
};
