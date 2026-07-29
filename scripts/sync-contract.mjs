#!/usr/bin/env node
/**
 * CF-22 P1 / D1 — vendor the product's community OpenAPI contract + generated
 * Zod into this framework repository, pinned to one verifiable product commit.
 *
 * Usage:
 *   node scripts/sync-contract.mjs [--product <path>] [--commit <sha>]
 *                                  [--framework <path>]
 *
 * Defaults:
 *   --framework  repository containing this script
 *   --product    ../Frontbase- relative to the framework
 *   --commit     product checkout HEAD
 *
 * `--framework` lets scheduled drift replay the sync in a scratch checkout.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
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
const framework = resolve(args.framework ?? scriptRoot);
const product = resolve(args.product ?? resolve(framework, '..', 'Frontbase-'));
const backendDir = resolve(framework, 'packages/backend');
const contractsDir = resolve(backendDir, 'contracts');

if (!existsSync(resolve(product, '.git'))) fail(`product checkout is not a Git working tree: ${product}`);
if (!existsSync(contractsDir)) fail(`framework contracts directory is missing: ${contractsDir}`);

const sources = [
    ['fastapi-backend/contracts/openapi.community.json', 'contracts/openapi.community.json'],
    ['src/client/zod.gen.ts', 'src/compat/zod.gen.ts'],
];

let commit = args.commit;
if (!commit) {
    try {
        commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {
            cwd: product,
            encoding: 'utf-8',
        }).trim();
    } catch (error) {
        fail(`cannot resolve product HEAD in ${product}: ${error.message}`);
    }
}
if (!/^[0-9a-f]{40}$/.test(commit)) {
    fail('--commit must resolve to a full, lowercase 40-character Git SHA');
}
try {
    commit = execFileSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], {
        cwd: product,
        encoding: 'utf-8',
    }).trim();
} catch {
    fail(`product commit does not exist in checkout: ${commit}`);
}

// Verify source provenance before writing anything. This prevents a dirty product
// tree from being recorded under a commit whose bytes cannot reproduce it.
for (const [rel] of sources) {
    let atCommit;
    try {
        atCommit = execFileSync('git', ['show', `${commit}:${rel}`], {
            cwd: product,
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024,
        });
    } catch {
        fail(`${rel} does not exist at ${commit.slice(0, 12)} in ${product}`);
    }
    const sourcePath = resolve(product, rel);
    if (!existsSync(sourcePath)) fail(`product artifact is missing: ${sourcePath}`);
    const onDisk = readFileSync(sourcePath, 'utf-8');
    if (onDisk.replace(/\r\n/g, '\n') !== atCommit.replace(/\r\n/g, '\n')) {
        fail(
            `${rel} in the product working tree differs from ${commit.slice(0, 12)}; ` +
            'commit/regenerate the product artifact before syncing',
        );
    }
}

for (const [rel, destRel] of sources) {
    const src = resolve(product, rel);
    const dst = resolve(backendDir, destRel);
    try {
        copyFileSync(src, dst);
        console.log(`✓ ${destRel}`);
    } catch (error) {
        fail(`could not copy ${src} to ${dst} (${error.code ?? error.message})`);
    }
}

writeFileSync(resolve(contractsDir, 'PRODUCT_COMMIT'), `${commit}\n`);
console.log(`✓ PRODUCT_COMMIT = ${commit.slice(0, 12)}`);

const specPath = resolve(contractsDir, 'openapi.community.json');
const contractSha = createHash('sha256')
    .update(readFileSync(specPath, 'utf-8').replace(/\r\n/g, '\n'))
    .digest('hex');
writeFileSync(resolve(contractsDir, 'CONTRACT_SHA256'), `${contractSha}\n`);
console.log(`✓ CONTRACT_SHA256 = ${contractSha.slice(0, 12)}`);

const embedded = resolve(backendDir, 'src/compat/community-spec.ts');
const specSrc = readFileSync(specPath, 'utf-8');
writeFileSync(
    embedded,
    '// CF-22 P1 — vendored product community spec, EMBEDDED for Workers-safe runtime\n' +
    '// use (no node:fs). Regenerated from contracts/openapi.community.json by\n' +
    '// scripts/sync-contract.mjs. DO NOT EDIT.\n' +
    `const SPEC: Record<string, unknown> = ${specSrc.trim()};\nexport default SPEC;\n`,
);
console.log('✓ src/compat/community-spec.ts (embedded)');

console.log('\nNext: pnpm --filter @frontbase/backend run contracts:emit && node scripts/contract-diff.mjs');
