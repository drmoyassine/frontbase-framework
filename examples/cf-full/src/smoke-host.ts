/**
 * Per-host smoke (A-24) — proves the deploy-matrix artifacts and the NEW edge
 * entries (Vercel, Deno) behave before any deploy, credential-free:
 *
 *   A. Artifact gates    — file-level checks on the built bundles (the edge
 *                          alias took, no node: imports where forbidden, the
 *                          staged copies are byte-identical).
 *   B. Disk-shim contract — createDiskAssets over the real staged console-dist
 *                          (200/304/404, dotfile + traversal denial, MIME).
 *   C. Route matrix      — drives each NEW entry's handler over the same
 *                          fresh-instance route classes the CF smoke asserts,
 *                          over a D1-over-REST runner whose fetch is stubbed to
 *                          a REAL in-memory SQLite (see below).
 *   D. Misconfigured boot — a child process boots each entry with a stripped
 *                          env and asserts the LEGIBLE 500 (naming the missing
 *                          var, never leaking a credential).
 *
 * WHY D1-REST FOR THE MATRIX: the edge bundles pin @libsql/client to the WEB
 * build (lib-esm/web.js), which rejects file:/:memory: with
 * URL_SCHEME_NOT_SUPPORTED — exactly what happens on a real Vercel/Deno edge
 * runtime. The resolver's edge-compatible paths are libsql-remote (needs a live
 * server — exercised by the fresh-deploy workflows with real Turso creds) and
 * d1-rest (plain HTTPS POST). Stubbing global fetch for api.cloudflare.com and
 * answering from a native in-process SQLite exercises the full engine —
 * migrations, eSSR, auth, console — through the SAME d1RunnerFromRest code a
 * real D1-over-REST deployment uses. Everything else (other hosts, other URLs)
 * passes through to the real fetch.
 *
 * The node/Docker entry is intentionally NOT matrix-driven here: it binds a
 * port at import and its engine routes are already covered by `pnpm smoke` +
 * the Docker gate. `--host node` therefore runs sections A/B/D only; default
 * is all hosts.
 *
 * CLI: node dist/smoke-host.mjs [--host vercel|deno|node]
 */
import { createClient } from '@libsql/client';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDiskAssets } from './assets-disk.js';

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = join(here, '..');
const CONSOLE_DIST = join(exampleRoot, 'console-dist');

let failures = 0;
const check = async (label: string, fn: () => Promise<boolean>) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${(e as Error).message}`); }
};
const textOf = (r: Response) => r.text();

// ========================================================================
// A. Artifact gates — the bundle-level invariants the deploy depends on.
// ========================================================================
const NODE_SPEC = /['"]node:[A-Za-z]/;          // any quoted node: import form
// A bundled NATIVE libsql path would carry the platform-binary loader (the
// `libsql` package's require of @libsql/<platform>-<arch>). The plain word
// "libsql" is NOT a usable marker — edge-infra's own provider config compares
// scheme names like p==="libsql" in ordinary string literals.
const NATIVE_LIBSQL = /@libsql\/(linux|darwin|win32|android|freebsd)-[a-z0-9-]+/;
const WEB_LIBSQL_MARKER = 'URL_SCHEME_NOT_SUPPORTED'; // web.js-only literal
const QSTASH_MARKER = 'qstash.upstash.io';       // qstash client stable literal

const readDist = (name: string): string => readFileSync(join(here, name), 'utf8');

console.log('\n=== A. Artifact gates ===');
const DIST_FILES = ['worker.mjs', 'vercel.mjs', 'deno.mjs'] as const;
for (const f of DIST_FILES) {
    await check(`dist/${f} exists and is non-trivial`, async () => {
        const src = readDist(f);
        return src.length > 100_000;
    });
}
await check('worker.mjs: zero quoted node: specifiers (CF isolate)', async () =>
    !NODE_SPEC.test(readDist('worker.mjs')));
await check('vercel.mjs: zero quoted node: specifiers (Edge runtime)', async () =>
    !NODE_SPEC.test(readDist('vercel.mjs')));
await check('deno.mjs: node:fs import preserved EXTERNAL (deno node-compat)', async () =>
    /['"]node:fs['"]/.test(readDist('deno.mjs')));
await check('deno.mjs: Deno.serve present (import.meta.main gated)', async () =>
    readDist('deno.mjs').includes('Deno.serve'));
for (const f of ['vercel.mjs', 'deno.mjs'] as const) {
    const src = readDist(f);
    await check(`${f}: WEB libsql client pinned (URL_SCHEME_NOT_SUPPORTED marker present)`, async () =>
        src.includes(WEB_LIBSQL_MARKER));
    await check(`${f}: native libsql client absent (no "libsql" specifier)`, async () =>
        !NATIVE_LIBSQL.test(src));
    await check(`${f}: qstash client bundled (upstash endpoint literal present)`, async () =>
        src.includes(QSTASH_MARKER));
}
await check('vercel.mjs: edge runtime directive survived bundling', async () =>
    /runtime\s*:\s*['"]edge['"]/.test(readDist('vercel.mjs')));
await check('api/cms.mjs is byte-identical to dist/vercel.mjs', async () => {
    const api = join(exampleRoot, 'api', 'cms.mjs');
    return existsSync(api) && readFileSync(api).equals(readFileSync(join(here, 'vercel.mjs')));
});
await check('deno-dist layout: entry + config + fresh console copy', async () => {
    const root = join(exampleRoot, 'deno-dist');
    const entry = join(root, 'deno.mjs');
    if (!existsSync(entry) || !readFileSync(entry).equals(readFileSync(join(here, 'deno.mjs')))) return false;
    const cfg = JSON.parse(readFileSync(join(root, 'deno.json'), 'utf8')) as { compilerOptions?: { lib?: string[] } };
    if (!cfg.compilerOptions?.lib?.includes('deno.window')) return false;
    return existsSync(join(root, 'console-dist', 'frontbase-admin', 'index.html'))
        && existsSync(join(root, 'console-dist', 'icon.png'))
        && existsSync(join(root, 'console-dist', 'react', 'hydrate.js'));
});

// ========================================================================
// B. Disk-shim contract — the ASSETS binding for node/Deno, over the REAL
//    staged console-dist (the same directory the worker smoke reads).
// ========================================================================
console.log('\n=== B. Disk-shim contract (createDiskAssets over staged console-dist) ===');
const assets = createDiskAssets(CONSOLE_DIST);
const shim = (path: string, init?: RequestInit) =>
    assets.fetch(new Request('https://shim.local' + path, init));

await check('200 + text/html for the staged shell', async () => {
    const r = await shim('/frontbase-admin/index.html');
    return r.status === 200 && r.headers.get('content-type') === 'text/html; charset=utf-8'
        && (await textOf(r)).includes('id="root"');
});
await check('ETag → conditional GET replays 304', async () => {
    const first = await shim('/frontbase-admin/index.html');
    const etag = first.headers.get('etag');
    if (!etag) return false;
    const second = await shim('/frontbase-admin/index.html', { headers: { 'if-none-match': etag } });
    return second.status === 304 && second.headers.get('etag') === etag;
});
await check('404 for a missing file', async () =>
    (await shim('/frontbase-admin/no-such-bundle-xyz.js')).status === 404);
await check('404 for a directory path (isFile only)', async () =>
    (await shim('/frontbase-admin')).status === 404);
await check('404 for a dotfile (.assetsignore is wrangler config, not an asset)', async () =>
    (await shim('/.assetsignore')).status === 404);
await check('404 for encoded ../ traversal out of the root', async () =>
    (await shim('/frontbase-admin/%2e%2e/%2e%2e/package.json')).status === 404);
await check('404 for the backslash traversal variant', async () =>
    (await shim('/frontbase-admin/..%5c..%5cpackage.json')).status === 404);
await check('MIME map: js/css/png served with exact types', async () => {
    const js = await shim('/react/hydrate.js');
    const cssName = readdirSync(join(CONSOLE_DIST, 'react')).find((f) => /^entry-.+\.css$/.test(f));
    const css = cssName ? await shim(`/react/${cssName}`) : null;
    const png = await shim('/icon.png');
    return js.headers.get('content-type') === 'text/javascript; charset=utf-8'
        && css?.headers.get('content-type') === 'text/css; charset=utf-8'
        && png.headers.get('content-type') === 'image/png';
});

// ========================================================================
// C. Route matrix — each NEW entry's handler over fresh-instance routes.
// ========================================================================
console.log('\n=== C. Route matrix (D1-REST over stubbed fetch → in-memory SQLite) ===');

// Sanitize the env this process inherited, then pin the matrix configuration:
// SESSION_SECRET + the complete D1-REST trio → resolveStateDb picks d1-rest on
// both entries. APP_DB_URL is deliberately ABSENT (the web client would refuse
// :memory:/file: — see the module docblock).
delete process.env.APP_DB_URL;
delete process.env.APP_DB_AUTH_TOKEN;
const SECRET_TOKEN = 'smoke-host-cf-token-not-a-real-credential';
process.env.SESSION_SECRET = 'smoke-host-session-secret-not-for-prod';
process.env.APP_DB_D1_ACCOUNT_ID = 'smoke-host-account';
process.env.APP_DB_D1_DATABASE_ID = 'smoke-host-database';
process.env.CLOUDFLARE_API_TOKEN = SECRET_TOKEN;

// The stub: answer d1RunnerFromRest's POST with a REAL in-memory SQLite via
// the NATIVE client (node resolution — smoke-host.mjs keeps packages external).
// Response shape mirrors what d1RunnerFromRest reads back (runners.ts): result
// array → results rows for query / meta.changes.count for exec.
const sqlite = createClient({ url: ':memory:' });
const realFetch = globalThis.fetch;
const D1_PREFIX = 'https://api.cloudflare.com/client/v4/accounts/';
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(D1_PREFIX)) return realFetch(input, init);
    let body: { sql?: string; params?: unknown[] };
    try { body = JSON.parse(String(init?.body ?? '{}')) as { sql?: string; params?: unknown[] }; }
    catch { body = {}; }
    try {
        const res = await sqlite.execute({ sql: body.sql ?? '', args: (body.params ?? []) as never[] });
        return new Response(JSON.stringify({
            success: true,
            result: [{
                results: [...res.rows],
                meta: { changes: { count: res.rowsAffected ?? 0 } },
            }],
            errors: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, errors: [{ message: String((e as Error).message) }] }),
            { status: 200, headers: { 'content-type': 'application/json' } });
    }
}) as typeof fetch;

interface EntryModule {
    default: (req: Request) => Promise<Response>;
    createRequestHandler?: () => (req: Request) => Promise<Response>;
}

/** Dynamic import of the BUILT bundles as runtime artifacts: esbuild replaces
 *  an unanalyzable import() with a throwing stub, so route the load through
 *  new Function (invisible to the bundler). The specifier is an absolute
 *  file:// URL — import() inside new Function has no module base for
 *  relative specifiers. */
const bundleImport = (url: string): Promise<unknown> =>
    new Function('u', 'return import(u);')(url);

async function loadEntry(name: 'vercel' | 'deno'): Promise<EntryModule> {
    return await bundleImport(pathToFileURL(join(here, name + '.mjs')).href) as EntryModule;
}

const handlerOf = (mod: EntryModule): (req: Request) => Promise<Response> =>
    mod.createRequestHandler ? mod.createRequestHandler() : mod.default;

async function driveMatrix(label: string, handle: (req: Request) => Promise<Response>): Promise<void> {
    const req = (path: string, init?: RequestInit) => handle(new Request('https://smoke-host.local' + path, init));
    console.log(`\n--- route matrix: ${label} ---`);
    await check('GET /frontbase-admin → 302 /setup (fresh instance, needsSetup)', async () => {
        const r = await req('/frontbase-admin');
        return r.status === 302 && r.headers.get('location') === '/setup';
    });
    await check('GET /setup → 200 shell', async () => {
        const r = await req('/setup');
        return r.status === 200 && (await textOf(r)).includes('id="root"');
    });
    await check('GET /console → 301 /frontbase-admin', async () => {
        const r = await req('/console');
        return r.status === 301 && r.headers.get('location') === '/frontbase-admin';
    });
    await check('GET /sw.js → 200 text/javascript, the browser engine', async () => {
        const r = await req('/sw.js');
        return r.status === 200 && r.headers.get('content-type') === 'text/javascript' && (await textOf(r)).length > 1000;
    });
    await check('GET /builder/client.js unauthenticated → 302', async () =>
        (await req('/builder/client.js')).status === 302);
    await check('GET /api/auth/me unauthenticated → 401', async () =>
        (await req('/api/auth/me')).status === 401);
    await check('GET /api/console/health public → 200', async () =>
        (await req('/api/console/health')).status === 200);
    await check('GET /health (compat Meta) → 200', async () =>
        (await req('/health')).status === 200);
    await check('GET / renders eSSR (edge marker + seeded homepage)', async () => {
        const r = await req('/');
        const body = await textOf(r);
        return r.status === 200 && body.includes('chimera-rendered-by" content="edge"')
            && body.includes('Welcome to your new site');
    });
    await check('GET / Accept:application/json → product API status', async () => {
        const r = await req('/', { headers: { accept: 'application/json' } });
        const body = await r.json() as { message?: string; test_mode?: boolean };
        return r.status === 200 && typeof body.message === 'string' && body.test_mode === false;
    });
}

const eqForm = process.argv.find((a) => a.startsWith('--host='))?.split('=')[1];
const flagIdx = process.argv.indexOf('--host');
const hosts = eqForm ?? (flagIdx >= 0 ? process.argv[flagIdx + 1] : 'all');
const wantVercel = hosts === 'all' || hosts === 'vercel';
const wantDeno = hosts === 'all' || hosts === 'deno';

let vercelStatuses: Record<string, number> = {};
let denoStatuses: Record<string, number> = {};
if (wantVercel) {
    const vercel = handlerOf(await loadEntry('vercel'));
    await driveMatrix('vercel entry (dist/vercel.mjs default export)', vercel);
    // No assets binding on Vercel — /static/* is CDN-owned (vercel.json, pinned
    // by test/vercel-config.mjs). The function must NOT 500 on those paths.
    await check('vercel: /static/icon.png does not hit the function as a 500', async () => {
        const r = await vercel(new Request('https://smoke-host.local/static/icon.png'));
        return r.status !== 500;
    });
    for (const p of ['/frontbase-admin/pages', '/frontbase-admin/dashboard']) {
        vercelStatuses[p] = (await vercel(new Request('https://smoke-host.local' + p))).status;
    }
}
if (wantDeno) {
    const deno = handlerOf(await loadEntry('deno'));
    await driveMatrix('deno entry (dist/deno.mjs createRequestHandler)', deno);
    // The disk ASSETS shim is wired on Deno — the full static matrix flows
    // through the engine's asset routes exactly like the CF worker's.
    await check('deno: /static/react/hydrate.js served from the staged bundle', async () => {
        const r = await deno(new Request('https://smoke-host.local/static/react/hydrate.js'));
        const body = await textOf(r);
        return r.status === 200 && r.headers.get('content-type')?.includes('javascript') === true
            && body.includes('chimera-rendered-by');
    });
    await check('deno: /static/icon.png → staged bytes, image/png, 1 d cache', async () => {
        const r = await deno(new Request('https://smoke-host.local/static/icon.png'));
        const body = Buffer.from(await r.arrayBuffer());
        return r.status === 200 && r.headers.get('content-type') === 'image/png'
            && r.headers.get('cache-control') === 'public, max-age=86400'
            && body.equals(readFileSync(join(CONSOLE_DIST, 'icon.png')));
    });
    await check('deno: builder-sw.js served from the staged console root', async () => {
        const r = await deno(new Request('https://smoke-host.local/frontbase-admin/builder-sw.js'));
        return r.status === 200 && r.headers.get('content-type')?.includes('javascript') === true
            && (await textOf(r)).length > 10_000;
    });
    await check('deno: hashed console asset resolves to a real staged file', async () => {
        const html = readFileSync(join(CONSOLE_DIST, 'frontbase-admin', 'index.html'), 'utf8');
        const path = html.match(/src="(\/frontbase-admin\/assets\/[^"]+\.js)"/)?.[1];
        if (!path) return false;
        const r = await deno(new Request('https://smoke-host.local' + path));
        return r.status === 200 && r.headers.get('content-type')?.includes('javascript') === true;
    });
    for (const p of ['/frontbase-admin/pages', '/frontbase-admin/dashboard']) {
        denoStatuses[p] = (await deno(new Request('https://smoke-host.local' + p))).status;
    }
}
if (wantVercel && wantDeno) {
    await check('SPA fallback parity: both entries classify /pages and /dashboard identically', async () =>
        JSON.stringify(vercelStatuses) === JSON.stringify(denoStatuses)
        && Object.values(vercelStatuses).every((s) => s === 200 || s === 302));
}

// ========================================================================
// D. Misconfigured boot — each entry's LAZY init must fail with a LEGIBLE 500
//    naming the missing configuration, never an opaque crash. Runs in child
//    processes (module state memoizes; the poisoned case must not leak into
//    the matrix above) with a stripped environment.
// ========================================================================
console.log('\n=== D. Misconfigured boot → legible 500 (child processes, stripped env) ===');
const strippedEnv = (over: Record<string, string>) => ({
    ...process.env,
    SESSION_SECRET: '', APP_DB_URL: '', APP_DB_AUTH_TOKEN: '',
    APP_DB_D1_ACCOUNT_ID: '', APP_DB_D1_DATABASE_ID: '', CLOUDFLARE_API_TOKEN: '',
    ...over,
});
const probe = (bundle: 'vercel.mjs' | 'deno.mjs', env: Record<string, string>, secretThatMustNotLeak: string): boolean => {
    const script = `
        import { pathToFileURL } from 'node:url';
        const mod = await import(pathToFileURL(${JSON.stringify(join(here, bundle))}));
        const handle = mod.createRequestHandler ? mod.createRequestHandler() : mod.default;
        const res = await handle(new Request('https://probe.local/frontbase-admin'));
        const body = await res.text();
        const leak = ${JSON.stringify(secretThatMustNotLeak)};
        const ok = res.status === 500 && body.length > 20 && body.length < 1000
            && !body.includes(leak) && !body.includes('internal_error');
        console.log(JSON.stringify({ ok, status: res.status, body: body.slice(0, 300) }));
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8', env: strippedEnv(env), cwd: here, timeout: 60_000,
    });
    if (r.status !== 0 || !r.stdout.trim()) {
        console.log(`  ❌ probe ${bundle} crashed: ${(r.stderr ?? '').slice(0, 200)}`);
        failures++;
        return false;
    }
    const out = JSON.parse(r.stdout.trim()) as { ok: boolean; status: number; body: string };
    return out.ok;
};
for (const bundle of ['vercel.mjs', 'deno.mjs'] as const) {
    const host = bundle === 'vercel.mjs' ? 'vercel' : 'deno';
    await check(`${host}: no SESSION_SECRET → 500 naming SESSION_SECRET`, async () =>
        probe(bundle, {}, SECRET_TOKEN));
    await check(`${host}: SESSION_SECRET but no state db → 500 naming the accepted forms`, async () => {
        // Run through the JSON round-trip so the message check is on the parent
        // side (probe() only asserts shape/no-leak).
        return probeBundleMessage(bundle, { SESSION_SECRET: 'probe-only-secret' }, host);
    });
}
function probeBundleMessage(bundle: 'vercel.mjs' | 'deno.mjs', env: Record<string, string>, host: string): boolean {
    const script = `
        import { pathToFileURL } from 'node:url';
        const mod = await import(pathToFileURL(${JSON.stringify(join(here, bundle))}));
        const handle = mod.createRequestHandler ? mod.createRequestHandler() : mod.default;
        const res = await handle(new Request('https://probe.local/frontbase-admin'));
        const body = await res.text();
        console.log(JSON.stringify({ status: res.status, body }));
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8', env: strippedEnv(env), cwd: here, timeout: 60_000,
    });
    if (r.status !== 0 || !r.stdout.trim()) return false;
    const out = JSON.parse(r.stdout.trim()) as { status: number; body: string };
    return out.status === 500
        && out.body.includes(`No state database configured for the ${host} host`)
        && out.body.includes('APP_DB_URL')
        && out.body.includes('APP_DB_D1_ACCOUNT_ID')
        && out.body.includes('libsql://');
}

// ========================================================================
console.log(`\n=== per-host smoke summary: ${failures === 0 ? 'ALL PASSED ✅' : `${failures} FAILURE(S) ❌`} ===`);
process.exit(failures === 0 ? 0 : 1);
