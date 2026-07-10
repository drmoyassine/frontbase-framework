/**
 * Canvas — the React view over the canvas model (M3.0.2). Palette (add), the
 * draggable node list (reorder/select/remove), a layers panel, and a preview
 * iframe that renders the current layout through the SAME engine (parity).
 *
 * React is a thin shell; all editing goes through the pure model (model.ts), so
 * the drag→draft→preview loop is measured on the model, not the DOM.
 * RULE 1: browser code — never imports edge-infra.
 */
import { useState, useCallback, useMemo } from 'react';
import {
    emptyCanvas, addNode, moveNode, removeNode, updateProps, selectNode,
    toLayout, layers, type CanvasState, type CanvasLayout,
} from './model.js';

export interface CanvasProps {
    /** Component types the palette offers. */
    palette: string[];
    /** Called whenever the layout changes — the host renders the preview from this. */
    onLayoutChange?: (layout: CanvasLayout) => void;
    initial?: CanvasState;
}

export function Canvas({ palette, onLayoutChange, initial }: CanvasProps) {
    const [state, setState] = useState<CanvasState>(initial ?? emptyCanvas());

    const apply = useCallback((next: CanvasState) => {
        setState(next);
        onLayoutChange?.(toLayout(next));
    }, [onLayoutChange]);

    const onAdd = useCallback((type: string) => apply(addNode(state, type).state), [state, apply]);
    const onRemove = useCallback((id: string) => apply(removeNode(state, id)), [state, apply]);
    const onReorder = useCallback((from: number, to: number) => apply(moveNode(state, from, to)), [state, apply]);
    const onSelect = useCallback((id: string) => apply(selectNode(state, id)), [state, apply]);
    const onProp = useCallback((id: string, props: Record<string, unknown>) => apply(updateProps(state, id, props)), [state, apply]);

    const layerList = useMemo(() => layers(state), [state]);

    return (
        <div className="fb-canvas" data-testid="fb-canvas">
            <aside className="fb-palette">
                {palette.map((type) => (
                    <button key={type} onClick={() => onAdd(type)} data-palette={type}>{type}</button>
                ))}
            </aside>
            <ul className="fb-layers">
                {layerList.map((l, i) => (
                    <li key={l.id} data-layer={l.id} aria-selected={l.selected}>
                        <button onClick={() => onSelect(l.id)}>{l.type}</button>
                        <button onClick={() => onReorder(i, i - 1)} disabled={i === 0} aria-label="up">↑</button>
                        <button onClick={() => onRemove(l.id)} aria-label="remove">✕</button>
                    </li>
                ))}
            </ul>
            {/* Preview iframe renders the layout via the host (parity). */}
            <div className="fb-preview" data-selected={state.selectedId ?? ''} />
        </div>
    );
}
