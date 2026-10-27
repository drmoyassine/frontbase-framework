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
 * A-25 Phase 4 adds `--cloud`: after the community stage, a SECOND vite build
 * (`--mode cloud`, base `/admin/`) is produced and staged to
 * console-dist/admin/ — the platform console the cloud app host serves at
 * /admin. The stages are independent trees under console-dist/ (wrangler's
 * Static Assets serves both), each validated by scripts/console-pin.mjs: the
 * cloud stage is validated whenever present, so a stale or partial cloud
 * stage fails a default build too.
 *
 * Usage:
 *   pnpm console:build                 # build + stage + verify (self-host)
 *   pnpm console:build -- --cloud      # also build + stage the cloud console
 *   pnpm console:build -- --skip-build # stage an existing packages/console/dist
 *                                      # (cf-full's build.mjs uses this after
 *                                      # `pnpm -r build` already built it)
 *                                      # — incompatible with --cloud: that
 *                                      # needs BOTH builds, and dist/ only
 *                                      # ever holds one.
 *
 * The stage is a wipe, not a merge: stale hashed chunks from a previous build
 * must not survive (Static Assets would happily serve them forever), and the
 * wipe orphans console-dist/react/ — cf-full's build re-stages it from
 * packages/hydrate/dist afterwards. Under --cloud it also orphans any
 * previous console-dist/admin/ (restaged below).
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

const argv = process.argv.slice(2);
const skipBuild = argv.includes('--skip-build');
const cloud = argv.includes('--cloud');
if (cloud && skipBuild) {
    fail('--cloud stages TWO builds (community + cloud); --skip-build can only restage the one dist/ holds. Run `pnpm console:build -- --cloud` without it.');
}
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const consolePkg = join(scriptRoot, 'packages', 'console');
const consoleDist = join(scriptRoot, 'examples', 'cf-full', 'console-dist');
const dest = join(consoleDist, 'frontbase-admin');

/** Run one pnpm build inside the console package. */
function buildConsole(viteArgs, label) {
    const r = spawnSync('pnpm', ['--filter', '@frontbase/console', 'run', ...viteArgs], {
        cwd: scriptRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });
    if (r.status !== 0) fail(`${label} failed — fix the error above before staging.`);
}

// ---- 1. Community build (unless the caller knows dist is fresh) ----
if (!skipBuild) {
    buildConsole(['build'], 'console build');
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

// ---- 3. Wipe + stage the self-host shell ----
// maxRetries: this repo lives under OneDrive, which holds transient handles on
// directories mid-sync — a bare rmSync intermittently dies with EPERM on
// Windows. Node retries EPERM/EBUSY with linear backoff under these options.
rmSync(consoleDist, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
mkdirSync(dest, { recursive: true });
cpSync(join(consolePkg, 'dist'), dest, { recursive: true });

// ---- 4. .assetsignore (tracked) — wrangler must not upload sourcemaps ----
writeFileSync(join(consoleDist, '.assetsignore'), '**/*.map\n');

// ---- 5. Verify the self-host stage (deploy/Docker/CI's validator) ----
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

// ---- 7. Cloud console (A-25 Phase 4): second vite build, staged AFTER the
//         community stage. dist/ only ever holds one build, so this runs
//         after the self-host stage is already copied out. ----
if (cloud) {
    buildConsole(['build:cloud'], 'cloud console build (vite --mode cloud)');

    const cloudIndex = join(consolePkg, 'dist', 'index.html');
    if (!existsSync(cloudIndex)) fail('cloud build produced no dist/index.html.');
    const cloudHtml = readFileSync(cloudIndex, 'utf8');
    if (!/(?:src|href)=["']\/admin\//.test(cloudHtml)) {
        fail('cloud bundle base-path mismatch: dist/index.html does not reference /admin/ — was it not built with --mode cloud? (build:cloud must follow build; both share dist/.)');
    }

    const cloudDest = join(consoleDist, 'admin');
    mkdirSync(cloudDest, { recursive: true });
    cpSync(join(consolePkg, 'dist'), cloudDest, { recursive: true });

    // Re-validate: the cloud stage now exists, so the validator's optional
    // cloud section (shell↔disk agreement at /admin/assets/, builder SW,
    // hygiene) runs against it.
    let cloudSummary;
    try {
        cloudSummary = validateStagedConsole(scriptRoot);
    } catch (error) {
        fail(`${error.message}`);
    }
    const cloudTs = cloudSummary.cloudBundles[0]?.match(/-(\d{13})\.js$/);
    console.log(`✓ staged cloud console: ${cloudSummary.cloudBundles.length} js + ${cloudSummary.cloudCssBundles.length} css bundles` +
        (cloudTs ? ` (build ${cloudTs[1]})` : ''));
    console.log('  → examples/cf-full/console-dist/admin (untracked; served at /admin by the cloud worker)');
}
