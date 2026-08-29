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
import { buildSystemContext } from './ssr/lib/context.js';
import type { TemplateContext } from './ssr/lib/context.js';
import type { SiteManifest, PageEntry, RegisteredQuery } from './manifest.js';
import type { DataProvider } from './data.js';
import { renderDocument } from './shell.js';
import { generateGatedPageDocument } from './ssr/gatedPage.js';
import { getDefaultTrackingConfig } from './ssr/lib/tracking.js';
import type { HtmlPageData } from './ssr/htmlDocument.js';
import { engineConfig, type Principal } from './config.js';

export type Environment = 'edge' | 'service-worker' | 'builder';

export interface EngineOptions {
    manifest: SiteManifest;
    data: DataProvider;
    environment: Environment;
    /** Pre-built browser engine bundle, served at /sw.js (compiler emits it — M1.4). */
    swBundle?: string;
    /** Console API sub-router, mounted at /api/console (Phase 2). */
    console?: Hono;
    /** Resolve a published page by URL path. When set, dynamic CMS pages override
     *  the baked manifest (the manifest becomes a last-resort fallback). Injected
     *  by the host so the engine stays DB-blind. Returns null when no such page.
     *  A-25: the raw Request is threaded (optional) so cloud hosts can resolve
     *  the page per HOST TENANT — the engine never parses tenancy itself. */
    resolvePublishedPage?: (path: string, request?: Request) => Promise<PageEntry | null>;
    /** Enrich a page layout at serve time (product parity: FastAPI public.py →
     *  convert_component adds binding.dataRequest before the edge renders).
     *  Host-injected so the engine stays DB-blind; runs on the NORMAL render
     *  path only — the gated preview renders the raw layout so an
     *  unauthenticated visitor never triggers a datasource fetch.
     *  A-25: optional raw Request so cloud hosts enrich from the HOST TENANT's
     *  datasources only (never a cross-tenant fallback). */
    enrichLayout?: (layout: unknown, request?: Request) => Promise<unknown>;
}

/**
 * Enforce a registered query's `scope` against the calling principal.
 * Deny-by-default: unknown scopes are treated as the most restrictive.
 *   - 'public' (or unset): allowed for anyone.
 *   - 'tenant': requires a resolved tenant (else 401).
 *   - 'user':   requires an authenticated user (else 401).
 * Returns a denial `{status, error}` or `null` when access is permitted.
 */
export function enforceScope(q: RegisteredQuery, principal: Principal): { status: 401 | 403; error: string } | null {
    const scope = q.scope ?? 'public';
    switch (scope) {
        case 'public':
            return null;
        case 'tenant':
            return principal.tenant ? null : { status: 401, error: 'tenant_required' };
        case 'user':
            return principal.user ? null : { status: 401, error: 'authentication_required' };
        default:
            // Unknown scope → deny (fail closed).
            return { status: 403, error: 'forbidden' };
    }
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
        url: {}, system: buildSystemContext(),
        cookies: {}, local: {}, session: {},
        records,
        app: { environment: opts.environment, manifestVersion: opts.manifest.version },
    } as TemplateContext;
}

/**
 * Adapt a resolved PageEntry to the HtmlPageData shape expected by the gated-page
 * document generator (which reuses the product's generateHtmlDocument shell).
 *
 * `isHomepage` is derived from the request path so the post-login redirect baked
 * into gatedPage.ts resolves to '/' for the homepage and '/<slug>' otherwise —
 * matching the product's `(page.isHomepage ? '/' : '/' + page.slug)`.
 */
function toHtmlPageData(page: PageEntry, path: string): HtmlPageData & { isHomepage: boolean } {
    return {
        id: page.slug,
        slug: page.slug,
        name: page.title,
        title: page.title,
        description: page.description,
        cssBundle: page.cssBundle,
        layoutData: page.layout,
        isHomepage: path === '/',
    } as HtmlPageData & { isHomepage: boolean };
}

export function createEngine(opts: EngineOptions): Hono {
    const { manifest, data, environment } = opts;
    const app = new Hono();

    app.onError((err, c) => {
        // Log the detail server-side; return an opaque error to the client
        // (no err.message / stack / env label — avoid information disclosure).
        console.error(`[chimera-engine:${environment}]`, err);
        return c.json({ error: 'internal_error' }, 500);
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
    //    Exception: /api/data/execute is handled by the compat layer (framework D — client hydration).
    if (environment === 'edge') {
        app.post('/api/data/:queryId', async (c, next) => {
            const queryId = c.req.param('queryId');
            // Delegate /api/data/execute to the compat layer (framework D — client hydration)
            if (queryId === 'execute') {
                return next(); // Pass through to compat app
            }
            const q = manifest.queries[queryId];
            if (!q) return c.json({ error: 'unknown_query' }, 404);

            // Resolve the calling principal (user + tenant) BEFORE anything else,
            // then enforce the query's scope. Deny-by-default: a 'tenant'/'user'
            // scoped query with no authenticated principal is rejected 401/403.
            const principal = await engineConfig().resolvePrincipal(c.req.raw);
            const denial = enforceScope(q, principal);
            if (denial) return c.json({ error: denial.error }, denial.status);

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
            // Thread user + tenant into the executor context so registered
            // queries can tenant-scope their own data access (isolation).
            const rows = await data.query(queryId, params, {
                request: c.req.raw,
                user: principal.user,
                tenant: principal.tenant,
            });
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
        // Dynamic-first: a published page resolved by the host (e.g. from the CMS
        // database) overrides the baked manifest; the manifest is the last-resort
        // fallback (demo pages, or a homepage the user deleted).
        let page = opts.resolvePublishedPage ? await opts.resolvePublishedPage(path, c.req.raw) : undefined;
        if (!page) page = manifest.pages[path];
        if (!page) return c.notFound();

        // Private-page gating (edge only). Mirrors the product's routes/pages.ts
        // gate field-for-field: a page whose `isPublic === false`, served to an
        // unauthenticated visitor, is rendered behind generateGatedPageDocument —
        // the full page HTML, blurred, with an inline auth overlay (the visitor
        // sees the content preview + a login/signup form; on success the page is
        // re-requested and served normally). Authenticated visitors fall through
        // to the normal render. The host wires `engineConfig().resolvePrincipal`
        // (the visitor session/cookie); cf-full reuses the SAME fb_session JWT
        // resolver as the compat /api surface and the builder auth gate, so the
        // decision is identical to the product's `refreshSession` check.
        //
        // Tenant isolation is preserved: the gated body is rendered with EMPTY
        // records (no query data is fetched or leaked to the unauthenticated
        // visitor — the scope-enforcement block below is skipped entirely).
        // The SW/builder environments never gate (a private page is still loaded
        // for local re-render / canvas editing).
        if (environment === 'edge' && page.isPublic === false) {
            const principal = await engineConfig().resolvePrincipal(c.req.raw);
            if (!principal.user) {
                const body = await renderPage(page.layout, buildContext(page, path, [], opts));
                const faviconUrl = await engineConfig().resolveFaviconUrl(c.req.raw);
                const gatedHtml = generateGatedPageDocument(
                    toHtmlPageData(page, path),
                    body,
                    {} as Record<string, unknown>,
                    getDefaultTrackingConfig(),
                    faviconUrl || undefined,
                    page._primaryAuthForm,
                );
                return c.html(gatedHtml, 200, {
                    'x-rendered-by': environment,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                });
            }
        }

        // Serve-time layout enrichment (see EngineOptions.enrichLayout). Applies
        // AFTER the gating branch — a gated (unauthenticated) preview renders
        // the raw layout, so enrichment/data fetches never happen behind the
        // auth overlay.
        if (opts.enrichLayout) {
            page = { ...page, layout: await opts.enrichLayout(page.layout, c.req.raw) as PageEntry['layout'] };
        }

        // Page data goes through the SAME scope enforcement + tenant threading as
        // the Edge Data Proxy — otherwise a tenant/user-scoped page query would
        // either leak cross-tenant data or reach an executor with no tenant.
        let records: Record<string, unknown>[] = [];
        if (page.queryId) {
            const q = manifest.queries[page.queryId];
            if (!q) {
                console.error(`[chimera-engine:${environment}] page "${path}" references unknown query "${page.queryId}"`);
                return c.json({ error: 'internal_error' }, 500);
            }
            const principal = await engineConfig().resolvePrincipal(c.req.raw);
            const denial = enforceScope(q, principal);
            // A scoped page requested without the required principal is not
            // rendered with empty data (which would silently hide content) — it
            // is denied, same as the proxy. Public pages are unaffected.
            if (denial) return c.json({ error: denial.error }, denial.status);
            records = await data.query(page.queryId, {}, {
                request: c.req.raw,
                user: principal.user,
                tenant: principal.tenant,
            });
        }
        const body = await renderPage(page.layout, buildContext(page, path, records, opts));
        const html = renderDocument(page, body, {
            environment,
            registerServiceWorker: environment === 'edge' && !!opts.swBundle,
            // Same resolver the gated branch and navbarFavicon use — the host
            // decides (product: project settings faviconUrl || default icon).
            faviconUrl: (await engineConfig().resolveFaviconUrl(c.req.raw)) || undefined,
        });
        return c.html(html, 200, {
            'x-rendered-by': environment,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
    });

    return app;
}
