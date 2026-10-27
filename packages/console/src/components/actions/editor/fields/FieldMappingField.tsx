/**
 * FieldMappingField - Map fields for data operations
 * 
 * Auto-populates column names from table schema when available.
 */

import React from 'react';
import { Plus, X, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useTableColumns, TableColumn } from '../hooks/useTableColumns';

export interface FieldMapping {
    id: string;
    sourceField: string;
    targetColumn: string;
    transform?: string;
}

interface FieldMappingFieldProps {
    name: string;
    label?: string;
    value: FieldMapping[];
    onChange: (value: FieldMapping[]) => void;
    description?: string;
    dataSourceId?: string;
    tableName?: string;
}

export function FieldMappingField({
    label,
    value = [],
    onChange,
    description,
    dataSourceId,
    tableName,
}: FieldMappingFieldProps) {
    const { columns, loading } = useTableColumns(dataSourceId, tableName);

    const handleAdd = () => {
        const newMapping: FieldMapping = {
            id: `field-${Date.now()}`,
            sourceField: '',
            targetColumn: '',
        };
        onChange([...value, newMapping]);
    };

    const handleRemove = (id: string) => {
        onChange(value.filter((m) => m.id !== id));
    };

    const handleUpdate = (id: string, updates: Partial<FieldMapping>) => {
        onChange(
            value.map((m) => (m.id === id ? { ...m, ...updates } : m))
        );
    };

    // Get unmapped columns for quick-add suggestions
    const mappedColumns = new Set(value.map((m) => m.targetColumn));
    const unmappedColumns = columns.filter((c) => !mappedColumns.has(c.name));

    const handleQuickAddColumn = (column: TableColumn) => {
        const newMapping: FieldMapping = {
            id: `field-${Date.now()}`,
            sourceField: `{{ $input.data.${column.name} }}`,
            targetColumn: column.name,
        };
        onChange([...value, newMapping]);
    };

    return (
        <div className="space-y-3">
            {label && <Label>{label}</Label>}

            {/* Loading indicator */}
            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading columns...
                </div>
            )}

            {/* Quick add buttons for available columns */}
            {!loading && unmappedColumns.length > 0 && value.length === 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Available columns:</p>
                    <div className="flex flex-wrap gap-1">
                        {unmappedColumns.slice(0, 8).map((col) => (
                            <Button
                                key={col.name}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => handleQuickAddColumn(col)}
                            >
                                + {col.name}
                            </Button>
                        ))}
                        {unmappedColumns.length > 8 && (
                            <span className="text-xs text-muted-foreground self-center ml-1">
                                +{unmappedColumns.length - 8} more
                            </span>
                        )}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {value.length === 0 && !loading && (
                    <div className="text-xs text-muted-foreground py-2 text-center border border-dashed rounded">
                        No field mappings. Click "Add Field" or select a column above.
                    </div>
                )}

                {value.map((mapping) => (
                    <div
                        key={mapping.id}
                        className="flex items-center gap-2 bg-muted/50 p-2 rounded border"
                    >
                        {/* Source field (from input data) */}
                        <Input
                            value={mapping.sourceField}
                            onChange={(e) =>
                                handleUpdate(mapping.id, { sourceField: e.target.value })
                            }
                            placeholder="{{ $input.data.field }}"
                            className="flex-1 h-8 text-xs font-mono"
                        />

                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

                        {/* Target column - dropdown if columns available */}
                        {columns.length > 0 ? (
                            <Select
                                value={mapping.targetColumn}
                                onValueChange={(v) =>
                                    handleUpdate(mapping.id, { targetColumn: v })
                                }
                            >
                                <SelectTrigger className="flex-1 h-8 text-xs">
                                    <SelectValue placeholder="Select column" />
                                </SelectTrigger>
                                <SelectContent>
                                    {columns.map((col) => (
                                        <SelectItem key={col.name} value={col.name}>
                                            <span>{col.name}</span>
                                            <span className="ml-2 text-muted-foreground text-[10px]">
                                                {col.type}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                value={mapping.targetColumn}
                                onChange={(e) =>
                                    handleUpdate(mapping.id, { targetColumn: e.target.value })
                                }
                                placeholder="column_name"
                                className="flex-1 h-8 text-xs"
                            />
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleRemove(mapping.id)}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                ))}
            </div>

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAdd}
                className="w-full"
            >
                <Plus className="w-4 h-4 mr-2" />
                Add Field
            </Button>

            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
