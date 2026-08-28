#!/usr/bin/env node
/**
 * Build the in-repo console and stage the artifact — the replacement for the
 * retired product-repo fetch (`pnpm run fetch:console`), consolidation
 * phase 1. The console source lives at packages/console; its vite build
 * (pinned to `--mode community`, i.e. self-host base `/frontbase-admin/`)
 * produces dist/, and this script stages it to
 * examples/cf-full/console-dist/frontbase-admin/ byte-for-byte the way
 * fetch-console.mjs used to.
 *
 * Usage:
 *   pnpm console:build                 # build + stage + verify
 *   pnpm console:build -- --skip-build # stage an existing packages/console/dist
 *                                      # (cf-full's build.mjs uses this after
 *                                      # `pnpm -r build` already built it)
 *
 * The stage is a wipe, not a merge: stale hashed chunks from a previous build
 * must not survive (Static Assets would happily serve them forever), and the
 * wipe orphans console-dist/react/ — cf-full's build re-stages it from
 * packages/hydrate/dist afterwards.
 *
 * Nothing here is committed: everything under console-dist/ is gitignored
 * except .assetsignore (tracked). No CONSOLE_PIN — the pin retired with the
 * product fetch; validation is structural, via scripts/console-pin.mjs.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagedConsole } from './console-pin.mjs';

function fail(message) {
    console.error(`✗ ${message}`);
    process.exit(1);
}

const skipBuild = process.argv.slice(2).includes('--skip-build');
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consolePkg = join(scriptRoot, 'packages', 'console');
const consoleDist = join(scriptRoot, 'examples', 'cf-full', 'console-dist');
const dest = join(consoleDist, 'frontbase-admin');

// ---- 1. Build (unless the caller knows dist is fresh) ----
if (!skipBuild) {
    const r = spawnSync('pnpm', ['--filter', '@frontbase/console', 'build'], {
        cwd: scriptRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    if (r.status !== 0) fail('console build failed — fix the error above before staging.');
}
const builtIndex = join(consolePkg, 'dist', 'index.html');
if (!existsSync(builtIndex)) fail('console build produced no dist/index.html — run `pnpm --filter @frontbase/console build` first.');

// ---- 2. Base-path guard on the build output itself ----
// Same guard fetch-console.mjs enforced: a cloud-mode build (base /admin/)
// must never reach the self-host stage.
const html = readFileSync(builtIndex, 'utf8');
if (!/(?:src|href)=["']\/frontbase-admin\//.test(html)) {
    fail('console bundle base-path mismatch: dist/index.html does not reference /frontbase-admin/ — was it built without --mode community?');
}

// ---- 3. Wipe + stage ----
rmSync(consoleDist, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(consolePkg, 'dist'), dest, { recursive: true });

// ---- 4. .assetsignore (tracked) — wrangler must not upload sourcemaps ----
writeFileSync(join(consoleDist, '.assetsignore'), '**/*.map\n');

// ---- 5. Verify the stage with the same validator deploy/Docker/CI use ----
let summary;
try {
    summary = validateStagedConsole(scriptRoot);
} catch (error) {
    fail(`${error.message}`);
}

// ---- 6. Inventory — every chunk shares the build's 13-digit timestamp, so it
//         identifies a build at a glance ----
const tsMatch = summary.jsBundles[0]?.match(/-(\d{13})\.js$/);
console.log(`✓ staged ${summary.jsBundles.length} js + ${summary.cssBundles.length} css bundles` +
    (tsMatch ? ` (build ${tsMatch[1]})` : ''));
console.log('  → examples/cf-full/console-dist/frontbase-admin (untracked; commit nothing under console-dist/)');
