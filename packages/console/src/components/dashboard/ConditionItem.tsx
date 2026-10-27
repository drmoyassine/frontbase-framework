
import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import { SmartValueInput } from './SmartValueInput';
import type {
    RLSCondition,
    RLSComparisonOperator,
    RLSValueSource
} from '@/types/rls';

interface ConditionItemProps {
    condition: RLSCondition;
    index: number;
    showCombinator: boolean;
    combinator: string;
    columns: Array<{ name: string; type: string }>; // Target columns
    sourceColumns: Array<{ name: string; type: string }>; // User/Source columns
    enumColumns: Record<string, string[]>;
    allowedSources: RLSValueSource[];
    onUpdate: (id: string, updates: Partial<RLSCondition>) => void;
    onRemove: (id: string) => void;
    disableRemove: boolean;
}

export function ConditionItem({
    condition,
    index,
    showCombinator,
    combinator,
    columns,
    sourceColumns,
    enumColumns,
    allowedSources,
    onUpdate,
    onRemove,
    disableRemove
}: ConditionItemProps) {

    return (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-lg border">
            {index > 0 && showCombinator && (
                <Badge variant="outline" className="text-xs shrink-0">
                    {combinator}
                </Badge>
            )}

            {/* Target table column (Left Side) */}
            <Select
                value={condition.column}
                onValueChange={(val) => onUpdate(condition.id, { column: val })}
            >
                <SelectTrigger className="w-[140px] h-8">
                    <SelectValue placeholder="Column" />
                </SelectTrigger>
                <SelectContent>
                    {columns.map(col => (
                        <SelectItem key={col.name} value={col.name}>
                            {col.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* Operator */}
            <Select
                value={condition.operator}
                onValueChange={(val) => onUpdate(condition.id, { operator: val as RLSComparisonOperator })}
            >
                <SelectTrigger className="w-[120px] h-8">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="equals">equals</SelectItem>
                    <SelectItem value="not_equals">not equals</SelectItem>
                    <SelectItem value="greater_than">greater than</SelectItem>
                    <SelectItem value="less_than">less than</SelectItem>
                    <SelectItem value="in">is in</SelectItem>
                    <SelectItem value="not_in">is not in</SelectItem>
                    <SelectItem value="is_null">is empty</SelectItem>
                    <SelectItem value="is_not_null">is not empty</SelectItem>
                    <SelectItem value="contains">contains</SelectItem>
                    <SelectItem value="starts_with">starts with</SelectItem>
                </SelectContent>
            </Select>

            {/* Only show value source if not null check */}
            {!['is_null', 'is_not_null'].includes(condition.operator) && (
                <SmartValueInput
                    value={condition.source === 'literal' ? (condition.literalValue || '') : (condition.sourceColumn || condition.literalValue || '')}
                    source={condition.source}
                    sourceColumn={condition.sourceColumn}
                    targetColumn={condition.column}
                    possibleValues={condition.column ? enumColumns[condition.column] : undefined}
                    userColumns={sourceColumns}
                    targetColumns={columns}
                    allowedSources={allowedSources}
                    onChange={(updates) => {
                        onUpdate(condition.id, {
                            source: updates.source,
                            sourceColumn: updates.sourceColumn,
                            // Ideally literalValue should be cleared if not literal, but for now we keep it simple or sync
                            literalValue: updates.value
                        });
                    }}
                />
            )}

            {/* Remove button */}
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive ml-auto"
                onClick={() => onRemove(condition.id)}
                disabled={disableRemove}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
}
