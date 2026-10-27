import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GripVertical, Pencil, ChevronRight, ChevronDown } from 'lucide-react';

export interface Column {
    name: string;
    type: string;
    isPrimaryKey?: boolean;
    foreignKey?: {
        table: string;
        column: string;
    };
    relatedTable?: string;
    relatedColumn?: string;
}

interface DraggableColumnItemProps {
    column: Column;
    index: number;
    override: any;
    moveColumn: (dragIndex: number, hoverIndex: number) => void;
    updateColumnOverride: (columnName: string, updates: any) => void;
    isExpanded?: boolean;
    onToggleExpand?: (columnName: string) => void;
    isForeignIncluded?: Boolean;
}

export const DraggableColumnItem: React.FC<DraggableColumnItemProps> = ({
    column,
    index,
    override,
    moveColumn,
    updateColumnOverride,
    isExpanded = false,
    onToggleExpand
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: column.name,
        data: {
            column,
            index
        }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 p-1.5 border-b last:border-0 bg-background hover:bg-muted/30 transition-colors`}
        >
            {/* Expand/Collapse Button for FK columns */}
            {column.foreignKey && !column.relatedTable ? (
                <button
                    onClick={() => onToggleExpand?.(column.name)}
                    className="p-1 hover:bg-muted rounded transition-colors"
                    title={isExpanded ? `Collapse ${column.foreignKey.table}` : `Expand ${column.foreignKey.table}`}
                >
                    {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                </button>
            ) : (
                <div className="w-5" />
            )}

            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-move text-muted-foreground hover:text-foreground p-1"
            >
                <GripVertical className="w-3.5 h-3.5" />
            </div>

            {/* Column Name & Edit Trigger */}
            <Popover>
                <PopoverTrigger asChild>
                    <div className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer group">
                        <span className="font-medium text-sm truncate select-none">
                            {override.displayName || (column.relatedTable ? `${column.relatedTable}.${column.relatedColumn}` : column.name)}
                        </span>
                        <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        {column.isPrimaryKey && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">PK</Badge>
                        )}
                        {column.foreignKey && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">FK</Badge>
                        )}
                        {column.relatedTable && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 bg-purple-50 text-purple-700 border-purple-200">Related</Badge>
                        )}
                    </div>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <h4 className="font-medium leading-none">Column Settings</h4>
                            <p className="text-sm text-muted-foreground">
                                Configure how {column.name} appears in the table.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="display-name">Label</Label>
                                <Input
                                    id="display-name"
                                    value={override.displayName || ''}
                                    onChange={(e) => updateColumnOverride(column.name, { displayName: e.target.value })}
                                    placeholder={column.name}
                                    className="col-span-2 h-8"
                                />
                            </div>
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor="display-type">Type</Label>
                                <Select
                                    value={override.displayType || 'text'}
                                    onValueChange={(displayType) => updateColumnOverride(column.name, { displayType })}
                                >
                                    <SelectTrigger id="display-type" className="col-span-2 h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="badge">Badge</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="boolean">Boolean (✓/✗)</SelectItem>
                                        <SelectItem value="currency">Currency</SelectItem>
                                        <SelectItem value="percentage">%</SelectItem>
                                        <SelectItem value="image">Logo</SelectItem>
                                        <SelectItem value="cover">Image (cover)</SelectItem>
                                        <SelectItem value="link">Link</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {/* Show label on card (Grid / Repeater) */}
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label htmlFor={`show-label-${column.name}`}>Card label</Label>
                                <div className="col-span-2 flex items-center gap-2">
                                    <Switch
                                        id={`show-label-${column.name}`}
                                        checked={override.showLabel !== false}
                                        onCheckedChange={(showLabel) => updateColumnOverride(column.name, { showLabel })}
                                    />
                                    <span className="text-xs text-muted-foreground">Show field label on the card</span>
                                </div>
                            </div>
                            {/* Date Format - only shown when type is date */}
                            {(override.displayType === 'date') && (
                                <div className="grid grid-cols-3 items-center gap-4">
                                    <Label>Format</Label>
                                    <Select
                                        value={override.dateFormat || 'MMM dd, yyyy'}
                                        onValueChange={(dateFormat) => updateColumnOverride(column.name, { dateFormat })}
                                    >
                                        <SelectTrigger className="col-span-2 h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MMM dd, yyyy">Dec 10, 2024</SelectItem>
                                            <SelectItem value="dd/MM/yyyy">10/12/2024</SelectItem>
                                            <SelectItem value="MM/dd/yyyy">12/10/2024</SelectItem>
                                            <SelectItem value="yyyy-MM-dd">2024-12-10</SelectItem>
                                            <SelectItem value="dd MMM yyyy">10 Dec 2024</SelectItem>
                                            <SelectItem value="EEEE, MMM dd">Tuesday, Dec 10</SelectItem>
                                            <SelectItem value="relative">Relative (2 days ago)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="grid grid-cols-3 items-center gap-4">
                                <Label>Original Type</Label>
                                <div className="col-span-2">
                                    <Badge variant="secondary" className="text-xs font-normal">
                                        {column.type}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            {/* Visibility Toggle */}
            <Switch
                checked={override.visible === true}
                onCheckedChange={(visible) => updateColumnOverride(column.name, { visible })}
                className="scale-75 origin-right"
            />
        </div>
    );
};
