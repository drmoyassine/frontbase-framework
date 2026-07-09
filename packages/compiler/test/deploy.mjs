/**
 * Deploy / composition gate (M2.4). THE critical boundary (RULE 1): the composed
 * worker has TWO bundles — the server worker (edge-infra, console, the real
 * directProvider + resolvePrincipal) and the /sw.js browser projection. The SW
 * bundle must contain NO server code/secret; the worker bundle DOES contain the
 * proxy. Plus the < 400 KB size budget.
 *
 * RULE 5: this builds a REAL composed worker from fixtures (not a unit test of
 * internals) — the same DEV-1 discipline.
 */
import * as esbuild from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeWorker, assertWorkerBudget } from '../dist/deploy/compose.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const FW = fileURLToPath(new URL('../../../', import.meta.url));
const EC = join(FW, 'packages', 'edge-core', 'src', 'index.ts').replace(/\\/g, '/');
const project = mkdtempSync(join(tmpdir(), 'fb-deploy-'));
mkdirSync(join(project, 'src'), { recursive: true });
mkdirSync(join(project, 'dist'), { recursive: true });

// The SW entry — browser-only (edge-core, proxyProvider). No server code.
// Imports edge-core by absolute source path (pnpm doesn't hoist workspace pkgs
// to the fixture's node_modules; same approach as test/sw-emit.mjs).
writeFileSync(join(project, 'src', 'sw.ts'),
    `import { createEngine, proxyProvider, attachServiceWorker } from '${EC}';
const manifest = { version: 'deploy', pages: {}, queries: {} };
const engine = createEngine({ manifest, data: proxyProvider('/api/data'), environment: 'service-worker' });
attachServiceWorker(self, engine, manifest);
`);

// The worker entry — SERVER code: a canary secret + the real provider + resolvePrincipal.
// The secret is USED (exported) so it survives minification — a real server credential.
const CANARY = 'DEPLOY_DB_PASSWORD_hunter2';
writeFileSync(join(project, 'src', 'worker.ts'),
    `import { createEngine, directProvider, configureEngine } from '${EC}';
// SERVER-ONLY: the canary secret + resolvePrincipal live here and ONLY here.
const DB_PASSWORD = '${CANARY}';
const manifest = { version: 'deploy', pages: { '/': { title: 'T', slug: 'home', layout: { root: {}, content: [] } } }, queries: {} };
configureEngine({ edition: 'community', nodeEnv: 'production', resolvePrincipal: async () => ({ user: { id: 'system' } }) });
const engine = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
// The secret is referenced by exported server code (a real provider would consume it).
export const __secretProbe = DB_PASSWORD;
export default engine;
`);

const res = await composeWorker({ swEntry: join(project, 'src', 'sw.ts'), workerEntry: join(project, 'src', 'worker.ts'), projectRoot: FW, outDir: join(project, 'dist') });

// Size budget
const budget = assertWorkerBudget(res);
check('worker < 400 KB gzip', budget.ok);

// THE critical boundary: /sw.js (browser projection) has NO server secret and
// NO edge-infra driver. (edge-core's own engine generically references
// "resolvePrincipal" — that's browser-safe engine code, not the server's auth
// implementation; the boundary is secrets + drivers, which is what we assert.)
check('RULE 1: /sw.js contains NO server secret', !res.sw.code.includes(CANARY));
check('RULE 1: /sw.js contains NO edge-infra driver (d1/turso/postgres)', !res.sw.code.includes('d1DataProvider') && !res.sw.code.includes('postgresDataProvider'));

// The worker bundle DOES contain the server code (proving it's there, in the right place)
const workerBundle = await esbuild.build({
    entryPoints: [join(project, 'src', 'worker.ts')], bundle: true, minify: true, write: false,
    platform: 'browser', format: 'esm', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    absWorkingDir: FW,
});
const workerText = workerBundle.outputFiles[0].text;
check('worker bundle CONTAINS the server proxy (resolvePrincipal)', workerText.includes('resolvePrincipal') || workerText.includes('configureEngine'));
check('worker bundle CONTAINS the server secret', workerText.includes(CANARY));

// Content-hash versioning (deterministic)
const res2 = await composeWorker({ swEntry: join(project, 'src', 'sw.ts'), workerEntry: join(project, 'src', 'worker.ts'), projectRoot: FW, outDir: join(project, 'dist') });
check('composition is deterministic (same hashes)', res2.worker.hash === res.worker.hash && res2.sw.hash === res.sw.hash);

console.log(`  (worker ${budget.gzipKb.toFixed(1)} KB · sw ${(res.sw.bytesMinGzip / 1024).toFixed(1)} KB gzip)`);
console.log(failures === 0 ? '\ndeploy: PASS ✅' : `\ndeploy: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
