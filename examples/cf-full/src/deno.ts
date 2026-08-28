/**
 * Deno Deploy entry (A-24) — the FULL CMS on Deno Deploy.
 *
 * Same engine as the Cloudflare Worker (src/worker.ts createCmsEngine); the
 * three host bindings swap like the Node entry (A-21):
 *   storage  : ./state-db resolver — Deno Deploy has NO writable persistent
 *              disk, so APP_DB_URL=file: is refused; the operator picks Turso
 *              (libsql:// or https:// — HRANA over fetch) or the D1-over-REST
 *              trio.
 *   console  : the SHARED disk ASSETS shim (src/assets-disk.ts) over the
 *              deployed console-dist/ — Deno Deploy's uploaded files are
 *              readable through node:fs (node compat), so the shim works
 *              unmodified. The root is resolved from CONSOLE_DIST_DIR, then
 *              probed next to this file (the staged deno-dist/ layout), then
 *              ../console-dist (a source checkout), then cwd.
 *   dispatch : fire-and-forget with a .catch (the node.ts rule).
 *
 * Deliberately ABSENT here: the BullMQ consumer (src/node.ts) — it is a
 * long-running TCP process; Deno Deploy is request-scoped, so a BullMQ env
 * warns and stays direct-execution (QStash delivers over HTTP by itself).
 *
 * Serving is gated on import.meta.main: `deployctl deploy --entrypoint
 * deno.mjs` (or `deno run`) serves; IMPORTING this module (the per-host
 * smoke) gets createRequestHandler() without binding a port.
 *
 * Secrets are RUNTIME env only (Deno Deploy project env) — never baked into
 * the bundle (repo rule).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { s3StorageProvider } from '@frontbase/edge-infra';
import { parseEnvServices, envServiceDescriptor, ENV_CARD_LABELS } from '@frontbase/backend';
import { createDiskAssets, isStagedConsole } from './assets-disk.js';
import { resolveStateDb, StateDbConfigError } from './state-db.js';
import { createCmsEngine } from './worker.js';
import type { Hono } from 'hono';

/** CONSOLE_DIST_DIR → next to this file (staged layout) → ../ (source) → cwd. */
export function resolveConsoleRoot(): string {
    if (process.env.CONSOLE_DIST_DIR) return process.env.CONSOLE_DIST_DIR;
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [
        join(here, 'console-dist'),
        join(here, '..', 'console-dist'),
        join(process.cwd(), 'console-dist'),
    ]) {
        if (isStagedConsole(candidate)) return candidate;
    }
    return join(here, 'console-dist');
}

let enginePromise: Promise<Hono> | null = null;
let initError: string | null = null;

function engine(): Promise<Hono> {
    if (!enginePromise) {
        enginePromise = (async () => {
            const env = process.env as unknown as Record<string, string | undefined>;
            if (!env.SESSION_SECRET) {
                throw new StateDbConfigError('SESSION_SECRET is not configured — set it in the Deno Deploy project environment variables and redeploy.');
            }
            const stateDb = resolveStateDb({ env, host: 'deno' });
            console.log(`[frontbase] state db: ${stateDb.kind} (${stateDb.displayUrl})`);
            const envServices = parseEnvServices(env);
            if (envServices.queue?.provider === 'bullmq') {
                console.warn('[frontbase] FRONTBASE_QUEUE=BullMQ is not available on Deno Deploy (request-scoped host, no long-running TCP consumer) — staying direct-execution');
            }
            return createCmsEngine({
                runner: stateDb.runner,
                sessionSecret: env.SESSION_SECRET!,
                setupToken: env.SETUP_TOKEN || undefined,
                setupExpiresAt: env.SETUP_EXPIRES_AT || undefined,
                admin: { email: env.ADMIN_EMAIL || undefined, password: env.ADMIN_PASSWORD || undefined, role: env.ADMIN_ROLE || undefined },
                assets: createDiskAssets(resolveConsoleRoot()),
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
                systemEdge: { provider: 'deno', name: 'Deno Deploy Edge', db: stateDb.label },
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

/** The request handler, importable without binding a port (per-host smoke). */
export function createRequestHandler(): (req: Request) => Promise<Response> {
    return async (req: Request): Promise<Response> => {
        if (initError) return new Response(initError, { status: 500 });
        try {
            const e = await engine();
            return await e.fetch(req);
        } catch (err) {
            if (err instanceof StateDbConfigError) return new Response(err.message, { status: 500 });
            console.error('[frontbase] request failed:', (err as Error)?.stack ?? err);
            return new Response('internal_error', { status: 500 });
        }
    };
}

const handler = createRequestHandler();
if (import.meta.main) {
    const port = Number(process.env.PORT ?? '');
    if (Number.isInteger(port) && port > 0) Deno.serve({ port, hostname: '0.0.0.0' }, (req) => handler(req));
    else Deno.serve((req) => handler(req));
}
