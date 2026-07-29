#!/usr/bin/env node
/**
 * Local RED-on-break proof for Work B. Uses disposable repositories only; no
 * network or external product mutation is required.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashBundles } from './console-pin.mjs';
import { verifyScheduledDrift } from './check-scheduled-drift.mjs';
import { pinConsoleBuildTime } from './pin-console-build-time.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const syncScript = join(root, 'scripts', 'sync-contract.mjs');
const temp = mkdtempSync(join(tmpdir(), 'fb-contract-drift-'));
let failures = 0;

function check(label, condition) {
    if (condition) console.log(`  PASS: ${label}`);
    else {
        failures++;
        console.error(`  FAIL: ${label}`);
    }
}

function write(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
}

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function throws(run) {
    try {
        run();
        return false;
    } catch {
        return true;
    }
}

try {
    const product = join(temp, 'product');
    const framework = join(temp, 'framework');
    mkdirSync(product, { recursive: true });
    mkdirSync(framework, { recursive: true });

    const contract = '{"openapi":"3.1.0","paths":{}}\n';
    const zod = 'export const zContract = true;\n';
    write(join(product, 'fastapi-backend', 'contracts', 'openapi.community.json'), contract);
    write(join(product, 'fastapi-backend', 'requirements.txt'), 'fastapi==0.139.0\n');
    write(join(product, 'src', 'client', 'zod.gen.ts'), zod);
    write(join(product, 'vite.config.ts'), 'const BUILD_TIMESTAMP = new Date().getTime();\n');
    git(product, 'init');
    git(product, 'config', 'user.email', 'drift-proof@example.invalid');
    git(product, 'config', 'user.name', 'Drift Proof');
    git(product, 'add', '.');
    git(product, 'commit', '-m', 'fixture');
    const commit = git(product, 'rev-parse', 'HEAD');

    write(join(framework, 'packages', 'backend', 'contracts', 'openapi.community.json'), '{}\n');
    write(join(framework, 'packages', 'backend', 'src', 'compat', 'zod.gen.ts'), '');
    write(join(framework, 'packages', 'backend', 'src', 'compat', 'community-spec.ts'), '');

    const consoleDist = join(framework, 'examples', 'cf-full', 'console-dist');
    const consoleRoot = join(consoleDist, 'frontbase-admin');
    const builtDist = join(temp, 'built-console');
    const bundleNames = [
        'index-AAAA1111-1700000000000.js',
        'index-BBBB2222-1700000000000.css',
    ];
    const shell = '<!doctype html><script type="module" src="/frontbase-admin/assets/' +
        `${bundleNames[0]}"></script><link rel="stylesheet" href="/frontbase-admin/assets/` +
        `${bundleNames[1]}">`;
    write(join(consoleRoot, 'index.html'), shell);
    write(join(builtDist, 'index.html'), shell);
    write(join(builtDist, 'assets', bundleNames[0]), 'console.log(1)');
    write(join(builtDist, 'assets', bundleNames[1]), 'body{}');
    const consoleSha = hashBundles(join(builtDist, 'assets'), bundleNames);
    const consolePinPath = join(consoleDist, 'CONSOLE_PIN');
    write(consolePinPath, JSON.stringify({
        commit,
        sha256: consoleSha,
        jsBundles: [bundleNames[0]],
        cssBundles: [bundleNames[1]],
    }, null, 2));

    const synced = spawnSync(
        process.execPath,
        [syncScript, '--framework', framework, '--product', product, '--commit', commit],
        { encoding: 'utf8' },
    );
    check('clean product sync succeeds', synced.status === 0);
    check(
        'scratch framework receives exact product contract',
        readFileSync(join(framework, 'packages', 'backend', 'contracts', 'openapi.community.json'), 'utf8') === contract,
    );

    const verified = verifyScheduledDrift({ framework, product, consoleDist: builtDist });
    check('prepared replay passes consistency verification', verified.productHead === commit);

    const vendoredBefore = readFileSync(
        join(framework, 'packages', 'backend', 'contracts', 'openapi.community.json'),
        'utf8',
    );
    write(
        join(product, 'fastapi-backend', 'contracts', 'openapi.community.json'),
        `${contract.trim()}\n `,
    );
    const dirtySync = spawnSync(
        process.execPath,
        [syncScript, '--framework', framework, '--product', product, '--commit', commit],
        { encoding: 'utf8' },
    );
    check('deliberate product artifact change makes sync gate RED', dirtySync.status !== 0);
    check(
        'failed provenance check writes nothing to framework',
        readFileSync(
            join(framework, 'packages', 'backend', 'contracts', 'openapi.community.json'),
            'utf8',
        ) === vendoredBefore,
    );
    write(join(product, 'fastapi-backend', 'contracts', 'openapi.community.json'), contract);

    const productCommitPath = join(framework, 'packages', 'backend', 'contracts', 'PRODUCT_COMMIT');
    write(productCommitPath, `${'b'.repeat(40)}\n`);
    check(
        'product/framework pin disagreement makes consistency gate RED',
        throws(() => verifyScheduledDrift({ framework, product, consoleDist: builtDist })),
    );
    write(productCommitPath, `${commit}\n`);

    write(consolePinPath, JSON.stringify({
        commit: 'c'.repeat(40),
        sha256: consoleSha,
        jsBundles: [bundleNames[0]],
        cssBundles: [bundleNames[1]],
    }, null, 2));
    check(
        'console/product pin disagreement makes consistency gate RED',
        throws(() => verifyScheduledDrift({ framework, product, consoleDist: builtDist })),
    );
    write(consolePinPath, JSON.stringify({
        commit,
        sha256: consoleSha,
        jsBundles: [bundleNames[0]],
        cssBundles: [bundleNames[1]],
    }, null, 2));

    const requirementsPath = join(product, 'fastapi-backend', 'requirements.txt');
    write(requirementsPath, 'fastapi==0.138.0\n');
    check(
        'exporter dependency pin drift makes consistency gate RED',
        throws(() => verifyScheduledDrift({ framework, product, consoleDist: builtDist })),
    );
    write(requirementsPath, 'fastapi==0.139.0\n');

    write(join(builtDist, 'assets', bundleNames[0]), 'console.log("tampered")');
    check(
        'rebuilt console byte drift makes consistency gate RED',
        throws(() => verifyScheduledDrift({ framework, product, consoleDist: builtDist })),
    );
    write(join(builtDist, 'assets', bundleNames[0]), 'console.log(1)');

    const timestamp = pinConsoleBuildTime(product, consolePinPath);
    check('console replay extracts the pinned timestamp', timestamp === '1700000000000');
    check(
        'console replay replaces only Date.now build timestamp',
        readFileSync(join(product, 'vite.config.ts'), 'utf8')
            .includes('const BUILD_TIMESTAMP = 1700000000000;'),
    );
    check(
        'unexpected product build config fails closed',
        throws(() => pinConsoleBuildTime(product, consolePinPath)),
    );
} catch (error) {
    failures++;
    console.error(`  FAIL: unexpected test error: ${error.stack ?? error.message}`);
} finally {
    rmSync(temp, { recursive: true, force: true });
}

console.log(failures === 0
    ? '\ncontract drift proof: PASS'
    : `\ncontract drift proof: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
