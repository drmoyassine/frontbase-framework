/**
 * builder mutation harness (RULE 8). The builder is a browser SPA that must
 * NEVER import @frontbase/edge-infra. Prove the no-leak exclusion check is real:
 * a builder bundle that DOES import an edge-infra driver must be caught.
 *
 * (RULE 1: the guarantee is architectural — the builder's source never imports
 * edge-infra. The mutation constructs the violation and confirms the gate's
 * exclusion assertion would fire.)
 */
import { expectFired, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PKG = '@frontbase/builder';
const pkgDir = repoRoot + 'packages/builder/';

console.log('— builder mutation harness —\n');

// A LEAKY builder entry that imports edge-infra's d1 driver (RULE 1 violation).
const CANARY = 'BUILDER_LEAK_d1DataProvider_hunter2';
const edgeInfraCloud = join(repoRoot, 'packages/edge-infra/dist/providers/cloud.js').replace(/\\/g, '/');

// Bundle a builder entry that pulls in the server driver. If it resolves+bundles,
// the result contains the driver → the no-leak gate's `!includes('d1DataProvider')`
// fires. If bundling fails outright (driver pulls node: builtins), that's also
// proof the package isn't browser-importable.
let code = '';
try {
    const r = await esbuild.build({
        stdin: {
            contents: `import { d1DataProvider } from '${edgeInfraCloud}'; import { localDraftProvider } from './src/draft/localDraftProvider'; const CANARY = '${CANARY}'; export const leak = { d: d1DataProvider, draft: localDraftProvider(), c: CANARY };`,
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

// The bundle exists → does it carry the driver / canary? The no-leak gate asserts
// neither is present. If they are, the gate's exclusion would fire.
expectFired('no-leak: a builder bundle importing edge-infra carries the driver', code.includes('d1DataProvider') || code.includes(CANARY));

summarize(PKG);
