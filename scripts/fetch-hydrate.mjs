#!/usr/bin/env node
/**
 * Stage the client-hydration vendor from the product checkout — the ONE
 * remaining product-derived input after the console moved in-repo
 * (consolidation phase 1). Retires together with the product in phase 2, when
 * the hydrate bundle's source lands in the framework.
 *
 * What and why: the framework's htmlDocument.ts loads, on every published
 * page, /static/react/hydrate.js (DataTable/Form/etc. client hydration) and
 * the worker serves /static/react/entry-*.css alongside it (worker.ts ASSETS
 * rewrites to /react/<file>). Both files are derived — public/react/ is fully
 * gitignored — so a fresh clone has neither until this runs:
 *
 *   pnpm fetch:hydrate
 *
 * Sources:
 *   --product <path>   product checkout (default: $FRONTBASE_PRODUCT, else the
 *                      sibling ../Frontbase- — mirrors sync-contract.mjs)
 *   --commit <sha>     product commit to read from (default: the vendored
 *                      contracts/PRODUCT_COMMIT — the same revision the
 *                      contract was vendored from, so the bytes provably exist
 *                      there; NO new pin file)
 *
 * Read with `git show` only — no network, no checkout of the product, no
 * dirty-tree hazards. patch-hydrate.mjs applies the canvas-fallback patches
 * on the next cf-full build; this script deliberately does not patch.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message, code = 1) {
    console.error(`✗ ${message}`);
    process.exit(code);
}

function parseArgs(argv) {
    const parsed = {};
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (!flag.startsWith('--')) throw new Error(`unexpected positional argument: ${flag}`);
        const value = argv[++i];
        if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
        parsed[flag.slice(2)] = value;
    }
    return parsed;
}

let args;
try {
    args = parseArgs(process.argv.slice(2));
} catch (error) {
    fail(error.message, 2);
}

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const product = resolve(args.product ?? process.env.FRONTBASE_PRODUCT ?? join(scriptRoot, '..', 'Frontbase-'));
const reactDir = resolve(scriptRoot, 'examples', 'cf-full', 'public', 'react');
const commitPath = resolve(scriptRoot, 'packages', 'backend', 'contracts', 'PRODUCT_COMMIT');

if (!existsSync(resolve(product, '.git'))) fail(`product checkout is not a Git working tree: ${product}`);

let commit = args.commit;
if (!commit) {
    if (!existsSync(commitPath)) fail('contracts/PRODUCT_COMMIT missing: run `node scripts/sync-contract.mjs`');
    commit = readFileSync(commitPath, 'utf8').trim();
}
if (!/^[0-9a-f]{40}$/.test(commit)) fail('--commit must be a full, lowercase 40-character Git SHA');

/** git show <commit>:<path> from the product's object store. */
function show(rel) {
    return execFileSync('git', ['show', `${commit}:${rel}`], {
        cwd: product,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
    });
}

const HYDRATE_REL = 'services/edge/public/react/hydrate.js';
let hydrate;
try {
    hydrate = show(HYDRATE_REL);
} catch {
    fail(`${HYDRATE_REL} does not exist at ${commit.slice(0, 12)} — re-pin PRODUCT_COMMIT via \`node scripts/sync-contract.mjs\``);
}

// entry-*.css ship next to hydrate.js in the product; the worker's
// /static/react/:cssFile route serves whatever the published HTML references,
// so stage every entry-* the product revision carries.
const cssFiles = execFileSync('git', ['ls-tree', '--name-only', `${commit}:services/edge/public/react`], {
    cwd: product,
    encoding: 'utf-8',
})
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^entry-.+\.css$/.test(s));

mkdirSync(reactDir, { recursive: true });
writeFileSync(join(reactDir, 'hydrate.vendor.js'), hydrate);
for (const css of cssFiles) {
    writeFileSync(join(reactDir, css), show(`services/edge/public/react/${css}`));
}

const staged = readdirSync(reactDir).sort().join(', ');
console.log(`✓ public/react/ staged from ${product} @ ${commit.slice(0, 12)} (${staged})`);
console.log('  patch-hydrate.mjs applies the canvas-fallback patches on the next cf-full build.');
