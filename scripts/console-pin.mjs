/**
 * Console artifact validation — the staged console-dist/ tree built from the
 * in-repo @frontbase/console package (`pnpm console:build`).
 *
 * History: this module used to validate a CONSOLE_PIN provenance file naming
 * the product-repo commit the console bundles were vendored from, and — after
 * consolidation phase 1 — the vendored product contract hash (the surviving
 * half of the old Gate 0). Consolidation phase 2 (A-23, 2026-08-28) inverted
 * the contract: the specs under packages/backend/contracts/ are
 * framework-owned (`contracts:check` staleness is their guard) and the
 * hydration bundle is built in-repo (packages/hydrate) instead of vendored and
 * byte-patched. What remains here is purely structural: the staged shell must
 * reference exactly the bundles on disk (both directions), the builder SW
 * must sit at the staged root, nothing stale may linger, and — deploy-grade —
 * the staged hydration bundle must be present. `pnpm console:build` runs the
 * same checks after staging, so a green build implies a green validate; this
 * module remains the independent judge for deploy, Docker and CI.
 *
 * Options:
 *   { requireHydrate: true }  additionally require the staged hydration bundle
 *                             (console-dist/react/hydrate.js + an entry-*.css)
 *                             — used by the deploy and Docker paths, because
 *                             without it the deployment 404s at
 *                             /static/react/hydrate.js (dead client
 *                             hydration). cf-full's build stages those files
 *                             itself right after its own (non-deploy-grade)
 *                             validation, so the build-time call omits this.
 *
 * Legacy call sites may pass { level: 'pin'|'shell'|'deploy' },
 * { contractOnly: true } or { formatOnly: true }; every retired spelling
 * collapses into the single staged-artifact check (requireHydrate is set only
 * by the explicit option).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EXPECTED_BASE_PATH = '/frontbase-admin/';

/** True when a hydration bundle is staged at console-dist/react/ (deploy-grade pre-check). */
export function hydrateStagedPresent(rootDir) {
    const reactDir = resolve(rootDir, 'examples', 'cf-full', 'console-dist', 'react');
    if (!existsSync(join(reactDir, 'hydrate.js'))) return false;
    return readdirSync(reactDir).some((f) => /^entry-.+\.css$/.test(f));
}

export function validateStagedConsole(rootDir, options = {}) {
    const requireHydrate = options.requireHydrate ?? false;
    const consoleDist = resolve(rootDir, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');

    // ---- 1. Staged shell + base path ----
    const indexPath = join(consoleRoot, 'index.html');
    if (!existsSync(indexPath)) throw new Error('console shell (console-dist/frontbase-admin/index.html) missing: run `pnpm console:build`');
    const html = readFileSync(indexPath, 'utf8');
    if (!html.includes(EXPECTED_BASE_PATH)) {
        throw new Error(
            `console base-path mismatch: expected ${EXPECTED_BASE_PATH} — was the console built with ` +
            'VITE_DEPLOYMENT_MODE=cloud? Re-run `pnpm console:build` (its build script pins --mode community).',
        );
    }

    // ---- 2. Two-way shell ↔ disk agreement ----
    // The stage is a build output now, so nothing pins the expected bundle
    // names — agreement with reality is the guarantee: a stale shell loading
    // assets that are no longer staged (or bundles no shell can reach) must
    // both fail, in both directions.
    const referenced = [...new Set(
        [...html.matchAll(/(?:src|href)=["']\/frontbase-admin\/assets\/([^"'?]+)["']/g)].map((m) => m[1]),
    )].sort();
    if (referenced.length === 0) {
        throw new Error('console shell references no /frontbase-admin/assets/ bundles — not a vite build output. Re-run `pnpm console:build`.');
    }
    const assetsDir = join(consoleRoot, 'assets');
    if (!existsSync(assetsDir)) throw new Error('console bundles missing: run `pnpm console:build`');
    const onDisk = readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f)).sort();
    const onlyInShell = referenced.filter((f) => !onDisk.includes(f));
    const onlyOnDisk = onDisk.filter((f) => !referenced.includes(f));
    if (onlyInShell.length > 0 || onlyOnDisk.length > 0) {
        throw new Error(
            'console shell and staged bundles disagree — stale or partial stage: ' +
            `shell-only=[${onlyInShell.join(', ')}] disk-only=[${onlyOnDisk.join(', ')}]. Re-run \`pnpm console:build\`.`,
        );
    }

    // ---- 3. builder-sw.js at the staged root ----
    // registerBuilderSw.ts registers `${import.meta.env.BASE_URL}builder-sw.js`
    // — a hashed assets/ name would never be addressed, so the SW must sit at
    // the dist root. Size floor catches a silently-truncated esbuild pass.
    const swPath = join(consoleRoot, 'builder-sw.js');
    if (!existsSync(swPath)) {
        throw new Error('builder-sw.js missing from the staged console root (registerBuilderSw fetches ${BASE_URL}builder-sw.js). Re-run `pnpm console:build`.');
    }
    if (statSync(swPath).size <= 10 * 1024) {
        throw new Error('builder-sw.js is suspiciously small (<10 KB) — the esbuild SW pass likely failed. Re-run `pnpm console:build`.');
    }

    // ---- 4. .assetsignore — wrangler must not upload sourcemaps ----
    const assetsIgnorePath = join(consoleDist, '.assetsignore');
    if (!existsSync(assetsIgnorePath)) throw new Error('console-dist/.assetsignore missing: run `pnpm console:build`');
    if (readFileSync(assetsIgnorePath, 'utf8') !== '**/*.map\n') {
        throw new Error('console-dist/.assetsignore has unexpected contents — expected exactly "**/*.map\\n". Re-run `pnpm console:build`.');
    }

    // ---- 5. No leftovers: retired pin file, stray sourcemaps ----
    if (existsSync(join(consoleDist, 'CONSOLE_PIN'))) {
        throw new Error('stray CONSOLE_PIN found — the pin retired with the product fetch; delete it (wrangler would upload it).');
    }
    const maps = readdirSync(assetsDir).filter((f) => f.endsWith('.map'));
    if (maps.length > 0) {
        throw new Error(`sourcemaps staged (${maps.join(', ')}) — vite runs with sourcemap: false; rebuild. Re-run \`pnpm console:build\`.`);
    }

    // ---- 6. Staged hydration bundle (deploy/Docker only) ----
    if (requireHydrate && !hydrateStagedPresent(rootDir)) {
        throw new Error(
            'the hydration bundle is not staged (console-dist/react/hydrate.js + entry-*.css) — the deployment would ' +
            '404 at /static/react/hydrate.js (dead client hydration). Run any examples/cf-full build ' +
            '(e.g. `pnpm --filter @frontbase/example-cf-full build`), which stages it from packages/hydrate.',
        );
    }

    return {
        jsBundles: onDisk.filter((f) => f.endsWith('.js')),
        cssBundles: onDisk.filter((f) => f.endsWith('.css')),
    };
}
