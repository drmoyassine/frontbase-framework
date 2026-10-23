/**
 * CanvasOverlay — the React interaction layer sitting on top of the eSSR
 * iframe (sibling, inside the same transform-scaled viewport wrapper).
 *
 * It is `pointer-events: none` by default so clicks/dblclick/hover fall
 * through to the iframe contentDocument (handled by useIframeSelection).
 * Specific children opt back in to pointer events:
 *  - the reorder MoveHandle (a @dnd-kit useDraggable) — pointer-events: auto,
 *    required to receive pointerdown to start a drag;
 *  - drop-zone / container droppables stay pointer-events: none — @dnd-kit
 *    measures their rects via getBoundingClientRect for collision detection,
 *    independent of pointer events, so they don't block canvas clicks.
 *
 * All droppables register the EXACT data shapes CustomBuilder.handleDragEnd
 * reads:
 *   { type: 'drop-zone',      index, pageId, parentId }   // before/after strip
 *   { type: 'container',      componentId, pageId }       // into a container
 *   id: 'canvas-drop-zone'                                  // empty canvas
 * and the MoveHandle seeds { type: 'existing-component', component, index,
 * pageId, parentId } so reorder flows through the existing store.moveComponent
 * action with no new actions required.
 */

import React from 'react';
import { useDraggable, useDroppable, useDndContext } from '@dnd-kit/core';
import { useBuilderStore } from '@/stores/builder';
import type { Page } from '@/types/builder';
import { cn } from '@/lib/utils';
import { findNodeLocation } from '@/lib/builder/iframeBridge';
import { CONTAINER_TYPES, type ComponentRect } from '@/lib/builder/iframeTypes';

// Geometry constants for the overlay affordances. Centralized so the corner
// dots, drop strips, and move handle stay consistent + tweakable in one place.
/** Side length (px) of the selection corner dots. They are offset by half this
 *  value so they sit centered on the selection rectangle's corners. */
const CORNER_DOT_SIZE = 6;
/** Vertical offset (px) of the reorder MoveHandle above the selected rect
 *  (clamped to 0 so it never escapes the top of the viewport). */
const MOVE_HANDLE_OFFSET = 18;

interface CanvasOverlayProps {
    page: Page;
    rects: ComponentRect[];
    hoveredId: string | null;
}

export const CanvasOverlay: React.FC<CanvasOverlayProps> = ({ page, rects, hoveredId }) => {
    const {active} = useDndContext();
    const selectedComponentId = useBuilderStore((s) => s.selectedComponentId);
    const isPreviewMode = useBuilderStore((s) => s.isPreviewMode);

    const content = page.layoutData?.content ?? [];
    const hasComponents = content.length > 0 && rects.length > 0;

    // Resolve insertion indexes from the authored tree, never repeated DOM order.
    const insertionRects = rects.map(rect => ({rect, loc: findNodeLocation(content, rect.id)})).filter(item => item.loc);
    const rectById = new Map(rects.map(rect => [rect.id, rect]));
    const containerRects = rects.filter((r) => CONTAINER_TYPES.has(r.type));

    const selectedRects = selectedComponentId ? rects.filter(r => r.id === selectedComponentId) : [];
    const hoveredRect =
        hoveredId && hoveredId !== selectedComponentId
            ? rects.find((r) => r.id === hoveredId) ?? null
            : null;

    return (
        <div className="absolute inset-0 z-10" style={{ pointerEvents: 'none' }}>
            {/* Empty-canvas drop target (replaces the old BuilderCanvas dropzone). */}
            {!hasComponents && !isPreviewMode && <EmptyCanvasDrop page={page} />}

            {/* Container drop targets — full-rect so a palette item can be
                dropped into any Container/Row/Column/Card/Repeater. */}
            {!isPreviewMode &&
                containerRects.map((r) => <ContainerDrop key={`c-${r.instanceId??r.id}`} rect={r} page={page} />)}

            {/* Every sibling boundary is usable, including nested Row children. */}
            {!isPreviewMode && active && insertionRects.map(({rect,loc}) => (
                <React.Fragment key={'strip-'+(rect.instanceId??rect.id)}>
                    {(['before','after'] as const).map(placement => <DropStrip
                        key={placement} id={'drop-'+placement+'-'+(rect.instanceId??rect.id)}
                        data={{type:'drop-zone',index:loc!.index+(placement==='after'?1:0),pageId:page.id,parentId:loc!.parentId}}
                        rect={rect} placement={placement} parent={rect.parentId?rectById.get(rect.parentId):undefined}
                    />)}
                </React.Fragment>
            ))}

            {/* Hover highlight. */}
            {hoveredRect && !isPreviewMode && (
                <div
                    className="absolute rounded-sm border border-primary/40 bg-primary/5"
                    style={{
                        left: hoveredRect.left,
                        top: hoveredRect.top,
                        width: hoveredRect.width,
                        height: hoveredRect.height,
                    }}
                />
            )}

            {/* Selection highlight + corner dots + reorder handle. */}
            {!isPreviewMode && selectedRects.map(selectedRect => (
                <React.Fragment key={'selected-'+(selectedRect.instanceId??selectedRect.id)}>
                    <div
                        className="absolute rounded-sm border-2 border-primary"
                        style={{
                            left: selectedRect.left,
                            top: selectedRect.top,
                            width: selectedRect.width,
                            height: selectedRect.height,
                        }}
                    />
                    {/* Corner handles. */}
                    <CornerDot left={selectedRect.left - CORNER_DOT_SIZE / 2} top={selectedRect.top - CORNER_DOT_SIZE / 2} />
                    <CornerDot left={selectedRect.left + selectedRect.width - CORNER_DOT_SIZE / 2} top={selectedRect.top - CORNER_DOT_SIZE / 2} />
                    <CornerDot left={selectedRect.left - CORNER_DOT_SIZE / 2} top={selectedRect.top + selectedRect.height - CORNER_DOT_SIZE / 2} />
                    <CornerDot left={selectedRect.left + selectedRect.width - CORNER_DOT_SIZE / 2} top={selectedRect.top + selectedRect.height - CORNER_DOT_SIZE / 2} />
                    <MoveHandle rect={selectedRect} page={page} />
                </React.Fragment>
            ))}
        </div>
    );
};

const CornerDot: React.FC<{ left: number; top: number }> = ({ left, top }) => (
    <div
        className="absolute z-20 w-2 h-2 rounded-full bg-primary"
        style={{ left, top, pointerEvents: 'none' }}
    />
);

/** A sibling boundary follows the parent’s rendered horizontal/vertical flow. */
const DropStrip: React.FC<{
    id: string;
    data: Record<string, unknown>;
    rect: ComponentRect;
    placement: 'before' | 'after';
    parent?: ComponentRect;
}> = ({ id, data, rect, placement, parent }) => {
    const { isOver, setNodeRef } = useDroppable({ id, data });
    const horizontal=parent?.flow==='horizontal';
    const leading=(placement==='before') !== Boolean(parent?.reverse);
    const edge=horizontal ? rect.left+(leading?0:rect.width) : rect.top+(leading?0:rect.height);
    return <div ref={setNodeRef} data-drop-placement={placement}
        className="absolute z-20" style={{
            left:horizontal?edge-5:rect.left,top:horizontal?rect.top:edge-5,
            width:horizontal?10:rect.width,height:horizontal?rect.height:10,pointerEvents:'none',
        }}>
        <div style={{position:'absolute',background:isOver?'#2563eb':'rgba(59,130,246,.5)',
            left:horizontal?4:0,top:horizontal?0:4,width:horizontal?2:'100%',height:horizontal?'100%':2}}/>
        {isOver && <span className="absolute bg-blue-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">Insert {placement}</span>}
    </div>;

};

/** Full-rect droppable for Container/Row/Column/Card/Repeater. */
const ContainerDrop: React.FC<{ rect: ComponentRect; page: Page }> = ({ rect, page }) => {
    const {active} = useDndContext();
    const { isOver, setNodeRef } = useDroppable({
        id: `container-${rect.instanceId??rect.id}`,
        data: { type: 'container', componentId: rect.id, pageId: page.id },
    });
    return (
        <div
            ref={setNodeRef}
            className={cn('absolute rounded-sm', active && 'border border-dashed border-blue-400/70', isOver && 'bg-blue-500/10 ring-2 ring-blue-500 ring-inset')}
            style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: Math.max(rect.height, 24),
                pointerEvents: 'none',
            }}
        >{isOver && <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-2 py-1 rounded">Inside {rect.type}</span>}</div>
    );
};

/** Empty-canvas droppable + visual. `over.id === 'canvas-drop-zone'` is what
 *  CustomBuilder.handleDragEnd matches for the empty case. */
const EmptyCanvasDrop: React.FC<{ page: Page }> = ({ page }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: 'canvas-drop-zone',
        data: { accepts: ['component', 'existing-component', 'layer-component'], pageId: page.id },
    });
    return (
        <div
            ref={setNodeRef}
            className={cn(
                'absolute inset-0 flex flex-col items-center justify-center text-center p-12 transition-colors',
                isOver && 'bg-blue-50/50 border-2 border-dashed border-blue-400',
            )}
            style={{ pointerEvents: 'none' }}
        >
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-xl font-semibold mb-2">Empty Canvas</h3>
            <p className="text-muted-foreground">
                Drag components from the left panel to start building your page
            </p>
        </div>
    );
};

/** Reorder drag handle floating at the top-left of the selected component.
 *  Registered as a @dnd-kit draggable with the `existing-component` data shape
 *  handleDragEnd expects for reorder. pointer-events: auto so it can seed a
 *  drag; the rest of the component stays click-through to the iframe. */
const MoveHandle: React.FC<{ rect: ComponentRect; page: Page }> = ({ rect, page }) => {
    const isPreviewMode = useBuilderStore((s) => s.isPreviewMode);
    const loc = React.useMemo(
        () => findNodeLocation(page.layoutData?.content ?? [], rect.id, undefined),
        [page.layoutData, rect.id],
    );

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `move-${rect.instanceId??rect.id}`,
        data: loc
            ? {
                  type: 'existing-component',
                  component: loc.component,
                  index: loc.index,
                  pageId: page.id,
                  parentId: loc.parentId,
              }
            : { type: 'existing-component' },
        disabled: !loc || isPreviewMode,
    });

    return (
        <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            className={cn(
                'absolute z-30 px-1.5 py-0.5 text-[10px] font-semibold rounded-sm bg-primary text-primary-foreground shadow cursor-move select-none',
                isDragging && 'opacity-50',
            )}
            style={{
                left: rect.left,
                top: Math.max(rect.top - MOVE_HANDLE_OFFSET, 0),
                pointerEvents: 'auto',
            }}
            onPointerDown={(e) => { e.stopPropagation(); listeners?.onPointerDown?.(e); }}
        >
            ⇅ {rect.type}
        </div>
    );
};
