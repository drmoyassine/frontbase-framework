#!/usr/bin/env node
/**
 * Work B fail-closed consistency check for a prepared drift replay.
 *
 * The caller first regenerates the product contract and runs sync-contract.mjs
 * into a scratch framework checkout. This command then proves that the replay:
 *   - names one real product commit everywhere;
 *   - uses the pinned FastAPI exporter toolchain;
 *   - contains the exact product OpenAPI + generated Zod bytes;
 *   - retains valid contract and console digests; and
 *   - optionally matches a freshly rebuilt community console artifact.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBundles, validateConsoleArtifact } from './console-pin.mjs';

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

function normalized(path) {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function requireFile(path, label) {
    if (!existsSync(path)) throw new Error(`${label} missing: ${path}`);
    return path;
}

function requireSha(value, label, length) {
    if (!new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
        throw new Error(`${label} must be a lowercase ${length}-character hexadecimal digest`);
    }
}

function sameBytes(left, right, label) {
    if (normalized(left) !== normalized(right)) throw new Error(`${label} differs`);
}

export function verifyScheduledDrift({
    framework,
    product,
    consoleDist,
}) {
    const productHead = execFileSync(
        'git',
        ['rev-parse', '--verify', 'HEAD^{commit}'],
        { cwd: product, encoding: 'utf8' },
    ).trim();
    requireSha(productHead, 'product HEAD', 40);

    const requirements = normalized(requireFile(
        join(product, 'fastapi-backend', 'requirements.txt'),
        'product requirements',
    ));
    const fastapiPins = requirements
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^fastapi(?:\[.*\])?==/i.test(line));
    if (fastapiPins.length !== 1 || fastapiPins[0].toLowerCase() !== 'fastapi==0.139.0') {
        throw new Error(`product exporter must pin exactly fastapi==0.139.0; found [${fastapiPins.join(', ')}]`);
    }

    const contractsDir = join(framework, 'packages', 'backend', 'contracts');
    const productCommit = normalized(requireFile(
        join(contractsDir, 'PRODUCT_COMMIT'),
        'framework PRODUCT_COMMIT',
    )).trim();
    requireSha(productCommit, 'PRODUCT_COMMIT', 40);
    if (productCommit !== productHead) {
        throw new Error(`PRODUCT_COMMIT ${productCommit.slice(0, 12)} != product HEAD ${productHead.slice(0, 12)}`);
    }

    const vendoredContract = requireFile(
        join(contractsDir, 'openapi.community.json'),
        'vendored community contract',
    );
    const productContract = requireFile(
        join(product, 'fastapi-backend', 'contracts', 'openapi.community.json'),
        'product community contract',
    );
    sameBytes(vendoredContract, productContract, 'vendored community contract');

    const recordedContractSha = normalized(requireFile(
        join(contractsDir, 'CONTRACT_SHA256'),
        'framework CONTRACT_SHA256',
    )).trim();
    requireSha(recordedContractSha, 'CONTRACT_SHA256', 64);
    const actualContractSha = createHash('sha256')
        .update(normalized(vendoredContract))
        .digest('hex');
    if (recordedContractSha !== actualContractSha) {
        throw new Error('CONTRACT_SHA256 does not describe the vendored contract');
    }

    sameBytes(
        requireFile(join(framework, 'packages', 'backend', 'src', 'compat', 'zod.gen.ts'), 'vendored Zod'),
        requireFile(join(product, 'src', 'client', 'zod.gen.ts'), 'product Zod'),
        'vendored generated Zod',
    );

    const pin = validateConsoleArtifact(framework, { level: consoleDist ? 'pin' : 'shell' });
    if (pin.commit !== productHead) {
        throw new Error(`CONSOLE_PIN.commit ${pin.commit.slice(0, 12)} != product HEAD ${productHead.slice(0, 12)}`);
    }

    if (consoleDist) {
        const builtIndex = requireFile(join(consoleDist, 'index.html'), 'rebuilt console index');
        const pinnedIndex = requireFile(
            join(framework, 'examples', 'cf-full', 'console-dist', 'frontbase-admin', 'index.html'),
            'pinned console shell',
        );
        sameBytes(pinnedIndex, builtIndex, 'rebuilt console shell');

        const assetsDir = requireFile(join(consoleDist, 'assets'), 'rebuilt console assets');
        const actualBundles = readdirSync(assetsDir)
            .filter((file) => /\.(?:js|css)$/.test(file))
            .sort();
        const expectedBundles = [...pin.jsBundles, ...pin.cssBundles].sort();
        if (JSON.stringify(actualBundles) !== JSON.stringify(expectedBundles)) {
            throw new Error(
                `rebuilt console bundle list differs: expected [${expectedBundles.join(', ')}], ` +
                `got [${actualBundles.join(', ')}]`,
            );
        }
        const actualBundleSha = hashBundles(assetsDir, expectedBundles);
        if (actualBundleSha !== pin.sha256) {
            throw new Error(`rebuilt console hash ${actualBundleSha} != CONSOLE_PIN.sha256 ${pin.sha256}`);
        }
    }

    return {
        productHead,
        contractSha: actualContractSha,
        consoleSha: pin.sha256,
    };
}

const invokedAsScript = process.argv[1]
    && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedAsScript) {
    try {
        const args = parseArgs(process.argv.slice(2));
        const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
        const result = verifyScheduledDrift({
            framework: resolve(args.framework ?? root),
            product: resolve(args.product ?? resolve(root, '..', 'Frontbase-')),
            consoleDist: args['console-dist'] ? resolve(args['console-dist']) : undefined,
        });
        console.log(
            `scheduled drift consistency: PASS (${result.productHead.slice(0, 12)}, ` +
            `contract ${result.contractSha.slice(0, 12)}, console ${result.consoleSha.slice(0, 12)})`,
        );
    } catch (error) {
        console.error(`scheduled drift consistency: FAIL - ${error.message}`);
        process.exit(1);
    }
}
