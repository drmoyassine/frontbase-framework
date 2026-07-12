/**
 * WorkflowEditor (Phase 3c / F2) — a visual DAG editor built on React Flow.
 * Replaces the vertical node-list in Automations.tsx with a real canvas: nodes
 * positioned on a grid, draggable, connectable (draw edges between handles).
 *
 * Storage stays JSON (nodes/edges arrays the backend persists). RF nodes carry
 * `position` + `data.label`; edges carry source/target. The palette adds nodes
 * at a default position; the user drags + connects.
 */
import { useCallback } from 'react';
import ReactFlow, {
    Background, Controls, MiniMap, addEdge,
    type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
    applyNodeChanges, applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';

export interface RfNode extends Node {
    data: { label: string; type: string };
}
export interface WorkflowGraph {
    nodes: RfNode[];
    edges: Edge[];
}

const NODE_COLORS: Record<string, string> = {
    trigger: '#22c55e', condition: '#eab308', action: '#3b82f6',
    delay: '#a855f7', webhook: '#ec4899', email: '#06b6d4', transform: '#f97316',
};

export interface WorkflowEditorProps {
    graph: WorkflowGraph;
    onChange: (graph: WorkflowGraph) => void;
    /** Node types offered by the palette (added externally — this component is just the canvas). */
}

export function WorkflowEditor({ graph, onChange }: WorkflowEditorProps) {
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        onChange({ ...graph, nodes: applyNodeChanges(changes, graph.nodes) as RfNode[] });
    }, [graph, onChange]);

    const onEdgesChange = useCallback((changes: EdgeChange[]) => {
        onChange({ ...graph, edges: applyEdgeChanges(changes, graph.edges) });
    }, [graph, onChange]);

    const onConnect = useCallback((connection: Connection) => {
        onChange({ ...graph, edges: addEdge({ ...connection, animated: true }, graph.edges) });
    }, [graph, onChange]);

    return (
        <div className="h-[420px] w-full rounded-md border">
            <ReactFlow
                nodes={graph.nodes}
                edges={graph.edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                nodeTypes={{}}
                defaultEdgeOptions={{ style: { stroke: '#94a3b8', strokeWidth: 2 }, animated: true }}
            >
                <Background color="#cbd5e1" gap={16} />
                <Controls />
                <MiniMap nodeColor={(n) => NODE_COLORS[(n.data as { type: string })?.type] ?? '#64748b'} />
            </ReactFlow>
        </div>
    );
}

/** Default position helper for newly-added palette nodes (stagger to avoid overlap). */
export function defaultPosition(index: number): { x: number; y: number } {
    return { x: 80 + (index % 4) * 200, y: 60 + Math.floor(index / 4) * 120 };
}

/** Node style with a colored top border by type. */
export function nodeStyle(type: string): React.CSSProperties {
    return { border: `2px solid ${NODE_COLORS[type] ?? '#64748b'}`, borderRadius: 8, padding: 8, background: '#fff' };
}
