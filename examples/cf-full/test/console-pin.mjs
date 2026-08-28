/**
 * Console artifact guarantees, proven rather than assumed. Since consolidation
 * phase 1 the console is built from the in-repo @frontbase/console package and
 * staged by `pnpm console:build` — nothing under console-dist/ is committed
 * except .assetsignore. `validateStagedConsole` is the independent judge for
 * deploy, Docker and CI, so these are the properties it must enforce:
 *
 *   1. A stage is only valid when the shell references EXACTLY the bundles on
 *      disk — both directions. A stale shell loading assets that were never
 *      staged (or bundles no shell can reach) must be a hard error, not a
 *      silent stale artifact.
 *   2. The builder SW must sit at the staged root (registerBuilderSw fetches
 *      ${BASE_URL}builder-sw.js — a hashed name would never be addressed).
 *   3. A cloud-mode build (base /admin/) must never validate as self-host.
 *   4. The vendored contract must still hash-match CONTRACT_SHA256 — the
 *      surviving half of the old Gate 0, and the only enforcer of it.
 *   5. Deploy-grade checks (requireHydrateVendor) fail closed without the
 *      hydrate vendor, because patch-hydrate.mjs silently skips without it.
 *
 * Every case runs against a throwaway fixture tree — the real repo is never touched.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateStagedConsole } from '../../../scripts/console-pin.mjs';

const COMMIT = 'a'.repeat(40);
const JS = 'index-AAAA1111-1700000000000.js';
const CSS = 'index-BBBB2222-1700000000000.css';

function contractHash(content) {
    return createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');
}

/** Build a fixture repo representing a complete, valid staged artifact. */
function fixture(opts = {}) {
    const root = mkdtempSync(join(tmpdir(), 'fb-console-artifact-'));
    const consoleDist = join(root, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');
    const assetsDir = join(consoleRoot, 'assets');
    mkdirSync(consoleRoot, { recursive: true });
    mkdirSync(join(root, 'packages', 'backend', 'contracts'), { recursive: true });

    // Contract files: PRODUCT_COMMIT + openapi bytes whose sha256 matches CONTRACT_SHA256.
    writeFileSync(join(root, 'packages', 'backend', 'contracts', 'PRODUCT_COMMIT'), COMMIT + '\n');
    const openapi = JSON.stringify({ openapi: '3.0.0', info: { title: 'fixture' } }, null, 2);
    writeFileSync(join(root, 'packages', 'backend', 'contracts', 'openapi.community.json'), openapi);
    writeFileSync(join(root, 'packages', 'backend', 'contracts', 'CONTRACT_SHA256'),
        (opts.recordedSha ?? contractHash(openapi)) + '\n');

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
    if (opts.hydrateVendor) {
        mkdirSync(join(root, 'examples', 'cf-full', 'public', 'react'), { recursive: true });
        writeFileSync(join(root, 'examples', 'cf-full', 'public', 'react', 'hydrate.vendor.js'), '// vendor');
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

// 4. Vendored-contract integrity (the old Gate 0's surviving half).
expect('CONTRACT_SHA256 tampered (recorded ≠ actual bytes) → RED', fixture({ recordedSha: 'f'.repeat(64) }), {}, false);
const missingContract = fixture({ noAssets: true });
rmSync(join(missingContract, 'packages', 'backend', 'contracts', 'openapi.community.json'));
expect('missing vendored contract file → RED', missingContract, {}, false);
expect('--contract-only mode passes without any staged console', fixture({ noAssets: true, assetsIgnore: false }), { contractOnly: true }, true);
expect('--contract-only still catches a tampered contract', fixture({ recordedSha: 'f'.repeat(64), noAssets: true, assetsIgnore: false }), { contractOnly: true }, false);

// 5. Stage hygiene: no retired pin, no stray sourcemaps, .assetsignore intact.
expect('leftover CONSOLE_PIN → RED', fixture({ strayPin: true }), {}, false);
expect('sourcemap staged under assets/ → RED', fixture({ sourcemap: true }), {}, false);
expect('.assetsignore missing → RED', fixture({ assetsIgnore: false }), {}, false);
expect('.assetsignore with wrong contents → RED', fixture({ assetsIgnore: 'CONSOLE_PIN\n**/*.map\n' }), {}, false);

// 6. Hydrate vendor is opt-in and fail-closed (deploy/Docker paths).
expect('deploy-grade check without hydrate vendor → RED', fixture(), { requireHydrateVendor: true }, false);
expect('deploy-grade check with hydrate vendor staged → GREEN', fixture({ hydrateVendor: true }), { requireHydrateVendor: true }, true);

console.log(failures === 0 ? '\nconsole artifact: PASS ✅' : `\nconsole artifact: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
