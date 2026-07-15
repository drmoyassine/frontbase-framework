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
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, arr) => {
        if (a.startsWith('--')) acc[a.slice(2)] = arr[i + 1];
        return acc;
    }, {}),
);

const product = resolve(args.product ?? '../Frontbase-');
const contractsDir = resolve('packages/backend/contracts');

const sources = [
    // JSON contract → contracts/ (the record).
    ['fastapi-backend/contracts/openapi.community.json', 'contracts/openapi.community.json'],
    // Vendored Zod → src/compat/ (compiled by the backend; rootDir is src/).
    ['src/client/zod.gen.ts', 'src/compat/zod.gen.ts'],
];

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

// Pin: explicit commit arg wins; else the product checkout's HEAD.
let commit = args.commit;
if (!commit) {
    try {
        commit = execSync('git rev-parse HEAD', { cwd: product, encoding: 'utf-8' }).trim();
    } catch {
        commit = 'unknown';
    }
}
writeFileSync(resolve(contractsDir, 'PRODUCT_COMMIT'), commit + '\n');
console.log(`✓ PRODUCT_COMMIT = ${commit.slice(0, 12)}`);

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
