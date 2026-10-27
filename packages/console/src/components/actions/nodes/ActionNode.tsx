/**
 * ActionNode - Generic action node (HTTP, Transform, etc.)
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Send, Code, MessageSquare, Database, Bell, ExternalLink, RefreshCw, Reply, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ElementType> = {
    // Actions
    action: Send,
    http_request: Send,
    transform: Code,
    log: MessageSquare,
    // Integrations
    database: Database,
    // Interface
    toast: Bell,
    redirect: ExternalLink,
    refresh: RefreshCw,
    // Output
    http_response: Reply,
    data_request: Database,
};

export const ActionNode = memo(({ data, selected }: NodeProps) => {
    const Icon = iconMap[data.type] || Send;

    // Determine color scheme based on node type category
    const getColorScheme = (type: string) => {
        const interfaceNodes = ['toast', 'redirect', 'refresh'];
        const integrationNodes = ['database'];

        if (interfaceNodes.includes(type)) {
            return {
                border: 'border-pink-500/50 bg-pink-500/5',
                ring: 'ring-pink-500',
                handle: '!bg-pink-500',
                iconBg: 'bg-pink-500/20',
                iconText: 'text-pink-500',
            };
        }
        if (integrationNodes.includes(type)) {
            return {
                border: 'border-orange-500/50 bg-orange-500/5',
                ring: 'ring-orange-500',
                handle: '!bg-orange-500',
                iconBg: 'bg-orange-500/20',
                iconText: 'text-orange-500',
            };
        }
        const outputNodes = ['http_response'];
        if (outputNodes.includes(type)) {
            return {
                border: 'border-cyan-500/50 bg-cyan-500/5',
                ring: 'ring-cyan-500',
                handle: '!bg-cyan-500',
                iconBg: 'bg-cyan-500/20',
                iconText: 'text-cyan-500',
            };
        }
        // Default: blue for actions
        return {
            border: 'border-blue-500/50 bg-blue-500/5',
            ring: 'ring-blue-500',
            handle: '!bg-blue-500',
            iconBg: 'bg-blue-500/20',
            iconText: 'text-blue-500',
        };
    };

    const colors = getColorScheme(data.type);

    // Execution status styling
    const getStatusStyle = () => {
        if (data.executionStatus === 'completed') {
            return 'border-green-500 bg-green-500/10 shadow-green-500/20 shadow-md';
        }
        if (data.executionStatus === 'error') {
            return 'border-red-500 bg-red-500/10 shadow-red-500/20 shadow-md';
        }
        if (data.executionStatus === 'executing') {
            return 'border-yellow-500 bg-yellow-500/10 shadow-yellow-500/20 shadow-md';
        }
        return '';
    };

    return (
        <div
            className={cn(
                'px-4 py-3 rounded-lg border-2 bg-card shadow-sm min-w-[150px] relative',
                colors.border,
                selected && `ring-2 ${colors.ring} ring-offset-2 ring-offset-background`,
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

            <Handle
                type="target"
                position={Position.Left}
                className={cn('w-3 h-3 !border-2 !border-background', colors.handle)}
            />

            <div className="flex items-center gap-2">
                <div className={cn('p-1.5 rounded', colors.iconBg)}>
                    <Icon className={cn('w-4 h-4', colors.iconText)} />
                </div>
                <div className="text-sm font-medium">{data.label}</div>
            </div>

            <Handle
                type="source"
                position={Position.Right}
                className={cn('w-3 h-3 !border-2 !border-background', colors.handle)}
            />
        </div>
    );
});

ActionNode.displayName = 'ActionNode';
