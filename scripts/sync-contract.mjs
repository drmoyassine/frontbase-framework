#!/usr/bin/env node
/**
 * CF-22 P1 / D1 — vendor the product's community OpenAPI contract + generated
 * Zod into this (framework) repo, pinned to a product commit.
 *
 * The framework must build and test hermetically, and contract bumps must be
 * explicit, reviewable commits — so the contract is vendored (not fetched live)
 * and re-vendored deliberately by running this script. No network dependency;
 * both repos are local siblings.
 *
 * Usage:
 *   node scripts/sync-contract.mjs [--product <path>] [--commit <sha>]
 *
 * Defaults: --product = ../Frontbase- (sibling product checkout),
 *           --commit  = the product checkout's current HEAD.
 *
 * Copies:
 *   <product>/fastapi-backend/contracts/openapi.community.json → contracts/openapi.community.json
 *   <product>/src/client/zod.gen.ts                            → contracts/zod.gen.ts
 * and writes the pin to contracts/PRODUCT_COMMIT.
 *
 * After syncing, regenerate the framework's emitted spec + drift gate:
 *   pnpm --filter @frontbase/backend run contracts:emit
 *   node scripts/contract-diff.mjs
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// --key value → { key: value }. (The reduce already builds the object; wrapping it
// in Object.fromEntries fed it a non-iterable and threw on any explicit flag.)
const args = process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc[a.slice(2)] = arr[i + 1];
    return acc;
}, {});

const product = resolve(args.product ?? '../Frontbase-');
const contractsDir = resolve('packages/backend/contracts');

const sources = [
    // JSON contract → contracts/ (the record).
    ['fastapi-backend/contracts/openapi.community.json', 'contracts/openapi.community.json'],
    // Vendored Zod → src/compat/ (compiled by the backend; rootDir is src/).
    ['src/client/zod.gen.ts', 'src/compat/zod.gen.ts'],
];

// Pin: explicit commit arg wins; else the product checkout's HEAD.
let commit = args.commit;
if (!commit) {
    try {
        commit = execSync('git rev-parse HEAD', { cwd: product, encoding: 'utf-8' }).trim();
    } catch {
        commit = 'unknown';
    }
}

/**
 * Provenance — the files vendored MUST be the ones at `commit`, not whatever
 * happens to be sitting in the product working tree.
 *
 * This is not hypothetical. The contract was once vendored from an uncommitted
 * product tree while PRODUCT_COMMIT named an older revision. The pin gate still
 * passed — it compared two identical strings — while the vendored contract
 * corresponded to no commit at all and could not be reproduced from any checkout.
 * Comparing content against `git show <commit>:<path>` is what makes the pin mean
 * something.
 */
if (commit !== 'unknown') {
    for (const [rel] of sources) {
        let atCommit;
        try {
            atCommit = execSync(`git show ${commit}:${rel}`, { cwd: product, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
        } catch {
            console.error(`✗ ${rel} does not exist at ${commit.slice(0, 12)} in ${product}`);
            process.exit(1);
        }
        const onDisk = readFileSync(resolve(product, rel), 'utf-8');
        // EOL-insensitive: the checkout may be CRLF while the stored blob is LF.
        if (onDisk.replace(/\r\n/g, '\n') !== atCommit.replace(/\r\n/g, '\n')) {
            console.error(`✗ ${rel} in the product working tree differs from ${commit.slice(0, 12)}.`);
            console.error('  Vendoring it would pin the contract to a commit it did not come from,');
            console.error('  leaving it unreproducible from any checkout. Commit the product changes');
            console.error('  first, then re-run — or pass --commit <sha> naming the revision you want.');
            process.exit(1);
        }
    }
}

for (const [rel, destRel] of sources) {
    const src = resolve(product, rel);
    const dst = resolve(resolve('packages/backend'), destRel);
    try {
        copyFileSync(src, dst);
        console.log(`✓ ${destRel}`);
    } catch (e) {
        console.error(`✗ could not read ${src} — is --product correct? (${e.code})`);
        process.exit(1);
    }
}
writeFileSync(resolve(contractsDir, 'PRODUCT_COMMIT'), commit + '\n');
console.log(`✓ PRODUCT_COMMIT = ${commit.slice(0, 12)}`);

// Digest of exactly what was vendored. CI has no product checkout, so it cannot
// re-derive provenance from git — but it CAN detect the vendored contract being
// edited in place afterwards, which would silently decouple it from the pin.
const contractSha = createHash('sha256')
    .update(readFileSync(resolve(contractsDir, 'openapi.community.json'), 'utf-8').replace(/\r\n/g, '\n'))
    .digest('hex');
writeFileSync(resolve(contractsDir, 'CONTRACT_SHA256'), contractSha + '\n');
console.log(`✓ CONTRACT_SHA256 = ${contractSha.slice(0, 12)}`);

// Regenerate the embedded (Workers-safe) TS copy of the spec — the backend
// imports it at runtime (no node:fs in the Workers runtime).
const specPath = resolve(contractsDir, 'openapi.community.json');
const embedded = resolve('packages/backend/src/compat/community-spec.ts');
const specSrc = readFileSync(specPath, 'utf-8');
writeFileSync(
    embedded,
    '// CF-22 P1 — vendored product community spec, EMBEDDED for Workers-safe runtime\n' +
    '// use (no node:fs). Regenerated from contracts/openapi.community.json by\n' +
    '// scripts/sync-contract.mjs. DO NOT EDIT.\n' +
    'const SPEC: Record<string, unknown> = ' + specSrc.trim() + ';\nexport default SPEC;\n',
);
console.log('✓ src/compat/community-spec.ts (embedded)');

console.log('\nNext: pnpm --filter @frontbase/backend run contracts:emit && node scripts/contract-diff.mjs');
