/** Independent offline tarball consumer proof. No registry publication, lifecycle scripts or network. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, realpath, cp } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [npmArg, outputArg] = process.argv.slice(2);
if (!npmArg || !outputArg) throw Error('Usage: node scripts/localization/verify-package.mjs <npm-cli.js> <new-private-output-directory-outside-workspace>');
const workspace = await realpath(process.cwd()), npm = resolve(npmArg), output = resolve(outputArg);
await mkdir(output, { recursive: true });
const resolvedOutput = await realpath(output), relativeOutput = relative(workspace, resolvedOutput);
assert.ok(relativeOutput.startsWith('..') || isAbsolute(relativeOutput), 'Consumer must live outside the workspace');
const manifest = JSON.parse(await readFile('packages/translation/package.json', 'utf8'));
assert.equal(manifest.name, '@frontbase/translation');
assert.ok(!manifest.private);
for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    assert.ok(!name.startsWith('@frontbase/'), 'Standalone engine must not depend on its Frontbase consumers');
}
const npmRun = (args, cwd) => execFileSync(process.execPath, [npm, ...args, '--cache', join(output, 'npm-cache')], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const pack = cwd => {
    const result = JSON.parse(npmRun(['pack', cwd, '--offline', '--ignore-scripts', '--json', '--pack-destination', output], output))[0];
    return { ...result, path: join(output, result.filename) };
};
const packed = pack(resolve('packages/translation'));
assert.ok(packed.files.some(file => file.path === 'dist/index.d.ts'));
assert.ok(packed.files.some(file => file.path === 'LICENSE'));
assert.ok(packed.files.some(file => file.path === 'sql/postgrest-v1.sql'));
assert.ok(!packed.files.some(file => /adapters\/postgres[.\-]/.test(file.path)), 'Retired native SQL adapters must not ship');
assert.ok(!packed.files.some(file => /(^|\/)(node_modules|test|src)\//.test(file.path)));
const packageRequire = createRequire(resolve('packages/translation/package.json'));
// Materialize the installed dependency: pnpm's store-backed file links are not an npm source tree.
const zodFixture = join(output, 'zod-fixture');
await cp(dirname(packageRequire.resolve('zod/package.json')), zodFixture, { recursive: true, dereference: true });
const zod = pack(zodFixture);
const consumer = join(output, 'consumer');
await mkdir(consumer); // Deliberately refuse reusing an existing consumer installation.
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'translation-external-consumer', private: true, type: 'module' }), 'utf8');
npmRun(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', packed.path, zod.path], consumer);
const installed = join(consumer, 'node_modules', '@frontbase', 'translation');
assert.equal(await realpath(installed), installed, 'External package must be installed, not workspace-linked');
await writeFile(join(consumer, 'test.mjs'), await readFile('packages/translation/test/localization.mjs', 'utf8'), 'utf8');
let functionalOutput = execFileSync(process.execPath, ['--disallow-code-generation-from-strings', 'test.mjs'], { cwd: consumer, encoding: 'utf8' });
for (const name of ['revisions.mjs', 'memory-persistence.mjs', 'jobs.mjs', 'job-fixtures.mjs', 'postgrest.mjs', 'accounting.mjs']) await writeFile(join(consumer, name), await readFile('packages/translation/test/' + name, 'utf8'), 'utf8');
functionalOutput += execFileSync(process.execPath, ['--disallow-code-generation-from-strings', 'revisions.mjs'], { cwd: consumer, encoding: 'utf8' });
functionalOutput += execFileSync(process.execPath, ['--disallow-code-generation-from-strings', 'jobs.mjs'], { cwd: consumer, encoding: 'utf8' });
functionalOutput += execFileSync(process.execPath, ['--disallow-code-generation-from-strings', 'postgrest.mjs'], { cwd: consumer, encoding: 'utf8' });
functionalOutput += execFileSync(process.execPath, ['--disallow-code-generation-from-strings', 'accounting.mjs'], { cwd: consumer, encoding: 'utf8' });
await writeFile(join(consumer, 'consumer.ts'), `import { translationUnitId, type ResourceRef } from '@frontbase/translation';
import { extractRichTextSegments } from '@frontbase/translation/rich-text';
import { TranslationLifecycle } from '@frontbase/translation/revisions';
import { SqliteTranslationPersistence, type SqliteConnection } from '@frontbase/translation/adapters/sqlite';
import { SqliteTranslationJobPersistence } from '@frontbase/translation/adapters/sqlite-jobs';
import { TranslationJobRunner } from '@frontbase/translation/jobs';
import { SqliteTranslationAccountingPersistence } from '@frontbase/translation/adapters/sqlite-accounting';
import { translationAttemptAccounting, type TranslationAllowance } from '@frontbase/translation';
import { PostgrestTranslationJobPersistence, type TranslationRpcTransport } from '@frontbase/translation/adapters/postgrest';
declare const transport: TranslationRpcTransport;
const httpJobs = new PostgrestTranslationJobPersistence(transport);
void httpJobs;
declare const connection: SqliteConnection;
const lifecycle = new TranslationLifecycle(new SqliteTranslationPersistence(connection));
const jobs = new SqliteTranslationJobPersistence(connection);
const accounted = new SqliteTranslationAccountingPersistence(connection);
void accounted; void translationAttemptAccounting; const allowanceType: TranslationAllowance | null = null; void allowanceType;
const runner = new TranslationJobRunner(jobs, {id:'fixture',generate:async()=>({text:'test'})}, {authorize:async()=>false});
const resource: ResourceRef = {kind:'system',componentKind:'Card',messageId:'title'};
const promise: Promise<string> = translationUnitId({tenantId:'tenant',projectId:'project'},resource);
const segments = extractRichTextSegments({version:1,children:[]});
void promise; void segments; void lifecycle; void runner;
`, 'utf8');
execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--strict', '--noEmit', 'consumer.ts'], { cwd: consumer, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const receipt = { package: manifest.name, version: manifest.version, node: process.version, dependencies: manifest.dependencies,
    packedBytes: packed.size, unpackedBytes: packed.unpackedSize, files: packed.files.map(file => file.path),
    sha256: createHash('sha256').update(await readFile(packed.path)).digest('hex'),
    outsideWorkspace: true, offlineInstall: true, lifecycleScriptsDisabled: true, publicExportsFunctional: true, externalTypeDeclarations: true, externalSqliteLifecycle: true, externalSqliteJobs: true, externalSqliteAccounting: true, externalHttpAdapterContract: true,
    limitations: ['Unpublished engine with deterministic local provider only; no configured AI service; external-consumer test uses injected HTTP transport, not a live database', 'Uses a locally packed copy of the existing Zod dependency, not npm registry availability proof', 'No browser/deployed-host or minimum-Node acceptance from this consumer test', 'Consumer uses the installed compiler as a test tool, not an application dependency'] };
await writeFile(join(output, 'results-package.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(functionalOutput + JSON.stringify(receipt, null, 2));
