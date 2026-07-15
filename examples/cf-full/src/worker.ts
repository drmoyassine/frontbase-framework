/**
 * Cloudflare Worker entry — the FULL CMS as ONE worker: the eSSR engine
 * (@frontbase/edge-core) + the login-gated admin console (@frontbase/backend),
 * over a Cloudflare D1 binding (@frontbase/edge-infra).
 *
 * CF-22 P3: the product's REAL community console SPA is now served from
 * console-dist/ (built by scripts/fetch-console.mjs). The old inline
 * @frontbase/admin-console SPA is retained at /console as a fallback during the
 * cutover period (parallel run). The compat /api surface (createCompatApp)
 * serves the product's 284 community API endpoints at /api/*.
 *
 * Deploy secrets (wrangler secret put — never in wrangler.toml, never in git):
 *   SESSION_SECRET  (required) HS256 key for the fb_session JWT cookie
 *   SETUP_TOKEN     (optional) enables the first-run /setup wizard
 *   ADMIN_EMAIL     (optional) seed the first owner on first boot …
 *   ADMIN_PASSWORD  (optional) … idempotent — never reseeds, never resets
 *   ADMIN_ROLE      (optional) role for the seeded admin (default 'owner')
 */
import { Hono } from 'hono';
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import { createConsole, createCompatApp, migrateUp, seedOwner, UserStore } from '@frontbase/backend';
import { d1RunnerFromBinding, type DbRunner } from '@frontbase/edge-infra';
import { manifest } from './manifest.js';
import SW_BUNDLE from 'virtual:sw-bundle';
import SPA_BUNDLE from 'virtual:spa-bundle';
import CONSOLE_INDEX from './console-shell.js';

// The OLD admin-console SPA shell (parallel-run fallback at /console).
const OLD_SPA_HTML = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frontbase Console</title></head><body><div id="root"></div><script>${SPA_BUNDLE}</script></body></html>`;

// Host config: there is no process.env on Workers — supply edition/env explicitly.
configureEngine({ edition: 'community', nodeEnv: 'production' });

export interface CmsEnv {
    DB: D1Database;
    SESSION_SECRET: string;
    SETUP_TOKEN?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_ROLE?: string;
}

export interface CmsEngineOptions {
    runner: DbRunner;
    sessionSecret: string;
    setupToken?: string;
    admin?: { email?: string; password?: string; role?: string };
    now?: () => string;
    /** F3b: background dispatcher. */
    dispatcher?: (work: () => Promise<void>) => void;
}

/**
 * Assemble the full CMS engine. The routing order is:
 *   1. /api/auth/login, /api/auth/logout, /api/auth/signup, etc. (UNAUTHENTICATED compat)
 *   2. /api/* — the compat surface (284 community ops) + /api/console/* (existing console)
 *      → ALL behind defaultDenyAuth (except the unauth auth routes above)
 *   3. /frontbase-admin + /frontbase-admin/* — the product SPA shell (Static Assets in prod;
 *      in test, served from the inlined CONSOLE_INDEX HTML with a catch-all SPA fallback)
 *   4. /console → 301 to /frontbase-admin (continuity redirect)
 *   5. /console (old SPA) — parallel-run fallback
 *   6. Engine catch-all (published pages, /sw.js)
 */
export async function createCmsEngine(opts: CmsEngineOptions): Promise<Hono> {
    const now = opts.now ?? (() => new Date().toISOString());
    await migrateUp(opts.runner, now);
    if (opts.admin?.email && opts.admin?.password) {
        await seedOwner(new UserStore(opts.runner, '_default'), {
            email: opts.admin.email,
            password: opts.admin.password,
            now: now(),
            role: opts.admin.role ?? 'owner',
        });
    }

    // The existing /api/console/* surface (keep during parallel run).
    const consoleApp = await createConsole({
        makeRunner: () => opts.runner,
        sessionSecret: opts.sessionSecret,
        setupToken: opts.setupToken,
        seedRole: opts.admin?.role ?? 'owner',
        now,
        dispatcher: opts.dispatcher,
    });

    // CF-22 P3: the compat /api/* surface — the product's 284 community ops.
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

    // 1. /frontbase-admin SPA shell + SPA fallback for client-side routes.
    app.get('/frontbase-admin', (c) => c.html(CONSOLE_INDEX));
    app.get('/frontbase-admin/*', (c) => c.html(CONSOLE_INDEX));

    // 2. /console → 301 redirect to /frontbase-admin (continuity).
    app.get('/console', (c) => c.redirect('/frontbase-admin', 301));

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
                    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: env.ADMIN_ROLE },
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
