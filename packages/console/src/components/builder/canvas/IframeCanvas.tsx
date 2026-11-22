/**
 * IframeCanvas — the eSSR presentation surface.
 *
 * Renders a same-origin <iframe> whose `srcdoc` is the HTML returned by
 * POST /builder/api/reRender (byte-identical to a published page). On every
 * `load` event (one per srcdoc swap) it:
 *   1. stamps data-fb-id / data-fb-component onto real component roots,
 *   2. measures viewport-local rects and pushes them to the parent overlay,
 *   3. re-attaches capture-phase click / hover / dblclick listeners,
 *   4. restores the current selection (selectedComponentId survives swaps;
 *      the overlay simply looks up its rect — if the node was deleted, no rect
 *      is found and nothing is drawn).
 *
 * The overlay (CanvasOverlay) is rendered as a SIBLING by BuilderCanvas,
 * inside the same transform-scaled viewport wrapper, so iframe-local coords
 * map directly to overlay coords.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ComponentData, Page } from '@/types/builder';
import {markSharedMenuPreview} from '@/lib/builder/sharedMenuPreview';
import { queryComponentRects, stampComponentIds } from '@/lib/builder/iframeBridge';
import { clearEditableText, stampEditableText } from '@/lib/builder/editableText';
import type { ComponentRect } from '@/lib/builder/iframeTypes';
import { useBuilderStore } from '@/stores/builder';
import { attachIframeSelection } from './useIframeSelection';
import { useIframePointerRouting } from './useIframeDnd';
import { useIframeCanvas } from './useIframeCanvas';
import { coalesceRaf } from './coalesceRaf';
import { observeCanvasContent } from './observeCanvasContent';

interface IframeCanvasProps {
    page: Page;
    /** Absolute system-edge URL for cross-origin dev reRender (production uses relative). */
    systemEdgeUrl?: string;
    /** Pushed up to BuilderCanvas so CanvasOverlay can consume the rects. */
    onRects?: (rects: ComponentRect[]) => void;
    onHoveredId?: (id: string | null) => void;
}

export const IframeCanvas: React.FC<IframeCanvasProps> = ({
    page,
    systemEdgeUrl,
    onRects,
    onHoveredId,
}) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [search] = useSearchParams();
    const { html, status, error } = useIframeCanvas(page, systemEdgeUrl, false, undefined, search.get('previewPath'));
    // Preview mode is reactive here so toggling it re-runs the affordance stamp
    // pass on the CURRENT iframe doc (see effect below) — without a srcdoc
    // refetch, since the rendered HTML is identical in both modes.
    const isPreviewMode = useBuilderStore((s) => s.isPreviewMode);
    const scrollTop = useRef(0);

    // Keep latest callbacks in refs so the load handler (which is stable apart
    // from page.layoutData) doesn't tear down/re-attach listeners on every
    // parent re-render.
    const onRectsRef = useRef(onRects);
    const onHoveredIdRef = useRef(onHoveredId);
    onRectsRef.current = onRects;
    onHoveredIdRef.current = onHoveredId;

    const selectionCleanup = useRef<(() => void) | null>(null);
    // Tears down the content-reflow ResizeObserver from the previous srcdoc.
    const layoutObserverCleanup = useRef<(() => void) | null>(null);

    const refreshRects = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        const next = queryComponentRects(doc);
        // The rects themselves are not kept in local state — the JSX only
        // renders the <iframe> + error overlay, so storing them would be a
        // wasted re-render on every measure. Forward directly to the overlay.
        onRectsRef.current?.(next);
    }, []);

    // The content nodes used for the data-fb-id stamping pass. Stable per layout.
    const contentNodes = page.layoutData?.content ?? [];

    // STEP 1 of handleLoad — stamp identity + inline-edit affordances onto the
    // freshly-loaded document. Pulled out so handleLoad reads as a pipeline.
    const prepareIframeDoc = useCallback(
        (doc: Document, nodes: ComponentData[], preview: boolean) => {
            // 1. Stamp data-fb-id so [data-fb-id] selection resolves real components.
            if(page.layoutData?.root.appMenus!==undefined)markSharedMenuPreview(doc);
            stampComponentIds(doc, nodes);
            // 1b. Stamp data-fb-edit-id/prop on inline-editable text elements
            //     (including NESTED prop text like Hero title / Features card
            //     title / Accordion item) so useIframeSelection can route click→
            //     select→edit for them. No-op in preview mode.
            stampEditableText(doc, nodes, preview);
        },
        [page.layoutData?.root.appMenus],
    );

    // Remeasure overlay geometry as the fixed viewport scrolls and reflows.
    const attachLayoutObserver = useCallback(
        (doc: Document) => {
            const { schedule, cancel } = coalesceRaf(window, () => {
                stampComponentIds(doc, contentNodesRef.current);
                stampEditableText(doc, contentNodesRef.current, useBuilderStore.getState().isPreviewMode);
                refreshRects();
            });
            const ro = new ResizeObserver(() => schedule());
            if (doc.body) ro.observe(doc.body);
            if (doc.documentElement) ro.observe(doc.documentElement);
            const stopContentObserver = observeCanvasContent(doc, schedule);
            const win = doc.defaultView;
            const scroll = coalesceRaf(window, () => {
                scrollTop.current = win?.scrollY ?? 0;
                refreshRects();
            });
            win?.addEventListener('scroll', scroll.schedule, true);
            win?.addEventListener('resize', scroll.schedule);
            return () => {
                win?.removeEventListener('scroll', scroll.schedule, true);
                win?.removeEventListener('resize', scroll.schedule);
                scroll.cancel();
                ro.disconnect();
                stopContentObserver();
                cancel();
            };
        },
        [refreshRects],
    );

    const handleLoad = useCallback(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;

        // 1. Stamp identity + affordances. Reads isPreviewMode imperatively at
        //    load time; subsequent toggles are handled by the effect below.
        prepareIframeDoc(doc, contentNodes, useBuilderStore.getState().isPreviewMode);
        layoutObserverCleanup.current?.();
        if (scrollTop.current) doc.defaultView?.scrollTo(0, scrollTop.current);
        refreshRects();
        // 3. Re-attach selection listeners (the document was just replaced).
        selectionCleanup.current?.();
        selectionCleanup.current = attachIframeSelection(doc, {
            onHoveredId: (id) => onHoveredIdRef.current?.(id),
        });
        layoutObserverCleanup.current = attachLayoutObserver(doc);
    }, [contentNodes, prepareIframeDoc, refreshRects, attachLayoutObserver]);

    // Reactive affordance pass on preview-mode toggle. The srcdoc is identical
    // in edit vs preview — only the affordance markers are mode-dependent — so
    // we do NOT refetch; we clear any stale markers left by the previous mode
    // and, in edit mode, re-stamp on the current doc. This is what prevents
    // edit→preview from leaking the cursor-text/hover ring into preview, and
    // preview→edit from silently losing inline-edit affordances until the next
    // layout change. (contentNodes is read via a ref so this effect runs ONLY
    // on isPreviewMode changes, not on every layout mutation — handleLoad
    // already re-stamps on srcdoc swaps.)
    const contentNodesRef = useRef(contentNodes);
    contentNodesRef.current = contentNodes;
    useEffect(() => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        clearEditableText(doc);
        if (!isPreviewMode) {
            stampEditableText(doc, contentNodesRef.current, false);
        }
    }, [isPreviewMode]);

    // Tear down selection listeners + height observer on unmount.
    useEffect(() => () => {
        selectionCleanup.current?.();
        layoutObserverCleanup.current?.();
    }, []);

    // Route pointer events to the parent during active DnD.
    useIframePointerRouting(iframeRef);

    return (
        <>
            <iframe
                ref={iframeRef}
                title="Frontbase Builder Canvas"
                // srcDoc (React) maps to the srcdoc attribute; same-origin, and
                // contentDocument is accessible from the parent. Undefined on
                // first paint so the iframe stays blank until the first render.
                srcDoc={html || undefined}
                onLoad={handleLoad}
                style={{
                    border: 'none',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    background: '#ffffff',
                }}
            />
            {status === 'error' && (
                <div className="absolute inset-0 z-30 flex items-center justify-center p-8 text-center bg-background/80">
                    <div className="max-w-md">
                        <p className="text-sm font-semibold text-destructive mb-1">
                            Canvas failed to render
                        </p>
                        <p className="text-xs text-muted-foreground break-all">{error}</p>
                    </div>
                </div>
            )}
        </>
    );
};
