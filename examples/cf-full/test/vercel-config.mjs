/**
 * Vercel + Deno deploy configuration gates (A-24). On Vercel the static matrix
 * is owned by the CDN — vercel.json IS the static-file serving code for that
 * host, so its rules are pinned here byte-level. The in-process per-host smoke
 * (smoke:host) cannot see these (it drives the function only); this is the
 * complementary half, credential-free and file-only:
 *
 *   1. Routing order — the shell MUST reach the function even though a real
 *      index.html exists on the CDN (beforeFiles beat the filesystem); the
 *      engine-emitted /static/* URLs must translate onto the staged layout
 *      ONLY as afterFiles rewrites (a real file wins); the catch-all fallback
 *      must be last. /static/assets/:filename (KV branding) must NOT be
 *      rewritten into the static tree.
 *   2. Header policy — hydrate.js no-cache (the canvas must always revalidate
 *      — the disk shim's ETag covers the cost), entry css + hashed console
 *      assets immutable, icon 1 d, broad shell rule 1 h and listed AFTER the
 *      assets rule (merge order = which cache-control a shell asset gets).
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
const before = vercel.rewrites?.beforeFiles ?? [];
const after = vercel.rewrites?.afterFiles ?? [];
const fallback = vercel.rewrites?.fallback ?? [];

check('beforeFiles: /frontbase-admin → the function (beats the staged index.html)',
    JSON.stringify(before[0]) === JSON.stringify({ source: '/frontbase-admin', destination: '/api/cms' }));
check('beforeFiles: /frontbase-admin/index.html → the function too',
    JSON.stringify(before[1]) === JSON.stringify({ source: '/frontbase-admin/index.html', destination: '/api/cms' }));
check('afterFiles: /static/react/:file* → /react/:file* (hydration stage)',
    JSON.stringify(after.find((r) => r.source === '/static/react/:file*'))
        === JSON.stringify({ source: '/static/react/:file*', destination: '/react/:file*' }));
check('afterFiles: /static/icon.png → /icon.png (A-24 staged root copy)',
    JSON.stringify(after.find((r) => r.source === '/static/icon.png'))
        === JSON.stringify({ source: '/static/icon.png', destination: '/icon.png' }));
check('afterFiles: /static/assets/ is NOT rewritten (KV branding stays on the function)',
    after.every((r) => !r.source.startsWith('/static/assets')));
check('fallback: catch-all → the function, listed last',
    fallback.length === 1 && fallback[0].source === '/:path*' && fallback[0].destination === '/api/cms');

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
check('broad shell rule: 1 h', valueOf('/frontbase-admin/(.*)', 'Cache-Control') === 'public, max-age=3600');
check('merge order: the immutable assets rule is listed BEFORE the broad shell rule',
    headers.findIndex((h) => h.source === '/frontbase-admin/assets/(.*)')
    < headers.findIndex((h) => h.source === '/frontbase-admin/(.*)'));

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

console.log(`\n=== deploy config gates: ${failures === 0 ? 'ALL PASSED ✅' : `${failures} FAILURE(S) ❌`} ===`);
process.exit(failures === 0 ? 0 : 1);
