/**
 * iframeTypes — shared types for the Phase D eSSR iframe canvas bridge.
 *
 * The builder canvas is now a same-origin <iframe> whose `srcdoc` is the
 * byte-identical eSSR output of POST /builder/api/reRender. All interaction
 * (selection / hover / reorder / palette drag-in / inline-edit) is split
 * between the iframe `contentDocument` (hit-testing) and a React overlay
 * sibling (selection rectangles + @dnd-kit droppables). These types are the
 * contract between the pure bridge helpers and the React hooks/components.
 *
 * NOTE: product-side new types live here (not in src/types/builder.ts, which
 * is outside this phase's allowlist).
 */

import type { ComponentData } from '@/types/builder';

/**
 * A component rectangle measured from the iframe `contentDocument`, expressed
 * in the IFRAME's viewport-local coordinate space (i.e. relative to the
 * iframe's own visible area, accounting for its internal scroll).
 *
 * The overlay is rendered as a sibling of the iframe INSIDE the same
 * transform-scaled wrapper (BuilderCanvas's viewport container), so these
 * viewport-local coords map 1:1 to overlay coords — no further scaling or
 * translation is required. On iframe scroll/resize the rects are re-queried
 * so the overlay follows the content.
 */
export interface ComponentRect {
    id: string;
    type: string;
    left: number;
    top: number;
    width: number;
    height: number;
    /** data-fb-id of the enclosing component, undefined for root-level nodes. */
    parentId?: string;
    /** Nesting depth (0 = top-level). */
    depth: number;
}

/**
 * The layout shape posted to POST /builder/api/reRender. Matches the framework
 * BuilderEngine `reRender` handler (BuilderEngine.ts L451-512): it accepts the
 * FULL layout in the body and returns the complete `renderDocument()` output.
 * Unlike /api/components, it does NOT read `x-page-id`.
 */
export interface PageLayoutLike {
    content: ComponentData[];
    root: Record<string, any>;
}

export interface ReRenderRequest {
    layout: PageLayoutLike;
    pageData: {
        title?: string;
        slug?: string;
        description?: string;
    };
}

/** Successful response: { html }. Error response: { error } with 4xx/5xx. */
export interface ReRenderResponse {
    html: string;
    error?: string;
}

/** Result of locating a node in the layout tree for DnD seeding. */
export interface NodeLocation {
    component: ComponentData;
    /** Index among its siblings within `parentId`. */
    index: number;
    /** Immediate parent's component id (undefined at root). */
    parentId?: string;
}

/**
 * The text-bearing component types whose double-click initiates an inline
 * contentEditable edit. Mirrors the legacy DraggableComponent.handleDoubleClick
 * list exactly so editing behavior is preserved.
 */
export const INLINE_TEXT_TYPES: ReadonlySet<string> = new Set([
    'Text',
    'Heading',
    'Button',
    'Badge',
    'Link',
]);

/** Component types treated as drop containers (mirror DraggableComponent). */
export const CONTAINER_TYPES: ReadonlySet<string> = new Set([
    'Container',
    'Row',
    'Column',
    'Card',
    'Repeater',
]);
