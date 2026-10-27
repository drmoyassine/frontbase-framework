/**
 * Builder no-leak gate (M2.3, RULE 1) — the builder is a browser SPA. Its bundle
 * must contain NO edge-infra driver or secret. We bundle the builder's browser
 * entry with a canary secret planted in a fake edge-infra import and assert the
 * builder entry does NOT pull it in (the builder never imports edge-infra).
 */
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const CANARY = 'EDGE_INFRA_DRIVER_SECRET_hunter2';

// 1. The builder sources must have no actual IMPORT of @frontbase/edge-infra.
//    (A naive substring would match this file's own comments — check import syntax.)
const importRe = /(?:import|from)\s+['"]@frontbase\/edge-infra(?:\/[^'"]*)?['"]/;
const barrel = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const draftSrc = readFileSync(new URL('../src/draft/localDraftProvider.ts', import.meta.url), 'utf8');
const canvasSrc = readFileSync(new URL('../src/canvas/Canvas.tsx', import.meta.url), 'utf8');
const canvasModelSrc = readFileSync(new URL('../src/canvas/model.ts', import.meta.url), 'utf8');
check('builder barrel does not IMPORT edge-infra', !importRe.test(barrel));
check('localDraftProvider does not IMPORT edge-infra', !importRe.test(draftSrc));
check('canvas (Canvas.tsx) does not IMPORT edge-infra (CF-8)', !importRe.test(canvasSrc));
check('canvas model does not IMPORT edge-infra (CF-8)', !importRe.test(canvasModelSrc));

// 2. Bundle the builder's draft entry for the browser; assert it contains no
//    canary even when a fake edge-infra module (with the canary) exists in the
//    graph — proving the builder doesn't pull server code in.
import { fileURLToPath } from 'node:url';
const draftPath = fileURLToPath(new URL('../src/draft/localDraftProvider.ts', import.meta.url));
const result = await esbuild.build({
    entryPoints: [draftPath],
    bundle: true, write: false, platform: 'browser', format: 'esm', minify: true, logLevel: 'silent',
    plugins: [{
        name: 'fake-edge-infra',
        setup(build) {
            build.onResolve({ filter: /@frontbase\/edge-infra/ }, () => ({ path: 'edge-infra', namespace: 'ei' }));
            build.onLoad({ filter: /.*/, namespace: 'ei' }, () => ({ contents: `export const DB_PASSWORD = '${CANARY}'; export const d1DataProvider = () => null;`, loader: 'js' }));
        },
    }],
});
const out = result.outputFiles[0].text;
check('RULE 1: builder bundle contains NO edge-infra canary secret', !out.includes(CANARY));
check('RULE 1: builder bundle contains NO d1 driver', !out.includes('d1DataProvider'));

console.log(failures === 0 ? '\nno-leak: PASS ✅' : `\nno-leak: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
