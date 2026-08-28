/**
 * useIframeCanvas — drives the eSSR re-render cycle for the iframe canvas.
 *
 * Subscribes to `page.layoutData`. On every change:
 *  - debounce ~120ms (coalesce rapid mutations: inline-edit typing, Phase C
 *    style-slider drags) so the worker isn't stampeded;
 *  - abort any in-flight request (the layout already superseded it);
 *  - render the page and store the returned HTML;
 *  - bump `renderNonce` so consumers can re-run post-load work (stamping,
 *    rect measurement, selection listener attach, selection restore).
 *
 * PHASE E RENDER PATH (SW-first, network fallback):
 *  1. PRIMARY — POST the reserved same-origin path /__fb_builder_render__ with
 *     the `{ layout, pageData }` body. The builder-scoped Service Worker
 *     intercepts this WHEN it is the active controller and runs the SAME
 *     `renderDocument(renderPage(layout))` the worker uses (imported from
 *     @frontbase/edge-core), answering `{ html }` LOCALLY — no network
 *     round-trip, zero drift vs the worker.
 *  2. FALLBACK — if the primary fails for ANY reason (network error, non-2xx,
 *     the 404 the framework worker returns while the SW is not yet active, or
 *     the render threw), retry the SAME body via POST /builder/api/reRender and
 *     use its `{ html }`.
 *
 * The consumed response shape (`{ html }`) is identical on both paths, so
 * IframeCanvas is unchanged. The Phase D debounce / coalesce / AbortController
 * behavior is preserved across both paths.
 *
 * The iframe element itself (and its `load` handler) is owned by IframeCanvas;
 * this hook only owns the fetch lifecycle and the resulting HTML string.
 */

import { useEffect, useState } from 'react';
import type { Page } from '@/types/builder';
import { buildReRenderRequest } from '@/lib/builder/iframeBridge';
import {
    fetchBuilderRender,
    fetchReRender,
    type BuilderApiOptions,
} from '@/lib/builder/builderApi';

export type IframeStatus = 'idle' | 'rendering' | 'ready' | 'error';

export interface UseIframeCanvasResult {
    /** The full HTML document string to assign to iframe.srcdoc. */
    html: string;
    status: IframeStatus;
    error: string | null;
    /** Monotonically bumped after each successful render commit. */
    renderNonce: number;
}

const DEBOUNCE_MS = 120;

export function useIframeCanvas(page: Page, systemEdgeUrl?: string): UseIframeCanvasResult {
    const [html, setHtml] = useState('');
    const [status, setStatus] = useState<IframeStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [renderNonce, setRenderNonce] = useState(0);

    // Re-render whenever the layout, page identity, or resolved origin changes.
    // `page.layoutData` is a new reference on every mutation (structural
    // sharing), so this effect re-runs exactly when the canvas should update.
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const controller = new AbortController();

        const issue = async () => {
            setStatus((prev) => (prev === 'ready' ? 'rendering' : prev));
            setError(null);

            const body = buildReRenderRequest(page);
            const baseOpts: BuilderApiOptions = {
                systemEdgeUrl,
                signal: controller.signal,
            };

            // Helper: was this error a deliberate cancellation (not a failure)?
            const isAbort = (e: unknown) =>
                controller.signal.aborted ||
                (e instanceof DOMException && e.name === 'AbortError');

            // Commit a successful { html } from EITHER path identically.
            const commit = (html: string) => {
                if (cancelled) return;
                setHtml(html);
                setStatus('ready');
                setRenderNonce((n) => n + 1);
            };

            // Only attempt the SW primary path when a Service Worker is actually
            // CONTROLLING this page. On cold start (or if the SW failed to
            // register/activate) there is no controller, so the
            // /__fb_builder_render__ fetch would just 404 on the worker and
            // immediately fall back — a wasted round-trip that ALSO provokes
            // intermittent 503s from the rapid 404→fallback sequence. Going
            // straight to reRender when uncontrolled keeps the canvas clean.
            const swController =
                typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;

            if (swController) {
                try {
                    // PRIMARY: builder-scoped Service Worker virtual fetch. When
                    // the SW is active it answers LOCALLY (zero drift, no
                    // round-trip).
                    const primary = await fetchBuilderRender(body, baseOpts);
                    commit(primary.html);
                    return;
                } catch (primaryErr: unknown) {
                    // Cancellation is not a failure — bail without surfacing error.
                    if (cancelled || isAbort(primaryErr)) return;
                    // Otherwise fall through to the network fallback below.
                }
            }

            // PRIMARY when no SW controls the page, or FALLBACK after a SW
            // failure: the worker's POST /builder/api/reRender. Same body, same
            // { html } response shape.
            try {
                const fallback = await fetchReRender(body, baseOpts);
                commit(fallback.html);
            } catch (fallbackErr: unknown) {
                if (cancelled || isAbort(fallbackErr)) return;
                const detail =
                    fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
                setError(detail);
                setStatus('error');
            }
        };

        // Trailing debounce: rapid mutations reset the timer; only the final
        // layout in the burst is actually rendered.
        timer = setTimeout(() => {
            timer = null;
            void issue();
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            // Abort an in-flight fetch so its stale result never lands.
            controller.abort();
        };
        // Deps mirror EXACTLY what buildReRenderRequest(page) consumes (layout
        // content/root via page.layoutData, plus pageData: title ?? name, slug,
        // description) plus the effect's own systemEdgeUrl input. page.id is
        // intentionally omitted: it is not read in the render body, and a page
        // swap always surfaces as a new page.layoutData reference anyway.
    }, [
        page.layoutData,
        page.title,
        page.name,
        page.slug,
        page.description,
        systemEdgeUrl,
    ]);

    return { html, status, error, renderNonce };
}
