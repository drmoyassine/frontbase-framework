/**
 * edge-core mutation harness (RULE 8). Proves each security guarantee in the
 * engine is real by breaking it and watching scope.mjs go RED:
 *   - SEC-P2-1 page-path: skip enforceScope on the eSSR catch-all → a scoped
 *     page renders to anon instead of 401.
 *   - proxy-path: skip enforceScope on /api/data → anon reaches tenant queries.
 * Mutations target engine.ts lines 105–107 (proxy) and 153–158 (page path) —
 * the exact code that implements each guarantee.
 */
import { withSourceMutation, buildPackage, runGate, expectRed, summarize, repoRoot } from '../../../scripts/mutation-lib.mjs';

const PKG = '@frontbase/edge-core';
const pkgDir = repoRoot + 'packages/edge-core/';
const SRC = 'packages/edge-core/src/engine.ts';

console.log('— edge-core mutation harness —\n');

// Baseline: the gate must be GREEN before we mutate (else the harness is broken).
if (!buildPackage(PKG)) { console.log('baseline build failed'); process.exit(2); }
const baseline = runGate(pkgDir, 'test/scope.mjs');
if (baseline !== 0) { console.log(`baseline scope.mjs is RED (${baseline}) — fix before mutating`); process.exit(2); }
console.log('baseline: scope.mjs GREEN (good — mutations should now turn it red)\n');

// 1. SEC-P2-1 — break the PAGE-PATH scope enforcement.
//    The page catch-all resolves principal + enforceScope + denies. Neuter the
//    deny so a scoped page renders to anon. scope.mjs's `page(anon): tenant-page
//    → 401` must now go RED (it'll be 200).
await withSourceMutation(
    'page-path enforceScope (SEC-P2-1)',
    SRC,
    'const denial = enforceScope(q, principal);\n            // A scoped page requested without the required principal is not',
    '/* MUTATION: deny removed */ void principal;\n            // A scoped page requested without the required principal is not',
    async () => {
        buildPackage(PKG);
        const exit = runGate(pkgDir, 'test/scope.mjs');
        expectRed('page-path: scope.mjs goes red when the page-path deny is removed', exit);
    },
);

// 2. Proxy-path — break the /api/data scope enforcement.
//    Neuter the proxy's `if (denial) return`. scope.mjs's `anon: tenant query →
//    401` must go RED (it'll be 200).
await withSourceMutation(
    'proxy-path enforceScope',
    SRC,
    "const denial = enforceScope(q, principal);\n            if (denial) return c.json({ error: denial.error }, denial.status);\n\n            let params",
    "/* MUTATION: proxy deny removed */ void 0;\n            let params",
    async () => {
        buildPackage(PKG);
        const exit = runGate(pkgDir, 'test/scope.mjs');
        expectRed('proxy-path: scope.mjs goes red when the proxy deny is removed', exit);
    },
);

// Restore + rebuild so the package is green for the rest of the suite.
buildPackage(PKG);
summarize(PKG);
