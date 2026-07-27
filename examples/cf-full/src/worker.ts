/**
 * Cloudflare Worker entry — the FULL CMS as ONE worker: the eSSR engine
 * (@frontbase/edge-core) + the login-gated admin console (@frontbase/backend),
 * over a Cloudflare D1 binding (@frontbase/edge-infra).
 *
 * CF-22 P3: the product's REAL community console SPA is now served from
 * console-dist/ (built by scripts/fetch-console.mjs). The old inline
 * @frontbase/admin-console SPA is retained at /console as a fallback during the
 * cutover period (parallel run). The compat /api surface (createCompatApp)
 * serves 285 product-compatible operations; the vendored GET / operation is
 * intentionally owned by the eSSR engine.
 *
 * Deploy secrets (wrangler secret put — never in wrangler.toml, never in git):
 *   SESSION_SECRET  (required) HS256 key for the fb_session JWT cookie
 *   SETUP_TOKEN     (optional) enables the first-run /setup wizard
 *   SETUP_EXPIRES_AT (optional) ISO expiry for the deploy-generated setup link
 *   ADMIN_EMAIL     (optional) seed the first owner on first boot …
 *   ADMIN_PASSWORD  (optional) … idempotent — never reseeds, never resets
 *   ADMIN_ROLE      (optional) role for the seeded admin (default 'master_admin')
 */
import { Hono } from 'hono';
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import { createConsole, createCompatApp, migrateUp, seedOwner, UserStore } from '@frontbase/backend';
import { d1RunnerFromBinding, type DbRunner } from '@frontbase/edge-infra';
import { manifest } from './manifest.js';
import SW_BUNDLE from 'virtual:sw-bundle';
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
}

/**
 * Assemble the full CMS engine. The routing order is:
 *   1. /api/auth/login, /api/auth/logout, /api/auth/signup, etc. (UNAUTHENTICATED compat)
 *   2. /api/* — the compat surface (285 ops) + /api/console/* (existing console)
 *      → ALL behind defaultDenyAuth (except the unauth auth routes above)
 *   3. /frontbase-admin assets + shell (Static Assets binding in production;
 *      validated inline fallback in the Node smoke)
 *   4. /console → 301 to /frontbase-admin (continuity redirect)
 *   5. /setup — existing first-run setup SPA during stabilization
 *   6. Engine catch-all (published pages, /sw.js)
 */
export async function createCmsEngine(opts: CmsEngineOptions): Promise<Hono> {
    const now = opts.now ?? (() => new Date().toISOString());
    await migrateUp(opts.runner, now);
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

    // The existing /api/console/* surface (keep during parallel run).
    const consoleApp = await createConsole({
        makeRunner: () => opts.runner,
        sessionSecret: opts.sessionSecret,
        setupToken: opts.setupToken,
        setupExpiresAt: opts.setupExpiresAt,
        seedRole: opts.admin?.role ?? 'master_admin',
        now,
        dispatcher: opts.dispatcher,
    });

    // CF-22 P3: the compat /api/* surface (the eSSR engine owns vendored GET /).
    // Sits BEFORE the engine catch-all so /api/auth/login, /api/pages/, etc.
    // are served by the framework, not shadowed by the eSSR proxy.
    const compatApp = await createCompatApp({
        makeRunner: () => opts.runner,
        resolvePrincipal: (await import('@frontbase/edge-infra')).createResolvePrincipal({
            jwtSecret: opts.sessionSecret,
            jwtCookie: 'fb_session',
        }) as (req: Request) => Promise<any>,
        sessionSecret: opts.sessionSecret,
        userStoreFor: (t: string) => new UserStore(opts.runner, t),
        now,
    });

    const engine = createEngine({
        manifest,
        data: directProvider(manifest),
        environment: 'edge',
        swBundle: SW_BUNDLE,
        console: consoleApp,
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

    // 3. Engine (published pages, /sw.js, /api/console/* via the console mount).
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
