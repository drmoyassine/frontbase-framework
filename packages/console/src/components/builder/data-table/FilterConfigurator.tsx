import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GripVertical, Plus, X, Pencil, Filter } from 'lucide-react';
import { FilterConfig } from '@/hooks/data/useSimpleData';
import { useDataBindingStore } from '@/stores/data-binding-simple';

interface FilterConfiguratorProps {
    tableName: string;
    dataSourceId?: string;
    filters: FilterConfig[];
    onFiltersChange: (filters: FilterConfig[]) => void;
    columnOrder?: string[];
}

interface DraggableFilterItemProps {
    filter: FilterConfig;
    index: number;
    columns: { name: string; type: string; isRelated?: boolean }[];
    moveFilter: (dragIndex: number, hoverIndex: number) => void;
    updateFilter: (filter: FilterConfig) => void;
    removeFilter: () => void;
}

const FILTER_TYPE_LABELS: Record<string, string> = {
    text: 'Text',
    dropdown: 'Dropdown',
    multiselect: 'Multi-Select',
    number: 'Number Range',
    dateRange: 'Date Range',
    boolean: 'Boolean'
};

const DraggableFilterItem: React.FC<DraggableFilterItemProps> = ({
    filter,
    index,
    columns,
    moveFilter,
    updateFilter,
    removeFilter
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: filter.id,
        data: {
            filter,
            index
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const displayName = filter.label || filter.column || 'Unconfigured';
    const filterTypeLabel = FILTER_TYPE_LABELS[filter.filterType] || 'Text';
    const selectedColumn = columns.find(c => c.name === filter.column);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 p-1.5 border-b last:border-0 bg-background hover:bg-muted/30 transition-colors`}
        >
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-move text-muted-foreground hover:text-foreground p-1">
                <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Filter Name & Edit Trigger */}
            <Popover>
                <PopoverTrigger asChild>
                    <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer group">
                        <span className={`font-medium text-sm truncate select-none ${!filter.column ? 'text-muted-foreground italic' : ''}`}>
                            {displayName}
                        </span>
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-auto">
                            {filterTypeLabel}
                        </Badge>
                        {selectedColumn?.isRelated && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-purple-50 text-purple-700 border-purple-200">
                                Related
                            </Badge>
                        )}
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Filter Settings</h4>
                            <p className="text-sm text-muted-foreground">
                                Configure this filter's column, type, and display label.
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {/* Column Selection */}
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label>Column</Label>
                                <Select
                                    value={filter.column || ''}
                                    onValueChange={(column) => updateFilter({ ...filter, column })}
                                >
                                    <SelectTrigger className="col-span-2 h-8">
                                        <SelectValue placeholder="Select column" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {columns.map((col) => (
                                            <SelectItem key={col.name} value={col.name}>
                                                <div className="flex items-center gap-2">
                                                    <span>{col.name}</span>
                                                    {col.isRelated && (
                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-purple-50 text-purple-700 border-purple-200">
                                                            Related
                                                        </Badge>
                                                    )}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Filter Type */}
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label>Type</Label>
                                <Select
                                    value={filter.filterType}
                                    onValueChange={(filterType: any) => updateFilter({ ...filter, filterType })}
                                >
                                    <SelectTrigger className="col-span-2 h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text Input</SelectItem>
                                        <SelectItem value="dropdown">Dropdown</SelectItem>
                                        <SelectItem value="multiselect">Multi-Select</SelectItem>
                                        <SelectItem value="number">Number Range</SelectItem>
                                        <SelectItem value="dateRange">Date Range</SelectItem>
                                        <SelectItem value="boolean">Boolean Toggle</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Custom Label */}
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label>Label</Label>
                                <Input
                                    value={filter.label || ''}
                                    onChange={(e) => updateFilter({ ...filter, label: e.target.value })}
                                    placeholder={filter.column || 'Filter label'}
                                    className="col-span-2 h-8"
                                />
                            </div>

                            {/* Original Column Type */}
                            {selectedColumn && (
                                <div className="grid grid-cols-3 items-center gap-4">
                                    <Label className="text-muted-foreground">Column Type</Label>
                                    <div className="col-span-2">
                                        <Badge variant="secondary" className="text-xs font-normal">
                                            {selectedColumn.type}
                                        </Badge>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Remove Button */}
            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={removeFilter}
            >
                <X className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
};

export const FilterConfigurator: React.FC<FilterConfiguratorProps> = ({
    tableName,
    dataSourceId,
    filters,
    onFiltersChange,
    columnOrder = []
}) => {
    const { loadTableSchema, globalSchema } = useDataBindingStore();
    const [schema, setSchema] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Load schema - use datasource-specific API when dataSourceId is available
    useEffect(() => {
        if (!tableName) return;

        const fetchSchema = async () => {
            setLoading(true);
            try {
                // Use sync API with dataSourceId if available
                if (dataSourceId && dataSourceId !== 'backend') {
                    const response = await fetch(
                        `/api/sync/datasources/${dataSourceId}/tables/${tableName}/schema`
                    );
                    if (response.ok) {
                        const schemaData = await response.json();
                        // Transform to expected format
                        const transformedSchema = {
                            columns: (schemaData.columns || []).map((col: any) => ({
                                name: col.column_name || col.name,
                                type: col.data_type || col.type,
                                nullable: col.is_nullable === 'YES' || col.nullable,
                                isPrimaryKey: col.is_primary || col.isPrimaryKey,
                                foreignKey: (col.is_foreign || col.isForeign) && (col.foreign_table || col.foreignTable) ? {
                                    table: col.foreign_table || col.foreignTable,
                                    column: col.foreign_column || col.foreignColumn
                                } : undefined
                            }))
                        };
                        setSchema(transformedSchema);
                    } else {
                        console.error('[FilterConfigurator] Failed to fetch schema from sync API');
                        setSchema(null);
                    }
                } else {
                    // Fallback to store method for legacy datasources
                    const result = await loadTableSchema(tableName);
                    setSchema(result);
                }
            } catch (error) {
                console.error('[FilterConfigurator] Schema load failed:', error);
                setSchema(null);
            } finally {
                setLoading(false);
            }
        };

        fetchSchema();
    }, [tableName, dataSourceId, loadTableSchema]);

    // Build columns list including related columns from columnOrder
    const columns: { name: string; type: string; isRelated?: boolean }[] = [];

    if (schema?.columns) {
        schema.columns.forEach((c: any) => {
            columns.push({ name: c.name, type: c.type, isRelated: false });
        });
    }

    // Add related columns from columnOrder
    columnOrder.forEach(col => {
        if (col.includes('.')) {
            const [relTable, relCol] = col.split('.');
            const relTableSchema = globalSchema.tables.find((t: any) => t.table_name === relTable);
            let colType = 'text';
            if (relTableSchema?.columns) {
                const foundCol = relTableSchema.columns.find((c: any) => c.column_name === relCol);
                if (foundCol) colType = foundCol.data_type;
            }
            if (!columns.some(c => c.name === col)) {
                columns.push({ name: col, type: colType, isRelated: true });
            }
        }
    });

    const addFilter = () => {
        const newFilter: FilterConfig = {
            id: `filter-${Date.now()}`,
            column: '',
            filterType: 'text'
        };
        onFiltersChange([...filters, newFilter]);
    };

    const updateFilter = (index: number, updatedFilter: FilterConfig) => {
        const newFilters = [...filters];
        newFilters[index] = updatedFilter;
        onFiltersChange(newFilters);
    };

    const removeFilter = (index: number) => {
        const newFilters = filters.filter((_, i) => i !== index);
        onFiltersChange(newFilters);
    };

    const moveFilter = (dragIndex: number, hoverIndex: number) => {
        const newFilters = [...filters];
        const [draggedItem] = newFilters.splice(dragIndex, 1);
        newFilters.splice(hoverIndex, 0, draggedItem);
        onFiltersChange(newFilters);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-4">
                <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
        );
    }

    if (!schema) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                Select a table to configure filters
            </div>
        );
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeIndex = filters.findIndex(f => f.id === active.id);
        const overIndex = filters.findIndex(f => f.id === over.id);

        if (activeIndex !== -1 && overIndex !== -1) {
            moveFilter(activeIndex, overIndex);
        }
    };

    return (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <Label className="font-medium">Frontend Filters</Label>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={addFilter}
                        className="h-7 text-xs"
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                    </Button>
                </div>

                {filters.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-muted/20">
                        No filters. Click "Add" to create one.
                    </div>
                ) : (
                    <SortableContext items={filters.map(f => f.id)} strategy={verticalListSortingStrategy}>
                        <div className="border rounded-lg overflow-hidden">
                            {filters.map((filter, index) => (
                                <DraggableFilterItem
                                    key={filter.id}
                                    filter={filter}
                                    index={index}
                                    columns={columns}
                                    moveFilter={moveFilter}
                                    updateFilter={(updated) => updateFilter(index, updated)}
                                    removeFilter={() => removeFilter(index)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                )}
            </div>
        </DndContext>
    );
};
