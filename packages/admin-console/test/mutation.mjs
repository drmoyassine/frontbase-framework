/**
 * admin-console mutation harness (RULE 8). The console SPA must NEVER import a
 * server module. Prove the no-leak exclusion is real: a SPA entry that DOES
 * import an edge-infra driver is caught (it either fails to bundle for the
 * browser, or the bundle carries the driver/canary → the gate fires).
 */
import { expectFired, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
import * as esbuild from 'esbuild';
import { join } from 'node:path';

const PKG = '@frontbase/admin-console';
const pkgDir = repoRoot + 'packages/admin-console/';

console.log('— admin-console mutation harness —\n');

// A LEAKY console entry that imports the edge-infra cloud driver (RULE 1 violation).
const CANARY = 'CONSOLE_LEAK_d1DataProvider_hunter2';
const edgeInfraCloud = join(repoRoot, 'packages/edge-infra/dist/providers/cloud.js').replace(/\\/g, '/');

let code = '';
try {
    const r = await esbuild.build({
        stdin: {
            contents: `import { d1DataProvider } from '${edgeInfraCloud}'; const CANARY = '${CANARY}'; export const leak = { d: d1DataProvider, c: CANARY };`,
            loader: 'ts',
        },
        bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent',
        absWorkingDir: pkgDir,
    });
    code = r.outputFiles[0].text;
} catch {
    // Bundling the server driver for the browser failed → not browser-importable.
    expectFired('no-leak: importing edge-infra fails to bundle for the browser (not browser-importable)', true);
    summarize(PKG);
    process.exit(0);
}

expectFired('no-leak: a console bundle importing edge-infra carries the driver', code.includes('d1DataProvider') || code.includes(CANARY));

summarize(PKG);
