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

// A-24 (addendum 2026-08-30): `--target vercel|deno` DISPATCHES to the
// framework repo's per-host scripts — same flag surface, secrets over stdin
// JSON, exit code propagated. Outside the repo it refuses honestly (the
// scripts build examples/cf-full and ship with the repo, not the published
// CLI). The stdin-not-argv assertion below is the mutation gate for the
// secret-handling rule: swapping stdin for an argv element fails this suite.
{
    const { deployCommand, findHostDeployScript } = await import('../dist/cli/deploy.js');
    let wranglerCalls = 0;
    const runWrangler = async () => { wranglerCalls++; return { code: 0, stdout: '', stderr: '' }; };

    // The walk-up locator.
    const vScript = findHostDeployScript(FW, 'vercel');
    check('locator finds scripts/deploy-vercel.mjs from the repo root', vScript !== null && /deploy-vercel\.mjs$/.test(vScript));
    check('locator walks up from a package dir', /deploy-deno\.mjs$/.test(findHostDeployScript(join(FW, 'packages', 'compiler'), 'deno') ?? ''));
    check('locator returns null outside the repo (tmpdir)', findHostDeployScript(tmpdir(), 'vercel') === null);

    // Dispatch: flags map, secrets ride stdin, never argv.
    let calls = 0;
    let seen = null;
    const execHostScript = async (bin, args, opts) => { calls++; seen = { bin, args, stdin: opts.stdin, cwd: opts.cwd }; return { code: 0 }; };
    const r = await deployCommand('.', {
        cwd: FW, target: 'vercel', dryRun: true, appName: 'my-app',
        adminEmail: 'owner@example.com', adminPassword: 'DISPATCH_PW_hunter2', sessionSecret: 'DISPATCH_SS_hunter2',
        execHostScript, runWrangler,
    });
    check('dispatch spawns the per-host script exactly once, via node', calls === 1 && seen?.bin === 'node' && /deploy-vercel\.mjs$/.test(seen?.args?.[0] ?? ''));
    check("--app-name maps to the script's --project", seen?.args?.includes('--project') === true && seen?.args?.[seen.args.indexOf('--project') + 1] === 'my-app');
    check('--dry-run forwards (script: build + gates, no host calls)', seen?.args?.includes('--dry-run') === true);
    check('--secrets-json flag present', seen?.args?.includes('--secrets-json') === true);
    const stdin = JSON.parse(seen?.stdin ?? '{}');
    check('secrets ride stdin (email/password/session secret)', stdin.ADMIN_EMAIL === 'owner@example.com' && stdin.ADMIN_PASSWORD === 'DISPATCH_PW_hunter2' && stdin.SESSION_SECRET === 'DISPATCH_SS_hunter2');
    check('RULE 8: secret VALUES never in argv', !JSON.stringify(seen?.args).includes('DISPATCH_PW_hunter2') && !JSON.stringify(seen?.args).includes('DISPATCH_SS_hunter2') && !JSON.stringify(seen?.args).includes('owner@example.com'));
    check('exit 0 → ok (dry-run summary names the mode)', r.ok === true && r.summary.includes('finished') && r.summary.includes('dry-run'));
    check('dispatch makes zero wrangler calls', wranglerCalls === 0);
    // Dispatch precedes the src/sw.ts + src/worker.ts entry check: the repo
    // root has neither file, yet the dispatch above ran (calls === 1).
    check('dispatch precedes the project-entry check (repo root has no src/)', calls === 1);

    // Deno target: --deno-project-id forwards.
    let denoArgs = null;
    await deployCommand('.', { cwd: FW, target: 'deno', denoProjectId: 'proj-123', execHostScript: async (b, a) => { denoArgs = a; return { code: 0 }; }, runWrangler });
    check('--deno-project-id forwards on the deno target', denoArgs?.includes('--deno-project-id') === true && denoArgs[denoArgs.indexOf('--deno-project-id') + 1] === 'proj-123');

    // Nonzero script exit propagates.
    const rFail = await deployCommand('.', { cwd: FW, target: 'deno', execHostScript: async () => ({ code: 3 }), runWrangler });
    check('nonzero script exit → ok:false with the code', rFail.ok === false && rFail.summary.includes('exit 3'));

    // CF-only options fail loud (never silently ignored), before any exec.
    let guarded = 0;
    const rCf = await deployCommand('.', { cwd: FW, target: 'vercel', d1DatabaseId: 'db-id', execHostScript: async () => { guarded++; return { code: 0 }; }, runWrangler });
    check('--d1-database-id refused for --target vercel', rCf.ok === false && rCf.summary.includes('--d1-database-id') && guarded === 0);

    // Half an admin seed fails on every target, before any exec.
    let halfSeeded = 0;
    const rPair = await deployCommand('.', { cwd: FW, target: 'vercel', adminEmail: 'x@y.z', execHostScript: async () => { halfSeeded++; return { code: 0 }; }, runWrangler });
    check('--admin-email without --admin-password fails before dispatch', rPair.ok === false && rPair.summary.includes('must be given together') && halfSeeded === 0);

    // Outside the repo: honest refusal, zero host calls of either kind.
    calls = 0; wranglerCalls = 0;
    const rOut = await deployCommand(project, { target: 'vercel', runWrangler, execHostScript: async () => { calls++; return { code: 0 }; } });
    check('outside the repo the dispatch refuses honestly (repo-owned scripts)', rOut.ok === false && rOut.summary.includes('deploy-vercel.mjs') && rOut.summary.includes('framework repo'));
    check('refusal makes zero wrangler + zero script calls', wranglerCalls === 0 && calls === 0);
}

console.log(failures === 0 ? '\ndeploy: PASS ✅' : `\ndeploy: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
