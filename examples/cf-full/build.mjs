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
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, copyFileSync, cpSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateStagedConsole } from '../../scripts/console-pin.mjs';

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
function pkgDir(name) { return join(REPO_ROOT, 'packages', name.replace(/^@frontbase\//, '')); }
const DEP_PKGS = [
    { name: '@frontbase/edge-core', artifact: 'dist/index.js' },
    { name: '@frontbase/edge-infra', artifact: 'dist/index.js' },
    { name: '@frontbase/compiler', artifact: 'dist/index.js' },
    { name: '@frontbase/backend', artifact: 'dist/index.js' },
    { name: '@frontbase/builder', artifact: 'dist/index.js' },
    { name: '@frontbase/admin-console', artifact: 'dist/spa.js' },
    // The console is NOT imported by the worker — it is served as Static
    // Assets — but it belongs here so a fresh clone builds its dist before the
    // staging step below reuses it (--skip-build).
    { name: '@frontbase/console', artifact: 'dist/index.html' },
    // Same story as the console: not imported by the worker (served as Static
    // Assets from console-dist/react/), built here so the staging step below
    // always has a dist to copy.
    { name: '@frontbase/hydrate', artifact: 'dist/hydrate.js' },
];
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

// Stage the console artifact when it is missing (fresh clone) or stale on
// demand (--refresh-console). `pnpm -r build` / the self-heal above produce
// packages/console/dist, so staging reuses it via --skip-build instead of
// building the SPA twice. After a console source edit WITHOUT rebuilding,
// pass --refresh-console or run `pnpm console:build` explicitly.
const STAGED_SHELL = join(here, 'console-dist', 'frontbase-admin', 'index.html');
if (!existsSync(STAGED_SHELL) || process.argv.includes('--refresh-console')) {
    const skip = existsSync(join(pkgDir('@frontbase/console'), 'dist', 'index.html'));
    console.log(`→ staging console artifact (${skip ? 'dist exists, skipping console build' : 'building console first'})...`);
    // process.execPath, NOT shell:true: with a shell, Node joins args unquoted
    // and a repo path containing spaces ('OneDrive - ...') shatters the script
    // path at the first space (MODULE_NOT_FOUND). execPath needs no shell.
    const r = spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'build-console.mjs'), ...(skip ? ['--skip-build'] : [])],
        { cwd: here, stdio: 'inherit' });
    if (r.status !== 0) {
        console.error('\n✗ console staging failed — run `pnpm console:build` manually for details.');
        process.exit(1);
    }
}
// Validate the stage that this build actually consumes: shell ↔ bundle
// agreement, builder-sw.js, .assetsignore, plus the vendored-contract hash.
// (Pre-consolidation this validated a committed shell before anything was
// staged, at a lower level; now staging always precedes validation, so the
// full check is affordable everywhere — including fresh clones and CI.)
try {
    validateStagedConsole(REPO_ROOT);
} catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
}
const CONSOLE_ROOT = join(here, 'console-dist', 'frontbase-admin');
const CONSOLE_INDEX_PATH = join(CONSOLE_ROOT, 'index.html');

// Stage the hydration bundle (packages/hydrate/dist → console-dist/react/).
// Runs AFTER console staging: staging wipes console-dist/ (including the
// served react/ copy). The worker routes /static/react/* to this directory;
// the CSS hash is free to change (the serving route globs entry-*.css).
// There is no silent-skip path: a missing/incomplete dist exits loudly (the
// self-heal above builds @frontbase/hydrate first; pre-consolidation this was
// a vendored product bundle + byte-level patches — scripts/patch-hydrate.mjs).
const HYDRATE_DIST = join(pkgDir('@frontbase/hydrate'), 'dist');
const REACT_STAGE = join(here, 'console-dist', 'react');
mkdirSync(REACT_STAGE, { recursive: true });
const hydrateFiles = readdirSync(HYDRATE_DIST).filter((f) => f === 'hydrate.js' || /^entry-.+\.css$/.test(f));
if (!hydrateFiles.includes('hydrate.js') || !hydrateFiles.some((f) => /^entry-.+\.css$/.test(f))) {
    console.error('✗ @frontbase/hydrate dist incomplete — expected hydrate.js + entry-*.css. Run `pnpm --filter @frontbase/hydrate build`.');
    process.exit(1);
}
for (const f of hydrateFiles) copyFileSync(join(HYDRATE_DIST, f), join(REACT_STAGE, f));
console.log(`→ staged hydration bundle: ${hydrateFiles.join(', ')} → console-dist/react/`);

// Stage the admin console's favicon at the ASSETS root: the engine rewrites
// /static/icon.png → /icon.png (worker.ts), and before A-24 nothing staged a
// root copy — that route 404'd on every host while the shell advertised it via
// <link rel="icon">. Copy (not move): the shell's own /frontbase-admin/icon.png
// keeps working. No .assetsignore change — the file is a served asset.
const ICON_SRC = join(CONSOLE_ROOT, 'icon.png');
if (!existsSync(ICON_SRC)) {
    console.error('✗ console-dist/frontbase-admin/icon.png missing — rebuild the console (pnpm console:build).');
    process.exit(1);
}
copyFileSync(ICON_SRC, join(here, 'console-dist', 'icon.png'));
console.log('→ staged console-dist/icon.png (serves /static/icon.png)');

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
// Deliberately never resolves @frontbase/console: the worker does not import
// it — it is served as Static Assets from console-dist/.
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

// A-24: pin the per-host EDGE bundles' library entries. Applied ONLY to the new
// emits (vercel.mjs / deno.mjs) — the verified worker/node/smoke builds keep
// their existing resolution untouched.
//   @libsql/client → the pure-web client (lib-esm/web.js: zero node: imports;
//     HRANA over fetch). Necessary for Deno: 0.17.4's exports map resolves the
//     `deno` condition to the NATIVE node entry (lib-esm/node.js), which
//     cannot run on Deno Deploy. file:/wss: are not web-client schemes — the
//     state-db resolver refuses them on edge hosts, and the per-host smoke
//     asserts the web build via its URL_SCHEME_NOT_SUPPORTED marker.
//   @upstash/qstash is deliberately NOT re-pinned. Its published ./cloudflare
//     subpath exports only the workflow `serve` helper — Receiver (inbound
//     signature verification, what queue/qstash.ts uses) lives in the main
//     entry. The main entry's dead local-dev helpers (a computed
//     `import(\`node:${t}\`)` inside startDevServer) ship in the SHARED chunk
//     that every entry imports — the worker artifact has always carried them,
//     the code path never executes on a fetch-only host, and esbuild leaves
//     computed dynamic imports unresolved (so no bundling error). Harmless
//     inert bytes on both new hosts, proven by the existing qstash receiver
//     suites.
// The pin resolves to the SAME physical package the bundle would otherwise
// import: the pnpm symlink inside @frontbase/edge-infra's own node_modules
// (the package that imports it), followed to its real store path — falling
// back to the example's own tree. NOT a .pnpm store walk: the store can hold
// several versions of one package (a transitive dep pins
// @libsql/client@0.14.0 alongside our 0.17.4) and readdir order is not
// version order. A missing pin fails the build loudly rather than silently
// resolving the native entry.
function linkedPkgDir(name, fromDir) {
    const link = join(fromDir, 'node_modules', ...name.split('/'));
    try { return realpathSync(link); } catch { return null; }
}
const EDGE_INFRA_PKG = join(REPO_ROOT, 'packages', 'edge-infra');
const LIBSQL_WEB = (() => {
    const d = linkedPkgDir('@libsql/client', EDGE_INFRA_PKG) ?? linkedPkgDir('@libsql/client', here);
    const p = d ? join(d, 'lib-esm', 'web.js') : null;
    return p && existsSync(p) ? p : null;
})();
const edgeAlias = {
    name: 'edge-alias',
    setup(build) {
        build.onResolve({ filter: /^@libsql\/client(\/.*)?$/ }, () => {
            if (!LIBSQL_WEB) throw new Error('edge-alias: @libsql/client/lib-esm/web.js not resolvable from @frontbase/edge-infra — cannot pin the web client for the edge bundles');
            return { path: LIBSQL_WEB };
        });
    },
};

// One emit shape for every self-contained edge artifact (the worker and the new
// per-host bundles): fully bundled (workspaceResolver), same virtual inlines,
// optional-dep stubs, minified ESM.
async function emitEdgeArtifact({ entry, outfile, extraPlugins = [], external }) {
    await esbuild.build({
        ...shared,
        entryPoints: [entry],
        outfile: join(here, outfile),
        minify: true,
        ...(external ? { external } : {}),
        plugins: [workspaceResolver, inlineSwPlugin, consoleShellPlugin, optionalStub, inlineClientPlugin, ...extraPlugins],
    });
}

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

// 2e. A-24: the per-host edge bundles — one self-contained ESM artifact per
//     fetch-only host, mirroring the worker emit above. Resolution changes are
//     SCOPED to these emits via edgeAlias (worker/node/smoke stay as verified).
//       vercel.mjs  — Vercel Edge function (api/cms.mjs is a byte copy below);
//                     platform browser, fully bundled, zero node: imports.
//       deno.mjs    — Deno Deploy entry; node:* stays EXTERNAL so the shared
//                     disk ASSETS shim's node:fs/path/url imports resolve via
//                     Deno's node compat at runtime (R1: keep the literal
//                     `node:` specifier form).
await emitEdgeArtifact({ entry: 'src/worker.ts', outfile: 'dist/worker.mjs' });
await emitEdgeArtifact({ entry: 'src/vercel.ts', outfile: 'dist/vercel.mjs', extraPlugins: [edgeAlias] });
await emitEdgeArtifact({ entry: 'src/deno.ts', outfile: 'dist/deno.mjs', extraPlugins: [edgeAlias], external: ['node:*'] });

// Vercel discovers functions under api/ at the PROJECT ROOT regardless of
// outputDirectory — stage the byte-identical copy the deploy consumes.
// src/vercel.ts exports `config = { runtime: 'edge' }` (verify point E3).
const API_STAGE = join(here, 'api');
mkdirSync(API_STAGE, { recursive: true });
copyFileSync(join(here, 'dist', 'vercel.mjs'), join(API_STAGE, 'cms.mjs'));

// Deno Deploy deploy root: the bundled entry + a deno.json (deployctl honors
// ignore files and console-dist/ is gitignored, so the root carries a FRESH,
// un-ignored console-dist copy — rebuilt every build, never stale).
const DENO_STAGE = join(here, 'deno-dist');
rmSync(DENO_STAGE, { recursive: true, force: true });
mkdirSync(join(DENO_STAGE, 'console-dist'), { recursive: true });
copyFileSync(join(here, 'dist', 'deno.mjs'), join(DENO_STAGE, 'deno.mjs'));
writeFileSync(join(DENO_STAGE, 'deno.json'), JSON.stringify({
    compilerOptions: { lib: ['deno.window', 'esnext'] },
}, null, '    ') + '\n');
cpSync(join(here, 'console-dist'), join(DENO_STAGE, 'console-dist'), { recursive: true });

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

// 5. A-24 node-side support emits (platform node, packages external — the
//    native libsql binding stays runtime-resolved):
//      state-db.mjs   — the resolver, importable by test/state-db.mjs
//                       (precedence matrix + no-leak gate).
//      smoke-host.mjs — the per-host smoke (src/smoke-host.ts): disk-shim
//                       contract, state-db wiring, artifact gates, and
//                       route-matrix parity for the NEW entries' handlers.
for (const [entry, outfile] of [['src/state-db.ts', 'state-db.mjs'], ['src/smoke-host.ts', 'smoke-host.mjs']]) {
    await esbuild.build({
        ...shared,
        platform: 'node',
        packages: 'external',
        target: 'node22',
        entryPoints: [entry],
        outfile: join(here, 'dist', outfile),
        minify: false,
        plugins: [inlineSwPlugin, consoleShellPlugin, inlineClientPlugin],
    });
}

const raw = statSync(join(here, 'dist', 'worker.mjs')).size;
const gz = gzipSync(readFileSync(join(here, 'dist', 'worker.mjs')), { level: 9 }).length;
const clientGz = gzipSync(CLIENT_SOURCE, { level: 9 }).length;
console.log('=== full-CMS CF worker artifact ===');
console.log(`worker.mjs min:      ${(raw / 1024).toFixed(1)} KB`);
console.log(`worker.mjs min+gzip: ${(gz / 1024).toFixed(1)} KB  (CF free limit 1024 KB — ${gz <= 1024 * 1024 ? 'PASS ✅' : 'FAIL ❌'})`);
console.log(`  includes inlined /sw.js: ${(SW_SOURCE.length / 1024).toFixed(1)} KB`);
console.log(`  includes inlined editing client: ${(CLIENT_SOURCE.length / 1024).toFixed(1)} KB (gzip: ${(clientGz / 1024).toFixed(1)} KB)`);

// A-24 per-host artifacts. The Vercel Edge limit is a HARD ceiling (fail the
// build); Deno Deploy's limit varies by plan — print-only, no invented gate.
const VERCEL_EDGE_LIMIT = 4 * 1024 * 1024;
const vercelGz = gzipSync(readFileSync(join(here, 'dist', 'vercel.mjs')), { level: 9 }).length;
const denoGz = gzipSync(readFileSync(join(here, 'dist', 'deno.mjs')), { level: 9 }).length;
console.log('=== per-host edge artifacts (A-24) ===');
console.log(`vercel.mjs min+gzip: ${(vercelGz / 1024).toFixed(1)} KB  (Vercel Edge limit 4096 KB — ${vercelGz <= VERCEL_EDGE_LIMIT ? 'PASS ✅' : 'FAIL ❌'})`);
console.log(`deno.mjs   min+gzip: ${(denoGz / 1024).toFixed(1)} KB  (Deno Deploy limit varies by plan — informational)`);
if (vercelGz > VERCEL_EDGE_LIMIT) {
    console.error('✗ dist/vercel.mjs exceeds the Vercel Edge bundle limit — shrink the bundle (see docs/STACK.md A-24) before deploying.');
    process.exit(1);
}

// Verification: Check that client bundle contains no prohibited symbols
const PROHIBITED = ['renderPage', 'globalRegistry', 'liquid', 'iconMap'];
const foundProhibited = PROHIBITED.filter(sym => CLIENT_SOURCE.includes(sym));
if (foundProhibited.length > 0) {
    console.log(`⚠ WARNING: Client bundle contains prohibited symbols: ${foundProhibited.join(', ')}`);
} else {
    console.log(`✅ Client bundle verification: NO prohibited symbols found`);
}
