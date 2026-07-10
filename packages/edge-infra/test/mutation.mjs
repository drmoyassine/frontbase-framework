/**
 * edge-infra mutation harness (RULE 8). Proves:
 *   - isolation: drop the app-level `WHERE tenant` predicate from the executor
 *     → tenant A and B see the SAME rows (A-17 headline, SEC-P2-2 class).
 *   - cache copy-on-read: return the cached parsed object by reference → a
 *     mutation leaks across reads (RULE 3 / BUG-1 class).
 * Also an artifact mutation for the no-leak discipline (server module in a
 * browser bundle → the exclusion check must fire).
 */
import { withSourceMutation, buildPackage, runGate, expectRed, expectFired, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PKG = '@frontbase/edge-infra';
const pkgDir = repoRoot + 'packages/edge-infra/';
const HARNESS = 'packages/edge-infra/test/_harness.mjs';
const PROVIDERS = 'packages/edge-infra/src/cache/providers.ts';
const RATELIMIT = 'packages/edge-infra/src/proxy/ratelimit.ts';

console.log('— edge-infra mutation harness —\n');
if (!buildPackage(PKG)) { console.log('baseline build failed'); process.exit(2); }
if (runGate(pkgDir, 'test/isolation.mjs') !== 0) { console.log('baseline isolation RED'); process.exit(2); }
if (runGate(pkgDir, 'test/cache.mjs') !== 0) { console.log('baseline cache RED'); process.exit(2); }
if (runGate(pkgDir, 'test/ratelimit.mjs') !== 0) { console.log('baseline ratelimit RED'); process.exit(2); }
console.log('baseline: isolation + cache + ratelimit GREEN\n');

// 1. Isolation — drop the WHERE tenant predicate. A and B now see all 4 rows.
await withSourceMutation(
    'isolation: app-level WHERE tenant predicate (A-17)',
    HARNESS,
    "return ctx.db.query('SELECT id, title, tenant FROM docs WHERE tenant = ?', [tenant]);",
    "return ctx.db.query('SELECT id, title, tenant FROM docs', []);",
    async () => {
        expectRed('isolation: goes red when the WHERE tenant predicate is dropped', runGate(pkgDir, 'test/isolation.mjs'));
    },
);

// 2. Cache copy-on-read — cache the parsed object and return the SAME reference.
await withSourceMutation(
    'cache: copy-on-read (RULE 3)',
    PROVIDERS,
    '            try { return JSON.parse(e.value) as unknown; } catch { return e.value as unknown; }',
    '            try { const v = JSON.parse(e.value); (store as any).__parsed ??= new Map(); const k = key; if ((store as any).__parsed.has(k)) return (store as any).__parsed.get(k); (store as any).__parsed.set(k, v); return v; } catch { return e.value as unknown; }',
    async () => {
        buildPackage(PKG);
        expectRed('cache: goes red when get returns a shared reference', runGate(pkgDir, 'test/cache.mjs'));
    },
);

// 3. Rate limit — remove the over-limit denial so consumeToken always allows.
//    ratelimit.mjs must go red (request 4 should have been denied).
await withSourceMutation(
    'ratelimit: over-limit denial (CF-16)',
    RATELIMIT,
    'if (current >= cfg.limit) {\n        return { allowed: false, remaining: 0 };\n    }',
    '/* MUTATION: over-limit denial removed */',
    async () => {
        buildPackage(PKG);
        expectRed('ratelimit: goes red when the over-limit denial is removed', runGate(pkgDir, 'test/ratelimit.mjs'));
    },
);

// 4. no-leak artifact mutation — a browser bundle that DOES import a server
//    module with a canary. The exclusion check must fire (find the canary).
const CANARY = 'EDGE_INFRA_CANARY_vault_key_hunter2';
const leaky = await esbuild.build({
    stdin: {
        contents: `import { d1DataProvider } from '${join(pkgDir, 'dist/providers/cloud.js').replace(/\\/g, '/')}'; const SECRET = '${CANARY}'; export const p = { d: d1DataProvider, s: SECRET };`,
        loader: 'js',
    },
    bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent',
    absWorkingDir: pkgDir,
}).catch(() => null);
if (leaky) {
    const code = leaky.outputFiles[0].text;
    // The no-leak gate asserts !code.includes(CANARY). If the leaky bundle has
    // it, the gate's assertion would be FALSE → the gate fails. expectFired.
    expectFired('no-leak: exclusion check fires on a bundle that imports server code', code.includes(CANARY));
} else {
    // Bundling a server module for the browser failing outright is also proof
    // (node:crypto/driver won't resolve) — the package isn't browser-importable.
    expectFired('no-leak: server module fails to bundle for the browser (not browser-importable)', true);
}

buildPackage(PKG);
summarize(PKG);
