/**
 * NodePalette - Draggable Node Sidebar
 * 
 * Lists available node types that can be dragged onto the canvas.
 * Supports drag-and-drop AND double-click to add nodes.
 */

import React from 'react';
import { Zap, GitBranch, Globe, Code, MessageSquare, Database, Timer, Send, Bell, ExternalLink, RefreshCw, Reply, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActionsStore } from '@/stores/actions';
import { getNodeSchema, getDefaultInputsFromSchema, getDefaultOutputsFromSchema } from '@/lib/workflow/nodeSchemas';

interface NodeTypeConfig {
    type: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    category: 'triggers' | 'actions' | 'logic' | 'integrations' | 'interface' | 'output';
}

const nodeTypes: NodeTypeConfig[] = [
    // Triggers
    {
        type: 'trigger',
        label: 'Manual Trigger',
        description: 'Start workflow manually',
        icon: <Zap className="w-4 h-4" />,
        category: 'triggers',
    },
    {
        type: 'webhook_trigger',
        label: 'Webhook',
        description: 'Trigger via HTTP webhook',
        icon: <Globe className="w-4 h-4" />,
        category: 'triggers',
    },
    {
        type: 'schedule_trigger',
        label: 'Schedule',
        description: 'Trigger on a schedule',
        icon: <Timer className="w-4 h-4" />,
        category: 'triggers',
    },
    {
        type: 'data_change_trigger',
        label: 'Data Change',
        description: 'Trigger when data changes',
        icon: <Database className="w-4 h-4" />,
        category: 'triggers',
    },

    // Actions
    {
        type: 'http_request',
        label: 'HTTP Request',
        description: 'Make an HTTP request',
        icon: <Send className="w-4 h-4" />,
        category: 'actions',
    },
    {
        type: 'transform',
        label: 'Transform',
        description: 'Transform data',
        icon: <Code className="w-4 h-4" />,
        category: 'actions',
    },
    {
        type: 'log',
        label: 'Console Log',
        description: 'Log to console',
        icon: <MessageSquare className="w-4 h-4" />,
        category: 'actions',
    },

    // Logic
    {
        type: 'condition',
        label: 'Condition',
        description: 'If/else branching',
        icon: <GitBranch className="w-4 h-4" />,
        category: 'logic',
    },

    // Integrations
    {
        type: 'data_request',
        label: 'Data Request',
        description: 'Query or modify data',
        icon: <Database className="w-4 h-4" />,
        category: 'actions',
    },

    // Interface
    {
        type: 'toast',
        label: 'Show Toast',
        description: 'Show a notification toast',
        icon: <Bell className="w-4 h-4" />,
        category: 'interface',
    },
    {
        type: 'redirect',
        label: 'Redirect',
        description: 'Navigate to URL',
        icon: <ExternalLink className="w-4 h-4" />,
        category: 'interface',
    },
    {
        type: 'refresh',
        label: 'Refresh Page',
        description: 'Reload the current page',
        icon: <RefreshCw className="w-4 h-4" />,
        category: 'interface',
    },
    {
        type: 'set_variable',
        label: 'Set Variable',
        description: 'Set value of a variable',
        icon: <Sliders className="w-4 h-4" />,
        category: 'interface',
    },

    // Output
    {
        type: 'http_response',
        label: 'HTTP Response',
        description: 'Return response to webhook caller',
        icon: <Reply className="w-4 h-4" />,
        category: 'output',
    },
];

const categories = [
    { id: 'triggers', label: 'Triggers', color: 'text-green-500' },
    { id: 'actions', label: 'Actions', color: 'text-blue-500' },
    { id: 'logic', label: 'Logic', color: 'text-purple-500' },
    { id: 'integrations', label: 'Integrations', color: 'text-orange-500' },
    { id: 'interface', label: 'User Interface', color: 'text-pink-500' },
    { id: 'output', label: 'Output', color: 'text-cyan-500' },
] as const;

interface NodePaletteProps {
    className?: string;
    hideTriggers?: boolean;
}

export function NodePalette({ className, hideTriggers }: NodePaletteProps) {
    const { nodes, addNode } = useActionsStore();

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    // Double-click to add node at a calculated position
    const onDoubleClick = (nodeType: string, label: string) => {
        // Calculate position - offset from existing nodes to avoid stacking
        const existingCount = nodes.length;
        const baseX = 300;
        const baseY = 100;
        const offsetX = (existingCount % 3) * 250; // 3 columns
        const offsetY = Math.floor(existingCount / 3) * 150; // rows

        const newNode = {
            id: `${nodeType}-${Date.now()}`,
            type: nodeType,
            position: { x: baseX + offsetX, y: baseY + offsetY },
            data: {
                label,
                type: nodeType,
                inputs: getDefaultInputsFromSchema(nodeType),
                outputs: getDefaultOutputsFromSchema(nodeType),
            },
        };

        addNode(newNode);
    };

    return (
        <div className={cn('w-64 bg-background border-r p-4 overflow-y-auto', className)}>
            <h3 className="font-semibold text-sm text-muted-foreground mb-4">
                Drag or double-click to add
            </h3>

            {categories
                .filter(cat => !hideTriggers || cat.id !== 'triggers')
                .map((category) => (
                    <div key={category.id} className="mb-4">
                        <h4 className={cn('text-xs font-medium mb-2', category.color)}>
                            {category.label}
                        </h4>
                        <div className="space-y-2">
                            {nodeTypes
                                .filter((n) => n.category === category.id)
                                .map((node) => (
                                    <div
                                        key={node.type}
                                        className="flex items-center gap-3 p-2 rounded-md border bg-card cursor-grab hover:border-primary transition-colors select-none"
                                        draggable
                                        onDragStart={(e) => onDragStart(e, node.type)}
                                        onDoubleClick={() => onDoubleClick(node.type, node.label)}
                                    >
                                        <div className="p-1.5 rounded bg-muted">
                                            {node.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">
                                                {node.label}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {node.description}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
        </div>
    );
}

