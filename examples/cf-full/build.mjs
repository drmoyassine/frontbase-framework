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
import { existsSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'dist'), { recursive: true });

/**
 * The example bundles the workspace packages from their compiled `dist/`. In a
 * fresh checkout those aren't built yet (esbuild then fails with a cryptic "Could
 * not resolve @frontbase/edge-core"). Detect any missing dist up front and build
 * just those packages via pnpm, so `smoke` is one command.
 */
const REPO_ROOT = (function findRoot(dir) {
    for (let d = dir; d !== dirname(d); d = dirname(d)) {
        if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    }
    return dir;
})(here);
const DEP_PKGS = [
    { name: '@frontbase/edge-core', artifact: 'dist/index.js' },
    { name: '@frontbase/edge-infra', artifact: 'dist/index.js' },
    { name: '@frontbase/compiler', artifact: 'dist/index.js' },
    { name: '@frontbase/backend', artifact: 'dist/index.js' },
    { name: '@frontbase/admin-console', artifact: 'dist/spa.js' },
];
function pkgDir(name) { return join(REPO_ROOT, 'packages', name.replace(/^@frontbase\//, '')); }
const missing = DEP_PKGS.filter((p) => !existsSync(join(pkgDir(p.name), p.artifact)));
if (missing.length > 0) {
    console.log(`→ building ${missing.length} unbuilt workspace package(s): ${missing.map((p) => p.name).join(', ')}`);
    const filters = missing.map((p) => ['--filter', p.name]).flat();
    const r = spawnSync('pnpm', [...filters, 'build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) {
        console.error('\n✗ workspace dependency build failed. Run `pnpm -r build` manually, then retry.');
        process.exit(1);
    }
    console.log('→ workspace packages built\n');
}

// Optional deps that are dynamic-imported behind feature flags — not part of a
// basic D1 CMS. Stubbed so the single-file artifact carries no dangling imports.
const OPTIONAL = ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', '@neondatabase/serverless', '@upstash/qstash', '@modelcontextprotocol/sdk', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'];
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

// 2b. Inline the admin-console SPA bundle (built by @frontbase/admin-console)
//     the same way → one artifact, no static assets.
const SPA_SOURCE = readFileSync(join(pkgDir('@frontbase/admin-console'), 'dist', 'spa.js'), 'utf8');
const inlineSpaPlugin = {
    name: 'inline-spa',
    setup(build) {
        build.onResolve({ filter: /^virtual:spa-bundle$/ }, () => ({ path: 'virtual:spa-bundle', namespace: 'vspa' }));
        build.onLoad({ filter: /.*/, namespace: 'vspa' }, () => ({ contents: `export default ${JSON.stringify(SPA_SOURCE)};`, loader: 'js' }));
    },
};

await esbuild.build({
    ...shared,
    entryPoints: [join(here, 'src', 'worker.ts')],
    outfile: join(here, 'dist', 'worker.mjs'),
    minify: true,
    plugins: [inlineSwPlugin, inlineSpaPlugin, optionalStub],
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
    plugins: [inlineSwPlugin, inlineSpaPlugin],
});

const raw = statSync(join(here, 'dist', 'worker.mjs')).size;
const gz = gzipSync(readFileSync(join(here, 'dist', 'worker.mjs')), { level: 9 }).length;
console.log('=== full-CMS CF worker artifact ===');
console.log(`worker.mjs min:      ${(raw / 1024).toFixed(1)} KB`);
console.log(`worker.mjs min+gzip: ${(gz / 1024).toFixed(1)} KB  (CF free limit 1024 KB — ${gz <= 1024 * 1024 ? 'PASS ✅' : 'FAIL ❌'})`);
console.log(`  includes inlined /sw.js: ${(SW_SOURCE.length / 1024).toFixed(1)} KB`);
console.log(`  includes inlined /console SPA: ${(SPA_SOURCE.length / 1024).toFixed(1)} KB`);
