/**
 * Vercel + Deno deploy configuration gates (A-24). On Vercel the static matrix
 * is owned by the CDN — vercel.json IS the static-file serving code for that
 * host, so its rules are pinned here byte-level. The in-process per-host smoke
 * (smoke:host) cannot see these (it drives the function only); this is the
 * complementary half, credential-free and file-only:
 *
 *   1. Routing order — vercel.json `rewrites` MUST be an ARRAY (the object
 *      beforeFiles/afterFiles/fallback form is invalid vercel.json: Vercel's
 *      Deploy Button project-creation flow rejects it outright — "rewrites
 *      should be array" — and array rewrites apply only AFTER the filesystem
 *      check). The pinned consequence: the staged shell at
 *      /frontbase-admin(+ /index.html) serves ITSELF from the CDN — exactly
 *      the Cloudflare behavior (exact /frontbase-admin/* files are Static
 *      Assets served ahead of the worker) — with no-cache headers so a stale
 *      shell never pins old hashed chunks. The engine-emitted /static/* URLs
 *      translate onto the staged layout as rewrites (a real file still wins),
 *      /static/assets/:filename (KV branding) must NOT be rewritten into the
 *      static tree, and the catch-all → function must be last.
 *   2. Header policy — hydrate.js no-cache (the canvas must always revalidate
 *      — the disk shim's ETag covers the cost), entry css + hashed console
 *      assets immutable, icon 1 d, exact shell rules no-cache and listed
 *      BEFORE the broad shell rule (first matching rule wins a header key),
 *      broad shell rule 1 h.
 *   3. outputDirectory is console-dist (the staged layout) — plus trailing
 *      slash/cleanUrls OFF so engine-emitted URLs never get redirected.
 *   4. The Deno deploy root (deno-dist) is a self-contained staging of entry +
 *      config + a FRESH console copy — checked for shape here, bytes are the
 *      build's job (smoke:host asserts byte identity).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const exampleRoot = join(here, '..');

let failures = 0;
const check = (label, ok) =>
    ok ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`));

const vercel = JSON.parse(readFileSync(join(exampleRoot, 'vercel.json'), 'utf8'));

console.log('=== vercel.json: project shape ===');
check('outputDirectory is console-dist (the staged layout)', vercel.outputDirectory === 'console-dist');
check('trailingSlash off (engine URLs never redirected)', vercel.trailingSlash === false);
check('cleanUrls off (no .html mangling)', vercel.cleanUrls === false);

console.log('=== vercel.json: routing order ===');
const rewrites = vercel.rewrites ?? [];

check('rewrites is an ARRAY (the object form is invalid vercel.json — the Deploy Button rejects it)',
    Array.isArray(rewrites));
check('no /frontbase-admin rewrite: the staged shell serves itself (Cloudflare Static-Assets parity)',
    rewrites.every((r) => !r.source.startsWith('/frontbase-admin')));
check('/static/react/:file* → /react/:file* (hydration stage)',
    JSON.stringify(rewrites.find((r) => r.source === '/static/react/:file*'))
        === JSON.stringify({ source: '/static/react/:file*', destination: '/react/:file*' }));
check('/static/icon.png → /icon.png (A-24 staged root copy)',
    JSON.stringify(rewrites.find((r) => r.source === '/static/icon.png'))
        === JSON.stringify({ source: '/static/icon.png', destination: '/icon.png' }));
check('/static/assets/ is NOT rewritten (KV branding stays on the function)',
    rewrites.every((r) => !r.source.startsWith('/static/assets')));
check('rewrites are exactly: root + hydration stage + icon + catch-all (nothing else shadows the filesystem)',
    rewrites.length === 4);
check('the root path is rewritten EXPLICITLY (no reliance on :path* zero-segment matching for /)',
    rewrites[0].source === '/' && rewrites[0].destination === '/api/cms');
check('catch-all → the function, listed last',
    rewrites[rewrites.length - 1].source === '/:path*' && rewrites[rewrites.length - 1].destination === '/api/cms');

console.log('=== vercel.json: header policy ===');
const headers = vercel.headers ?? [];
const headerFor = (source) => headers.find((h) => h.source === source)?.headers ?? [];
const valueOf = (source, key) => headerFor(source).find((h) => h.key === key)?.value;

check('hydrate.js: no-cache, must-revalidate (canvas revalidates every load)',
    valueOf('/react/hydrate.js', 'Cache-Control') === 'no-cache, must-revalidate');
check('hydrate.js: javascript content-type + nosniff',
    valueOf('/react/hydrate.js', 'Content-Type') === 'application/javascript; charset=utf-8'
    && valueOf('/react/hydrate.js', 'X-Content-Type-Options') === 'nosniff');
check('entry css: immutable 1 y + css content-type',
    valueOf('/react/entry-(.*).css', 'Cache-Control') === 'public, max-age=31536000, immutable'
    && valueOf('/react/entry-(.*).css', 'Content-Type') === 'text/css; charset=utf-8');
check('icon.png: 1 d cache + png content-type',
    valueOf('/icon.png', 'Cache-Control') === 'public, max-age=86400'
    && valueOf('/icon.png', 'Content-Type') === 'image/png');
check('hashed console assets: immutable',
    valueOf('/frontbase-admin/assets/(.*)', 'Cache-Control') === 'public, max-age=31536000, immutable');
check('exact shell rules: no-cache, must-revalidate (a stale CDN shell must never pin old chunks)',
    valueOf('/frontbase-admin', 'Cache-Control') === 'no-cache, must-revalidate'
    && valueOf('/frontbase-admin/index.html', 'Cache-Control') === 'no-cache, must-revalidate');
check('broad shell rule: 1 h', valueOf('/frontbase-admin/(.*)', 'Cache-Control') === 'public, max-age=3600');
check('merge order: the immutable assets rule is listed BEFORE the broad shell rule',
    headers.findIndex((h) => h.source === '/frontbase-admin/assets/(.*)')
    < headers.findIndex((h) => h.source === '/frontbase-admin/(.*)'));
check('merge order: exact shell no-cache rules listed BEFORE the broad shell rule (first match wins)',
    headers.findIndex((h) => h.source === '/frontbase-admin') >= 0
    && headers.findIndex((h) => h.source === '/frontbase-admin') < headers.findIndex((h) => h.source === '/frontbase-admin/(.*)')
    && headers.findIndex((h) => h.source === '/frontbase-admin/index.html') < headers.findIndex((h) => h.source === '/frontbase-admin/(.*)'));

console.log('=== deno-dist: self-contained deploy root shape (staged by build.mjs) ===');
const denoDist = join(exampleRoot, 'deno-dist');
check('entry + config + console copy staged', existsSync(join(denoDist, 'deno.mjs'))
    && existsSync(join(denoDist, 'deno.json'))
    && existsSync(join(denoDist, 'console-dist', 'frontbase-admin', 'index.html')));
const denoCfg = existsSync(join(denoDist, 'deno.json'))
    ? JSON.parse(readFileSync(join(denoDist, 'deno.json'), 'utf8'))
    : {};
check('staged deno.json targets deno.window (no node types at top level)',
    denoCfg.compilerOptions?.lib?.includes('deno.window') === true);

console.log('=== deno deploy config: committed entrypoint shim ===');
// Deno Deploy validates the entrypoint against the WORKING DIRECTORY before
// any build runs — a build output (deno-dist/deno.mjs) can never satisfy that
// check on a fresh clone. The committed shim exists pre-build and hands off
// to the bundle post-build.
const entryShimPath = join(exampleRoot, 'deno-entry.mjs');
const appDenoJson = JSON.parse(readFileSync(join(exampleRoot, 'deno.json'), 'utf8'));
check('deno.json declares deploy install/build + dynamic runtime',
    appDenoJson.deploy?.install === 'pnpm install'
    && appDenoJson.deploy?.build === 'pnpm -r build'
    && appDenoJson.deploy?.runtime?.type === 'dynamic');
check('deploy.runtime.entrypoint is the COMMITTED shim (exists in a fresh clone)',
    appDenoJson.deploy?.runtime?.entrypoint === './deno-entry.mjs' && existsSync(entryShimPath));
check('shim imports the built bundle (hand-off after the build)',
    readFileSync(entryShimPath, 'utf8').includes("import './deno-dist/deno.mjs';"));

console.log(`\n=== deploy config gates: ${failures === 0 ? 'ALL PASSED ✅' : `${failures} FAILURE(S) ❌`} ===`);
process.exit(failures === 0 ? 0 : 1);
