/** R1 external declaration diagnostic; failures are retained, never suppressed. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = process.argv[2];
assert.ok(source, 'Usage: release-declaration-diagnostic.mjs <retained consumer proof directory> [--online]');
const prior = JSON.parse(readFileSync(join(source, 'evidence.json'), 'utf8'));
assert.equal(prior.success, true, 'Require a successful immutable tarball proof');
const pkg = JSON.parse(readFileSync(join(source, 'consumer', 'package.json'), 'utf8'));
for (const archive of prior.archives) {
    const path = join(source, 'archives', `${archive.name.replace('@', '').replace('/', '-')}-${archive.version}.tgz`);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), archive.sha256);
}
const output = mkdtempSync(join(tmpdir(), 'frontbase-r1-declarations-'));
const consumer = join(output, 'consumer');
mkdirSync(consumer);
const cli = process.env.npm_execpath || (process.env.APPDATA ? join(process.env.APPDATA, 'npm/node_modules/pnpm/bin/pnpm.cjs') : '');
assert.ok(existsSync(cli), 'Run through pnpm exec');
const online = process.argv.includes('--online');
const typescriptVersion = process.argv.find(arg => arg.startsWith('--typescript='))?.slice('--typescript='.length) ?? '6.0.3';
assert.match(typescriptVersion, /^\d+\.\d+\.\d+$/, 'Use an exact TypeScript version');
const cloudflareVersion = process.argv.find(arg => arg.startsWith('--cloudflare-types='))?.slice('--cloudflare-types='.length);
if (cloudflareVersion) assert.match(cloudflareVersion, /^\d+\.\d+\.\d+$/, 'Use an exact official Cloudflare type version');
const evidence = { schemaVersion: 1, source, output, archiveHashesVerified: true, online, lifecycleScripts: false, typescriptVersion, cloudflareVersion, commands: [], profiles: {} };
const persist = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
function run(args) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: consumer, encoding: 'utf8', timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    evidence.commands.push({ args, exit: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr });
    persist();
    return result;
}
console.log('Declaration diagnostic output: ' + output);
try {
    pkg.name = 'frontbase-external-declaration-diagnostic';
    // Explicit consumer ambient/tool dependencies. No declarations or package sources are patched.
    pkg.devDependencies = { typescript: typescriptVersion, '@types/node': '26.1.1' };
    if (cloudflareVersion) pkg.devDependencies['@cloudflare/workers-types'] = cloudflareVersion;
    writeFileSync(join(consumer, 'package.json'), JSON.stringify(pkg, null, 2));
    const install = run(['install', ...(online ? [] : ['--offline']), '--ignore-scripts']);
    assert.equal(install.status, 0, 'Diagnostic installation failed: ' + (install.stderr || install.stdout));
    const profiles = {
        'all-node-dom': { entries: prior.importEntries, types: ['node'] },
        'browser-components': { entries: prior.importEntries.filter(name => /^@frontbase\/(edge-core|ui-components|builder)(\/|$)/.test(name)), types: [] },
        'compiler-node-dom': { entries: prior.importEntries.filter(name => /^@frontbase\/compiler(\/|$)/.test(name)), types: ['node'] },
        'infra-node-dom': { entries: ['@frontbase/edge-infra'], types: ['node'] },
        'backend-node-dom': { entries: ['@frontbase/backend'], types: ['node'] },
    };
    if (cloudflareVersion) profiles['cloudflare-binding-compatibility'] = {
        entries: ['@frontbase/edge-infra'], types: ['node'],
        additionalSource: `import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { d1RunnerFromBinding, kvCache } from '@frontbase/edge-infra';
declare const d1: D1Database;
declare const kv: KVNamespace;
d1RunnerFromBinding(d1);
kvCache(kv);
// @ts-expect-error The binding must return a prepared statement.
d1RunnerFromBinding({ prepare: () => 123 });
// @ts-expect-error KV get must return text or null.
kvCache({ get: async () => 123, put: async () => {}, delete: async () => {} });`,
    };
    for (const [name, profile] of Object.entries(profiles)) {
        const file = `${name}.ts`;
        writeFileSync(join(consumer, file), profile.entries.map((entry, i) => `export type PublicEntry${i} = typeof import(${JSON.stringify(entry)});`).join('\n') + '\n' + (profile.additionalSource ?? ''));
        writeFileSync(join(consumer, `tsconfig.${name}.json`), JSON.stringify({
            compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'], strict: true, skipLibCheck: false, noEmit: true, types: profile.types },
            files: [file],
        }, null, 2));
        const result = run(['exec', 'tsc', '-p', `tsconfig.${name}.json`, '--pretty', 'false']);
        evidence.profiles[name] = { entries: profile.entries, skipLibCheck: false, exit: result.status, error: result.error?.message };
        console.log(`${name}: ${profile.entries.length} exports, exit ${result.status}`);
        if (result.status !== 0 || result.error) process.exitCode = 1;
    }
    evidence.success = Object.values(evidence.profiles).every(profile => profile.exit === 0);
} catch (error) {
    evidence.success = false;
    evidence.failure = error.message;
    console.error(error.message);
    process.exitCode = 1;
} finally {
    persist();
    console.log('Evidence retained: ' + join(output, 'evidence.json'));
}
