#!/usr/bin/env node
/**
 * `pnpm console:check` — validate the staged console artifact without
 * deploying anything. See scripts/console-pin.mjs.
 *
 *   (no flags)         full staged-artifact check — requires `pnpm console:build`.
 *   --require-hydrate  also require the staged hydration bundle
 *                      (console-dist/react/hydrate.js + entry-*.css) — the
 *                      deploy/Docker grade.
 *
 * Historical spellings --contract-only/--format-only retired with the product
 * contract pins (consolidation A-23): there is no vendored contract to hash
 * any more.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagedConsole } from './console-pin.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireHydrate = process.argv.slice(2).includes('--require-hydrate');

try {
    const { jsBundles, cssBundles } = validateStagedConsole(root, { requireHydrate });
    console.log(`console artifact: PASS (${jsBundles.length} js + ${cssBundles.length} css bundles staged${requireHydrate ? ' + hydration bundle' : ''})`);
} catch (error) {
    console.error(`console artifact: FAIL — ${error.message}`);
    process.exit(1);
}
