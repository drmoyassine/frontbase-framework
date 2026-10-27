/**
 * @frontbase/builder/editing/client — Public API for browser bundle.
 *
 * This is the browser-optimized entry point for the editing layer.
 * It provides all editing functionality in a simplified API.
 *
 * Usage:
 * ```ts
 * import { Editor } from '@frontbase/builder/editing/client';
 *
 * const editor = new Editor({
 *   iframe: document.querySelector('iframe')!,
 *   overlay: document.querySelector('.overlay')!,
 *   onRender: (html) => { iframe.srcdoc = html; }
 * });
 *
 * editor.load(components);
 * ```
 */

// Main Editor class. Imported as a VALUE (not just re-exported) so the bootstrap
// at the bottom of this file can instantiate it.
import { Editor } from './editor.js';
import type { PageComponent } from '@frontbase/edge-core';
export { Editor };
export type { EditorConfig } from './editor.js';

// Selection utilities
export * from './selection.js';

// Drag & Drop utilities
export * from './drag-drop.js';

/**
 * Auto-bootstrap. When this bundle loads on a /builder/edit page, the template
 * has injected window.__FRONTBASE_REGISTRY__, .__FRONTBASE_PAGE_ID__, and
 * .__FRONTBASE_LAYOUT__. The exports above only DEFINE Editor; without this
 * bootstrap nothing instantiates it, so the tree/property panels never build and
 * the canvas is a bare iframe. We wire Editor to the template's #fb-* elements
 * and load the page's component tree.
 */

if (typeof window !== 'undefined' && (window as unknown as { __FRONTBASE_PAGE_ID__?: string }).__FRONTBASE_PAGE_ID__) {
    const init = (): void => {
        const iframe = document.getElementById('fb-canvas') as HTMLIFrameElement | null;
        const overlay = document.getElementById('fb-overlay');
        if (!iframe || !overlay) return;
        const w = window as unknown as { __FRONTBASE_PAGE_ID__: string; __FRONTBASE_LAYOUT__?: unknown };
        const editor = new Editor({
            iframe,
            overlay,
            propertyPanelContainer: document.getElementById('fb-property-panel') ?? undefined,
            treeViewContainer: document.getElementById('fb-tree-view') ?? undefined,
            pageId: w.__FRONTBASE_PAGE_ID__,
        });
        const components = (w.__FRONTBASE_LAYOUT__ ?? []) as PageComponent[];
        const load = (): void => editor.load(components);
        // The srcdoc iframe loads async; load the tree + query rects once ready.
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') load();
        iframe.addEventListener('load', load);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
