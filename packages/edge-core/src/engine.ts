/**
 * The Chimera Engine — ONE Hono app, identical in every host (CHIMERA §1–2).
 *
 * Unified priority router (consolidates the product's lite/full engines):
 *   1. GET  /sw.js              — the browser engine bundle (edge only, if provided)
 *   2. POST /api/data/:queryId  — Edge Data Proxy (edge only; registered queries,
 *                                 Zod-validated params — Decision A-16)
 *   3. /api/console/*           — host-mounted console sub-router (Phase 2: @frontbase/backend)
 *   4. GET  *                   — eSSR catch-all for manifest pages
 */
import { Hono } from 'hono';
import { renderPage } from './ssr/PageRenderer.js';
import type { TemplateContext } from './ssr/lib/context.js';
import type { SiteManifest, PageEntry } from './manifest.js';
import type { DataProvider } from './data.js';
import { renderDocument } from './shell.js';

export type Environment = 'edge' | 'service-worker' | 'builder';

export interface EngineOptions {
    manifest: SiteManifest;
    data: DataProvider;
    environment: Environment;
    /** Pre-built browser engine bundle, served at /sw.js (compiler emits it — M1.4). */
    swBundle?: string;
    /** Console API sub-router, mounted at /api/console (Phase 2). */
    console?: Hono;
}

/** Deterministic template context — timestamps come from the manifest, never Date.now(). */
function buildContext(page: PageEntry, path: string, records: Record<string, unknown>[], opts: EngineOptions): TemplateContext {
    return {
        page: {
            id: page.slug, title: page.title, url: path, slug: page.slug,
            description: page.description ?? '', published: true,
            createdAt: '', updatedAt: '',
            image: '', type: 'page', custom: {},
        },
        user: null,
        visitor: {} as TemplateContext['visitor'],
        url: {}, system: {} as TemplateContext['system'],
        cookies: {}, local: {}, session: {},
        records,
        app: { environment: opts.environment, manifestVersion: opts.manifest.version },
    } as TemplateContext;
}

export function createEngine(opts: EngineOptions): Hono {
    const { manifest, data, environment } = opts;
    const app = new Hono();

    app.onError((err, c) => {
        console.error(`[chimera-engine:${environment}]`, err);
        return c.text(`engine_error(${environment}): ${err.message}`, 500);
    });

    // 1. The browser engine bundle (the handover). Edge only — inside the SW,
    //    /sw.js must fall through to the network so updates can arrive.
    if (opts.swBundle && environment === 'edge') {
        const bundle = opts.swBundle;
        app.get('/sw.js', (c) =>
            c.body(bundle, 200, {
                'content-type': 'text/javascript',
                'cache-control': 'no-cache', // CHM-1: version via content, not cache TTL
            })
        );
    }

    // 2. Edge Data Proxy — the ONLY data path browsers ever see (A-16).
    if (environment === 'edge') {
        app.post('/api/data/:queryId', async (c) => {
            const queryId = c.req.param('queryId');
            const q = manifest.queries[queryId];
            if (!q) return c.json({ error: 'unknown_query' }, 404);

            let params: Record<string, unknown> = {};
            try {
                params = await c.req.json();
            } catch { /* empty body → no params */ }

            if (q.params) {
                const parsed = q.params.safeParse(params);
                if (!parsed.success) {
                    return c.json({ error: 'invalid_params', issues: parsed.error.issues }, 400);
                }
                params = parsed.data as Record<string, unknown>;
            }
            const rows = await data.query(queryId, params, { request: c.req.raw });
            return c.json(rows, 200, { 'x-proxy': 'edge-data-proxy' });
        });
    }

    // 3. Console API mount point (Phase 2: @frontbase/backend sub-router).
    if (opts.console) {
        app.route('/api/console', opts.console);
    }

    // 4. eSSR catch-all — same renderer, every host.
    app.get('*', async (c) => {
        const path = new URL(c.req.url).pathname;
        const page = manifest.pages[path];
        if (!page) return c.notFound();

        const records = page.queryId ? await data.query(page.queryId) : [];
        const body = await renderPage(page.layout, buildContext(page, path, records, opts));
        const html = renderDocument(page, body, {
            environment,
            registerServiceWorker: environment === 'edge' && !!opts.swBundle,
        });
        return c.html(html, 200, { 'x-rendered-by': environment });
    });

    return app;
}
