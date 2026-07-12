/**
 * Cloudflare Worker entry — the FULL CMS as ONE worker: the eSSR engine
 * (@frontbase/edge-core) + the login-gated admin console (@frontbase/backend),
 * over a Cloudflare D1 binding (@frontbase/edge-infra).
 *
 * WHY the lazy `getEngine(env)` shape (BLOCKER-1/B10): D1 bindings live on the
 * per-request `env`, not on module scope — there is no `env` at import time. So
 * the engine (and its DB-bound console) is assembled on first request and cached
 * per isolate. The console is async (it opens the runner, runs migrations, and
 * optionally seeds the first admin from deploy secrets), hence a cached promise.
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
import { createConsole, migrateUp, seedOwner, UserStore } from '@frontbase/backend';
import { d1RunnerFromBinding, type DbRunner } from '@frontbase/edge-infra';
import { manifest } from './manifest.js';
import SW_BUNDLE from 'virtual:sw-bundle';
import SPA_BUNDLE from 'virtual:spa-bundle';

// The admin console SPA shell. The IIFE (built by @frontbase/admin-console, CSS
// runtime-inlined) mounts React into #root. HashRouter is used, so the worker
// only ever serves /console — client routes live in the #hash.
const SPA_HTML = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frontbase Console</title></head><body><div id="root"></div><script>${SPA_BUNDLE}</script></body></html>`;

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
    /** F3b: background dispatcher — on CF, wire to ctx.waitUntil so async workflow
     *  execution doesn't block the request. */
    dispatcher?: (work: () => Promise<void>) => void;
}

/**
 * Assemble the full CMS engine over a given runner. Exported so the pre-deploy
 * smoke can boot the EXACT same stack over an in-memory SQLite runner — the
 * console, auth, migrations and seeding are all real, only the D1 binding is
 * swapped for `:memory:`.
 */
export async function createCmsEngine(opts: CmsEngineOptions): Promise<Hono> {
    const now = opts.now ?? (() => new Date().toISOString());
    // First boot: idempotent schema migration, then optional first-admin seed.
    await migrateUp(opts.runner, now);
    if (opts.admin?.email && opts.admin?.password) {
        await seedOwner(new UserStore(opts.runner, '_default'), {
            email: opts.admin.email,
            password: opts.admin.password,
            now: now(),
            role: opts.admin.role ?? 'owner',
        });
    }
    const consoleApp = await createConsole({
        makeRunner: () => opts.runner,
        sessionSecret: opts.sessionSecret,
        setupToken: opts.setupToken,
        seedRole: opts.admin?.role ?? 'owner',
        now,
        dispatcher: opts.dispatcher,
    });
    const engine = createEngine({
        manifest,
        data: directProvider(manifest),
        environment: 'edge',
        swBundle: SW_BUNDLE,
        console: consoleApp,
    });
    // Serve the admin console SPA at /console AHEAD of the engine, so the eSSR
    // catch-all doesn't swallow it. Everything else (public pages, /sw.js,
    // /api/console/*) falls through to the engine.
    const app = new Hono();
    app.get('/console', (c) => c.html(SPA_HTML));
    app.route('/', engine);
    return app;
}

let enginePromise: Promise<Hono> | null = null;

// F3b: the per-request ExecutionContext is captured here so the console's async
// dispatcher can call ctx.waitUntil (workflow execution runs after the response
// is sent). Updated on every fetch; the engine is built once per isolate.
let currentCtx: ExecutionContext | null = null;

export default {
    async fetch(req: Request, env: CmsEnv, ctx: ExecutionContext): Promise<Response> {
        try {
            if (!env.SESSION_SECRET) {
                // Fail loud, not silently insecure: the JWT seam has no key.
                return new Response('SESSION_SECRET is not configured — run: wrangler secret put SESSION_SECRET', { status: 500 });
            }
            if (!env.DB) {
                // The commonest cause of a CF 1101 here: the D1 binding never attached
                // (placeholder database_id, or the [[d1_databases]] block is missing).
                // Surface it plainly instead of throwing an opaque exception.
                return new Response('D1 binding "DB" is not configured — check wrangler.toml [[d1_databases]] binding="DB" and a REAL database_id (not the placeholder)', { status: 500 });
            }
            currentCtx = ctx;
            if (!enginePromise) {
                enginePromise = createCmsEngine({
                    runner: d1RunnerFromBinding(env.DB),
                    sessionSecret: env.SESSION_SECRET,
                    setupToken: env.SETUP_TOKEN,
                    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, role: env.ADMIN_ROLE },
                    // F3b: dispatch background workflow execution onto the request's
                    // ctx.waitUntil so it survives after the response is returned.
                    dispatcher: (work) => { if (currentCtx) currentCtx.waitUntil(work()); else void work(); },
                }).catch((e) => { enginePromise = null; throw e; }); // don't cache a failed boot
            }
            const engine = await enginePromise;
            return engine.fetch(req, env, ctx);
        } catch (e) {
            // Turn a CF 1101 (unhandled throw — e.g. a D1 migration/DDL failure on
            // first boot) into a LOGGED, opaque 500 (RULE 4). The detail goes to
            // `wrangler tail` / observability; the client only sees 'internal_error'.
            console.error('[cf-full] worker fetch failed:', (e as Error)?.stack ?? e);
            return new Response('internal_error', { status: 500 });
        }
    },
};
