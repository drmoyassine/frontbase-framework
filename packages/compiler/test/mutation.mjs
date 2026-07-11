/**
 * compiler mutation harness (RULE 8). Proves the SW no-leak (SEC-1) guarantee
 * is real with two mutations:
 *   - ARTIFACT: a leaky SW entry that imports the SERVER queries module (secret
 *     inside execute) instead of the static browser manifest → the emitted sw.js
 *     contains the secret → the real gate's `!includes(SECRET)` fires.
 *   - SOURCE: toBrowserQueries must OMIT execute. If it includes it, the emitted
 *     browser manifest carries execute → sw-no-leak.mjs goes red.
 */
import { withSourceMutation, buildPackage, runGate, expectRed, expectFired, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSwBundle } from '../dist/emit/swBundle.js';

const PKG = '@frontbase/compiler';
const pkgDir = repoRoot + 'packages/compiler/';
const EC = join(repoRoot, 'packages/edge-core/src/index.ts').replace(/\\/g, '/');
const SWBUNDLE = 'packages/compiler/src/emit/swBundle.ts';
const DEPLOY = 'packages/compiler/src/cli/deploy.ts';

console.log('— compiler mutation harness —\n');
if (!buildPackage(PKG)) { console.log('baseline build failed'); process.exit(2); }
if (runGate(pkgDir, 'test/sw-no-leak.mjs') !== 0) { console.log('baseline sw-no-leak RED'); process.exit(2); }
if (runGate(pkgDir, 'test/deploy-seed.mjs') !== 0) { console.log('baseline deploy-seed RED'); process.exit(2); }
console.log('baseline: sw-no-leak + deploy-seed GREEN\n');

// 1. ARTIFACT — leaky SW entry imports the server queries (SEC-1 regression).
const SECRET = 'sk-LEAK-MUTATION-DB-PASSWORD-4242';
const dir = mkdtempSync(join(tmpdir(), 'fb-swmut-'));
mkdirSync(join(dir, 'src'), { recursive: true });
writeFileSync(join(dir, 'src', 'queries.js'),
    `export const queries = { 'x.list': { scope: 'public', execute: async () => { const DB_PASSWORD = '${SECRET}'; return [{ p: DB_PASSWORD }]; } } };`);
writeFileSync(join(dir, 'src', 'sw.js'),
    `import { createEngine, proxyProvider, attachServiceWorker } from '${EC}';
     import { queries } from './queries.js';
     const engine = createEngine({ manifest: { version: 't', pages: {}, queries }, data: proxyProvider('/api/data'), environment: 'service-worker' });
     attachServiceWorker(self, engine, { version: 't', pages: {}, queries });`);
const leaky = await emitSwBundle({ entry: join(dir, 'src', 'sw.js'), projectRoot: dir, outDir: join(dir, 'dist') });
expectFired('sw-no-leak (SEC-1): leaky entry puts the secret in sw.js', leaky.code.includes(SECRET));

// 2. SOURCE — the serialization boundary. emitBrowserManifest uses JSON.stringify
//    (functions structurally cannot survive). If it instead emitted a function
//    (bypassing that protection), the browser manifest would carry an executor →
//    sw-no-leak.mjs's "executor-free" check fires. (Mutating toBrowserQueries
//    alone is a no-op precisely BECAUSE JSON.stringify is the backstop — that
//    finding is documented in the report.)
await withSourceMutation(
    'sw-no-leak: serialization boundary (JSON.stringify)',
    SWBUNDLE,
    "    writeFileSync(outFile, `export const manifest = ${JSON.stringify(manifest, null, 2)};\\n`);",
    "    writeFileSync(outFile, `export const manifest = ${JSON.stringify(manifest, null, 2)}; export const execute = function(){ return 'LEAKED_SERVER_EXECUTOR'; };\\n`);",
    async () => {
        buildPackage(PKG);
        const exit = runGate(pkgDir, 'test/sw-no-leak.mjs');
        expectRed('sw-no-leak: goes red when the emitted manifest carries a function', exit);
    },
);

// 3. SOURCE — CF-19 no-argv-leak. Secret values must travel on stdin only. If the
//    value is added to the wrangler argv (process-list leak), deploy-seed's
//    "NO secret value leaked to argv" check fires → the gate goes red.
await withSourceMutation(
    'deploy-seed: secret value on argv (process-list leak)',
    DEPLOY,
    "const res = await runWrangler(['secret', 'put', name], { cwd, stdin: value });",
    "const res = await runWrangler(['secret', 'put', name, value], { cwd, stdin: value });",
    async () => {
        buildPackage(PKG);
        const exit = runGate(pkgDir, 'test/deploy-seed.mjs');
        expectRed('deploy-seed: goes red when a secret value is passed on argv', exit);
    },
);

buildPackage(PKG);
summarize(PKG);
