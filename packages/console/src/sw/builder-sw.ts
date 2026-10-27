/**
 * builder-sw — the BUILDER-SCOPED Service Worker (Phase E).
 *
 * Renders the eSSR canvas LOCALLY in the SW thread by importing the SAME
 * @frontbase/edge-core the framework worker (cf-full) uses for
 * /builder/api/reRender. Edits re-render with NO network round-trip and ZERO
 * drift vs the server endpoint — both paths call the identical
 * renderDocument(renderPage(layout, ctx)).
 *
 * === SW<->CLIENT RENDER CONTRACT (phase E spec — follow verbatim) ===
 *  1. VIRTUAL FETCH INTERCEPT. The client POSTs the reserved same-origin path
 *     /__fb_builder_render__ with JSON body
 *     { layout: <full page layout>, pageData: { title, slug, description } }
 *     (IDENTICAL body shape to /builder/api/reRender).
 *  2. This SW's fetch handler intercepts same-origin POST /__fb_builder_render__
 *     ONLY when the SW is the active controller, runs
 *     renderDocument(renderPage(layout, ctx)), and responds
 *     200 application/json { html: <string> }.
 *  3. EVERY OTHER request passes through unchanged. The published-page SW is a
 *     SEPARATE SW (served by the framework worker to visitors) and stays
 *     non-intercepting — this file does not touch it.
 *  4. FALLBACK (client-side): on any failure here the client retries the SAME
 *     body via POST /builder/api/reRender and uses its { html } — handled in
 *     iframeBridge, not in this file.
 *
 * === WHY renderPage/renderDocument ARE SW-SAFE ===
 * They are PURE string renderers. The only DOM-ish tokens in their source tree
 * live INSIDE EMITTED <script> strings (Navbar theme toggle, the /sw.js
 * registration snippet in shell.ts) — those are never executed in the SW
 * thread, only returned as HTML text. Verified across
 * packages/edge-core/src/ssr/**: no top-level document/window access.
 *
 * === WHY registerComponents() IS NOT CALLED ===
 * The phase E spec says "ensure registerComponents() runs once from the
 * imported @frontbase/edge-core". That export does NOT exist on
 * @frontbase/edge-core — registerComponents lives in @frontbase/builder/registry
 * and only feeds globalRegistry.renderComponent (used by the SEPARATE
 * /builder/api/render-component + /api/registry endpoints). The /builder/api/reRender
 * BODY path this SW mirrors does NOT consult that registry: renderPage has its
 * OWN renderer dispatch (static/interactive/data/layout/landing classification
 * sets in PageRenderer.ts) with a pure-string `fb-unknown` fallback. Verified
 * in packages/edge-core/src/ssr/PageRenderer.ts. Importing @frontbase/builder
 * here would pull Hono + the editing client into the SW bundle for zero
 * rendering benefit — deliberately omitted.
 *
 * === VERSION PIN ===
 * The vite build pass (see vite.config.ts `builderSwPlugin`) resolves
 * @frontbase/edge-core through this package's workspace dependency to the
 * compiled dist (packages/edge-core/dist/index.js) — the SAME package the
 * cf-full worker imports. A single source of truth, so the SW and the worker
 * can never drift.
 */

// --- Minimal ServiceWorker type declarations ---
// We intentionally do NOT pull in the full "webworker" lib via a triple-slash
// reference: this SW source lives under the product's shared tsconfig.app.json,
// whose "lib" already includes "DOM". Merging "DOM" + "webworker" produces
// duplicate-global conflicts. Instead we declare only the SW-global surface we
// touch. (esbuild strips these at bundle time; they exist purely for tsc.)
/* eslint-disable @typescript-eslint/no-explicit-any */

interface ExtendableEventLike extends Event {
    waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends Event {
    readonly request: Request;
    readonly clientId: string;
    respondWith(promise: Promise<Response>): void;
}

interface SwClientLike {
    readonly type: string;
}

interface SwClientsLike {
    get(id: string): Promise<SwClientLike | undefined>;
    claim(): Promise<unknown>;
}

interface ServiceWorkerGlobalScopeLike {
    readonly location: { readonly origin: string };
    skipWaiting(): Promise<void>;
    readonly clients: SwClientsLike;
    addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEventLike) => void): void;
    addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void;
}

declare const self: ServiceWorkerGlobalScopeLike;

import { renderPage, renderDocument } from '@frontbase/edge-core';
import type { PageLayoutData } from '@frontbase/edge-core';

/** Reserved virtual path SUFFIX the client POSTs to. The full path is
 *  `${BASE_URL}builder/__fb_builder_render__` — it MUST sit UNDER this SW's
 *  scope (`${BASE_URL}builder/`, see registerBuilderSw.ts): a SW only receives
 *  fetch events for URLs in its scope, so a root-level path would never be
 *  intercepted. Matched here by SUFFIX so the same SW works in every deploy
 *  mode (dev "/", self-host "/frontbase-admin/", cloud "/admin/") without
 *  needing BASE_URL at SW bundle time. NEVER hits the network when active. */
const RENDER_PATH = '/__fb_builder_render__';

// ---------------------------------------------------------------------------
// ctx builder — byte-for-byte mirror of /builder/api/reRender in
// packages/builder/src/BuilderEngine.ts. Any divergence here would make the SW
// output differ from the worker output (defeating the "zero drift" goal).
// ---------------------------------------------------------------------------

/** Build system context (UTC) — matches edge-core's buildSystemContext. */
function buildSystemContext() {
    const now = new Date();
    const iso = now.toISOString();
    const parts = iso.split('T');
    const datePart = parts[0] || '';
    const timePart = parts[1]?.split('.')[0] || '';
    return {
        date: datePart,
        time: timePart,
        datetime: iso,
        timestamp: now.getTime(),
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
        env: 'production',
    };
}

interface PageDataLike {
    title?: string;
    slug?: string;
    description?: string;
}

interface RenderBody {
    layout: PageLayoutData;
    pageData?: PageDataLike;
}

/** Build the TemplateContext exactly as the worker's reRender endpoint does.
 *  Visitor tracking never runs inside the SW (no request headers to read), so
 *  the visitor starts as the empty context — the same shape the worker's
 *  tracker would produce for a cookieless first hit. */
function buildContext(slug: string, title: string, description: string) {
    const system = buildSystemContext();
    return {
        page: {
            id: slug,
            title,
            url: `/${slug}`,
            slug,
            description,
            published: true,
            createdAt: '',
            updatedAt: '',
            image: '',
            type: 'page',
            custom: {},
        },
        user: null,
        // The visitor cast's spelling is the product's ORIGINAL ON PURPOSE:
        // esbuild orders its minified-name alphabet by character frequency over
        // source identifiers, so even an erased type annotation changes
        // builder-sw.js's bytes. The SW bundle must stay byte-identical to the
        // product build it replaces (fidelity gate), so the cast is NOT
        // re-typed to TemplateContext['visitor'] — the assignability error it
        // produces at the renderPage call below is suppressed there instead.
        visitor: {} as Record<string, unknown>,
        url: {},
        system: {
            date: system.date,
            time: system.time,
            datetime: system.datetime,
            timestamp: system.timestamp,
            year: system.year,
            month: system.month,
            day: system.day,
            env: 'builder',
        },
        cookies: {},
        local: {},
        session: {},
        records: [],
        app: { environment: 'builder', manifestVersion: 1 },
    };
}

/** Render the POSTed layout to a full HTML document — the {html} payload. */
async function handleRender(request: Request): Promise<Response> {
    const body = (await request.json()) as RenderBody;

    if (!body?.layout) {
        return new Response(JSON.stringify({ error: 'Layout is required' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
        });
    }

    const layout = body.layout;
    const title = body.pageData?.title ?? '';
    const slug = body.pageData?.slug ?? '';
    const description = body.pageData?.description ?? '';

    const pageEntry = {
        title,
        slug,
        description,
        layout,
    };

    const ctx = buildContext(slug, title, description);
    // @ts-ignore — the empty visitor cast above is Record<string, unknown>
    // (kept byte-stable for the SW fidelity gate; see buildContext). Tracking
    // never runs inside the SW, so the missing VisitorContext fields are
    // exactly the ones a cookieless first hit leaves unset.
    const bodyHtml = await renderPage(layout, ctx);
    const html = renderDocument(pageEntry, bodyHtml, {
        environment: 'builder',
        registerServiceWorker: false,
    });

    return new Response(JSON.stringify({ html }), {
        status: 200,
        headers: {
            'content-type': 'application/json',
            // The rendered HTML is a function of the POSTed layout, which is
            // never cached by the caller — mark no-store so a stale SW cache
            // never shadows a fresher layout.
            'cache-control': 'no-store',
        },
    });
}

// ---------------------------------------------------------------------------
// Lifecycle: take control ASAP so the registering page is served locally on
// the FIRST navigation (without these, the SW would only control clients
// opened AFTER activation, and the builder would fall back to the network on
// first load).
// ---------------------------------------------------------------------------

self.addEventListener('install', () => {
    // Nothing to pre-warm: renderPage is a pure function with no registry to
    // populate (see header). Activate immediately so we can claim the builder
    // tab without a reload.
    void self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEventLike) => {
    event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Fetch: intercept ONLY POST /__fb_builder_render__. Pass through everything
// else untouched (including /builder/api/reRender, which is the client's
// fallback when this SW is not yet active or render threw).
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event: FetchEventLike) => {
    const req = event.request;

    // Cheap pre-filters before any async work: method + same-origin + path.
    if (req.method !== 'POST') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    // Match by SUFFIX (e.g. /builder/__fb_builder_render__ under any BASE_URL).
    // The browser only dispatches in-scope fetches to this SW, so any pathname
    // ending in the reserved suffix is the builder render request.
    if (!url.pathname.endsWith(RENDER_PATH)) return;

    event.respondWith(
        (async () => {
            // Belt-and-suspenders controller guard. The fetch event is only
            // dispatched to the SW that controls the fetching client, so by the
            // time we reach here we ARE the active controller for that client.
            // We still resolve the client to (a) confirm it is a window (not a
            // dedicated/shared worker that we should not render for) and (b)
            // survive the brief install→activate race cleanly.
            const client = event.clientId ? await self.clients.get(event.clientId) : undefined;
            if (client && client.type !== 'window') {
                // Not a page — let it go to the network unchanged.
                return fetch(req);
            }
            try {
                return await handleRender(req);
            } catch (err) {
                // Return a 5xx so the client's fallback (POST /builder/api/reRender)
                // takes over. Never leave the page without a render path.
                return new Response(
                    JSON.stringify({ error: err instanceof Error ? err.message : 'render_failed' }),
                    { status: 500, headers: { 'content-type': 'application/json' } },
                );
            }
        })(),
    );
});
