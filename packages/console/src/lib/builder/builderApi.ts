/**
 * builderApi — the single credentialed client for every framework-worker
 * builder endpoint AND the builder-scoped Service Worker render shortcut.
 *
 * WHY CENTRALIZE:
 *  - `credentials: 'include'` + a relative same-origin URL is the ONE correct
 *    incantation. In production the console is served FROM the framework
 *    worker (cf-full, CF-22 system edge), so `/builder/api/*` is same-origin
 *    and the `fb_session` cookie rides along automatically. In Vite dev
 *    (:5173) the `/builder` proxy (vite.config.ts) forwards to wrangler :8787,
 *    which is again same-origin from the browser's point of view.
 *  - the system-edge absolute-URL fallback (cross-origin `engine.url` where
 *    `engine.is_system === true`) lives in ONE place so the SW-render primary
 *    path and the network fallback share it.
 *
 * ENDPOINTS:
 *  - GET  /builder/api/registry    → framework component registry (Phase C)
 *  - POST /builder/api/reRender    → framework worker eSSR render (Phase D, FALLBACK)
 *  - POST /__fb_builder_render__   → builder-scoped Service Worker render (Phase E, PRIMARY)
 *
 * SW<->CLIENT RENDER CONTRACT (Phase E):
 *  The reserved `/__fb_builder_render__` path is a same-origin virtual fetch.
 *  It is intercepted ONLY by the builder Service Worker WHEN the SW is the
 *  active controller, which then runs the SAME `renderDocument(renderPage())`
 *  the worker uses (imported from `@frontbase/edge-core`) and answers
 *  `{ html }` LOCALLY — no network round-trip, zero drift vs the worker.
 *  When the SW is NOT yet active the path is NOT intercepted and the framework
 *  worker 404s on it; the caller MUST then fall back to `fetchReRender()`.
 *  The POST body is IDENTICAL to `/builder/api/reRender` (`{ layout, pageData }`)
 *  and the success response shape (`{ html }`) is identical, so the canvas
 *  consumes either path the same way.
 */

import type { ReRenderRequest, ReRenderResponse } from './iframeTypes';

export interface BuilderApiOptions {
    /**
     * Optional absolute system-edge origin (`engine.url` for an
     * `engine.is_system === true` edge). When omitted the path stays
     * same-origin relative, which is correct wherever the console is served
     * from the worker.
     */
    systemEdgeUrl?: string;
    signal?: AbortSignal;
}

/**
 * Resolve a builder path to a same-origin relative URL (default) or an
 * absolute system-edge URL when the caller provides one (cross-origin dev).
 */
export function resolveBuilderUrl(path: string, systemEdgeUrl?: string): string {
    if (systemEdgeUrl) {
        const base = systemEdgeUrl.replace(/\/+$/, '');
        return `${base}${path.startsWith('/') ? path : `/${path}`}`;
    }
    return path;
}

/** Read the `{ html, error? }` body; never throws on a non-JSON body. */
async function readRenderBody(res: Response): Promise<ReRenderResponse> {
    try {
        return (await res.json()) as ReRenderResponse;
    } catch {
        return { html: '' };
    }
}

/**
 * GET /builder/api/registry — the framework component registry (raw wire
 * format; the caller reshapes via `reshapeRegistryDescriptor`).
 *
 * This is a SOFT fetch: the registry is optional, so on ANY failure (network
 * error, non-2xx) it resolves to `null` instead of throwing — callers fall
 * back to product-local schemas / bespoke panels without try/catch.
 */
export async function fetchRegistry(
    opts: BuilderApiOptions = {},
): Promise<unknown> {
    const url = resolveBuilderUrl('/builder/api/registry', opts.systemEdgeUrl);
    try {
        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json' },
            signal: opts.signal,
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * POST /builder/api/reRender — the framework worker eSSR render. This is the
 * FALLBACK path used when the builder Service Worker is not yet active (or
 * the SW render threw). Throws on non-2xx, network error, or `{ error }` body;
 * returns the `{ html }` response object on success.
 */
export async function fetchReRender(
    body: ReRenderRequest,
    opts: BuilderApiOptions = {},
): Promise<ReRenderResponse> {
    const url = resolveBuilderUrl('/builder/api/reRender', opts.systemEdgeUrl);
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
    });
    if (!res.ok) {
        const data = await readRenderBody(res);
        const detail = data?.error ?? '';
        throw new Error(`reRender failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    const data = await readRenderBody(res);
    if (data.error) throw new Error(`reRender error: ${data.error}`);
    return data;
}

/**
 * POST /__fb_builder_render__ — the builder-scoped Service Worker render
 * PRIMARY path (Phase E). The request body is IDENTICAL to
 * `/builder/api/reRender` (`{ layout, pageData }`) and the success response
 * shape (`{ html }`) is identical.
 *
 * When the builder SW is the active controller it intercepts this same-origin
 * POST and answers LOCALLY (no network round-trip, zero drift vs the worker).
 * When the SW is NOT yet active the path 404s on the framework worker and the
 * caller MUST fall back to `fetchReRender()`.
 *
 * Throws on non-2xx (incl. the 404 the worker returns when the SW is
 * inactive), network error, or `{ error }` body — the caller is expected to
 * catch and fall back.
 */
export async function fetchBuilderRender(
    body: ReRenderRequest,
    opts: BuilderApiOptions = {},
): Promise<ReRenderResponse> {
    // The path MUST sit under the builder SW's scope (`${BASE_URL}builder/`) — a
    // SW only intercepts fetches in its scope, so a root-level path would never
    // reach the SW and the primary would always 404→fallback (E's value lost).
    const renderPath = `${import.meta.env.BASE_URL}builder/__fb_builder_render__`;
    const url = resolveBuilderUrl(renderPath, opts.systemEdgeUrl);
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
    });
    if (!res.ok) {
        const data = await readRenderBody(res);
        const detail = data?.error ?? '';
        throw new Error(`builder render failed (${res.status})${detail ? `: ${detail}` : ''}`);
    }
    const data = await readRenderBody(res);
    if (data.error) throw new Error(`builder render error: ${data.error}`);
    // An empty/non-HTML body (e.g. a framework-worker SPA catch-all returning
    // 200 + index.html for an unknown /builder/* path when the SW is inactive)
    // is NOT a valid local render — treat it as failure so the caller falls
    // back to /builder/api/reRender.
    if (!data.html) throw new Error('builder render returned no html');
    return data;
}
