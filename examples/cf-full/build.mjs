/**
 * Builds the single deployable Worker artifact for the FULL-CMS example.
 *   1. Bundle sw.ts → the browser engine (iife) — the /sw.js handover payload.
 *   2. Inline it into worker.ts (virtual:sw-bundle) and bundle the whole CMS
 *      (edge-core engine + backend console + edge-infra D1 runner) → one file.
 *   3. Emit a Node smoke build so the login gate can be proven before deploy.
 *
 * Optional AI/queue/object-store SDKs (ai, @ai-sdk/*, @upstash/qstash,
 * @modelcontextprotocol/sdk, @aws-sdk/*) are dynamic-imported behind feature
 * executors a basic D1 CMS never invokes. We map them to a throwing stub so the
 * artifact is fully self-contained (no unresolved bare imports) and any attempt
 * to use those features fails with a clear message instead of a cryptic CF error.
 * @neondatabase/serverless is NOT stubbed — the console's edge-database
 * connect/schema flows (Supabase/Neon Postgres) need it at runtime.
 */
import * as esbuild from 'esbuild';
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateConsoleArtifact, consoleBundlesPresent } from '../../scripts/console-pin.mjs';
import { patchHydrate } from './scripts/patch-hydrate.mjs';

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
// The Worker bundle embeds only the SPA shell (see consoleShellPlugin below); the
// hashed bundles are served by Workers Static Assets and are never bundled. So the
// build validates at level 'shell' — everything it actually consumes, all of it
// committed, so this succeeds in a fresh clone and in CI. The bundle bytes are a
// DEPLOY requirement, enforced at level 'deploy' by scripts/deploy.mjs; building a
// worker without them is fine, shipping one is not.
try {
    validateConsoleArtifact(REPO_ROOT, { level: 'shell' });
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
const CONSOLE_ROOT = join(here, 'console-dist', 'frontbase-admin');
const CONSOLE_INDEX_PATH = join(CONSOLE_ROOT, 'index.html');
if (!consoleBundlesPresent(REPO_ROOT)) {
    console.log('⚠ console bundles absent — building against the committed shell only.');
    console.log('  This artifact is NOT deployable; run `pnpm run fetch:console` before deploying.');
}
// Regenerate the served hydration bundle from the vendored product build.
// Throws when the vendor bytes drift and a patch anchor stops matching —
// never ship a silently unpatched bundle (see scripts/patch-hydrate.mjs).
const hydratePatch = patchHydrate();
if (hydratePatch.patched) {
    console.log(`→ hydrate.js: ${hydratePatch.patches} canvas-fallback patches applied (${hydratePatch.bytes} bytes)`);
}
const DEP_PKGS = [
    { name: '@frontbase/edge-core', artifact: 'dist/index.js' },
    { name: '@frontbase/edge-infra', artifact: 'dist/index.js' },
    { name: '@frontbase/compiler', artifact: 'dist/index.js' },
    { name: '@frontbase/backend', artifact: 'dist/index.js' },
    { name: '@frontbase/builder', artifact: 'dist/index.js' },
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
// (@neondatabase/serverless is bundled for real: the edge-database Postgres
// flows invoke it on demand, not behind an unused feature flag.)
// ioredis/bullmq are TCP-only (Node runtime); the worker's cache resolver
// catches the stub's throw and falls back (warn + env/memory path).
// @upstash/qstash is bundled FOR REAL (Phase 3): Receiver.verify runs on the
// worker — stubbing it would break inbound signature authentication.
const OPTIONAL = ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', '@modelcontextprotocol/sdk', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'ioredis', 'bullmq'];
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

// Resolve workspace @frontbase/* packages to their dist directories.
// This ensures esbuild can find workspace packages even when they're not in node_modules.
const workspaceResolver = {
    name: 'workspace-resolver',
    setup(build) {
        build.onResolve({ filter: /^@frontbase\// }, (args) => {
            const path = args.path;

            // Direct package imports (e.g., @frontbase/builder)
            if (!path.includes('/') || path.split('/').length === 2) {
                const pkgName = path.replace('@frontbase/', '');
                const pkgDir = join(REPO_ROOT, 'packages', pkgName);
                const resolvedPath = join(pkgDir, 'dist', 'index.js');
                if (existsSync(resolvedPath)) {
                    return { path: resolvedPath };
                }
            }

            // Subpath imports (e.g., @frontbase/builder/registry)
            const parts = path.split('/');
            const pkgName = parts[1]; // 'builder' from '@frontbase/builder/registry'
            const subpath = parts.slice(2).join('/'); // 'registry' from '@frontbase/builder/registry'
            const pkgDir = join(REPO_ROOT, 'packages', pkgName);

            // Try dist/subpath.js
            let resolvedPath = join(pkgDir, 'dist', `${subpath}.js`);
            if (existsSync(resolvedPath)) {
                return { path: resolvedPath };
            }

            // Try dist/subpath/index.js
            resolvedPath = join(pkgDir, 'dist', subpath, 'index.js');
            if (existsSync(resolvedPath)) {
                return { path: resolvedPath };
            }

            // Try dist/subpath (no extension)
            resolvedPath = join(pkgDir, 'dist', subpath);
            if (existsSync(resolvedPath)) {
                return { path: resolvedPath };
            }
        });
    },
};

const shared = {
    bundle: true,
    absWorkingDir: here,
    platform: 'browser',   // V8 isolate target (no nodejs_compat) — Web Crypto only
    format: 'esm',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
};

// 1. The service-worker bundle (browser engine, edge-core only).
const swResult = await esbuild.build({
    ...shared,
    entryPoints: ['src/sw.ts'],
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

// 2b. Stage the setup-only SPA without putting it in the Worker bundle. CF-22's
// product console is the sole dashboard at /frontbase-admin; this artifact owns
// only first-admin initialization at /setup.
const setupAssetDir = join(here, 'console-dist', 'frontbase-setup');
mkdirSync(setupAssetDir, { recursive: true });
copyFileSync(join(pkgDir('@frontbase/admin-console'), 'dist', 'spa.js'), join(setupAssetDir, 'spa.js'));

// 2c. CF-22 P3: Inline the product console index.html for the Node smoke fallback.
//     For the smoke build (platform:node), this reads the file at build time and
//     embeds it. In production, Workers Static Assets serves console-dist/
//     directly — this module is only used for the smoke/in-process path.
const consoleShellPlugin = {
    name: 'console-shell',
    setup(build) {
        build.onResolve({ filter: /^\.\/console-shell\.js$/ }, () => ({ path: 'console-shell', namespace: 'cshell' }));
        build.onLoad({ filter: /.*/, namespace: 'cshell' }, () => {
            const html = readFileSync(CONSOLE_INDEX_PATH, 'utf-8');
            return { contents: `export default ${JSON.stringify(html)};`, loader: 'js' };
        });
    },
};

// 2d. Phase 2: Bundle the editing client (browser-only, DOM-based).
//     This creates a thin browser bundle that round-trips edits through server
//     endpoints. No renderPage, liquid, iconMap, or globalRegistry symbols.
const clientResult = await esbuild.build({
    ...shared,
    entryPoints: [join(pkgDir('@frontbase/builder'), 'src', 'editing', 'client', 'index.ts')],
    write: false,
    format: 'iife',
    minify: true,
    platform: 'browser',
});
const CLIENT_SOURCE = clientResult.outputFiles[0].text;

// Inline the client bundle as a string constant → used by BuilderEngine.
const inlineClientPlugin = {
    name: 'inline-client',
    setup(build) {
        build.onResolve({ filter: /^virtual:builder-client-bundle$/ }, () => ({ path: 'virtual:builder-client-bundle', namespace: 'vclient' }));
        build.onLoad({ filter: /.*/, namespace: 'vclient' }, () => ({ contents: `export default ${JSON.stringify(CLIENT_SOURCE)};`, loader: 'js' }));
    },
};

await esbuild.build({
    ...shared,
    entryPoints: ['src/worker.ts'],
    outfile: join(here, 'dist', 'worker.mjs'),
    minify: true,
    plugins: [workspaceResolver, inlineSwPlugin, consoleShellPlugin, optionalStub, inlineClientPlugin],
});

// 3. Node smoke build (unminified, importable) — the SAME worker + a memory
//    runner. platform:'node' with packages:'external' so @libsql/client's NATIVE
//    node binding (and the workspace @frontbase/* dist) are resolved by Node at
//    runtime rather than bundled (esbuild can't inline the native .node addon).
//    Only our own src + the inlined SW/console-shell/client virtuals are bundled.
//
//    Deliberately NO workspaceResolver here (unlike the CF worker build above).
//    workspaceResolver redirects @frontbase/* to their source dist paths, which
//    makes esbuild BUNDLE those packages into smoke.mjs — inlining their
//    transitive bare imports (@libsql/client, @supabase/postgrest-js, liquidjs,
//    zod, drizzle-orm, …) as external statements rooted at cf-full/dist. pnpm's
//    strict layout does NOT hoist those transitive deps into cf-full/node_modules,
//    so Node fails with ERR_MODULE_NOT_FOUND at runtime (this broke `pnpm smoke`
//    in CI). With packages:'external' alone, @frontbase/* stay as bare imports
//    that Node resolves via the workspace symlinks in cf-full/node_modules, and
//    each package's OWN deps resolve from that package's node_modules. The worker
//    (CF) build keeps workspaceResolver because it must bundle everything for the
//    edge runtime, which has no node_modules.
await esbuild.build({
    ...shared,
    platform: 'node',
    packages: 'external',
    entryPoints: ['src/smoke.ts'],
    outfile: join(here, 'dist', 'smoke.mjs'),
    minify: false,
    plugins: [inlineSwPlugin, consoleShellPlugin, inlineClientPlugin],
});

// 4. Node server build — the self-host/Docker entry (src/node.ts → dist/node.mjs).
//    Identical shape to the smoke build above (same rationale: external packages
//    so the libsql native binding and workspace @frontbase/* dist resolve from
//    node_modules at runtime); the only difference is the entrypoint. Served by
//    `node dist/node.mjs` (npm script start:node) or the Dockerfile CMD.
await esbuild.build({
    ...shared,
    platform: 'node',
    packages: 'external',
    target: 'node22',
    entryPoints: ['src/node.ts'],
    outfile: join(here, 'dist', 'node.mjs'),
    minify: false,
    plugins: [inlineSwPlugin, consoleShellPlugin, inlineClientPlugin],
});

const raw = statSync(join(here, 'dist', 'worker.mjs')).size;
const gz = gzipSync(readFileSync(join(here, 'dist', 'worker.mjs')), { level: 9 }).length;
const clientGz = gzipSync(CLIENT_SOURCE, { level: 9 }).length;
console.log('=== full-CMS CF worker artifact ===');
console.log(`worker.mjs min:      ${(raw / 1024).toFixed(1)} KB`);
console.log(`worker.mjs min+gzip: ${(gz / 1024).toFixed(1)} KB  (CF free limit 1024 KB — ${gz <= 1024 * 1024 ? 'PASS ✅' : 'FAIL ❌'})`);
console.log(`  includes inlined /sw.js: ${(SW_SOURCE.length / 1024).toFixed(1)} KB`);
console.log(`  includes inlined editing client: ${(CLIENT_SOURCE.length / 1024).toFixed(1)} KB (gzip: ${(clientGz / 1024).toFixed(1)} KB)`);

// Verification: Check that client bundle contains no prohibited symbols
const PROHIBITED = ['renderPage', 'globalRegistry', 'liquid', 'iconMap'];
const foundProhibited = PROHIBITED.filter(sym => CLIENT_SOURCE.includes(sym));
if (foundProhibited.length > 0) {
    console.log(`⚠ WARNING: Client bundle contains prohibited symbols: ${foundProhibited.join(', ')}`);
} else {
    console.log(`✅ Client bundle verification: NO prohibited symbols found`);
}
