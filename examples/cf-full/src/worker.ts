/**
 * Cloudflare Worker entry — the FULL CMS as ONE worker: the eSSR engine
 * (@frontbase/edge-core) + the login-gated admin console (@frontbase/backend),
 * over a Cloudflare D1 binding (@frontbase/edge-infra).
 *
 * CF-22: the product's community console SPA is served from console-dist/
 * (built by scripts/fetch-console.mjs). The framework SPA is setup-only at
 * /setup, /console redirects to the product console, and the legacy
 * /api/console surface is retired except for health and first-run setup.
 * The vendored GET / operation remains owned by the eSSR engine.
 *
 * Deploy secrets (wrangler secret put — never in wrangler.toml, never in git):
 *   SESSION_SECRET  (required) HS256 key for the frontbase_session JWT cookie
 *   SETUP_TOKEN     (optional) enables the first-run /setup wizard
 *   SETUP_EXPIRES_AT (optional) ISO expiry for the deploy-generated setup link
 *   ADMIN_EMAIL     (optional) seed the first owner on first boot …
 *   ADMIN_PASSWORD  (optional) … idempotent — never reseeds, never resets
 *   ADMIN_ROLE      (optional) role for the seeded admin (default 'master_admin')
 */
import { Hono } from 'hono';
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import type { PageEntry } from '@frontbase/edge-core';
import { createConsole, createCompatApp, migrateUp, seedOwner, UserStore, PagesStore } from '@frontbase/backend';
import { createBuilderEngine } from '@frontbase/builder';
import { registerComponents } from '@frontbase/builder/registry';
import { d1RunnerFromBinding, s3StorageProvider, type DbRunner, type StorageProvider } from '@frontbase/edge-infra';
import { manifest } from './manifest.js';
import SW_BUNDLE from 'virtual:sw-bundle';
import CLIENT_BUNDLE from 'virtual:builder-client-bundle';
import CONSOLE_INDEX from './console-shell.js';

const SETUP_SPA_HTML = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frontbase Setup</title></head><body><div id="root"></div><script src="/frontbase-setup/spa.js"></script></body></html>';

// Host config: there is no process.env on Workers — supply edition/env explicitly.
configureEngine({ edition: 'community', nodeEnv: 'production' });

export interface CmsEnv {
    DB: D1Database;
    ASSETS: { fetch(request: Request): Promise<Response> };
    SESSION_SECRET: string;
    SETUP_TOKEN?: string;
    SETUP_EXPIRES_AT?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_ROLE?: string;
    STORAGE_ACCESS_KEY_ID?: string;
    STORAGE_SECRET_ACCESS_KEY?: string;
    STORAGE_ENDPOINT?: string;
    STORAGE_REGION?: string;
}

export interface CmsEngineOptions {
    runner: DbRunner;
    sessionSecret: string;
    setupToken?: string;
    setupExpiresAt?: string;
    admin?: { email?: string; password?: string; role?: string };
    now?: () => string;
    /** F3b: background dispatcher. */
    dispatcher?: (work: () => Promise<void>) => void;
    /** Wrangler Static Assets binding. Omitted by the in-process smoke. */
    assets?: { fetch(request: Request): Promise<Response> };
    storageProvider?: StorageProvider;
}

/**
 * Assemble the full CMS engine. The routing order is:
 *   1. /api/auth/login, /api/auth/logout, /api/auth/signup, etc. (UNAUTHENTICATED compat)
 *   2. /api/* — the 334-operation product-compatible surface
 *      → behind defaultDenyAuth (except documented unauth auth/callback routes)
 *   3. /frontbase-admin assets + shell (Static Assets binding in production;
 *      validated inline fallback in the Node smoke)
 *   4. /console → 301 to /frontbase-admin (continuity redirect)
 *   5. /setup — first-run setup-only SPA
 *   6. Engine catch-all (published pages, /sw.js)
 */
export async function createCmsEngine(opts: CmsEngineOptions): Promise<Hono> {
    const now = opts.now ?? (() => new Date().toISOString());
    await migrateUp(opts.runner, now);
    // Fresh-deploy homepage template: a real, editable page that is live at '/'
    // (is_homepage=1, is_published=1). Idempotent — only seeds when no homepage
    // exists, so the user can edit/delete/replace it freely.
    await new PagesStore(opts.runner, '_root').ensureHomepage(now());
    if (opts.admin?.email && opts.admin?.password) {
        const role = opts.admin.role ?? 'master_admin';
        const tenantSlug = role === 'master_admin' ? '_root' : '_default';
        await seedOwner(new UserStore(opts.runner, tenantSlug), {
            email: opts.admin.email,
            password: opts.admin.password,
            now: now(),
            role,
            tenantSlug,
        });
    }
    const needsSetup = async () =>
        (await new UserStore(opts.runner, '_default').countUsers()) === 0
        && (await new UserStore(opts.runner, '_root').countUsers()) === 0;

    // CF-22 Work C: retain health + first-run setup, explicitly retire every
    // other /api/console/* route with 410 Gone.
    const consoleApp = await createConsole({
        makeRunner: () => opts.runner,
        sessionSecret: opts.sessionSecret,
        setupToken: opts.setupToken,
        setupExpiresAt: opts.setupExpiresAt,
        seedRole: opts.admin?.role ?? 'master_admin',
        now,
        dispatcher: opts.dispatcher,
        retireLegacyApi: true,
        storageProvider: opts.storageProvider,
    });

    // CF-22 P3: the compat /api/* surface (the eSSR engine owns vendored GET /).
    // Sits BEFORE the engine catch-all so /api/auth/login, /api/pages/, etc.
    // are served by the framework, not shadowed by the eSSR proxy.
    const compatApp = await createCompatApp({
        makeRunner: () => opts.runner,
        resolvePrincipal: (await import('@frontbase/edge-infra')).createResolvePrincipal({
            jwtSecret: opts.sessionSecret,
            jwtCookie: 'frontbase_session',
        }) as (req: Request) => Promise<any>,
        sessionSecret: opts.sessionSecret,
        userStoreFor: (t: string) => new UserStore(opts.runner, t),
        now,
        storageProvider: opts.storageProvider,
        // The system edge is THIS worker: Cloudflare, backed by the bound D1. The
        // cf-full worker always runs on Cloudflare; future deno/vercel/netlify
        // worker entries pass their own provider + real binding here.
        systemEdge: { provider: 'cloudflare', name: 'Local Edge', db: 'Cloudflare D1' },
    });

    // Phase 1: Wire the framework eSSR BuilderEngine as the real builder canvas.
    // The builder uses PagesStore for persistence and is mounted behind auth.
    const pagesStore = new PagesStore(opts.runner, '_root');
    await registerComponents(); // Populate the component registry
    const resolvePrincipal = (await import('@frontbase/edge-infra')).createResolvePrincipal({
        jwtSecret: opts.sessionSecret,
        jwtCookie: 'frontbase_session',
    });
    // Wire the visitor session resolver into the eSSR engine so private-page
    // gating decides the SAME way the compat /api surface and the builder gate
    // do: a valid frontbase_session JWT → authenticated user; otherwise anonymous (and
    // a private page is served behind the auth overlay). configureEngine RESETS
    // to defaults on each call (its documented contract), so the edition/env
    // values are re-stated here alongside resolvePrincipal in ONE call — this
    // replaces the module-load `configureEngine({ edition, nodeEnv })`.
    configureEngine({ edition: 'community', nodeEnv: 'production', resolvePrincipal });
    // Auth gate for every builder route: no session → 302 to /frontbase-admin
    // (with a return URL). Passed INTO createBuilderEngine via `authMiddleware` so
    // it is registered as the FIRST handler — Hono dispatches in registration
    // order, so a gate added after the routes (or via a parent app.use that
    // doesn't cascade onto mounted sub-apps) never runs before them.
    const builderAuthGate = async (c: any, next: any) => {
        const principal = await resolvePrincipal(c.req.raw);
        // resolvePrincipal returns { user: null } (a truthy OBJECT) when there is
        // no credential — NOT null. Checking `!principal` therefore never redirects
        // (the builder was unprotected from d78b292 until this fix; the routing 404
        // masked it). Check the USER: no authenticated user → 302 to login.
        if (!principal?.user) {
            const returnUrl = encodeURIComponent(c.req.url);
            return c.redirect(`/frontbase-admin?returnUrl=${returnUrl}`, 302);
        }
        return next();
    };
    const builderApp = createBuilderEngine({
        loadPage: async (pageId: string) => {
            const row = await pagesStore.get(pageId);
            if (!row) return null;
            let layout: unknown;
            try { layout = JSON.parse(row.layout_data); } catch { layout = { content: [], root: {} }; }
            return { id: row.id, layout: layout as any };
        },
        savePage: async (pageId: string, layoutData) => {
            await pagesStore.update(pageId, { layoutData }, now());
        },
        autoSave: false, // No auto-save for now
        authMiddleware: builderAuthGate,
        // Point the canvas template at the inlined editing client (built by
        // build.mjs as virtual:builder-client-bundle), served below at
        // /builder/client.js. Without this, the template's <script> 404s, the
        // editing client never runs, and the tree/property panels never build.
        clientBundle: '/builder/client.js',
    });
    // Serve the editing client IIFE. Same-origin <script src> from the authed
    // /builder/edit page carries the session cookie, so builderAuthGate passes.
    builderApp.get('/client.js', () =>
        new Response(CLIENT_BUNDLE, {
            status: 200,
            headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' },
        }),
    );

    const engine = createEngine({
        manifest,
        data: directProvider(manifest),
        environment: 'edge',
        swBundle: SW_BUNDLE,
        console: consoleApp,
        // Serve published Builder pages (dynamic-first — they override the baked
        // demo). '/' → the homepage (is_homepage=1); '/<slug>' → by slug. Only
        // published, non-deleted pages. Community single-tenant: read across tenants.
        resolvePublishedPage: async (path) => {
            const rows = path === '/'
                ? await opts.runner.query('SELECT name, slug, description, layout_data, is_public, primary_auth_form FROM compat_pages WHERE is_homepage = 1 AND is_published = 1 AND deleted_at IS NULL LIMIT 1')
                : await opts.runner.query('SELECT name, slug, description, layout_data, is_public, primary_auth_form FROM compat_pages WHERE slug = ? AND is_published = 1 AND deleted_at IS NULL LIMIT 1', [decodeURIComponent(path).replace(/^\/+|\/+$/g, '')]);
            const row = rows[0];
            if (!row) return null;
            let layout;
            try { layout = JSON.parse(String(row.layout_data)); } catch { layout = { content: [], root: {} }; }
            // Surface the page's visibility flag so the eSSR engine can gate
            // private pages. is_public is INTEGER (0/1) in compat_pages; coerce
            // to a boolean, defaulting to public when absent (NULL → public),
            // matching the product's `isPublic` semantics.
            const isPublic = row.is_public == null ? undefined : Number(row.is_public) !== 0;
            // primary_auth_form is the project's primary auth-form config baked at
            // publish (migration v19) — a TEXT column holding a JSON AuthFormConfig.
            // The engine threads page._primaryAuthForm into generateGatedPageDocument
            // so a private page's overlay skins from real config. NULL/invalid →
            // undefined → the overlay falls back to its built-in defaults.
            let primaryAuthForm: PageEntry['_primaryAuthForm'];
            if (row.primary_auth_form != null && String(row.primary_auth_form) !== '') {
                try {
                    const parsed = JSON.parse(String(row.primary_auth_form));
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        primaryAuthForm = parsed as PageEntry['_primaryAuthForm'];
                    }
                } catch { /* malformed JSON → fall back to overlay defaults */ }
            }
            return {
                title: String(row.name ?? row.slug ?? 'Page'),
                slug: String(row.slug ?? ''),
                description: row.description ? String(row.description) : undefined,
                layout,
                ...(isPublic !== undefined ? { isPublic } : {}),
                ...(primaryAuthForm ? { _primaryAuthForm: primaryAuthForm } : {}),
            };
        },
    });

    const app = new Hono();

    const assetResponse = async (request: Request, cacheControl: string): Promise<Response | null> => {
        if (!opts.assets) return null;
        const response = await opts.assets.fetch(request);
        if (!response.ok) return null;
        const headers = new Headers(response.headers);
        headers.set('Cache-Control', cacheControl);
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    };
    const consoleShell = async (c: any) => {
        if (await needsSetup()) return c.redirect('/setup', 302);
        const url = new URL(c.req.url);
        url.pathname = '/frontbase-admin/index.html';
        const asset = await assetResponse(new Request(url, c.req.raw), 'no-cache');
        return asset ?? c.html(CONSOLE_INDEX, 200, { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    };

    // 1. /frontbase-admin exact files + shell fallback. Worker-first routing
    // preserves API/eSSR ownership while the binding serves real assets.
    app.get('/frontbase-admin', consoleShell);
    app.get('/frontbase-admin/*', async (c) => {
        const path = new URL(c.req.url).pathname;
        if (path.includes('/assets/') || /\.[a-z0-9]+$/i.test(path)) {
            const cache = path.includes('/assets/')
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=3600';
            const asset = await assetResponse(c.req.raw, cache);
            if (asset) return asset;
        }
        return consoleShell(c);
    });

    // 2. /console → 301 redirect to /frontbase-admin (continuity).
    app.get('/console', (c) => c.redirect('/frontbase-admin', 301));

    // WordPress-style first-run setup surface. It is setup-only: after the first
    // admin exists the server leaves /setup before any retired SPA hash can load.
    app.get('/setup', async (c) => {
        if (!await needsSetup()) return c.redirect('/frontbase-admin/dashboard', 302);
        return c.html(SETUP_SPA_HTML, 200, { 'Cache-Control': 'no-store' });
    });
    app.get('/frontbase-setup/spa.js', async (c) =>
        (await assetResponse(c.req.raw, 'no-cache')) ?? c.text('not_found', 404));

    // Mount the builder sub-app at '/builder'. BuilderEngine's routes are RELATIVE
    // ('/edit/:pageId', '/api/components', …); the '/builder' mount prefix supplies
    // the namespace → '/builder/edit/:pageId' etc. Auth is enforced by the gate
    // mounted on builderApp itself (above), NOT a parent app.use — a parent
    // '/builder/*' gate does not cascade onto merged sub-app routes in this Hono
    // version, and routes that carried the '/builder' prefix doubled the path to
    // '/builder/builder/...' → 404. Mounted before compat/engine so /builder/*
    // matches the builder first.
    app.route('/builder', builderApp);

    // 3. Engine (published pages, /sw.js, retained console health/setup, and
    //    explicit 410 responses for every other /api/console/* path).
    //    Mounted BEFORE compat so the engine's specific routes (/, /sw.js,
    //    /api/console/*) take precedence. The engine's page catch-all /* also
    //    catches unknown paths — compat routes under /api/* that the engine
    //    doesn't own will fall through to compat because Hono tries the next
    //    mounted app when the engine's catch-all returns a 404 or unmatched.
    //    NO — actually Hono doesn't cascade between app.route() mounts.
    //    The correct approach: mount compat FIRST (its routes are all specific
    //    paths — no catch-all that would shadow the engine), then engine.
    //    Compat's defaultDenyAuth catches unknown /api/* paths with 401, but
    //    /, /sw.js, and /frontbase-admin/* are NOT /api/* paths — compat's
    //    own routes don't register for them, so Hono falls through to engine.

    // 4. Compat /api/* surface.
    // The product contract also defines a JSON API status at GET /. Preserve the
    // eSSR homepage for normal browser navigation and serve the API form only to
    // clients that explicitly request JSON.
    app.get('/', async (c, next) => {
        const accepts = c.req.header('accept') ?? '';
        if (accepts.toLowerCase().includes('application/json')) {
            return c.json({ message: 'Frontbase API is operational', test_mode: false });
        }
        return next();
    });
    app.route('/', compatApp);

    // 5. Engine.
    app.route('/', engine);

    return app;
}

let enginePromise: Promise<Hono> | null = null;
let currentCtx: ExecutionContext | null = null;

export default {
    async fetch(req: Request, env: CmsEnv, ctx: ExecutionContext): Promise<Response> {
        try {
            if (!env.SESSION_SECRET) {
                return new Response('SESSION_SECRET is not configured — run: wrangler secret put SESSION_SECRET', { status: 500 });
            }
            if (!env.DB) {
                return new Response('D1 binding "DB" is not configured — check wrangler.toml [[d1_databases]] binding="DB" and a REAL database_id (not the placeholder)', { status: 500 });
            }
            currentCtx = ctx;
            if (!enginePromise) {
                enginePromise = createCmsEngine({
                    runner: d1RunnerFromBinding(env.DB),
                    sessionSecret: env.SESSION_SECRET,
                    setupToken: env.SETUP_TOKEN,
                    setupExpiresAt: env.SETUP_EXPIRES_AT,
                    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: env.ADMIN_ROLE },
                    assets: env.ASSETS,
                    dispatcher: (work) => { if (currentCtx) currentCtx.waitUntil(work()); else void work(); },
                    storageProvider: env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
                        ? s3StorageProvider({
                            accessKeyId: env.STORAGE_ACCESS_KEY_ID,
                            secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
                            endpoint: env.STORAGE_ENDPOINT,
                            region: env.STORAGE_REGION,
                        })
                        : undefined,
                }).catch((e) => { enginePromise = null; throw e; });
            }
            const engine = await enginePromise;
            return engine.fetch(req, env, ctx);
        } catch (e) {
            console.error('[cf-full] worker fetch failed:', (e as Error)?.stack ?? e);
            return new Response('internal_error', { status: 500 });
        }
    },
};
