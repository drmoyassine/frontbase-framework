/**
 * TriggerNode - Entry point node for workflows
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
    // Execution status styling
    const getStatusStyle = () => {
        if (data.executionStatus === 'completed') {
            return 'shadow-green-500/30 shadow-lg';
        }
        if (data.executionStatus === 'error') {
            return 'border-red-500 bg-red-500/10 shadow-red-500/20 shadow-md';
        }
        if (data.executionStatus === 'executing') {
            return 'shadow-yellow-500/30 shadow-lg';
        }
        return '';
    };

    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[150px] relative',
                'border-green-500/50 bg-green-500/5',
                selected && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background',
                getStatusStyle()
            )}
        >
            {/* Status Badge */}
            {data.executionStatus === 'completed' && (
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-md">
                    <Check className="w-3 h-3 text-white" />
                </div>
            )}
            {data.executionStatus === 'error' && (
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-md">
                    <X className="w-3 h-3 text-white" />
                </div>
            )}
            {data.executionStatus === 'executing' && (
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center shadow-md">
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                </div>
            )}

            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded bg-green-500/20">
                    <Zap className="w-4 h-4 text-green-500" />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className="w-3 h-3 !bg-green-500 !border-2 !border-background"
            />
        </div>
    );
});

TriggerNode.displayName = 'TriggerNode';
