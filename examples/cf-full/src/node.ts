/**
 * Node entry — the FULL CMS as one self-hosted process (Docker / bare metal).
 *
 * Same engine as the Cloudflare Worker (src/worker.ts createCmsEngine); only the
 * three host bindings swap:
 *   storage  : sqliteRunner over a file: URL on a volume (default /data/app.db)
 *              — full D1 sqlite-dialect parity; generic PG/MySQL as the APP db is
 *              a documented unclosable gap (docs/unclosable-postgres-mysql-parity.md).
 *   console  : a disk-backed ASSETS shim over ./console-dist — the same layout
 *              wrangler's [assets] directory serves, satisfying the identical
 *              { fetch(Request) → Promise<Response> } binding contract.
 *   dispatch : fire-and-forget (workerd's ctx.waitUntil equivalent) — with a
 *              .catch, because an unhandled rejection terminates Node.
 *
 * Secrets are RUNTIME env only — never baked into an image (repo rule).
 */
import { serve } from '@hono/node-server';
import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteRunner, s3StorageProvider } from '@frontbase/edge-infra';
import { createCmsEngine } from './worker.js';

const here = dirname(fileURLToPath(import.meta.url));
const CONSOLE_ROOT = join(here, '..', 'console-dist');

// ── ASSETS shim — Static Assets binding over a directory ────────────────────
// Every engine call site rewrites the URL path BEFORE fetch (worker.ts: /static/
// react/* → /react/*, /static/icon.png → /icon.png, shell → /frontbase-admin/
// index.html, hashed bundles raw), so the shim maps the pathname 1:1 under
// console-dist/. assetResponse() treats 200/304 as a hit and rebuilds from
// response.body + headers, so the ETag below is what makes the hydrate.js
// `no-cache, must-revalidate` policy cheap (a conditional GET 304s instead of
// re-downloading the ~1 MB bundle every canvas load).
const MIME: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};
const assets = {
    async fetch(request: Request): Promise<Response> {
        let pathname: string;
        try { pathname = decodeURIComponent(new URL(request.url).pathname); }
        catch { return new Response('bad_path', { status: 400 }); }
        const rel = pathname.replace(/^\/+/, '');
        // Dotfile deny (console-dist/.assetsignore is wrangler-only config, not
        // an asset) + empty path reject.
        if (!rel || rel.split('/').some((seg) => seg.startsWith('.'))) {
            return new Response('not_found', { status: 404 });
        }
        const file = normalize(join(CONSOLE_ROOT, rel));
        if (!file.startsWith(CONSOLE_ROOT + sep)) return new Response('not_found', { status: 404 });
        let st: ReturnType<typeof statSync>;
        try { st = statSync(file); } catch { return new Response('not_found', { status: 404 }); }
        if (!st.isFile()) return new Response('not_found', { status: 404 });
        const bytes = readFileSync(file);
        const etag = '"' + createHash('sha1').update(bytes).digest('hex').slice(0, 24) + '"';
        if (request.headers.get('if-none-match') === etag) {
            return new Response(null, { status: 304, headers: { etag } });
        }
        return new Response(bytes, {
            status: 200,
            headers: {
                'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
                etag,
            },
        });
    },
};

// ── runtime env ─────────────────────────────────────────────────────────────
const die = (msg: string): never => {
    console.error(`[frontbase] ${msg}`);
    process.exit(1);
};
const env = process.env;
const SESSION_SECRET = env.SESSION_SECRET
    ?? die('SESSION_SECRET is not configured — pass it as a runtime env var (docker compose / shell). Never bake it into the image.');
const APP_DB_URL = env.APP_DB_URL ?? 'file:/data/app.db';

// libsql does not create parent directories — make sure the volume path exists
// before the runner opens the database file.
if (APP_DB_URL.startsWith('file:')) {
    const spec = APP_DB_URL.slice('file:'.length);
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

// migrateUp self-applies the schema at boot (worker.ts createCmsEngine); first
// boot on a cold volume also seeds the homepage and, when ADMIN_* are set, the
// first administrator (idempotent — a re-run with existing users never reseeds).
const engine = await createCmsEngine({
    runner: sqliteRunner(APP_DB_URL),
    sessionSecret: SESSION_SECRET,
    setupToken: env.SETUP_TOKEN || undefined,
    setupExpiresAt: env.SETUP_EXPIRES_AT || undefined,
    admin: { email: env.ADMIN_EMAIL || undefined, password: env.ADMIN_PASSWORD || undefined, role: env.ADMIN_ROLE || undefined },
    assets,
    dispatcher,
    storageProvider,
    // The edge-engines system card must describe THIS host, not Cloudflare.
    systemEdge: { provider: 'node', name: 'Self-host Edge', db: 'SQLite (libsql)' },
    // Resource-tab truth for the same reason: the self-host runs a single
    // service with a local SQLite file — no Redis/BullMQ/vector backend (the
    // product's self-host does run Redis; this is not it). A local file path,
    // not a credential, so showing it on the system card is safe.
    systemResources: {
        database: { provider: 'sqlite', name: 'SQLite (libsql)', url: APP_DB_URL },
        cache: null,
        queue: null,
        vector: null,
    },
});

const port = Number(env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) die(`PORT is not a valid port number: ${env.PORT}`);
const server = serve(
    { fetch: (req) => engine.fetch(req), port, hostname: env.HOST ?? '0.0.0.0' },
    (info) => console.log(`[frontbase] CMS listening on http://${info.address}:${info.port} (db: ${APP_DB_URL})`),
);

// Graceful shutdown: stop accepting, let in-flight requests drain, then exit.
// The bounded fallback exit covers a hung keep-alive connection.
const shutdown = (sig: string) => {
    console.log(`[frontbase] ${sig} — shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
