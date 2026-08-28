/**
 * Console artifact guarantees, proven rather than assumed. Since consolidation
 * phase 1 the console is built from the in-repo @frontbase/console package and
 * staged by `pnpm console:build`; since phase 2 (A-23) the hydration bundle is
 * built from packages/hydrate and staged to console-dist/react/ by the cf-full
 * build. Nothing under console-dist/ is committed except .assetsignore.
 * `validateStagedConsole` is the independent judge for deploy, Docker and CI,
 * so these are the properties it must enforce:
 *
 *   1. A stage is only valid when the shell references EXACTLY the bundles on
 *      disk — both directions. A stale shell loading assets that were never
 *      staged (or bundles no shell can reach) must be a hard error, not a
 *      silent stale artifact.
 *   2. The builder SW must sit at the staged root (registerBuilderSw fetches
 *      ${BASE_URL}builder-sw.js — a hashed name would never be addressed).
 *   3. A cloud-mode build (base /admin/) must never validate as self-host.
 *   4. Stage hygiene: no retired pin file, no stray sourcemaps, .assetsignore
 *      intact.
 *   5. Deploy-grade checks (requireHydrate) fail closed without a staged
 *      hydration bundle — the Worker serves console-dist/react/ via Static
 *      Assets, and a missing bundle is a dead /static/react/hydrate.js.
 *
 * Every case runs against a throwaway fixture tree — the real repo is never touched.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStagedConsole } from '../../../scripts/console-pin.mjs';

const JS = 'index-AAAA1111-1700000000000.js';
const CSS = 'index-BBBB2222-1700000000000.css';

/** Build a fixture repo representing a complete, valid staged artifact. */
function fixture(opts = {}) {
    const root = mkdtempSync(join(tmpdir(), 'fb-console-artifact-'));
    const consoleDist = join(root, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');
    const assetsDir = join(consoleRoot, 'assets');
    mkdirSync(consoleRoot, { recursive: true });

    // The staged shell: meta tags + asset refs at the self-host base path.
    const base = opts.base ?? '/frontbase-admin/';
    const refs = opts.noRefs ? [] : [
        `<script type="module" src="${base}assets/${opts.shellJs ?? JS}"></script>`,
        `<link rel="stylesheet" href="${base}assets/${opts.shellCss ?? CSS}">`,
    ];
    writeFileSync(join(consoleRoot, 'index.html'),
        `<!doctype html><html><head>${refs.join('')}</head><body><div id="root"></div></body></html>`);

    // The staged bundles the shell names, plus the builder SW at the root.
    if (!opts.noAssets) {
        mkdirSync(assetsDir, { recursive: true });
        writeFileSync(join(assetsDir, JS), 'console.log(1)');
        writeFileSync(join(assetsDir, CSS), 'body{}');
        if (opts.extraDisk) writeFileSync(join(assetsDir, opts.extraDisk), 'console.log("orphan")');
        if (opts.sourcemap) writeFileSync(join(assetsDir, JS.replace(/\.js$/, '.js.map')), '{"version":3}');
        if (!opts.noBuilderSw) {
            writeFileSync(join(consoleRoot, 'builder-sw.js'),
                opts.smallBuilderSw ? 'console.log(1)' : `/* builder SW */\n${'x'.repeat(12 * 1024)}`);
        }
    }
    if (opts.assetsIgnore !== false) {
        writeFileSync(join(consoleDist, '.assetsignore'), opts.assetsIgnore ?? '**/*.map\n');
    }
    if (opts.strayPin) writeFileSync(join(consoleDist, 'CONSOLE_PIN'), '{}');
    // The staged hydration bundle: hydrate.js + one hashed entry css (the same
    // shape the cf-full build stages from packages/hydrate/dist).
    if (opts.stagedHydrate) {
        const reactDir = join(consoleDist, 'react');
        mkdirSync(reactDir, { recursive: true });
        if (opts.stagedHydrate !== 'css-only') writeFileSync(join(reactDir, 'hydrate.js'), '// hydration bundle');
        if (opts.stagedHydrate !== 'js-only') writeFileSync(join(reactDir, 'entry-XXXXYYYY.css'), 'body{}');
    }
    return root;
}

let failures = 0;
function expect(label, root, opts, shouldPass) {
    let err = null;
    try { validateStagedConsole(root, opts); } catch (e) { err = e; }
    const ok = shouldPass ? err === null : err !== null;
    if (ok) console.log(`  ✅ ${label}`);
    else { failures++; console.log(`  ❌ ${label} — ${shouldPass ? `threw: ${err.message}` : 'did NOT fail'}`); }
    rmSync(root, { recursive: true, force: true });
}

console.log('console artifact — staged-tree guarantees:');

// The happy path: a complete, consistent stage validates.
expect('complete staged artifact passes', fixture(), {}, true);

// 1. Shell ↔ disk agreement, both directions.
expect('shell naming a JS bundle that is not staged → RED', fixture({ shellJs: 'stale-9999.js' }), {}, false);
expect('shell naming a CSS bundle that is not staged → RED', fixture({ shellCss: 'stale-9999.css' }), {}, false);
expect('staged asset the shell never references → RED', fixture({ extraDisk: 'orphan-777.js' }), {}, false);
expect('shell with no asset references at all → RED', fixture({ noRefs: true }), {}, false);
expect('missing assets dir entirely → RED', fixture({ noAssets: true }), {}, false);

// 2. Builder SW at the staged root.
expect('missing builder-sw.js → RED', fixture({ noBuilderSw: true }), {}, false);
expect('undersized builder-sw.js (<10 KB) → RED', fixture({ smallBuilderSw: true }), {}, false);

// 3. Base path.
// A console built without base=/frontbase-admin resolves its assets at the site
// root, where the engine — not Static Assets — answers. Caught before it ships.
expect('shell built with the wrong base path → RED', fixture({ base: '/admin/' }), {}, false);

// 4. Stage hygiene: no retired pin, no stray sourcemaps, .assetsignore intact.
expect('leftover CONSOLE_PIN → RED', fixture({ strayPin: true }), {}, false);
expect('sourcemap staged under assets/ → RED', fixture({ sourcemap: true }), {}, false);
expect('.assetsignore missing → RED', fixture({ assetsIgnore: false }), {}, false);
expect('.assetsignore with wrong contents → RED', fixture({ assetsIgnore: 'CONSOLE_PIN\n**/*.map\n' }), {}, false);

// 5. Staged hydration bundle is opt-in and fail-closed (deploy/Docker paths).
expect('deploy-grade check without a staged hydration bundle → RED', fixture(), { requireHydrate: true }, false);
expect('deploy-grade check with the hydration bundle staged → GREEN', fixture({ stagedHydrate: true }), { requireHydrate: true }, true);
expect('hydrated stage without hydrate.js (css only) → RED', fixture({ stagedHydrate: 'css-only' }), { requireHydrate: true }, false);
expect('hydrated stage without entry css (js only) → RED', fixture({ stagedHydrate: 'js-only' }), { requireHydrate: true }, false);

console.log(failures === 0 ? '\nconsole artifact: PASS ✅' : `\nconsole artifact: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
