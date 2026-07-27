/**
 * The console artifact is split: the SPA shell is committed, the hashed bundles
 * are not. That split is only safe if three things hold, so they are proven here
 * rather than assumed:
 *
 *   1. A bare checkout (shell, no bundles) BUILDS — level 'shell' passes.
 *      This is what CI needs; before the split, `pnpm -r build` could not run at all.
 *   2. A bare checkout CANNOT DEPLOY — level 'deploy' fails without bundle bytes.
 *      Serving a shell whose assets 404 is the failure this prevents.
 *   3. A shell that outlived its bundles is a HARD ERROR, not a silent stale
 *      artifact. The shell is committed and the bundles are not, so nothing else
 *      in the repo would notice them drifting apart.
 *
 * Every case runs against a throwaway fixture tree — the real repo is never touched.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConsoleArtifact, hashBundles } from '../../../scripts/console-pin.mjs';

const COMMIT = 'a'.repeat(40);
const JS = 'index-AAAA1111.js';
const CSS = 'index-BBBB2222.css';

/** Build a fixture repo. `opts.bundles` false → simulate a bare checkout. */
function fixture(opts = {}) {
    const root = mkdtempSync(join(tmpdir(), 'fb-console-pin-'));
    const consoleDist = join(root, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');
    const assetsDir = join(consoleRoot, 'assets');
    mkdirSync(consoleRoot, { recursive: true });
    mkdirSync(join(root, 'packages', 'backend', 'contracts'), { recursive: true });
    writeFileSync(join(root, 'packages', 'backend', 'contracts', 'PRODUCT_COMMIT'), (opts.productCommit ?? COMMIT) + '\n');

    const js = opts.shellJs ?? JS;
    const css = opts.shellCss ?? CSS;
    const base = opts.base ?? '/frontbase-admin/';
    writeFileSync(join(consoleRoot, 'index.html'),
        '<!doctype html><html><head>' +
        `<script type="module" src="${base}assets/${js}"></script>` +
        `<link rel="stylesheet" href="${base}assets/${css}">` +
        '</head><body><div id="root"></div></body></html>');

    let sha256 = 'f'.repeat(64);
    if (opts.bundles !== false) {
        mkdirSync(assetsDir, { recursive: true });
        writeFileSync(join(assetsDir, JS), opts.jsBytes ?? 'console.log(1)');
        writeFileSync(join(assetsDir, CSS), 'body{}');
        sha256 = hashBundles(assetsDir, [JS, CSS]);
        if (opts.tamperAfterHash) writeFileSync(join(assetsDir, JS), 'console.log("tampered")');
    }
    writeFileSync(join(consoleDist, 'CONSOLE_PIN'), JSON.stringify({
        commit: COMMIT, sha256: opts.sha256 ?? sha256, jsBundles: [JS], cssBundles: [CSS],
    }, null, 2));
    return root;
}

let failures = 0;
function expect(label, root, level, shouldPass) {
    let err = null;
    try { validateConsoleArtifact(root, { level }); } catch (e) { err = e; }
    const ok = shouldPass ? err === null : err !== null;
    if (ok) console.log(`  ✅ ${label}`);
    else { failures++; console.log(`  ❌ ${label} — ${shouldPass ? `threw: ${err.message}` : 'did NOT fail'}`); }
    rmSync(root, { recursive: true, force: true });
}

console.log('console artifact split — guarantees:');

// 1. a bare checkout builds
expect("bare checkout (no bundles) passes level 'shell' — CI can build", fixture({ bundles: false }), 'shell', true);

// 2. a bare checkout cannot deploy
expect("bare checkout FAILS level 'deploy' — cannot ship a shell with 404 assets", fixture({ bundles: false }), 'deploy', false);

// 3. shell/bundle drift is a hard error, both directions
expect('shell naming a JS bundle the pin does not list → RED', fixture({ shellJs: 'stale-9999.js' }), 'shell', false);
expect('shell naming a CSS bundle the pin does not list → RED', fixture({ shellCss: 'stale-9999.css' }), 'shell', false);
// A console built without base=/frontbase-admin resolves its assets at the site
// root, where the engine — not Static Assets — answers. Caught before it ships.
expect('shell built with the wrong base path → RED', fixture({ base: '/' }), 'shell', false);

// 4. bundle bytes are pinned, not just named
expect('bundle bytes tampered after hashing → RED at deploy', fixture({ tamperAfterHash: true }), 'deploy', false);

// 5. Gate 0 — one source revision
expect('CONSOLE_PIN.commit != contracts/PRODUCT_COMMIT → RED', fixture({ productCommit: 'b'.repeat(40) }), 'pin', false);

// 6. the happy path still passes end to end
expect("complete artifact passes level 'deploy'", fixture(), 'deploy', true);

console.log(failures === 0 ? '\nconsole-pin: PASS ✅' : `\nconsole-pin: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
