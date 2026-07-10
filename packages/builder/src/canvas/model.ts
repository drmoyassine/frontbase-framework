/**
 * Canvas model (M3.0.2, CF-8) — the framework-agnostic drag/drop editing core.
 * React is a thin view over this; the state transitions (add/move/remove/select/
 * update-props) are pure and testable, and the draft→preview loop is measured
 * against them (< 100 ms gate) without needing a DOM.
 *
 * The model owns a layout tree (the same `{ root, content }` the engine renders),
 * so the preview renders the EXACT layout that will be published (parity).
 * RULE 1: this is browser code — it never imports edge-infra.
 */
export interface CanvasNode {
    id: string;
    type: string;
    props: Record<string, unknown>;
    styles?: Record<string, unknown>;
    children?: CanvasNode[];
}

export interface CanvasLayout {
    root: Record<string, unknown>;
    content: CanvasNode[];
}

export interface CanvasState {
    layout: CanvasLayout;
    selectedId: string | null;
}

let _seq = 0;
/** Deterministic-ish id (monotonic within a session). */
export function nodeId(prefix = 'n'): string {
    return `${prefix}-${(++_seq).toString(36)}`;
}

export function emptyCanvas(): CanvasState {
    return { layout: { root: {}, content: [] }, selectedId: null };
}

/** Insert a new node from the palette at `index` (default: end). Returns new state + the node id. */
export function addNode(state: CanvasState, type: string, props: Record<string, unknown> = {}, index?: number): { state: CanvasState; id: string } {
    const id = nodeId(type.toLowerCase());
    const node: CanvasNode = { id, type, props };
    const content = [...state.layout.content];
    content.splice(index ?? content.length, 0, node);
    return { state: { layout: { ...state.layout, content }, selectedId: id }, id };
}

/** Move a top-level node from one index to another (drag reorder). */
export function moveNode(state: CanvasState, fromIndex: number, toIndex: number): CanvasState {
    const content = [...state.layout.content];
    if (fromIndex < 0 || fromIndex >= content.length) return state;
    const [node] = content.splice(fromIndex, 1);
    if (!node) return state;
    content.splice(Math.max(0, Math.min(toIndex, content.length)), 0, node);
    return { ...state, layout: { ...state.layout, content } };
}

/** Remove a node by id (top-level). */
export function removeNode(state: CanvasState, id: string): CanvasState {
    const content = state.layout.content.filter((n) => n.id !== id);
    return { layout: { ...state.layout, content }, selectedId: state.selectedId === id ? null : state.selectedId };
}

/** Update a node's props (property-panel edit). */
export function updateProps(state: CanvasState, id: string, props: Record<string, unknown>): CanvasState {
    const content = state.layout.content.map((n) => (n.id === id ? { ...n, props: { ...n.props, ...props } } : n));
    return { ...state, layout: { ...state.layout, content } };
}

export function selectNode(state: CanvasState, id: string | null): CanvasState {
    return { ...state, selectedId: id };
}

/** The layout the preview/publish path renders — identical shape for both. */
export function toLayout(state: CanvasState): CanvasLayout {
    // Return a deep-ish copy so a consumer can't mutate the model's tree (RULE 3).
    return { root: { ...state.layout.root }, content: state.layout.content.map((n) => ({ ...n, props: { ...n.props } })) };
}

/** Flatten to a layers list (id/type/selected) for the layers panel. */
export function layers(state: CanvasState): Array<{ id: string; type: string; selected: boolean }> {
    return state.layout.content.map((n) => ({ id: n.id, type: n.type, selected: n.id === state.selectedId }));
}
