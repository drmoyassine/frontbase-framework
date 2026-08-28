/**
 * iframeBridge — pure (non-React) helpers that mediate between the React
 * builder shell and the eSSR iframe canvas.
 *
 * Responsibilities:
 *  - buildReRenderRequest: shape the product Page into the `{ layout, pageData }`
 *    body consumed by BOTH POST /builder/api/reRender (worker fallback) and
 *    POST /__fb_builder_render__ (builder Service Worker primary). The actual
 *    credentialed fetches live in the shared `./builderApi` client.
 *  - stampComponentIds: THE load-bearing gap fix. The eSSR renderer emits
 *    `id="${id}"` on every real component root (static.ts getCommonAttributes)
 *    but `data-fb-id` / `data-fb-component` ONLY on unknown-component
 *    fallbacks (PageRenderer). The bridge stamps them itself after every
 *    srcdoc swap so the framework's `closest('[data-fb-id]')` selection logic
 *    works against real components. This mutates ONLY the iframe DOM — the
 *    published HTML stays byte-identical.
 *  - queryComponentRects / findComponentId / findNodeLocation: tree + DOM
 *    geometry helpers shared by the selection and DnD hooks.
 */

import type { ComponentData, Page } from '@/types/builder';
import type {
    ComponentRect,
    NodeLocation,
    PageLayoutLike,
    ReRenderRequest,
} from './iframeTypes';

// Backward-compat aliases: the credentialed fetches + URL resolution now live
// in the shared `./builderApi` client. Historical names are re-exported so any
// dormant caller keeps compiling; new code should import builderApi directly.
export { resolveBuilderUrl as resolveBuilderApiUrl } from './builderApi';
export type { BuilderApiOptions as FetchReRenderOptions } from './builderApi';

/** Shape the product Page into the `{ layout, pageData }` body consumed by
 *  BOTH POST /builder/api/reRender (worker fallback) and
 *  POST /__fb_builder_render__ (builder SW primary). */
export function buildReRenderRequest(page: Page): ReRenderRequest {
    const layout: PageLayoutLike = {
        content: page.layoutData?.content ?? [],
        root: page.layoutData?.root ?? {},
    };
    return {
        layout,
        pageData: {
            title: page.title ?? page.name ?? '',
            slug: page.slug ?? '',
            description: page.description,
        },
    };
}

/** Walk a layout content tree depth-first, invoking the visitor for each node. */
export function walkLayout(
    nodes: ComponentData[],
    visitor: (node: ComponentData, parentId: string | undefined, depth: number) => void,
): void {
    const recurse = (list: ComponentData[], parentId: string | undefined, depth: number) => {
        for (const node of list) {
            visitor(node, parentId, depth);
            if (node.children && node.children.length > 0) {
                recurse(node.children, node.id, depth + 1);
            }
        }
    };
    recurse(nodes, undefined, 0);
}

/**
 * Stamp `data-fb-id` + `data-fb-component` onto every real component root in
 * the iframe document. The eSSR renderer already puts `id="${id}"` on every
 * real root and component ids are unique, so `getElementById` is a direct
 * O(N) lookup. Re-run after EVERY srcdoc swap (the whole document is replaced).
 */
export function stampComponentIds(doc: Document, nodes: ComponentData[]): void {
    walkLayout(nodes, (node) => {
        const el = doc.getElementById(node.id);
        if (el) {
            el.setAttribute('data-fb-id', node.id);
            el.setAttribute('data-fb-component', node.type);
        }
    });
}

/**
 * Query every `[data-fb-id]` element in the iframe and return its rect in the
 * iframe's viewport-local coordinate space. `getBoundingClientRect()` on an
 * element inside `iframe.contentDocument` returns coords relative to the
 * iframe's own viewport (already accounting for internal scroll), which map
 * 1:1 to the sibling overlay's coordinate space.
 */
export function queryComponentRects(doc: Document): ComponentRect[] {
    const out: ComponentRect[] = [];
    const elements = doc.querySelectorAll<HTMLElement>('[data-fb-id]');
    elements.forEach((el) => {
        const id = el.getAttribute('data-fb-id');
        const type = el.getAttribute('data-fb-component');
        if (!id || !type) return;
        const r = el.getBoundingClientRect();
        out.push({
            id,
            type,
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            parentId: findParentId(el),
            depth: computeDepth(el),
        });
    });
    return out;
}

/** Resolve the data-fb-id for an element by walking up to the closest stamp. */
export function findComponentId(el: Element | null): string | null {
    if (!el) return null;
    const hit = el.closest('[data-fb-id]') as HTMLElement | null;
    return hit?.getAttribute('data-fb-id') ?? null;
}

/** Find the immediate stamped parent of an element (undefined at root). */
function findParentId(el: HTMLElement): string | undefined {
    const parent = el.parentElement?.closest('[data-fb-id]') as HTMLElement | undefined;
    return parent?.getAttribute('data-fb-id') ?? undefined;
}

/** Count stamped ancestors (0 at top level). */
function computeDepth(el: HTMLElement): number {
    let depth = 0;
    let current: HTMLElement | null = el.parentElement;
    while (current) {
        if (current.hasAttribute('data-fb-id')) depth++;
        current = current.parentElement;
    }
    return depth;
}

/**
 * Locate a node in the layout tree by id, returning the component, its sibling
 * index, and its immediate parent id. Used to seed @dnd-kit `active.data` for
 * reorder (mirrors the data shape DraggableComponent previously emitted).
 */
export function findNodeLocation(
    nodes: ComponentData[],
    id: string,
    parentId: string | undefined = undefined,
): NodeLocation | null {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.id === id) {
            return { component: node, index: i, parentId };
        }
        if (node.children && node.children.length > 0) {
            const inner = findNodeLocation(node.children, id, node.id);
            if (inner) return inner;
        }
    }
    return null;
}
