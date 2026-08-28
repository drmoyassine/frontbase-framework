#!/usr/bin/env node
/**
 * `pnpm console:check` — validate the staged console artifact (and the vendored
 * contract hash) without deploying anything. See scripts/console-pin.mjs.
 *
 *   (no flags)        full staged-artifact check — requires `pnpm console:build`.
 *   --contract-only   vendored-contract hash only — for jobs that have not
 *                     built/staged the console.
 *   --format-only     retired spelling of --contract-only (it used to validate
 *                     the committed CONSOLE_PIN's shape); tolerated for one
 *                     release so old invocations keep passing.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagedConsole } from './console-pin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const contractOnly = argv.includes('--contract-only') || argv.includes('--format-only');

try {
    if (contractOnly) {
        const { productCommit } = validateStagedConsole(root, { contractOnly: true });
        console.log(`console contract guard: PASS (vendored from ${productCommit.slice(0, 12)})`);
    } else {
        const { jsBundles, cssBundles } = validateStagedConsole(root);
        console.log(`console artifact: PASS (${jsBundles.length} js + ${cssBundles.length} css bundles staged)`);
    }
} catch (error) {
    console.error(`console artifact: FAIL — ${error.message}`);
    process.exit(1);
}
