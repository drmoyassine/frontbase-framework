/**
 * Builds the single deployable Worker artifact for the FULL-CMS example.
 *   1. Bundle sw.ts → the browser engine (iife) — the /sw.js handover payload.
 *   2. Inline it into worker.ts (virtual:sw-bundle) and bundle the whole CMS
 *      (edge-core engine + backend console + edge-infra D1 runner) → one file.
 *   3. Emit a Node smoke build so the login gate can be proven before deploy.
 *
 * Optional datasource/AI/queue SDKs (ai, @ai-sdk/*, @neondatabase/serverless,
 * @upstash/qstash, @modelcontextprotocol/sdk) are dynamic-imported behind feature
 * executors a basic D1 CMS never invokes. We map them to a throwing stub so the
 * artifact is fully self-contained (no unresolved bare imports) and any attempt
 * to use those features fails with a clear message instead of a cryptic CF error.
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'dist'), { recursive: true });

// Optional deps that are dynamic-imported behind feature flags — not part of a
// basic D1 CMS. Stubbed so the single-file artifact carries no dangling imports.
const OPTIONAL = ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', '@neondatabase/serverless', '@upstash/qstash', '@modelcontextprotocol/sdk'];
const optionalStub = {
    name: 'stub-optional-deps',
    setup(build) {
        const filter = new RegExp('^(' + OPTIONAL.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(/.*)?$');
        build.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'stub-optional' }));
        build.onLoad({ filter: /.*/, namespace: 'stub-optional' }, (args) => ({
            contents: `throw new Error(${JSON.stringify('optional dependency not bundled in this edge build: ')} + ${JSON.stringify(args.path)});`,
            loader: 'js',
        }));
    },
};

const shared = {
    bundle: true,
    platform: 'browser',   // V8 isolate target (no nodejs_compat) — Web Crypto only
    format: 'esm',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
};

// 1. The service-worker bundle (browser engine, edge-core only).
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
    plugins: [inlineSwPlugin, optionalStub],
});

// 3. Node smoke build (unminified, importable) — the SAME worker + a memory
//    runner. platform:'node' with packages:'external' so @libsql/client's NATIVE
//    node binding (and the workspace @frontbase/* dist) are resolved by Node at
//    runtime rather than bundled (esbuild can't inline the native .node addon).
//    Only our own src + the inlined SW are bundled.
await esbuild.build({
    ...shared,
    platform: 'node',
    packages: 'external',
    entryPoints: [join(here, 'src', 'smoke.ts')],
    outfile: join(here, 'dist', 'smoke.mjs'),
    minify: false,
    plugins: [inlineSwPlugin],
});

const raw = statSync(join(here, 'dist', 'worker.mjs')).size;
const gz = gzipSync(readFileSync(join(here, 'dist', 'worker.mjs')), { level: 9 }).length;
console.log('=== full-CMS CF worker artifact ===');
console.log(`worker.mjs min:      ${(raw / 1024).toFixed(1)} KB`);
console.log(`worker.mjs min+gzip: ${(gz / 1024).toFixed(1)} KB  (CF free limit 1024 KB — ${gz <= 1024 * 1024 ? 'PASS ✅' : 'FAIL ❌'})`);
console.log(`  includes inlined /sw.js: ${(SW_SOURCE.length / 1024).toFixed(1)} KB`);
