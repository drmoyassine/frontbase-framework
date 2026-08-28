/**
 * Actions Store - Zustand
 * 
 * Manages UI state for the workflow editor (synchronous operations).
 */

import { create } from 'zustand';
import { Node, Edge, Connection, addEdge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from 'reactflow';

export interface WorkflowNode extends Node {
    data: {
        label: string;
        type: string;
        inputs: Array<{ name: string; type: string; value?: any }>;
        outputs: Array<{ name: string; type: string }>;
    };
}

export interface ActionsState {
    // Current draft info
    currentDraftId: string | null;
    draftName: string;
    triggerType: 'manual' | 'http_webhook' | 'scheduled' | 'data_change';

    // React Flow state
    nodes: WorkflowNode[];
    edges: Edge[];
    selectedNodeId: string | null;

    // Editor state
    isEditorOpen: boolean;
    isDirty: boolean;
    isSaving: boolean;
    isPublishing: boolean;

    // Validation state (Sprint 1: Node Connection Validation)
    lastValidationError: string | null;
    rejectedConnections: Array<{ source: string; target: string; error: string; timestamp: number }>;

    // Actions
    setCurrentDraft: (id: string | null, name?: string) => void;
    setTriggerType: (type: ActionsState['triggerType']) => void;

    // Node operations
    setNodes: (nodes: WorkflowNode[]) => void;
    addNode: (node: WorkflowNode) => void;
    updateNode: (id: string, data: Partial<WorkflowNode['data']>) => void;
    removeNode: (id: string) => void;
    onNodesChange: (changes: NodeChange[]) => void;

    // Edge operations
    setEdges: (edges: Edge[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;

    // Selection
    selectNode: (id: string | null) => void;

    // Validation actions (Sprint 1)
    setLastValidationError: (error: string | null) => void;
    addRejectedConnection: (connection: { source: string; target: string; error: string }) => void;
    clearRejectedConnections: () => void;

    // Editor controls
    openEditor: (draftId?: string) => void;
    closeEditor: () => void;
    markDirty: () => void;
    markClean: () => void;

    // Reset
    resetEditor: () => void;
}

const initialState = {
    currentDraftId: null,
    draftName: 'Untitled Workflow',
    triggerType: 'manual' as const,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isEditorOpen: false,
    isDirty: false,
    isSaving: false,
    isPublishing: false,
    lastValidationError: null,
    rejectedConnections: [],
};

export const useActionsStore = create<ActionsState>((set, get) => ({
    ...initialState,

    setCurrentDraft: (id, name) => set({
        currentDraftId: id,
        draftName: name || 'Untitled Workflow',
        isDirty: false
    }),

    setTriggerType: (type) => set({ triggerType: type, isDirty: true }),

    // Node operations
    setNodes: (nodes) => set({ nodes }),

    addNode: (node) => set((state) => {
        // Ensure unique node name
        const existingNames = new Set(state.nodes.map(n => n.data.label));
        let label = node.data.label;
        let counter = 1;
        const baseName = label.replace(/ \d+$/, ''); // Remove trailing number if exists

        while (existingNames.has(label)) {
            counter++;
            label = `${baseName} ${counter}`;
        }

        return {
            nodes: [...state.nodes, { ...node, data: { ...node.data, label } }],
            isDirty: true
        };
    }),

    updateNode: (id, data) => set((state) => {
        // If renaming, check for duplicates
        if (data.label) {
            const otherNames = state.nodes
                .filter(n => n.id !== id)
                .map(n => n.data.label);
            if (otherNames.includes(data.label)) {
                // Duplicate name - don't update the label
                const { label, ...restData } = data;
                return {
                    nodes: state.nodes.map(n =>
                        n.id === id ? { ...n, data: { ...n.data, ...restData } } : n
                    ),
                    isDirty: true
                };
            }
        }
        return {
            nodes: state.nodes.map(n =>
                n.id === id ? { ...n, data: { ...n.data, ...data } } : n
            ),
            isDirty: true
        };
    }),

    removeNode: (id) => set((state) => ({
        nodes: state.nodes.filter(n => n.id !== id),
        edges: state.edges.filter(e => e.source !== id && e.target !== id),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        isDirty: true
    })),

    onNodesChange: (changes) => set((state) => {
        const isSignificant = changes.some(c => c.type !== 'select' && c.type !== 'dimensions');
        return {
            nodes: applyNodeChanges(changes, state.nodes) as WorkflowNode[],
            isDirty: state.isDirty || isSignificant
        };
    }),

    // Edge operations
    setEdges: (edges) => set({ edges }),

    onEdgesChange: (changes) => set((state) => {
        const isSignificant = changes.some(c => c.type !== 'select');
        return {
            edges: applyEdgeChanges(changes, state.edges),
            isDirty: state.isDirty || isSignificant
        };
    }),

    onConnect: (connection) => set((state) => ({
        edges: addEdge({ ...connection, animated: true }, state.edges),
        isDirty: true
    })),

    // Selection
    selectNode: (id) => set({ selectedNodeId: id }),

    // Validation actions (Sprint 1)
    setLastValidationError: (error) => set({ lastValidationError: error }),

    addRejectedConnection: (connection) => set((state) => ({
        rejectedConnections: [
            ...state.rejectedConnections,
            { ...connection, timestamp: Date.now() },
        ].slice(-10), // keep only the most recent 10
    })),

    clearRejectedConnections: () => set({ rejectedConnections: [], lastValidationError: null }),

    // Editor controls
    openEditor: (draftId) => set({
        isEditorOpen: true,
        currentDraftId: draftId || null
    }),

    closeEditor: () => set({ isEditorOpen: false }),

    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),

    // Reset
    resetEditor: () => set(initialState),
}));
