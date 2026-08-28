import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { ConditionItem } from './ConditionItem';
import type {
    RLSCondition,
    RLSConditionGroup,
    RLSValueSource
} from '@/types/rls';

interface ConditionGroupBuilderProps {
    group: RLSConditionGroup;
    onChange: (group: RLSConditionGroup) => void;
    columns: Array<{ name: string; type: string }>; // Target columns for the left side
    sourceColumns?: Array<{ name: string; type: string }>; // Columns for the right side (contacts/user attributes)
    allowedSources?: RLSValueSource[];
    enumColumns?: Record<string, string[]>; // Map of column name -> possible values
    title?: string;
    showCombinator?: boolean;
}

/**
 * Generate a unique ID for conditions
 */
function generateId(): string {
    return `cond-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty condition
 */
export function createEmptyCondition(defaultSource: RLSValueSource = 'literal'): RLSCondition {
    return {
        id: generateId(),
        column: '',
        operator: 'equals',
        source: defaultSource,
        sourceColumn: ''
    };
}

export function ConditionGroupBuilder({
    group,
    onChange,
    columns,
    sourceColumns = [],
    allowedSources = ['contacts', 'auth', 'literal'],
    enumColumns = {},
    title,
    showCombinator = true
}: ConditionGroupBuilderProps) {

    const updateCondition = (conditionId: string, updates: Partial<RLSCondition>) => {
        onChange({
            ...group,
            conditions: group.conditions.map(c =>
                'id' in c && c.id === conditionId ? { ...c, ...updates } : c
            )
        });
    };

    const addCondition = () => {
        onChange({
            ...group,
            conditions: [...group.conditions, createEmptyCondition(allowedSources.includes('literal') ? 'literal' : allowedSources[0])]
        });
    };

    const removeCondition = (conditionId: string) => {
        onChange({
            ...group,
            conditions: group.conditions.filter(c => !('id' in c) || c.id !== conditionId)
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                {title && <Label className="text-sm font-medium">{title}</Label>}
                {showCombinator && (
                    <div className="flex items-center gap-2">
                        <Select
                            value={group.combinator}
                            onValueChange={(val) => onChange({ ...group, combinator: val as 'AND' | 'OR' })}
                        >
                            <SelectTrigger className="w-[80px] h-7 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AND">AND</SelectItem>
                                <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {group.conditions.map((cond, index) => {
                    if (!('column' in cond)) return null;
                    const condition = cond as RLSCondition;

                    return (
                        <ConditionItem
                            key={condition.id}
                            condition={condition}
                            index={index}
                            showCombinator={showCombinator}
                            combinator={group.combinator}
                            columns={columns}
                            sourceColumns={sourceColumns}
                            enumColumns={enumColumns}
                            allowedSources={allowedSources}
                            onUpdate={updateCondition}
                            onRemove={removeCondition}
                            disableRemove={group.conditions.length <= 1}
                        />
                    );
                })}
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={addCondition}
                className="w-full"
            >
                <Plus className="h-4 w-4 mr-2" />
                Add Condition
            </Button>
        </div>
    );
}
