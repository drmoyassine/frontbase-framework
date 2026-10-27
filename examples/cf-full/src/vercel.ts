let bootstrapCompletion:Promise<void>|undefined;
import {createCloudBootstrap,bootstrapRuntimeProof,completeCloudBootstrap} from './hosted-cloud.js';
import {createNativeCloudBootstrap} from './native-cloud.js';
/**
 * Vercel entry (A-24) — the FULL CMS as one serverless function.
 *
 * Same engine as the Cloudflare Worker (src/worker.ts createCmsEngine); the
 * three host bindings swap like the Node entry (A-21), with Vercel's twist:
 *   storage  : ./state-db resolver — no D1 binding exists here, so the
 *              operator picks Turso (libsql:// + APP_DB_AUTH_TOKEN) or the
 *              D1-over-REST trio. APP_DB_URL=file: is refused (no persistent
 *              filesystem on the platform).
 *   console  : NO assets binding — vercel.json serves the static matrix
 *              (hashed bundles, hydration bundle, icon) from the CDN; THIS
 *              function owns every route that needs state or a redirect:
 *              /api/*, the /frontbase-admin shell (incl. the needsSetup 302
 *              to /setup), /static/assets/:filename (KV branding), SPA
 *              fallbacks, /setup, /frontbase-setup/spa.js, /sw.js,
 *              /builder/client.js, /console 301. The engine's shell fallback
 *              (inlined CONSOLE_INDEX) covers the shell route.
 *   dispatch : waitUntil owns asynchronous work for the request lifetime;
 *              durable retries remain the existing engine/queue responsibility.
 *
 * RUNTIME — Node, not Edge, deliberately. Node-only DNS-pinned HTTP egress
 * rejects private resolved destinations. The web libsql client remains HTTP-based.
 * On Vercel's Edge isolate the previous ~2 MB bundle silently
 * held every request until the platform's 300s kill, while the identical
 * bundle answers in milliseconds under plain Node — proven by the api/health
 * bisect (tiny edge function 200, cms edge function hung). No default config
 * export ⇒ @vercel/node provisions the Node runtime for api/cms.mjs.
 *
 * The default export is a plain Web-standard fetch handler: init is LAZY (per
 * cold start), and a misconfigured boot surfaces as a LEGIBLE 500 (the config
 * error's message — state-db errors name the missing var and never contain a
 * credential), not an opaque module-init crash. Boot and request-path engine
 * work are bounded by the boot guard (boot-guard.ts) — a state DB that never
 * answers yields a legible 503, never a hang.
 *
 * Secrets are RUNTIME env only (Vercel project Environment Variables) — never
 * baked into the bundle (repo rule).
 */
import type { Hono } from 'hono';
import { waitUntil } from '@vercel/functions';
import { createNodeHttpTransport } from '@frontbase/edge-infra/node-http';
import { vercelDispatcher } from './vercel-lifecycle.js';

import { deploymentStorageOptions, parseEnvServices, envServiceDescriptor, ENV_CARD_LABELS } from '@frontbase/backend';
import { resolveStateDb, StateDbConfigError } from './state-db.js';
import { createCmsEngine, readTranslationExecutionEnabled } from './worker.js';
import { bootTimeoutMs, raceBootTimeout, BootTimeoutError } from './boot-guard.js';

let enginePromise: Promise<Hono> | null = null;
let bootstrapHost:any;
declare const __FRONTBASE_NATIVE_VERCEL__: Record<string,string>;
const externalFetch = createNodeHttpTransport();

function engine(): Promise<Hono> {
    if (!enginePromise) {
        enginePromise = (async () => {
            const env = process.env as unknown as Record<string, string | undefined>;
            // SESSION_SECRET is NOT required: when unset the engine generates +
            // persists one in the state DB on first boot (resolveSessionSecret) —
            // one-click deploys boot without it. Setting it explicitly overrides.
            const stateDb = resolveStateDb({ env, host: 'vercel' });
            console.log(`[frontbase] state db: ${stateDb.kind} (${stateDb.displayUrl})`);
            const envServices = parseEnvServices(env);
            return createCmsEngine({
                externalFetch,
                resend:env.RESEND_API_KEY?{apiKey:env.RESEND_API_KEY,from:env.RESEND_FROM}:undefined,
                publicOrigin:env.FRONTBASE_PUBLIC_ORIGIN,
                providerOAuthEnv:env,
                runner: stateDb.runner,
                translationExecutionEnabled: readTranslationExecutionEnabled(env.FRONTBASE_TRANSLATION_EXECUTION_ENABLED),
                deploymentManifest: env.FRONTBASE_DEPLOYMENT_MANIFEST,
                sessionSecret: env.SESSION_SECRET,
                setupToken: env.SETUP_TOKEN || undefined,
                setupExpiresAt: env.SETUP_EXPIRES_AT || undefined,
                admin: { email: env.ADMIN_EMAIL || undefined, password: env.ADMIN_PASSWORD || undefined, role: env.ADMIN_ROLE || undefined },
                dispatcher: vercelDispatcher(waitUntil),
                ...deploymentStorageOptions(env),
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
            throw e;
        });
    }
    return enginePromise;
}

export async function handler(req: Request): Promise<Response> {
    const nativeEnv = {...(typeof __FRONTBASE_NATIVE_VERCEL__ === 'undefined' ? {} : __FRONTBASE_NATIVE_VERCEL__),...process.env};
    if(nativeEnv.FRONTBASE_BOOTSTRAP==='native'){try{bootstrapHost??=createNativeCloudBootstrap(nativeEnv,'vercel',externalFetch);return await bootstrapHost.fetch(req);}catch{return new Response('Setup unavailable',{status:503});}}
    if(process.env.FRONTBASE_BOOTSTRAP==='1'){try{bootstrapHost??=createCloudBootstrap(process.env,'vercel',externalFetch);return await bootstrapHost.fetch(req);}catch{return new Response('Setup unavailable',{status:503});}}
    // Boot AND request-path engine work are bounded: an unreachable state DB
    // must answer as a legible 503, not hold the request until the platform's
    // own kill (every request awaits the same pending init — the hang would
    // otherwise cover the whole deployment). Resetting the memo lets a later
    // request retry after a transient fault.
    const budget = bootTimeoutMs(process.env as { FRONTBASE_BOOT_TIMEOUT_MS?: string });
    try {
        const e = await raceBootTimeout(engine(), budget, 'the full-CMS engine');
        await (bootstrapCompletion??=completeCloudBootstrap(process.env,'vercel',()=>e.fetch(new Request(new URL('/health',req.url))),externalFetch).catch(()=>{console.warn('bootstrap_receipt_completion_pending')}));
            const proof=await bootstrapRuntimeProof(req,process.env,()=>e.fetch(new Request(new URL('/health',req.url))));if(proof)return proof;
        if(new URL(req.url).pathname.startsWith('/frontbase-bootstrap/'))return new Response('Setup closed',{status:410});
        return await raceBootTimeout(e.fetch(req), budget, 'the state database-backed engine');
    } catch (err) {
        if (err instanceof StateDbConfigError) return new Response(err.message, { status: 500 });
        if (err instanceof BootTimeoutError) {
            enginePromise = null;
            console.error('[frontbase] boot/request exceeded budget:', (err as Error).message);
            return new Response(err.message, { status: 503, headers: { 'cache-control': 'no-store' } });
        }
        console.error('[frontbase] request failed:', (err as Error)?.stack ?? err);
        return new Response('internal_error', { status: 500 });
    }
}

// Vercel Node distinguishes Web handlers from legacy IncomingMessage handlers.
export default { fetch: handler };
