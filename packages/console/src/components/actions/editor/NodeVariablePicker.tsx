/**
 * NodeVariablePicker - Autocomplete dropdown for workflow node outputs
 * 
 * Shows upstream nodes first, drill down into their output fields.
 * Supports nested field access like node.data[0].field
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Zap, Send, Code, Database, GitBranch, Box } from 'lucide-react';
import { getNodeSchema, OutputDefinition } from '@/lib/workflow/nodeSchemas';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface WorkflowNode {
    id: string;
    type?: string;
    data: {
        label: string;
        type: string;
        inputs?: Array<{ name: string; type?: string; value?: any }>;
    };
}

interface WorkflowEdge {
    source: string;
    target: string;
}

interface NodeExecution {
    nodeId: string;
    status: string;
    outputs?: Record<string, unknown>;
}

interface NodeVariablePickerProps {
    onSelect: (value: string) => void;
    onClose: () => void;
    searchTerm: string;
    position: { top: number; left: number };
    currentNodeId: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    nodeExecutions?: NodeExecution[];
}

// Icons for node types
const NODE_ICONS: Record<string, React.ReactNode> = {
    trigger: <Zap className="h-4 w-4" />,
    manual_trigger: <Zap className="h-4 w-4" />,
    webhook_trigger: <Zap className="h-4 w-4" />,
    http_request: <Send className="h-4 w-4" />,
    data_request: <Database className="h-4 w-4" />,
    transform: <Code className="h-4 w-4" />,
    condition: <GitBranch className="h-4 w-4" />,
    default: <Box className="h-4 w-4" />,
};

const NODE_COLORS: Record<string, string> = {
    trigger: 'text-green-500',
    manual_trigger: 'text-green-500',
    webhook_trigger: 'text-green-500',
    http_request: 'text-blue-500',
    data_request: 'text-orange-500',
    transform: 'text-purple-500',
    condition: 'text-yellow-500',
    default: 'text-gray-500',
};

interface FieldPath {
    path: string;
    type: string;
    description?: string;
    sampleValue?: unknown;
    isNested?: boolean;
}

export function NodeVariablePicker({
    onSelect,
    onClose,
    searchTerm,
    position,
    currentNodeId,
    nodes,
    edges,
    nodeExecutions,
}: NodeVariablePickerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [activeNode, setActiveNode] = useState<string | null>(null);
    const [drillPath, setDrillPath] = useState<string[]>([]);
    const listRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLDivElement>(null);

    // Get all upstream nodes connected to current node
    const upstreamNodes = useMemo(() => {
        const upstream: string[] = [];
        const visited = new Set<string>();
        const queue = [currentNodeId];

        while (queue.length > 0) {
            const nodeId = queue.shift()!;
            if (visited.has(nodeId)) continue;
            visited.add(nodeId);

            const incomingEdges = edges.filter(e => e.target === nodeId);
            for (const edge of incomingEdges) {
                if (!visited.has(edge.source)) {
                    upstream.push(edge.source);
                    queue.push(edge.source);
                }
            }
        }

        return upstream
            .map(id => nodes.find(n => n.id === id))
            .filter((n): n is WorkflowNode => n !== undefined);
    }, [currentNodeId, nodes, edges]);

    // Get outputs for a node (from schema)
    const getNodeOutputs = useCallback((node: WorkflowNode): OutputDefinition[] => {
        const schema = getNodeSchema(node.data.type || node.type);
        return schema?.outputs || [];
    }, []);

    // Get sample data for a node from executions
    const getNodeSampleData = useCallback((nodeId: string): Record<string, unknown> | null => {
        const execution = nodeExecutions?.find(e => e.nodeId === nodeId);
        return execution?.outputs || null;
    }, [nodeExecutions]);

    // Build field paths for drilling - supports nested objects and arrays
    const getFieldsAtPath = useCallback((nodeId: string, path: string[]): FieldPath[] => {
        const sampleData = getNodeSampleData(nodeId);
        const node = nodes.find(n => n.id === nodeId);

        if (!sampleData) {
            // Fall back to schema outputs if no sample data
            if (path.length === 0 && node) {
                const outputs = getNodeOutputs(node);
                return outputs.map(o => ({
                    path: o.name,
                    type: o.type,
                    description: o.description,
                }));
            }
            return [];
        }

        // Navigate to current path in sample data
        let current: unknown = sampleData;
        for (const segment of path) {
            if (current === null || current === undefined) return [];
            if (Array.isArray(current)) {
                const index = parseInt(segment.replace(/[\[\]]/g, ''), 10);
                current = current[index];
            } else if (typeof current === 'object') {
                current = (current as Record<string, unknown>)[segment];
            } else {
                return [];
            }
        }

        // List fields at current level
        const fields: FieldPath[] = [];

        if (Array.isArray(current)) {
            // Show array indices
            current.forEach((_, i) => {
                fields.push({
                    path: `[${i}]`,
                    type: 'array element',
                    sampleValue: current[i],
                    isNested: typeof current[i] === 'object' && current[i] !== null,
                });
            });
        } else if (typeof current === 'object' && current !== null) {
            // Show object keys
            Object.entries(current).forEach(([key, value]) => {
                fields.push({
                    path: key,
                    type: typeof value === 'object'
                        ? (Array.isArray(value) ? `array[${value.length}]` : 'object')
                        : typeof value,
                    sampleValue: value,
                    isNested: typeof value === 'object' && value !== null,
                });
            });
        }

        return fields;
    }, [getNodeSampleData, getNodeOutputs, nodes]);

    // Filter nodes based on search
    const filteredNodes = useMemo(() => {
        if (!searchTerm) return upstreamNodes;
        return upstreamNodes.filter(n =>
            n.data.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            n.data.type.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [upstreamNodes, searchTerm]);

    // Current fields when drilling into a node
    const currentFields = useMemo(() => {
        if (!activeNode) return [];
        const fields = getFieldsAtPath(activeNode, drillPath);
        if (!searchTerm) return fields;
        return fields.filter(f =>
            f.path.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [activeNode, drillPath, getFieldsAtPath, searchTerm]);

    // Get current items to display
    const currentItems = activeNode ? currentFields : filteredNodes;
    const totalItems = currentItems.length;

    // Reset selection when view changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [activeNode, drillPath.length, searchTerm]);

    // Scroll selected into view
    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(i => Math.min(i + 1, totalItems - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(i => Math.max(i - 1, 0));
                    break;
                case 'ArrowRight':
                case 'Enter':
                case 'Tab':
                    e.preventDefault();
                    handleSelect(selectedIndex);
                    break;
                case 'ArrowLeft':
                case 'Backspace':
                    if (activeNode && (e.key === 'ArrowLeft' || (e.key === 'Backspace' && !searchTerm))) {
                        e.preventDefault();
                        if (drillPath.length > 0) {
                            setDrillPath(p => p.slice(0, -1));
                        } else {
                            setActiveNode(null);
                        }
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (activeNode) {
                        if (drillPath.length > 0) {
                            setDrillPath([]);
                        } else {
                            setActiveNode(null);
                        }
                    } else {
                        onClose();
                    }
                    break;
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, totalItems, activeNode, drillPath, searchTerm, onClose]);

    const handleSelect = useCallback((index: number) => {
        if (!activeNode) {
            // Selecting a node - drill down
            if (index < filteredNodes.length) {
                setActiveNode(filteredNodes[index].id);
                setDrillPath([]);
            }
        } else {
            // Selecting a field
            if (index < currentFields.length) {
                const field = currentFields[index];
                if (field.isNested) {
                    // Drill deeper
                    setDrillPath(p => [...p, field.path]);
                } else {
                    // Select field - build full path
                    const node = nodes.find(n => n.id === activeNode);
                    const fullPath = [node?.data.label || activeNode, ...drillPath, field.path].join('.');
                    onSelect(`{{ ${fullPath} }}`);
                    onClose();
                }
            }
        }
    }, [activeNode, filteredNodes, currentFields, drillPath, nodes, onSelect, onClose]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (listRef.current && !listRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const activeNodeData = activeNode ? nodes.find(n => n.id === activeNode) : null;

    if (totalItems === 0 && upstreamNodes.length === 0) {
        return (
            <div
                ref={listRef}
                className="variable-picker fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-80 min-w-[260px] max-w-[360px] overflow-y-auto"
                style={{ top: position.top, left: position.left }}
            >
                <div className="p-3 text-sm text-muted-foreground">
                    No upstream nodes available
                </div>
            </div>
        );
    }

    return (
        <TooltipProvider>
            <div
                ref={listRef}
                className="variable-picker fixed z-[9999] bg-popover border border-border rounded-lg shadow-lg max-h-80 min-w-[260px] max-w-[360px] overflow-y-auto"
                onMouseDown={(e) => e.preventDefault()}
                style={{ top: position.top, left: position.left }}
            >
                {/* Header with back button when drilling */}
                {activeNode && (
                    <div className="header-back-container">
                        <div
                            className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border cursor-pointer text-sm hover:bg-accent"
                            onClick={() => {
                                if (drillPath.length > 0) {
                                    setDrillPath(p => p.slice(0, -1));
                                } else {
                                    setActiveNode(null);
                                }
                            }}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            <span className={NODE_COLORS[activeNodeData?.data.type || 'default'] || NODE_COLORS.default}>
                                {NODE_ICONS[activeNodeData?.data.type || 'default'] || NODE_ICONS.default}
                            </span>
                            <span className="font-medium">
                                {activeNodeData?.data.label}
                                {drillPath.length > 0 && <span className="text-muted-foreground">.{drillPath.join('.')}</span>}
                            </span>
                        </div>
                    </div>
                )}

                {/* Nodes view */}
                {!activeNode && filteredNodes.length > 0 && (
                    <div className="py-1">
                        <div className="px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                            <span>🔗</span> Upstream Nodes
                        </div>
                        {filteredNodes.map((node, i) => {
                            const icon = NODE_ICONS[node.data.type] || NODE_ICONS.default;
                            const color = NODE_COLORS[node.data.type] || NODE_COLORS.default;
                            const outputCount = getNodeOutputs(node).length;
                            const hasSampleData = !!getNodeSampleData(node.id);

                            return (
                                <div
                                    key={node.id}
                                    ref={i === selectedIndex ? selectedRef : null}
                                    className={cn(
                                        'px-3 py-2.5 cursor-pointer flex items-center gap-2.5 text-sm transition-colors',
                                        i === selectedIndex && 'bg-accent'
                                    )}
                                    onClick={() => handleSelect(i)}
                                    onMouseEnter={() => setSelectedIndex(i)}
                                >
                                    <span className={cn('flex-shrink-0', color)}>{icon}</span>
                                    <span className="font-medium text-foreground">{node.data.label}</span>
                                    {hasSampleData && (
                                        <span className="text-xs text-green-500">●</span>
                                    )}
                                    <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                                        {outputCount} outputs
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Fields in active node */}
                {activeNode && currentFields.length > 0 && (
                    <div className="py-1">
                        {currentFields.map((field, i) => (
                            <Tooltip key={field.path}>
                                <TooltipTrigger asChild>
                                    <div
                                        ref={i === selectedIndex ? selectedRef : null}
                                        className={cn(
                                            'px-3 py-2 cursor-pointer flex items-center gap-2 text-sm transition-colors',
                                            i === selectedIndex && 'bg-accent'
                                        )}
                                        onClick={() => handleSelect(i)}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <span className="font-mono font-medium text-foreground">{field.path}</span>
                                        <span className="text-[0.7rem] text-muted-foreground bg-muted px-1 py-0.5 rounded">
                                            {field.type}
                                        </span>
                                        {field.isNested && (
                                            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground flex-shrink-0" />
                                        )}
                                    </div>
                                </TooltipTrigger>
                                {field.sampleValue !== undefined && (
                                    <TooltipContent side="right" className="max-w-xs">
                                        <div className="text-xs">
                                            <div className="font-semibold mb-1">Sample value:</div>
                                            <pre className="bg-muted p-1 rounded text-[10px] overflow-auto max-h-24">
                                                {typeof field.sampleValue === 'object'
                                                    ? JSON.stringify(field.sampleValue, null, 2).slice(0, 200)
                                                    : String(field.sampleValue).slice(0, 100)}
                                            </pre>
                                        </div>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        ))}
                    </div>
                )}

                {activeNode && currentFields.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground">
                        Run a test to see available fields
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}
