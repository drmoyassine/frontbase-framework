/**
 * Node entry — the FULL CMS as one self-hosted process (Docker / bare metal).
 *
 * Same engine as the Cloudflare Worker (src/worker.ts createCmsEngine); only the
 * three host bindings swap:
 *   storage  : ./state-db resolver over @frontbase/edge-infra runners — file:
 *              URL on a volume by default (/data/app.db), with APP_DB_AUTH_TOKEN
 *              (Turso libsql://), :memory:, or the D1-over-REST trio as choices
 *              (A-24). Generic PG/MySQL as the APP db is a documented unclosable
 *              gap (docs/known-limitation-postgres-mysql.md).
 *   console  : a disk-backed ASSETS shim over ./console-dist — the same layout
 *              wrangler's [assets] directory serves, satisfying the identical
 *              { fetch(Request) → Promise<Response> } binding contract.
 *   dispatch : fire-and-forget (workerd's ctx.waitUntil equivalent) — with a
 *              .catch, because an unhandled rejection terminates Node.
 *
 * Secrets are RUNTIME env only — never baked into an image (repo rule).
 */
import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { s3StorageProvider, bullmqDriver } from '@frontbase/edge-infra';
import { parseEnvServices, envServiceDescriptor, ENV_CARD_LABELS } from '@frontbase/backend';
import { createDiskAssets } from './assets-disk.js';
import { resolveStateDb } from './state-db.js';
import { createCmsEngine } from './worker.js';

const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE_ROOT = join(here, '..', 'console-dist');

// ── ASSETS shim — Static Assets binding over a directory (src/assets-disk.ts,
// shared with the Deno Deploy entry). Every engine call site rewrites the URL
// path BEFORE fetch, so the shim maps the pathname 1:1 under console-dist/ —
// the same layout wrangler's [assets] directory serves. The shim's ETag is
// what makes the hydrate.js `no-cache, must-revalidate` policy cheap on the
// disk hosts (a conditional GET 304s instead of re-downloading the bundle).
const assets = createDiskAssets(CONSOLE_ROOT);

// ── runtime env ─────────────────────────────────────────────────────────────
const die = (msg: string): never => {
    console.error(`[frontbase] ${msg}`);
    process.exit(1);
};
const env = process.env;
const SESSION_SECRET = env.SESSION_SECRET
    ?? die('SESSION_SECRET is not configured — pass it as a runtime env var (docker compose / shell). Never bake it into the image.');

// A-24: the state DB is the operator's choice (./state-db) — file:/data/app.db
// by default; APP_DB_AUTH_TOKEN unlocks Turso (libsql://), :memory: and the
// D1-over-REST trio are env-selectable. A HALF-configured choice dies here, at
// boot, naming the missing var — never at first write.
const stateDb = resolveStateDb({ env, host: 'node' });

// libsql does not create parent directories — make sure the volume path exists
// before the runner opens the database file.
if (stateDb.kind === 'sqlite-file') {
    const spec = stateDb.url.slice('file:'.length);
    const dir = dirname(spec.replace(/^\.\//, ''));
    try { mkdirSync(dir || '.', { recursive: true }); } catch { /* relative path on a read-only cwd — the runner's open will surface the real error */ }
}

// Fire-and-forget waitUntil equivalent. The .catch is NOT optional: an unhandled
// rejection terminates Node by default, where workerd's ctx.waitUntil isolated
// background failures.
const dispatcher = (work: () => Promise<void>) =>
    void work().catch((e) => console.error('[frontbase] background task failed:', (e as Error)?.stack ?? e));

const storageProvider = env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
    ? s3StorageProvider({
        accessKeyId: env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
        endpoint: env.STORAGE_ENDPOINT,
        region: env.STORAGE_REGION,
    })
    : undefined;

// System-service env (dual wiring): FRONTBASE_* JSON + legacy single vars,
// parsed here (the host is where process.env exists) and injected as data.
// Adopted is_default registry rows still take precedence at resolve time.
const envServices = parseEnvServices(env);

// migrateUp self-applies the schema at boot (worker.ts createCmsEngine); first
// boot on a cold volume also seeds the homepage and, when ADMIN_* are set, the
// first administrator (idempotent — a re-run with existing users never reseeds).
const engine = await createCmsEngine({
    runner: stateDb.runner,
    sessionSecret: SESSION_SECRET,
    setupToken: env.SETUP_TOKEN || undefined,
    setupExpiresAt: env.SETUP_EXPIRES_AT || undefined,
    admin: { email: env.ADMIN_EMAIL || undefined, password: env.ADMIN_PASSWORD || undefined, role: env.ADMIN_ROLE || undefined },
    assets,
    dispatcher,
    storageProvider,
    // The edge-engines system card must describe THIS host, not Cloudflare —
    // and the resolved state DB, not a hardcoded local SQLite file (A-24).
    systemEdge: { provider: 'node', name: 'Self-host Edge', db: stateDb.label },
    // Resource-tab truth for the same reason: the self-host runs a single
    // service with its chosen state DB — no platform Redis/BullMQ/vector
    // backend. Env-declared services (e.g. FRONTBASE_CACHE pointing at Upstash)
    // surface their cards; a local file path / remote URL is not a credential,
    // so showing the database URL on the system card is safe (the auth token
    // never is — state-db keeps it out of displayUrl).
    systemResources: {
        database: stateDb.card,
        cache: envServiceDescriptor(envServices.cache, ENV_CARD_LABELS.cache),
        queue: envServiceDescriptor(envServices.queue, ENV_CARD_LABELS.queue),
        vector: envServiceDescriptor(envServices.vector, ENV_CARD_LABELS.vector),
    },
    envServices,
});

const port = Number(env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) die(`PORT is not a valid port number: ${env.PORT}`);
const server = serve(
    { fetch: (req) => engine.fetch(req), port, hostname: env.HOST ?? '0.0.0.0' },
    (info) => console.log(`[frontbase] CMS listening on http://${info.address}:${info.port} (db: ${stateDb.displayUrl})`),
);

// BullMQ consumer (node-only; env wiring decides). QStash delivers over HTTP by
// itself, but a BullMQ queue needs a long-running Worker — and its jobs ride
// the SAME receive endpoint, looped back over HTTP, so verification and
// idempotency live in one place. Authentication is the shared callback secret
// (in-process delivery carries no QStash signature). Without the secret the
// receive route would 401 its own jobs, so a BullMQ env without it is a
// misconfiguration — warn and stay direct-execution rather than fail the boot.
let queueWorker: Awaited<ReturnType<typeof bullmqDriver>> | null = null;
if (envServices.queue?.provider === 'bullmq' && envServices.queue.url) {
    if (!envServices.queueCallbackSecret) {
        console.warn('[frontbase] FRONTBASE_QUEUE=BullMQ without FRONTBASE_QUEUE_CALLBACK_SECRET — queue receive would reject its own jobs; staying direct-execution');
    } else {
        try {
            const driver = await bullmqDriver({ redisUrl: envServices.queue.url });
            await driver.start(async (job) => {
                const res = await fetch(`http://127.0.0.1:${port}/api/system/queue/receive`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-frontbase-callback-secret': envServices.queueCallbackSecret!,
                    },
                    body: JSON.stringify(job),
                });
                if (!res.ok) console.error(`[frontbase] queue receive answered ${res.status} — BullMQ will retry per its attempts policy`);
            });
            queueWorker = driver;
            console.log('[frontbase] BullMQ consumer started (loop-back to /api/system/queue/receive)');
        } catch (error) {
            console.warn(`[frontbase] BullMQ consumer unavailable (${(error as Error)?.message ?? error}) — direct execution`);
        }
    }
}

// Graceful shutdown: stop accepting, let in-flight requests drain, then exit.
// The bounded fallback exit covers a hung keep-alive connection.
const shutdown = (sig: string) => {
    console.log(`[frontbase] ${sig} — shutting down`);
    if (queueWorker) void queueWorker.close().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
