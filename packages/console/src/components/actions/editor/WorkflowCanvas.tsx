/**
 * WorkflowCanvas - Main React Flow Editor
 * 
 * The visual workflow builder canvas using React Flow.
 */

import React, { useCallback, useRef, useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    ReactFlowInstance,
    Connection,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useActionsStore } from '@/stores/actions';
import { TriggerNode } from '../nodes/TriggerNode';
import { ActionNode } from '../nodes/ActionNode';
import { ConditionNode } from '../nodes/ConditionNode';
import { cn } from '@/lib/utils';
import {
    getNodeSchema,
    getDefaultInputsFromSchema,
    getDefaultOutputsFromSchema
} from '@/lib/workflow/nodeSchemas';
import { validateConnection } from '@/lib/workflow/typeCompatibility';
import { InvalidConnectionTooltip } from './InvalidConnectionTooltip';

// Register custom node types
const nodeTypes = {
    // Triggers - all trigger variants use TriggerNode
    trigger: TriggerNode,
    webhook_trigger: TriggerNode,
    schedule_trigger: TriggerNode,
    data_change_trigger: TriggerNode,
    ui_event_trigger: TriggerNode,
    // Core actions
    action: ActionNode,
    condition: ConditionNode,
    // Map specific action types to the generic ActionNode
    http_request: ActionNode,
    transform: ActionNode,
    log: ActionNode,
    database: ActionNode,
    data_request: ActionNode,
    // Interface Actions
    toast: ActionNode,
    redirect: ActionNode,
    refresh: ActionNode,
    // Output
    http_response: ActionNode,
};

// Node execution status type
interface NodeExecutionResult {
    nodeId: string;
    status: string;
    outputs?: Record<string, unknown>;
    error?: string;
}

interface WorkflowCanvasProps {
    className?: string;
    nodeExecutions?: NodeExecutionResult[];
}

export function WorkflowCanvas({ className, nodeExecutions }: WorkflowCanvasProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        selectNode,
        addNode,
        setLastValidationError,
        addRejectedConnection,
    } = useActionsStore();

    // Merge execution status into nodes
    const nodesWithStatus = useMemo(() => {
        if (!nodeExecutions || nodeExecutions.length === 0) return nodes;

        return nodes.map(node => {
            const execution = nodeExecutions.find(e => e.nodeId === node.id);
            if (execution) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        executionStatus: execution.status,
                        executionError: execution.error,
                    }
                };
            }
            return node;
        });
    }, [nodes, nodeExecutions]);

    // Style edges based on execution status and add data counts
    const edgesWithStatus = useMemo(() => {
        if (!nodeExecutions || nodeExecutions.length === 0) return edges;

        // Build a map of node outputs for data counting
        const nodeOutputsMap = new Map<string, Record<string, unknown>>();
        nodeExecutions.forEach(exec => {
            if (exec.outputs) {
                nodeOutputsMap.set(exec.nodeId, exec.outputs);
            }
        });

        const completedNodeIds = new Set(
            nodeExecutions.filter(e => e.status === 'completed').map(e => e.nodeId)
        );
        const errorNodeIds = new Set(
            nodeExecutions.filter(e => e.status === 'error').map(e => e.nodeId)
        );

        return edges.map(edge => {
            // Get data count from source node's output
            let label = '';
            const sourceOutputs = nodeOutputsMap.get(edge.source);
            if (sourceOutputs && completedNodeIds.has(edge.source)) {
                // Check for data array (like from data_request)
                const dataArray = sourceOutputs.data as unknown[];
                if (Array.isArray(dataArray)) {
                    label = `${dataArray.length} rows`;
                } else if (sourceOutputs.rowCount !== undefined) {
                    label = `${sourceOutputs.rowCount} rows`;
                } else if (typeof sourceOutputs === 'object') {
                    // Count keys for object outputs
                    const keyCount = Object.keys(sourceOutputs).length;
                    if (keyCount > 0) {
                        label = `${keyCount} fields`;
                    }
                }
            }

            // Edge is green if source completed successfully
            if (completedNodeIds.has(edge.source)) {
                return {
                    ...edge,
                    style: { stroke: '#22c55e', strokeWidth: 2 },
                    animated: false,
                    label,
                    labelStyle: { fill: '#22c55e', fontWeight: 600, fontSize: 11 },
                    labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
                    labelBgPadding: [4, 2] as [number, number],
                    labelBgBorderRadius: 4,
                };
            }
            // Edge is red if source had error
            if (errorNodeIds.has(edge.source)) {
                return {
                    ...edge,
                    style: { stroke: '#ef4444', strokeWidth: 2 },
                    animated: false,
                    label: '❌',
                    labelStyle: { fontSize: 12 },
                };
            }
            return edge;
        });
    }, [edges, nodeExecutions]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        selectNode(node.id);
    }, [selectNode]);

    const onPaneClick = useCallback(() => {
        selectNode(null);
    }, [selectNode]);

    // Validate connections before allowing them (Sprint 1)
    const handleConnect = useCallback((connection: Connection) => {
        const result = validateConnection(connection, nodes);
        if (!result.isValid) {
            setLastValidationError(result.error || 'Invalid connection');
            addRejectedConnection({
                source: connection.source || '',
                target: connection.target || '',
                error: result.error || 'Invalid connection',
            });
            return;
        }
        setLastValidationError(null);
        onConnect(connection);
    }, [nodes, onConnect, setLastValidationError, addRejectedConnection]);

    // Handle drag and drop from palette
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();

        if (!reactFlowInstance || !reactFlowWrapper.current) return;

        const nodeType = event.dataTransfer.getData('application/reactflow');
        if (!nodeType) return;

        const position = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        // Get label from schema or fallback to formatted type
        const schema = getNodeSchema(nodeType);
        const label = schema?.label || nodeType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const newNodeId = `${nodeType}-${Date.now()}`;

        // Auto-populate webhook path for webhook_trigger nodes
        let defaultInputs = getDefaultInputsFromSchema(nodeType);
        if (nodeType === 'webhook_trigger') {
            const shortId = newNodeId.slice(-8);
            defaultInputs = defaultInputs.map(inp =>
                inp.name === 'path'
                    ? { ...inp, value: `/wh/${shortId}` }
                    : inp
            );
        }

        const newNode = {
            id: newNodeId,
            type: nodeType,
            position,
            data: {
                label,
                type: nodeType,
                inputs: defaultInputs,
                outputs: getDefaultOutputsFromSchema(nodeType),
            },
        };

        addNode(newNode);
    }, [reactFlowInstance, addNode]);

    return (
        <div ref={reactFlowWrapper} className={cn('h-full w-full', className)}>
            <ReactFlow
                nodes={nodesWithStatus}
                edges={edgesWithStatus}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onInit={setReactFlowInstance}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[15, 15]}
                className="bg-muted/30"
            >
                <Background gap={15} size={1} />
                <Controls />
                <MiniMap
                    nodeStrokeWidth={3}
                    zoomable
                    pannable
                    className="bg-background border rounded-md"
                />
            </ReactFlow>
            <InvalidConnectionTooltip />
        </div>
    );
}

// Wrap with provider for external use
export function WorkflowCanvasWithProvider(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvas {...props} />
        </ReactFlowProvider>
    );
}

