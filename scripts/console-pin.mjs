/**
 * Console artifact validation — the staged console-dist/ tree built from the
 * in-repo @frontbase/console package (`pnpm console:build`).
 *
 * History: this module used to validate a CONSOLE_PIN provenance file naming
 * the product-repo commit the console bundles were vendored from (posture B,
 * `pnpm run fetch:console`). The console moved into this workspace on
 * 2026-08-28 (consolidation phase 1): the artifact is now built from source,
 * the pin is retired, and validation is purely structural — the staged shell
 * must reference exactly the bundles on disk (both directions), the builder SW
 * must be present at the staged root, and nothing stale may linger in the
 * stage. `pnpm console:build` runs the same checks after staging, so a green
 * build implies a green validate; this module remains the independent judge
 * for deploy, Docker and CI.
 *
 * The contract guard below is the surviving half of the old Gate 0 (which
 * compared CONSOLE_PIN.commit with contracts/PRODUCT_COMMIT). The vendored
 * contract is STILL product-derived, so detecting in-place edits of
 * openapi.community.json remains load-bearing — and this check is its only
 * enforcer: contracts:check verifies spec staleness against a product
 * checkout, contracts:diff verifies op coverage, but neither re-hashes the
 * committed bytes.
 *
 * Options:
 *   { contractOnly: true }        run only the contract guard — for CI jobs
 *                                 that have not built/staged the console.
 *   { requireHydrateVendor: true } additionally require
 *                                 examples/cf-full/public/react/hydrate.vendor.js —
 *                                 used by the deploy and Docker paths, because
 *                                 patch-hydrate.mjs SILENTLY SKIPS when the
 *                                 vendor is absent (it must, so fresh clones
 *                                 can build), which would ship a worker whose
 *                                 /static/react/hydrate.js 404s — dead client
 *                                 hydration, green build.
 *
 * Legacy call sites may pass { level: 'pin'|'shell'|'deploy' } or
 * { formatOnly: true }; the levels collapsed when the pin retired — every
 * spelling now runs the same staged-artifact check.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EXPECTED_BASE_PATH = '/frontbase-admin/';

export function hydrateVendorPresent(rootDir) {
    return existsSync(resolve(rootDir, 'examples', 'cf-full', 'public', 'react', 'hydrate.vendor.js'));
}

/** True when any staged console bundles exist at all (pre-check before deploy). */
export function consoleBundlesPresent(rootDir) {
    return existsSync(resolve(rootDir, 'examples', 'cf-full', 'console-dist', 'frontbase-admin', 'assets'));
}

export function validateStagedConsole(rootDir, options = {}) {
    const contractOnly = options.contractOnly ?? false;
    const requireHydrateVendor = options.requireHydrateVendor ?? false;
    const consoleDist = resolve(rootDir, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');

    // ---- 1. Contract guard (the old Gate 0's surviving half) ----
    const contractsDir = resolve(rootDir, 'packages', 'backend', 'contracts');
    const productCommitPath = join(contractsDir, 'PRODUCT_COMMIT');
    if (!existsSync(productCommitPath)) throw new Error('contracts/PRODUCT_COMMIT missing: run `node scripts/sync-contract.mjs`');
    const productCommit = readFileSync(productCommitPath, 'utf8').trim();
    const shaPath = join(contractsDir, 'CONTRACT_SHA256');
    const contractPath = join(contractsDir, 'openapi.community.json');
    if (!existsSync(shaPath) || !existsSync(contractPath)) {
        throw new Error('vendored contract files missing: run `node scripts/sync-contract.mjs`');
    }
    const recorded = readFileSync(shaPath, 'utf8').trim();
    const actual = createHash('sha256')
        .update(readFileSync(contractPath, 'utf8').replace(/\r\n/g, '\n'))
        .digest('hex');
    if (recorded !== actual) {
        throw new Error(
            'vendored contract does not match CONTRACT_SHA256 — it was edited in place after being ' +
            `vendored from ${productCommit.slice(0, 12)}, so nothing describes it any more. ` +
            'Re-run `node scripts/sync-contract.mjs` against a committed product revision.',
        );
    }
    if (contractOnly) return { productCommit };

    // ---- 2. Staged shell + base path ----
    const indexPath = join(consoleRoot, 'index.html');
    if (!existsSync(indexPath)) throw new Error('console shell (console-dist/frontbase-admin/index.html) missing: run `pnpm console:build`');
    const html = readFileSync(indexPath, 'utf8');
    if (!html.includes(EXPECTED_BASE_PATH)) {
        throw new Error(
            `console base-path mismatch: expected ${EXPECTED_BASE_PATH} — was the console built with ` +
            'VITE_DEPLOYMENT_MODE=cloud? Re-run `pnpm console:build` (its build script pins --mode community).',
        );
    }

    // ---- 3. Two-way shell ↔ disk agreement ----
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

    // ---- 4. builder-sw.js at the staged root ----
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

    // ---- 5. .assetsignore — wrangler must not upload sourcemaps ----
    const assetsIgnorePath = join(consoleDist, '.assetsignore');
    if (!existsSync(assetsIgnorePath)) throw new Error('console-dist/.assetsignore missing: run `pnpm console:build`');
    if (readFileSync(assetsIgnorePath, 'utf8') !== '**/*.map\n') {
        throw new Error('console-dist/.assetsignore has unexpected contents — expected exactly "**/*.map\\n". Re-run `pnpm console:build`.');
    }

    // ---- 6. No leftovers: retired pin file, stray sourcemaps ----
    if (existsSync(join(consoleDist, 'CONSOLE_PIN'))) {
        throw new Error('stray CONSOLE_PIN found — the pin retired with the product fetch; delete it (wrangler would upload it).');
    }
    const maps = readdirSync(assetsDir).filter((f) => f.endsWith('.map'));
    if (maps.length > 0) {
        throw new Error(`sourcemaps staged (${maps.join(', ')}) — vite runs with sourcemap: false; rebuild. Re-run \`pnpm console:build\`.`);
    }

    // ---- 7. Hydrate vendor (deploy/Docker only) ----
    if (requireHydrateVendor && !hydrateVendorPresent(rootDir)) {
        throw new Error(
            'examples/cf-full/public/react/hydrate.vendor.js is absent — patch-hydrate.mjs would silently skip and the ' +
            'deployment would 404 at /static/react/hydrate.js (dead client hydration). Run `pnpm fetch:hydrate`.',
        );
    }

    return {
        productCommit,
        jsBundles: onDisk.filter((f) => f.endsWith('.js')),
        cssBundles: onDisk.filter((f) => f.endsWith('.css')),
    };
}

/**
 * Back-compat alias: the pre-consolidation name. `level`/`formatOnly` collapse
 * into the single staged check (see header).
 */
export function validateConsoleArtifact(rootDir, options = {}) {
    const contractOnly = options.contractOnly ?? Boolean(options.level === 'pin' || options.formatOnly);
    return validateStagedConsole(rootDir, {
        contractOnly,
        requireHydrateVendor: options.requireHydrateVendor ?? options.level === 'deploy',
    });
}
