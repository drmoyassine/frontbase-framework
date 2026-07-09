/**
 * Builds the single deployable Worker artifact for the edge-core example.
 *   1. Bundle sw.ts → the browser engine (iife) — the /sw.js handover payload.
 *   2. Inline it into worker.ts via virtual:sw-bundle → dist/worker.mjs (one file).
 *   3. Also emit a Node smoke build so the routing can be checked before deploy.
 *
 * Proves @frontbase/edge-core boots on all three hosts: Node (smoke), CF Worker
 * (worker.mjs), and the browser service worker (the inlined sw bundle).
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'dist'), { recursive: true });

const shared = {
    bundle: true,
    platform: 'browser',   // V8 isolate target for both SW and Worker (no nodejs_compat)
    format: 'esm',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
};

// 1. The service-worker bundle (browser engine).
const swResult = await esbuild.build({
    ...shared,
    entryPoints: [join(here, 'src', 'sw.ts')],
    write: false,
    format: 'iife',
    minify: true,
});
const SW_SOURCE = swResult.outputFiles[0].text;

// 2. Inline the SW bundle as a string constant → single worker artifact.
const inlineSwPlugin = {
    name: 'inline-sw',
    setup(build) {
        build.onResolve({ filter: /^virtual:sw-bundle$/ }, () => ({ path: 'virtual:sw-bundle', namespace: 'vsw' }));
        build.onLoad({ filter: /.*/, namespace: 'vsw' }, () => ({ contents: `export default ${JSON.stringify(SW_SOURCE)};`, loader: 'js' }));
    },
};

await esbuild.build({
    ...shared,
    entryPoints: [join(here, 'src', 'worker.ts')],
    outfile: join(here, 'dist', 'worker.mjs'),
    minify: true,
    plugins: [inlineSwPlugin],
});

// 3. Node smoke build (unminified, importable) — same worker, checked locally.
//    Keep platform:'browser' so liquidjs resolves its browser build (the Node
//    build require()s 'stream', which breaks under ESM). This mirrors the deploy
//    target exactly: the worker runs the browser liquid build too.
await esbuild.build({
    ...shared,
    entryPoints: [join(here, 'src', 'smoke.ts')],
    outfile: join(here, 'dist', 'smoke.mjs'),
    minify: false,
    plugins: [inlineSwPlugin],
    banner: { js: 'import{createRequire}from"node:module";const require=createRequire(import.meta.url);' },
});

const raw = statSync(join(here, 'dist', 'worker.mjs')).size;
const gz = gzipSync(readFileSync(join(here, 'dist', 'worker.mjs')), { level: 9 }).length;
console.log('=== edge-core CF worker artifact ===');
console.log(`worker.mjs min:      ${(raw / 1024).toFixed(1)} KB`);
console.log(`worker.mjs min+gzip: ${(gz / 1024).toFixed(1)} KB  (CF free limit 1024 KB — ${gz <= 1024 * 1024 ? 'PASS ✅' : 'FAIL ❌'})`);
console.log(`  includes inlined /sw.js: ${(SW_SOURCE.length / 1024).toFixed(1)} KB`);
