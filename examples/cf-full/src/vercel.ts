/**
 * Vercel Edge entry (A-24) — the FULL CMS as one Edge function.
 *
 * Same engine as the Cloudflare Worker (src/worker.ts createCmsEngine); the
 * three host bindings swap like the Node entry (A-21), with Vercel's twist:
 *   storage  : ./state-db resolver — no D1 binding exists here, so the
 *              operator picks Turso (libsql:// + APP_DB_AUTH_TOKEN) or the
 *              D1-over-REST trio. APP_DB_URL=file: is refused (no filesystem).
 *   console  : NO assets binding and NO fs on the Edge runtime — vercel.json
 *              serves the static matrix (hashed bundles, hydration bundle,
 *              icon) from the CDN; THIS function owns every route that needs
 *              state or a redirect: /api/*, the /frontbase-admin shell (incl.
 *              the needsSetup 302 to /setup), /static/assets/:filename (KV
 *              branding), SPA fallbacks, /setup, /frontbase-setup/spa.js,
 *              /sw.js, /builder/client.js, /console 301. The engine's shell
 *              fallback (inlined CONSOLE_INDEX) covers the shell route.
 *   dispatch : fire-and-forget with a .catch (the node.ts rule — an unhandled
 *              rejection must not take the isolate down).
 *
 * The default export is a plain Web-standard fetch handler: hono/vercel's
 * handle() is a verified pure pass-through ((app) => (req) => app.fetch(req)),
 * so the adapter adds nothing here. Init is LAZY (per cold start), and a
 * misconfigured boot surfaces as a LEGIBLE 500 (the config error's message —
 * state-db errors name the missing var and never contain a credential),
 * not an opaque module-init crash.
 *
 * Secrets are RUNTIME env only (Vercel project Environment Variables) — never
 * baked into the bundle (repo rule).
 */
import type { Hono } from 'hono';
import { s3StorageProvider } from '@frontbase/edge-infra';
import { parseEnvServices, envServiceDescriptor, ENV_CARD_LABELS } from '@frontbase/backend';
import { resolveStateDb, StateDbConfigError } from './state-db.js';
import { createCmsEngine } from './worker.js';

// Vercel Edge runtime directive (execution-time verify point E3); inert on
// every other host. esbuild preserves exported consts in the ESM bundle.
export const config = { runtime: 'edge' } as const;

let enginePromise: Promise<Hono> | null = null;
let initError: string | null = null;

function engine(): Promise<Hono> {
    if (!enginePromise) {
        enginePromise = (async () => {
            const env = process.env as unknown as Record<string, string | undefined>;
            if (!env.SESSION_SECRET) {
                throw new StateDbConfigError('SESSION_SECRET is not configured — add it in the Vercel project settings (Environment Variables) and redeploy.');
            }
            const stateDb = resolveStateDb({ env, host: 'vercel' });
            console.log(`[frontbase] state db: ${stateDb.kind} (${stateDb.displayUrl})`);
            const envServices = parseEnvServices(env);
            return createCmsEngine({
                runner: stateDb.runner,
                sessionSecret: env.SESSION_SECRET!,
                setupToken: env.SETUP_TOKEN || undefined,
                setupExpiresAt: env.SETUP_EXPIRES_AT || undefined,
                admin: { email: env.ADMIN_EMAIL || undefined, password: env.ADMIN_PASSWORD || undefined, role: env.ADMIN_ROLE || undefined },
                dispatcher: (work) => void work().catch((e) => console.error('[frontbase] background task failed:', (e as Error)?.stack ?? e)),
                storageProvider: env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
                    ? s3StorageProvider({
                        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
                        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
                        endpoint: env.STORAGE_ENDPOINT,
                        region: env.STORAGE_REGION,
                    })
                    : undefined,
                // The edge-engines system card must describe THIS host (the
                // engine default describes the Cloudflare worker).
                systemEdge: { provider: 'vercel', name: 'Vercel Edge', db: stateDb.label },
                // Resource-tab truth: database = the resolved state DB; the
                // others render env-derived cards when FRONTBASE_* wiring
                // declares them (absent → null → honest empty state).
                systemResources: {
                    database: stateDb.card,
                    cache: envServiceDescriptor(envServices.cache, ENV_CARD_LABELS.cache),
                    queue: envServiceDescriptor(envServices.queue, ENV_CARD_LABELS.queue),
                    vector: envServiceDescriptor(envServices.vector, ENV_CARD_LABELS.vector),
                },
                envServices,
            });
        })().catch((e) => {
            enginePromise = null;
            initError = e instanceof Error ? e.message : String(e);
            throw e;
        });
    }
    return enginePromise;
}

export default async function handler(req: Request): Promise<Response> {
    if (initError) return new Response(initError, { status: 500 });
    try {
        const e = await engine();
        return await e.fetch(req);
    } catch (err) {
        if (err instanceof StateDbConfigError) return new Response(err.message, { status: 500 });
        console.error('[frontbase] request failed:', (err as Error)?.stack ?? err);
        return new Response('internal_error', { status: 500 });
    }
}
