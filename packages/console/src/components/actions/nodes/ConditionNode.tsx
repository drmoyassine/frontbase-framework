/**
 * ConditionNode - Multi-route condition/router node
 * 
 * Renders dynamic output handles based on the conditions defined in the node data.
 */

import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Condition {
    id: string;
    name: string;
    field: string;
    operator: string;
    value: string;
}

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
    // Get conditions from the node data
    const conditions: Condition[] = useMemo(() => {
        const conditionsInput = data.inputs?.find((i: any) => i.name === 'conditions');
        if (conditionsInput?.value && Array.isArray(conditionsInput.value)) {
            return conditionsInput.value;
        }
        // Default if no conditions set
        return [{ id: 'default', name: 'Condition 1', field: '', operator: 'equals', value: '' }];
    }, [data.inputs]);

    // Calculate positions for handles
    const handleCount = conditions.length + 1; // +1 for else
    const handleSpacing = 100 / (handleCount + 1);

    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[180px]',
                'border-purple-500/50 bg-purple-500/5',
                selected && 'ring-2 ring-purple-500 ring-offset-2 ring-offset-background'
            )}
        >
            <Handle
                type="target"
                position={Position.Left}
                className="w-3 h-3 !bg-purple-500 !border-2 !border-background"
            />

            {/* Node Header */}
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded bg-purple-500/20">
                    <GitBranch className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            {/* Condition Routes Preview */}
            <div className="space-y-1 text-xs">
                {conditions.map((condition, index) => (
                    <div
                        key={condition.id}
                        className="flex items-center gap-1 text-muted-foreground"
                    >
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getRouteColor(index) }}
                        />
                        <span className="truncate max-w-[100px]">
                            {condition.name || `Route ${index + 1}`}
                        </span>
                    </div>
                ))}
                <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    <span>else</span>
                </div>
            </div>

            {/* Dynamic Output Handles */}
            {conditions.map((condition, index) => (
                <Handle
                    key={condition.id}
                    type="source"
                    position={Position.Right}
                    id={condition.name || `route_${index}`}
                    style={{ top: `${handleSpacing * (index + 1)}%` }}
                    className="w-3 h-3 !border-2 !border-background"
                    title={condition.name}
                />
            ))}

            {/* Else Handle (always last) */}
            <Handle
                type="source"
                position={Position.Right}
                id="else"
                style={{ top: `${handleSpacing * (conditions.length + 1)}%` }}
                className="w-3 h-3 !bg-gray-400 !border-2 !border-background"
                title="else (no match)"
            />

            {/* Handle Labels */}
            <div className="absolute right-[-8px] top-0 bottom-0 flex flex-col justify-around pr-8 text-xs pointer-events-none">
                {conditions.map((condition, index) => (
                    <div
                        key={condition.id}
                        className="text-right truncate max-w-[60px]"
                        style={{
                            color: getRouteColor(index),
                            position: 'absolute',
                            right: '-65px',
                            top: `calc(${handleSpacing * (index + 1)}% - 8px)`,
                        }}
                    >
                        {condition.name || `R${index + 1}`}
                    </div>
                ))}
                <div
                    className="text-gray-400 text-right"
                    style={{
                        position: 'absolute',
                        right: '-45px',
                        top: `calc(${handleSpacing * (conditions.length + 1)}% - 8px)`,
                    }}
                >
                    else
                </div>
            </div>
        </div>
    );
});

// Generate consistent colors for route handles
function getRouteColor(index: number): string {
    const colors = [
        '#22c55e', // green
        '#3b82f6', // blue
        '#f59e0b', // amber
        '#ec4899', // pink
        '#8b5cf6', // violet
        '#06b6d4', // cyan
        '#f97316', // orange
    ];
    return colors[index % colors.length];
}

ConditionNode.displayName = 'ConditionNode';
