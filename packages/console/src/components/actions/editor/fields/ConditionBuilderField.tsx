/**
 * ConditionBuilderField - Multi-condition router builder
 * 
 * Allows users to add multiple conditions, each with a name that becomes an output handle.
 */

import React from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
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

export interface Condition {
    id: string;
    name: string;
    field: string;
    operator: string;
    value: string;
}

interface ConditionBuilderFieldProps {
    name: string;
    label?: string;
    value: Condition[];
    onChange: (value: Condition[]) => void;
    description?: string;
}

const OPERATORS = [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'notContains', label: 'Not Contains' },
    { value: 'greaterThan', label: 'Greater Than' },
    { value: 'lessThan', label: 'Less Than' },
    { value: 'greaterThanOrEqual', label: '>=' },
    { value: 'lessThanOrEqual', label: '<=' },
    { value: 'isEmpty', label: 'Is Empty' },
    { value: 'isNotEmpty', label: 'Is Not Empty' },
    { value: 'startsWith', label: 'Starts With' },
    { value: 'endsWith', label: 'Ends With' },
    { value: 'regex', label: 'Regex Match' },
];

export function ConditionBuilderField({
    label,
    value = [],
    onChange,
    description,
}: ConditionBuilderFieldProps) {
    const handleAddCondition = () => {
        const newCondition: Condition = {
            id: `cond-${Date.now()}`,
            name: `Condition ${value.length + 1}`,
            field: '',
            operator: 'equals',
            value: '',
        };
        onChange([...value, newCondition]);
    };

    const handleRemoveCondition = (id: string) => {
        onChange(value.filter((c) => c.id !== id));
    };

    const handleUpdateCondition = (id: string, updates: Partial<Condition>) => {
        onChange(
            value.map((c) => (c.id === id ? { ...c, ...updates } : c))
        );
    };

    return (
        <div className="space-y-3">
            {label && <Label>{label}</Label>}

            <div className="space-y-3">
                {value.map((condition, index) => (
                    <div
                        key={condition.id}
                        className="bg-muted/50 rounded-lg p-3 space-y-2 border"
                    >
                        {/* Condition Header */}
                        <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                            <Input
                                value={condition.name}
                                onChange={(e) =>
                                    handleUpdateCondition(condition.id, { name: e.target.value })
                                }
                                placeholder="Route name"
                                className="flex-1 h-8 text-sm font-medium"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRemoveCondition(condition.id)}
                                disabled={value.length <= 1}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Field to evaluate */}
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
                            <Input
                                value={condition.field}
                                onChange={(e) =>
                                    handleUpdateCondition(condition.id, { field: e.target.value })
                                }
                                placeholder="{{ $input.data.status }}"
                                className="h-8 text-xs font-mono"
                            />

                            <Select
                                value={condition.operator}
                                onValueChange={(op) =>
                                    handleUpdateCondition(condition.id, { operator: op })
                                }
                            >
                                <SelectTrigger className="w-[130px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OPERATORS.map((op) => (
                                        <SelectItem key={op.value} value={op.value}>
                                            {op.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Hide value input for isEmpty/isNotEmpty */}
                            {!['isEmpty', 'isNotEmpty'].includes(condition.operator) && (
                                <Input
                                    value={condition.value}
                                    onChange={(e) =>
                                        handleUpdateCondition(condition.id, { value: e.target.value })
                                    }
                                    placeholder="Value"
                                    className="h-8 text-xs"
                                />
                            )}
                        </div>

                        {/* Output indicator */}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            Route: <span className="font-mono">{condition.name || `output_${index}`}</span>
                        </div>
                    </div>
                ))}

                {/* Fallback/Else route indicator */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 bg-muted/30 rounded-lg border border-dashed">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="font-mono">else</span>
                    <span className="ml-1">— Default route (no conditions match)</span>
                </div>
            </div>

            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCondition}
                className="w-full"
            >
                <Plus className="w-4 h-4 mr-2" />
                Add Condition
            </Button>

            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
