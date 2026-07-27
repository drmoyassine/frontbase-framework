/**
 * CF-22 — console artifact validation, split by the inputs each check needs.
 *
 * Posture B keeps the product console's ~1.2 MB of hashed JS/CSS out of this repo.
 * The SPA *shell* (index.html) is a different thing: 1.7 KB of meta tags plus
 * references to those hashed filenames, which CONSOLE_PIN already names. It is
 * committed, so the deployable Worker can be built and smoke-tested from repo
 * contents alone. Only the bundles themselves require `pnpm run fetch:console`.
 *
 * Three levels, because a single all-or-nothing check forced the build to demand
 * files that by design are not in the repo — which is why CI could not build
 * examples/cf-full at all:
 *
 *   'pin'    pin JSON shape + agreement with contracts/PRODUCT_COMMIT.
 *            Inputs: committed files only. Used by the CI format gate.
 *   'shell'  + index.html exists, uses the expected base path, and references
 *            exactly the bundles CONSOLE_PIN names (neither more nor fewer).
 *            Inputs: committed files only. Used by the build.
 *   'deploy' + the real bundle bytes exist and hash to CONSOLE_PIN.sha256.
 *            Inputs: a fetched artifact. Used by the deploy path — nothing may
 *            reach Cloudflare without this.
 *
 * The levels are cumulative; each runs every check below it.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EXPECTED_BASE_PATH = '/frontbase-admin/';
const LEVELS = ['pin', 'shell', 'deploy'];

/** The pin digest covers every asset the shell loads, JS and CSS, in one sorted order. */
export function hashBundles(assetsDir, bundles) {
    const digest = createHash('sha256');
    for (const file of [...bundles].sort()) {
        digest.update(file).update('\0').update(readFileSync(join(assetsDir, file)));
    }
    return digest.digest('hex');
}

export function validateConsoleArtifact(rootDir, options = {}) {
    // `formatOnly` is the older spelling of level 'pin'; kept so existing callers work.
    const level = options.level ?? (options.formatOnly ? 'pin' : 'deploy');
    if (!LEVELS.includes(level)) throw new Error(`unknown validation level: ${level}`);
    const at = (l) => LEVELS.indexOf(level) >= LEVELS.indexOf(l);

    const consoleDist = resolve(rootDir, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');
    const pinPath = join(consoleDist, 'CONSOLE_PIN');
    if (!existsSync(pinPath)) throw new Error('console pin missing: run `pnpm run fetch:console`');

    let pin;
    try { pin = JSON.parse(readFileSync(pinPath, 'utf8')); }
    catch { throw new Error('console pin is not valid JSON: run `pnpm run fetch:console`'); }
    if (!/^[0-9a-f]{40}$/.test(pin.commit ?? '')) throw new Error('CONSOLE_PIN.commit must be a full 40-character git SHA');
    if (!/^[0-9a-f]{64}$/.test(pin.sha256 ?? '')) throw new Error('CONSOLE_PIN.sha256 must be a SHA-256 digest');
    const listOk = (v, ext) => Array.isArray(v) && v.every((f) => typeof f === 'string' && f.endsWith(ext));
    if (!listOk(pin.jsBundles, '.js') || pin.jsBundles.length === 0) {
        throw new Error('CONSOLE_PIN.jsBundles must contain at least one JavaScript bundle');
    }
    if (!listOk(pin.cssBundles, '.css')) throw new Error('CONSOLE_PIN.cssBundles must be a list of .css filenames');

    // Gate 0 — one source revision. The console bundle (CONSOLE_PIN.commit) and the
    // vendored contract (contracts/PRODUCT_COMMIT) MUST name the same product commit.
    // When they drift, the console is compiled against endpoint shapes the compat
    // backend does not serve — the setup-console cutover incident's failure mode.
    const productCommitPath = resolve(rootDir, 'packages', 'backend', 'contracts', 'PRODUCT_COMMIT');
    if (!existsSync(productCommitPath)) throw new Error('contracts/PRODUCT_COMMIT missing: run `node scripts/sync-contract.mjs`');
    const productCommit = readFileSync(productCommitPath, 'utf8').trim();
    if (productCommit !== pin.commit) {
        throw new Error(
            `pin disagreement — console is pinned to ${pin.commit.slice(0, 12)} but the contract is vendored ` +
            `from ${productCommit.slice(0, 12)}. Re-sync both to one product revision: ` +
            '`node scripts/sync-contract.mjs --commit <sha>` and `pnpm run fetch:console -- --commit <sha>`.',
        );
    }
    if (!at('shell')) return pin;

    // ---- shell: committed, so this holds in a fresh clone ----
    const indexPath = join(consoleRoot, 'index.html');
    if (!existsSync(indexPath)) throw new Error('console shell (frontbase-admin/index.html) missing — it is committed; a checkout should have it');
    const html = readFileSync(indexPath, 'utf8');
    if (!html.includes(EXPECTED_BASE_PATH)) throw new Error(`console base-path mismatch: expected ${EXPECTED_BASE_PATH}`);

    // The shell is committed but the bundles are not, so nothing else would notice
    // a shell that outlived the bundles it names. Require exact agreement with the
    // pin in both directions: a stale shell loads assets that were never deployed.
    const referenced = [...html.matchAll(/(?:src|href)=["']\/frontbase-admin\/assets\/([^"'?]+)["']/g)].map((m) => m[1]);
    const expected = [...pin.jsBundles, ...pin.cssBundles].sort();
    const actual = [...new Set(referenced)].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            'console shell references assets CONSOLE_PIN does not name (or omits ones it does): ' +
            `shell=[${actual.join(', ')}] pin=[${expected.join(', ')}]. Re-run \`pnpm run fetch:console\` and commit both.`,
        );
    }
    if (!at('deploy')) return pin;

    // ---- deploy: needs a fetched artifact ----
    const assetsDir = join(consoleRoot, 'assets');
    if (!existsSync(assetsDir)) throw new Error('console bundles missing: run `pnpm run fetch:console` before deploying');
    const onDisk = readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f)).sort();
    if (JSON.stringify(onDisk) !== JSON.stringify(expected)) {
        throw new Error('console bundle list does not match CONSOLE_PIN: run `pnpm run fetch:console`');
    }
    if (hashBundles(assetsDir, expected) !== pin.sha256) {
        throw new Error('console bundle hash does not match CONSOLE_PIN: run `pnpm run fetch:console`');
    }
    return pin;
}

/** True when the real (gitignored) bundle bytes are present. */
export function consoleBundlesPresent(rootDir) {
    return existsSync(resolve(rootDir, 'examples', 'cf-full', 'console-dist', 'frontbase-admin', 'assets'));
}
