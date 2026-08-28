import React, { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Search, Pencil, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FieldSettingsPopover } from './FieldSettingsPopover';
import type { ColumnSchema } from '@/types/schema';

// Helper for sortable item with inline popover
const SortableFieldItem = ({
    id,
    column,
    override,
    onToggleVisibility,
    onSaveSettings,
    componentType,
    dataSourceId
}: {
    id: string,
    column: ColumnSchema,
    override: any,
    onToggleVisibility: (visible: boolean) => void,
    onSaveSettings: (settings: any) => void,
    componentType: 'Form' | 'InfoList',
    dataSourceId?: string
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
        position: 'relative' as const,
    };

    const isVisible = override?.hidden !== true;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 p-1.5 border-b last:border-0 bg-background hover:bg-muted/30 transition-colors ${!isVisible ? 'opacity-60' : ''}`}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-move text-muted-foreground hover:text-foreground p-1"
            >
                <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Field Name & Settings Popover (inline) */}
            <FieldSettingsPopover
                fieldName={column.name}
                settings={override || {}}
                onSave={onSaveSettings}
                componentType={componentType}
                fkTable={column.is_foreign ? column.foreign_table : undefined}
                dataSourceId={dataSourceId}
                isBuilderMode={true}
            >
                <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer group">
                    <span className="font-medium text-sm truncate select-none">
                        {override?.label || column.name}
                    </span>
                    <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Badges - Only PK/FK */}
                    {column.primary_key && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">PK</Badge>
                    )}
                    {column.is_foreign && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">FK</Badge>
                    )}
                </div>
            </FieldSettingsPopover>

            {/* Visibility Toggle */}
            <Switch
                checked={isVisible}
                onCheckedChange={onToggleVisibility}
                className="scale-75 origin-right"
            />
        </div>
    );
};

interface FieldConfiguratorProps {
    columns: ColumnSchema[];
    overrides: Record<string, any>;
    onOverridesChange: (overrides: Record<string, any>) => void;
    order?: string[];
    onOrderChange: (order: string[]) => void;
    focusedField?: { componentId: string; fieldName: string } | null;
    onFocusHandled?: () => void;
    componentType?: 'Form' | 'InfoList';
    dataSourceId?: string;
}

export const FieldConfigurator: React.FC<FieldConfiguratorProps> = ({
    columns,
    overrides = {},
    onOverridesChange,
    order = [],
    onOrderChange,
    focusedField,
    onFocusHandled,
    componentType = 'Form',
    dataSourceId
}) => {
    const [search, setSearch] = useState('');

    // Track last processed field to prevent re-processing on re-renders
    const lastFocusedRef = React.useRef<string | null>(null);

    // Handle focus events from canvas (just mark as handled since popover is inline)
    React.useEffect(() => {
        if (focusedField?.fieldName) {
            const key = `${focusedField.componentId}:${focusedField.fieldName}`;
            // If it's a new focus event (different from last handled), process it
            if (lastFocusedRef.current !== key) {
                lastFocusedRef.current = key;
                // Notify parent that we've handled this focus event
                if (onFocusHandled) {
                    onFocusHandled();
                }
            }
        }
    }, [focusedField, onFocusHandled]);

    // Compute ordered fields
    const orderedFields = React.useMemo(() => {
        const colMap = new Map(columns.map(c => [c.name, c]));
        const result: ColumnSchema[] = [];
        const processed = new Set<string>();

        // Add ordered fields first
        for (const name of order) {
            if (colMap.has(name)) {
                result.push(colMap.get(name)!);
                processed.add(name);
            }
        }

        // Add remaining fields (preserving original schema order)
        for (const col of columns) {
            if (!processed.has(col.name)) {
                result.push(col);
            }
        }

        return result;
    }, [columns, order]);

    // Filter fields based on search
    const filteredFields = orderedFields.filter(col => {
        if (!search) return true;
        const label = overrides[col.name]?.label || col.name;
        return label.toLowerCase().includes(search.toLowerCase()) ||
            col.name.toLowerCase().includes(search.toLowerCase());
    });

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = orderedFields.findIndex(c => c.name === active.id);
        const newIndex = orderedFields.findIndex(c => c.name === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newOrderIds = [...orderedFields.map(c => c.name)];
            const [moved] = newOrderIds.splice(oldIndex, 1);
            newOrderIds.splice(newIndex, 0, moved);
            onOrderChange(newOrderIds);
        }
    };

    const toggleVisibility = (fieldName: string, visible: boolean) => {
        const currentOverride = overrides[fieldName] || {};
        onOverridesChange({
            ...overrides,
            [fieldName]: {
                ...currentOverride,
                hidden: !visible
            }
        });
    };

    const toggleAll = (visible: boolean) => {
        const newOverrides = { ...overrides };
        orderedFields.forEach(f => {
            const current = newOverrides[f.name] || {};
            newOverrides[f.name] = {
                ...current,
                hidden: !visible
            };
        });
        onOverridesChange(newOverrides);
    };

    const updateSettings = (fieldName: string, settings: any) => {
        onOverridesChange({
            ...overrides,
            [fieldName]: {
                ...overrides[fieldName],
                ...settings
            }
        });
    };

    // Calculate active count
    const activeCount = orderedFields.filter(f => overrides[f.name]?.hidden !== true).length;

    return (
        <div className="space-y-2">
            {/* Search Bar */}
            <div className="px-1">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search fields..."
                        className="h-8 pl-8 text-xs"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Quick Actions Header */}
            <div className="flex justify-between items-center px-1">
                <Label className="text-xs font-medium text-muted-foreground">
                    {activeCount} Active Fields
                </Label>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleAll(true)}
                        className="h-6 w-6"
                        title="Show All"
                    >
                        <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleAll(false)}
                        className="h-6 w-6"
                        title="Hide All"
                    >
                        <EyeOff className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filteredFields.map(f => f.name)} strategy={verticalListSortingStrategy}>
                    <div className="border rounded-md divide-y max-h-[400px] overflow-y-auto bg-card">
                        {filteredFields.map((col) => (
                            <SortableFieldItem
                                key={col.name}
                                id={col.name}
                                column={col}
                                override={overrides[col.name]}
                                onToggleVisibility={(visible) => toggleVisibility(col.name, visible)}
                                onSaveSettings={(settings) => updateSettings(col.name, settings)}
                                componentType={componentType}
                                dataSourceId={dataSourceId}
                            />
                        ))}
                        {filteredFields.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No fields match search
                            </div>
                        )}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
};
