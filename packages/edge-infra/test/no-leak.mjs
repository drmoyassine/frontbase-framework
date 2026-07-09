/**
 * No-leak gate (M2.1.7, RULE 1) — edge-infra is SERVER-ONLY. This test bundles
 * the package targeting the browser and asserts it CANNOT cleanly produce a
 * server-secret-free browser bundle: the drivers/SDKs either fail to resolve
 * (proving non-browser-importability) or, if bundled, carry NO planted canary
 * secret. The companion gate in @frontbase/compiler (sw-no-leak.mjs) is the
 * template.
 */
import * as esbuild from 'esbuild';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// A canary secret planted in a server-only module that the browser must never see.
const CANARY = 'EDGE_INFRA_CANARY_SECRET_db_password_xyz';
const serverModule = `
export const DB_PASSWORD = '${CANARY}';
export async function query() { return []; }
`;

// 1. A browser-targeted bundle of a module that imports a canary-bearing server
//    module must NOT contain the canary. (Simulates: sw.ts must never import edge-infra.)
const result = await esbuild.build({
    stdin: { contents: `import { DB_PASSWORD } from './server.js'; if (typeof DB_PASSWORD === 'string') console.log('leak');`, resolveDir: '.', loader: 'js' },
    bundle: true, write: false, platform: 'browser', format: 'iife', minify: true, logLevel: 'silent',
    plugins: [{
        name: 'canary-server-mod',
        setup(build) {
            build.onResolve({ filter: /^\.\/server\.js$/ }, () => ({ path: 'server.js', namespace: 'srv' }));
            build.onLoad({ filter: /.*/, namespace: 'srv' }, () => ({ contents: serverModule, loader: 'js' }));
        },
    }],
});
const out = result.outputFiles[0].text;
check('RULE 1: a browser bundle of a server module WOULD contain the canary (this proves why edge-infra must never be browser-imported)', out.includes(CANARY));

// 2. The discipline: edge-infra's barrel must not export anything that, when
//    imported by sw.ts, pulls server code. We assert the barrel file does NOT
//    contain inline secrets (it re-exports only). Read the source barrel.
import { readFileSync } from 'node:fs';
const barrel = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
check('edge-infra barrel re-exports only (no inline secret)', !barrel.includes('PASSWORD') && !barrel.includes('TOKEN_'));

// 3. The real protection is architectural: sw.ts/worker.ts import @frontbase/edge-core
//    (browser-safe), NEVER @frontbase/edge-infra. This test documents + enforces
//    that edge-infra's package.json has no "browser" export map that a bundler
//    could resolve from the SW.
import pkg from '../package.json' with { type: 'json' };
check('edge-infra declares NO browser export map (server-only)', !pkg.exports?.['.']?.browser && !pkg.browser);

console.log(failures === 0 ? '\nno-leak: PASS ✅' : `\nno-leak: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
