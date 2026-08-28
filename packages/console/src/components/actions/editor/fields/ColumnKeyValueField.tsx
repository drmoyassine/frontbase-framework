/**
 * ColumnKeyValueField - Key-value with column autocomplete from table schema
 * 
 * Used for Fields to Select, WHERE conditions, etc.
 */

import React from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
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
import { useTableColumns } from '../hooks/useTableColumns';

interface KeyValuePair {
    key: string;
    value: string;
}

interface ColumnKeyValueFieldProps {
    name: string;
    label?: string;
    value: KeyValuePair[];
    onChange: (value: KeyValuePair[]) => void;
    description?: string;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
    dataSourceId?: string;
    tableName?: string;
}

export function ColumnKeyValueField({
    label,
    value = [],
    onChange,
    description,
    keyPlaceholder = 'Column',
    valuePlaceholder = 'Value',
    dataSourceId,
    tableName,
}: ColumnKeyValueFieldProps) {
    const { columns, loading } = useTableColumns(dataSourceId, tableName);

    const handleAdd = () => {
        onChange([...value, { key: '', value: '' }]);
    };

    const handleRemove = (index: number) => {
        const newValue = value.filter((_, i) => i !== index);
        onChange(newValue);
    };

    const handleUpdate = (index: number, field: 'key' | 'value', newValue: string) => {
        const updated = value.map((pair, i) =>
            i === index ? { ...pair, [field]: newValue } : pair
        );
        onChange(updated);
    };

    // Get unused columns for quick-add
    const usedColumns = new Set(value.map((p) => p.key));
    const availableColumns = columns.filter((c) => !usedColumns.has(c.name));

    const handleQuickAddColumn = (columnName: string) => {
        onChange([...value, { key: columnName, value: '' }]);
    };

    return (
        <div className="space-y-3">
            {label && <Label>{label}</Label>}

            {/* Loading indicator */}
            {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="text-xs">Loading columns...</span>
                </div>
            )}

            {/* Quick-add column chips */}
            {!loading && availableColumns.length > 0 && value.length === 0 && (
                <div className="flex flex-wrap gap-1">
                    {availableColumns.slice(0, 6).map((col) => (
                        <Button
                            key={col.name}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => handleQuickAddColumn(col.name)}
                        >
                            + {col.name}
                        </Button>
                    ))}
                    {availableColumns.length > 6 && (
                        <span className="text-xs text-muted-foreground self-center">
                            +{availableColumns.length - 6} more
                        </span>
                    )}
                </div>
            )}

            <div className="space-y-2">
                {value.map((pair, index) => (
                    <div key={index} className="flex items-center gap-2">
                        {/* Column selector or input */}
                        {columns.length > 0 ? (
                            <Select
                                value={pair.key}
                                onValueChange={(v) => handleUpdate(index, 'key', v)}
                            >
                                <SelectTrigger className="flex-1 h-8 text-xs">
                                    <SelectValue placeholder={keyPlaceholder} />
                                </SelectTrigger>
                                <SelectContent>
                                    {columns.map((col) => (
                                        <SelectItem key={col.name} value={col.name}>
                                            {col.name}
                                            <span className="ml-2 text-muted-foreground text-[10px]">
                                                {col.type}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                value={pair.key}
                                onChange={(e) => handleUpdate(index, 'key', e.target.value)}
                                placeholder={keyPlaceholder}
                                className="flex-1 h-8 text-xs"
                            />
                        )}

                        <Input
                            value={pair.value}
                            onChange={(e) => handleUpdate(index, 'value', e.target.value)}
                            placeholder={valuePlaceholder}
                            className="flex-1 h-8 text-xs"
                        />

                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleRemove(index)}
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
                Add
            </Button>

            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
