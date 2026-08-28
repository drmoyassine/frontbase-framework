import React, { useState, useEffect } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, Search } from 'lucide-react';
import { useDataBindingStore } from '@/stores/data-binding-simple';
import { DraggableColumnItem, Column } from './DraggableColumnItem';

interface ColumnConfiguratorProps {
    tableName: string;
    dataSourceId?: string;
    columnOverrides?: { [columnName: string]: any };
    columnOrder?: string[];
    onColumnOverridesChange: (overrides: { [columnName: string]: any }) => void;
    onColumnOrderChange: (order: string[]) => void;
    additionalColumns?: Column[];
}

export const CompactColumnConfigurator: React.FC<ColumnConfiguratorProps> = ({
    tableName,
    dataSourceId,
    columnOverrides = {},
    columnOrder,
    onColumnOverridesChange,
    onColumnOrderChange,
    additionalColumns
}) => {
    const { loadTableSchema } = useDataBindingStore();
    const [schema, setSchema] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [orderedColumns, setOrderedColumns] = useState<Column[]>([]);
    const [expandedFKs, setExpandedFKs] = useState<Set<string>>(new Set());
    const [relatedSchemas, setRelatedSchemas] = useState<Map<string, any>>(new Map());

    // Order columns based on columnOrder
    useEffect(() => {
        // This useEffect is now redundant as we have the main ordering logic below.
        // Keeping it empty or removing it would be best, but to minimize diff noise we'll check logic below.
    }, [schema, columnOrder, additionalColumns]);

    // Filter columns based on search
    const filteredColumns = orderedColumns.filter(col => {
        if (!search) return true;
        const override = columnOverrides[col.name];
        const label = override?.label || col.name;
        return label.toLowerCase().includes(search.toLowerCase()) ||
            col.name.toLowerCase().includes(search.toLowerCase());
    });
    // Load schema
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
                        console.error('[CompactColumnConfigurator] Failed to fetch schema from sync API');
                        setSchema(null);
                    }
                } else {
                    // Fallback to store method for legacy datasources
                    const result = await loadTableSchema(tableName);
                    setSchema(result);
                }
            } catch (error) {
                console.error('[CompactColumnConfigurator] Schema load failed:', error);
                setSchema(null);
            } finally {
                setLoading(false);
            }
        };

        fetchSchema();
    }, [tableName, dataSourceId, loadTableSchema]);

    // Order columns based on columnOrder
    useEffect(() => {
        // Base columns from schema + additional virtual columns
        let baseColumns: Column[] = [];

        if (schema?.columns) {
            baseColumns = [...schema.columns];
        }

        if (additionalColumns) {
            baseColumns = [...baseColumns, ...additionalColumns];
        }

        if (baseColumns.length === 0) {
            setOrderedColumns([]);
            return;
        }

        const baseColumnMap = new Map(baseColumns.map(c => [c.name, c]));

        // Final ordered list
        const ordered: Column[] = [];

        // Track what we've added to avoid duplicates
        const addedKeys = new Set<string>();

        // 1. If we have a stored order, respect it
        if (columnOrder && columnOrder.length > 0) {
            columnOrder.forEach(key => {
                // Is it a base column?
                if (baseColumnMap.has(key)) {
                    ordered.push(baseColumnMap.get(key)!);
                    addedKeys.add(key);
                }
                // Is it a known related column from overrides? 
                // We construct the object from the key since we don't have the full schema for all relations handy always,
                // but we can trust the key format "table.column" if it's in the order list.
                // However, better to verify it's a valid related key format.
                else if (key.includes('.')) {
                    const [relTable, relCol] = key.split('.');
                    ordered.push({
                        name: key,
                        type: 'text', // Default, will be updated if we load schema
                        relatedTable: relTable,
                        relatedColumn: relCol
                    });
                    addedKeys.add(key);
                }
            });
        }

        // 2. Add any missing base columns (at the end)
        baseColumns.forEach(col => {
            if (!addedKeys.has(col.name)) {
                ordered.push(col);
                addedKeys.add(col.name);
                // Ensure default base columns are visible unless overridden
                // Actually, if we are in "custom order mode" (i.e. columnOrder exists), 
                // newly discovered columns should probably be hidden by default to not disrupt layout?
                // But currently we don't strictly enforce "custom order mode".
                // Let's leave visibility as is (default true).
            }
        });

        setOrderedColumns(ordered);
    }, [schema, columnOrder, additionalColumns]);

    const updateColumnOverride = (columnName: string, updates: any) => {
        const newOverrides = {
            ...columnOverrides,
            [columnName]: {
                ...columnOverrides[columnName],
                ...updates
            }
        };
        onColumnOverridesChange(newOverrides);
    };

    const handleToggleColumn = (column: Column, visible: boolean) => {
        // If it's a related column being turned ON:
        if (column.relatedTable && visible) {
            // It MUST be in orderedColumns.
            // If it's not already in orderedColumns (it shouldn't be if it was OFF and we just removed it per the old logic, 
            // BUT wait, my new logic in useEffect puts everything in `orderedColumns` ONLY if it's in `columnOrder`.
            // So if I toggle it ON from the Expansion panel, I need to:
            // 1. Add it to columnOrder.
            // 2. Set visible: true override.

            const newOrder = [...orderedColumns.map(c => c.name)];
            if (!newOrder.includes(column.name)) {
                newOrder.push(column.name);
                onColumnOrderChange(newOrder);
            }
            updateColumnOverride(column.name, { visible: true });
        }
        // If it's a related column being turned OFF:
        else if (column.relatedTable && !visible) {
            // We can keep it in the list (so user can re-enable easily) or remove it.
            // User asked for "clean" way. Keeping hidden columns in the main list clutters it if you have many relations.
            // But if I remove it, I lose its position.
            // Let's KEEP it in the main list if it's already there. 
            // The user can remove it by unchecking it.
            // Wait, if I uncheck it, it stays? 
            // Let's say: If I uncheck it, it stays but `visible: false`.
            updateColumnOverride(column.name, { visible: false });
        }
        else {
            // Base column
            updateColumnOverride(column.name, { visible });
        }
    };

    const handleAddRelatedColumn = (relatedKey: string, relatedTable: string, relatedColName: string) => {
        // 1. Add to overrides as visible
        const newOverrides = {
            ...columnOverrides,
            [relatedKey]: {
                ...columnOverrides[relatedKey],
                visible: true
            }
        };
        onColumnOverridesChange(newOverrides);

        // 2. Add to column order immediately (at the end or after parent?)
        // Let's add to end for predictability
        const currentOrder = orderedColumns.map(c => c.name);
        if (!currentOrder.includes(relatedKey)) {
            onColumnOrderChange([...currentOrder, relatedKey]);
        }
    };

    const handleRemoveRelatedColumn = (relatedKey: string) => {
        // Set visible false
        const newOverrides = {
            ...columnOverrides,
            [relatedKey]: {
                ...columnOverrides[relatedKey],
                visible: false
            }
        };
        onColumnOverridesChange(newOverrides);

        // Remove from order?
        // If we remove from order, it disappears from the draggable list.
        // This keeps the list clean. To show it again, go back to FK expansion.
        // This seems to match the "phantom columns" complaint - if they are OFF, they shouldn't haunt the list unless necessary.
        const currentOrder = orderedColumns.map(c => c.name);
        const newOrder = currentOrder.filter(k => k !== relatedKey);
        onColumnOrderChange(newOrder);
    };

    const moveColumn = (dragIndex: number, hoverIndex: number) => {
        const newOrder = [...orderedColumns];
        const [removed] = newOrder.splice(dragIndex, 1);
        newOrder.splice(hoverIndex, 0, removed);

        setOrderedColumns(newOrder);
        onColumnOrderChange(newOrder.map(c => c.name));
    };

    const toggleFKExpansion = async (columnName: string) => {
        const newExpanded = new Set(expandedFKs);

        if (newExpanded.has(columnName)) {
            newExpanded.delete(columnName);
        } else {
            newExpanded.add(columnName);

            // Fetch related table schema if not already loaded
            const column = orderedColumns.find(c => c.name === columnName);
            if (column?.foreignKey && !relatedSchemas.has(column.foreignKey.table)) {
                try {
                    // Logic to fetch related schema - similar to initial schema fetch
                    let relatedSchema = null;
                    if (dataSourceId && dataSourceId !== 'backend') {
                        const response = await fetch(
                            `/api/sync/datasources/${dataSourceId}/tables/${column.foreignKey.table}/schema`
                        );
                        if (response.ok) {
                            const schemaData = await response.json();
                            // Transform
                            relatedSchema = {
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
                        }
                    } else {
                        relatedSchema = await loadTableSchema(column.foreignKey.table);
                    }

                    if (relatedSchema) {
                        setRelatedSchemas(prev => new Map(prev).set(column.foreignKey!.table, relatedSchema));
                    }
                } catch (error) {
                    console.error('Failed to load related schema:', error);
                }
            }
        }

        setExpandedFKs(newExpanded);
    };

    const toggleAllVisible = (visible: boolean) => {
        if (!schema) return;

        const newOverrides = { ...columnOverrides };
        // Base columns
        schema.columns.forEach((column: Column) => {
            newOverrides[column.name] = {
                ...newOverrides[column.name],
                visible
            };
        });
        // We probably shouldn't auto-enable ALL foreign columns as it would flood the table.
        // But we can enable/disable already known ones.
        orderedColumns.forEach(col => {
            if (col.relatedTable) {
                newOverrides[col.name] = {
                    ...(newOverrides[col.name] || {}),
                    visible
                };
            }
        })

        onColumnOverridesChange(newOverrides);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-4">
                <div className="text-sm text-muted-foreground">Loading columns...</div>
            </div>
        );
    }

    if (!schema) {
        return (
            <div className="text-sm text-muted-foreground p-4">
                Select a table to configure columns
            </div>
        );
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeIndex = orderedColumns.findIndex(col => col.name === active.id);
        const overIndex = orderedColumns.findIndex(col => col.name === over.id);

        if (activeIndex !== -1 && overIndex !== -1) {
            moveColumn(activeIndex, overIndex);
        }
    };

    return (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="space-y-2">
                {/* Search */}
                <div className="px-1">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search columns..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8 pl-8 text-xs"
                        />
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex justify-between items-center px-1">
                    <Label className="text-xs font-medium text-muted-foreground">
                        {orderedColumns.length} Active Columns
                    </Label>
                    <div className="flex gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleAllVisible(true)}
                            className="h-6 w-6"
                            title="Show All"
                        >
                            <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleAllVisible(false)}
                            className="h-6 w-6"
                            title="Hide All"
                        >
                            <EyeOff className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Column List */}
                <SortableContext items={filteredColumns.map(c => c.name)} strategy={verticalListSortingStrategy}>
                    <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto bg-card">
                        {filteredColumns.map((column, index) => {
                            const override = columnOverrides[column.name] || {};
                            const isExpanded = expandedFKs.has(column.name);
                            // Prevent expanding self-referencing foreign keys (matches backend limitation)
                            const isSelfReference = column.foreignKey?.table === tableName;
                            const relatedSchema = column.foreignKey && !isSelfReference ? relatedSchemas.get(column.foreignKey.table) : null;

                            return (
                                <React.Fragment key={column.name}>
                                    <DraggableColumnItem
                                        column={column}
                                        index={index}
                                        override={override}
                                        moveColumn={moveColumn}
                                        updateColumnOverride={(name, up) => {
                                            // Intercept visibility toggle for related columns to handle remove logic
                                            if (column.relatedTable && up.visible === false) {
                                                handleRemoveRelatedColumn(name);
                                            } else {
                                                updateColumnOverride(name, up);
                                            }
                                        }}
                                        isExpanded={isExpanded}
                                        onToggleExpand={!isSelfReference ? toggleFKExpansion : undefined}
                                    />

                                    {/* Render related columns when expanded - CATALOG MODE */}
                                    {isExpanded && relatedSchema && column.foreignKey && !isSelfReference && (
                                        <div className="bg-muted/30 pl-12 border-b">
                                            <div className="px-1.5 py-1 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                                                Available Columns from {column.foreignKey.table}
                                            </div>
                                            {relatedSchema.columns.map((relatedCol: any) => {
                                                const relatedKey = `${column.foreignKey!.table}.${relatedCol.name}`;
                                                const isActive = orderedColumns.some(c => c.name === relatedKey);
                                                // Calculate check state: It is checked if it is In the Order AND Visible.
                                                // If it is in the order but hidden, it's checked? No, let's say checked = active.

                                                // Wait, if I remove it from order when hidden, then isActive is strictly about presence in order.

                                                return (
                                                    <div
                                                        key={relatedKey}
                                                        className="flex items-center gap-2 p-1.5 border-b last:border-0 hover:bg-muted/50 transition-colors"
                                                    >
                                                        <div className="w-5" /> {/* Spacer */}
                                                        <span className="flex-1 text-sm text-muted-foreground">
                                                            {relatedCol.name}
                                                        </span>
                                                        <Switch
                                                            checked={isActive}
                                                            onCheckedChange={(checked) => {
                                                                if (checked) {
                                                                    handleAddRelatedColumn(relatedKey, column.foreignKey!.table, relatedCol.name);
                                                                } else {
                                                                    handleRemoveRelatedColumn(relatedKey);
                                                                }
                                                            }}
                                                            className="scale-75 origin-right"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </SortableContext>

                {orderedColumns.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        No columns visible. Enable columns to start.
                    </div>
                )}
            </div>
        </DndContext>
    );
};
