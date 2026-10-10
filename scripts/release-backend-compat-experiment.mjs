/** External dependency experiments, never a replacement for release acceptance. */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, realpathSync, cpSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const source = process.argv[2];
assert.ok(source, 'Usage: pnpm exec node scripts/release-backend-compat-experiment.mjs <successful retained proof> [--online]');
const prior = JSON.parse(readFileSync(join(source, 'evidence.json'), 'utf8'));
assert.equal(prior.success, true);
for (const archive of prior.archives) {
    const path = join(source, 'archives', `${archive.name.replace('@', '').replace('/', '-')}-${archive.version}.tgz`);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), archive.sha256);
}
const manifest = JSON.parse(readFileSync(join(source, 'consumer/package.json'), 'utf8'));
const output = mkdtempSync(join(tmpdir(), 'frontbase-r1-backend-compat-'));
const cli = process.env.npm_execpath || join(process.env.APPDATA ?? '', 'npm/node_modules/pnpm/bin/pnpm.cjs');
assert.ok(existsSync(cli), 'Run through pnpm exec');
const online = process.argv.includes('--online');
const repair = process.argv.includes('--repair-candidate');
const evidence = { source, output, archiveHashes: prior.archives, online, repairCandidate: repair, lifecycleScripts: false, skipLibCheck: false, experiments: [] };
const persist = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log('External backend experiment: ' + output); persist();
let repairedPath;
if (repair) {
    // Never edit an installed graph or pnpm store file: make an independent package copy.
    const backendPackage = realpathSync(join(source, 'consumer/node_modules/@frontbase/backend'));
    const original = realpathSync(join(backendPackage, '../../drizzle-orm'));
    assert.equal(JSON.parse(readFileSync(join(original, 'package.json'), 'utf8')).version, '0.36.4');
    repairedPath = join(output, 'drizzle-declaration-candidate'); cpSync(original, repairedPath, { dereference: true, recursive: true });
    const hashFiles = (root) => {
        const records = [];
        const visit = (directory) => {
            for (const item of readdirSync(directory, { withFileTypes: true })) {
                const path = join(directory, item.name);
                if (item.isDirectory()) visit(path);
                else { assert.ok(item.isFile(), 'Unexpected package entry'); records.push({ path: relative(root, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }); }
            }
        }; visit(root); return records.sort((a,b) => a.path.localeCompare(b.path));
    };
    const before = hashFiles(repairedPath);
    const patches = [];
    function modify(path, transform) {
        const absolute = join(repairedPath, path), old = readFileSync(absolute, 'utf8'), updated = transform(old);
        assert.notEqual(old, updated, 'Patch must change expected declaration: ' + path);
        writeFileSync(absolute, updated);
        patches.push({ path, before: createHash('sha256').update(old).digest('hex'), after: createHash('sha256').update(updated).digest('hex'), original: old, updated });
    }
    function once(text, anchor, replacement) {
        assert.equal(text.split(anchor).length - 1, 1, 'Unique patch anchor required: ' + anchor);
        return text.replace(anchor, replacement);
    }
    for (const extension of ['d.ts', 'd.cts']) {
        for (const dialect of ['pg', 'sqlite']) modify(`${dialect}-core/query-builders/query.${extension}`, text => {
            text = once(text, 'import type { Query, SQLWrapper }', 'import type { Query, SQL, SQLWrapper }');
            return once(text, '    toSQL(): Query;', '    getSQL(): SQL;\n    toSQL(): Query;');
        });
        modify(`mysql-core/query-builders/delete.${extension}`, text => once(text, '    toSQL(): Query;', '    getSQL(): SQL;\n    toSQL(): Query;'));
        for (const dialect of ['mysql', 'sqlite']) {
            const key = dialect === 'mysql' ? 'session' : 'config';
            modify(`${dialect}-core/query-builders/select.${extension}`, text => {
                const dialectName = dialect === 'mysql' ? 'MySql' : 'SQLite';
                return once(text, `    protected dialect: ${dialectName}Dialect;`, `    protected dialect: ${dialectName}Dialect;\n    getSQL(): SQL;`);
            });
            modify(`${dialect}-core/query-builders/select.types.${extension}`, text => once(text, `'${key}' | `, ''));
        }
        modify(`pg-core/roles.${extension}`, text => once(text, '    readonly name: string;', '    readonly name: string;\n    createDb?: boolean;\n    createRole?: boolean;\n    inherit?: boolean;'));
    }
    const after = hashFiles(repairedPath);
    assert.equal(before.length, after.length);
    const changed = after.filter((record, i) => record.sha256 !== before[i].sha256);
    assert.equal(changed.length, 16);
    assert.ok(changed.every(record => /\.d\.(ts|cts)$/.test(record.path)));
    evidence.candidate = { path: repairedPath, name: 'drizzle-orm', version: '0.36.4', adopted: false, changedDeclarations: changed, runtimeBytesUnchanged: true, allFileHashesBefore: before, allFileHashesAfter: after };
    writeFileSync(join(output, 'declaration-patches.json'), JSON.stringify(patches, null, 2)); persist();
}
const scenarios = repair ? [
    { name: 'declaration-repair-without-driver', drizzle: '0.36.4' },
    { name: 'declaration-repair-candidate', drizzle: '0.36.4', mysql: '3.24.5' },
] : [
    { name: 'baseline', drizzle: '0.36.4' },
    { name: 'optional-mysql', drizzle: '0.36.4', mysql: '3.24.5' },
    { name: 'candidate-latest', drizzle: '0.45.4', mysql: '3.24.5' },
];
for (const scenario of scenarios) {
    const cwd = join(output, scenario.name); mkdirSync(cwd);
    const experiment = { ...scenario, commands: [], profiles: {} }; evidence.experiments.push(experiment);
    function run(args, executable = cli) {
        const r = spawnSync(process.execPath, [executable, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 12 * 1024 * 1024 });
        experiment.commands.push({ args, executable, exit: r.status, error: r.error?.message, stdout: r.stdout, stderr: r.stderr }); persist(); return r;
    }
    const pkg = structuredClone(manifest);
    pkg.name = `frontbase-experiment-${scenario.name}`;
    pkg.dependencies['drizzle-orm'] = repairedPath ? `file:${repairedPath.replaceAll('\\', '/')}` : scenario.drizzle;
    pkg.pnpm.overrides['drizzle-orm'] = pkg.dependencies['drizzle-orm'];
    pkg.devDependencies = { typescript: '6.0.3', '@types/node': '26.1.1' };
    if (scenario.mysql) pkg.devDependencies.mysql2 = scenario.mysql;
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2));
    const install = run(['install', ...(online ? [] : ['--offline']), '--ignore-scripts']);
    if (install.status !== 0) { experiment.installFailed = true; process.exitCode = 1; continue; }
    // Dependencies may use links inside this consumer but never a workspace or sibling graph.
    function checkLinks(path) {
        for (const item of readdirSync(path, { withFileTypes: true })) {
            const child = join(path, item.name);
            if (item.isSymbolicLink()) {
                const resolved = relative(cwd, realpathSync(child));
                assert.ok(!isAbsolute(resolved) && resolved !== '..' && !resolved.startsWith('../') && !resolved.startsWith('..\\'), 'Escaped consumer dependency link: ' + child);
            } else if (item.isDirectory()) checkLinks(child);
        }
    }
    checkLinks(join(cwd, 'node_modules')); experiment.noEscapedLinks = true;
    experiment.installedDrizzle = JSON.parse(readFileSync(join(cwd, 'node_modules/drizzle-orm/package.json'), 'utf8')).version;
    assert.equal(experiment.installedDrizzle, scenario.drizzle);
    const entries = prior.importEntries.map((entry, i) => `export type Entry${i} = typeof import(${JSON.stringify(entry)});`).join('\n');
    writeFileSync(join(cwd, 'consumer.ts'), entries + `
import { publishedPages } from '@frontbase/backend';
type Page = typeof publishedPages.$inferSelect;
const version: Page['version'] = 1;
// @ts-expect-error Schema model must retain its numeric version type.
const invalidVersion: Page['version'] = 'invalid';
type Insert = typeof publishedPages.$inferInsert;
const row: Insert = { slug: '/', tenantSlug: 'synthetic', title: 'Synthetic', layoutData: '{}', updatedAt: '2026-10-09' };
// @ts-expect-error tenantSlug remains required.
const invalidRow: Insert = { slug: '/', title: 'Synthetic', layoutData: '{}', updatedAt: '2026-10-09' };
`);
    for (const mode of ['NodeNext', 'Bundler']) {
        const config = { compilerOptions: { target: 'ES2022', module: mode === 'Bundler' ? 'ESNext' : mode, moduleResolution: mode, strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['node'] }, files: ['consumer.ts'] };
        writeFileSync(join(cwd, `tsconfig.${mode}.json`), JSON.stringify(config, null, 2));
        const r = run(['exec', 'tsc', '-p', `tsconfig.${mode}.json`, '--pretty', 'false']);
        experiment.profiles[mode] = { exit: r.status, diagnostics: (r.stdout?.match(/error TS\d+/g) ?? []).length };
        console.log(`${scenario.name}/${mode}: exit ${r.status}, ${experiment.profiles[mode].diagnostics} diagnostics`);
    }
    // Importing only upstream SQLite schema builders separates upstream defects from Frontbase APIs.
    writeFileSync(join(cwd, 'upstream.ts'), `import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';\nconst table = sqliteTable('synthetic', { name: text('name').notNull(), version: integer('version').notNull() });\ntype Row = typeof table.$inferSelect;\nconst row: Row = { name: 'synthetic', version: 1 };\n// @ts-expect-error Numeric schema data remains numeric.\nconst invalid: Row = { name: 'synthetic', version: 'invalid' };\n`);
    if (repair) {
        const modelChecks = `
import { QueryBuilder } from 'drizzle-orm/sqlite-core';
import { eq, SQL } from 'drizzle-orm';
const qb = new QueryBuilder();
const selected = qb.select().from(table).where(eq(table.name, 'synthetic'));
const realSQL: SQL = selected.getSQL();
// @ts-expect-error SQLWrapper returns the real SQL type, not a string or any.
const invalidSQL: string = selected.getSQL();
// @ts-expect-error A static where cannot be repeated.
selected.where(eq(table.name, 'synthetic'));
const combined = qb.select().from(table).union(qb.select().from(table));
// @ts-expect-error Public where exclusion survives removal of the private config key.
combined.where(eq(table.name, 'synthetic'));
// @ts-expect-error Typed columns remain real SQL expressions.
eq(table.version, 'invalid');
`;
        writeFileSync(join(cwd, 'upstream.ts'), readFileSync(join(cwd, 'upstream.ts'), 'utf8') + modelChecks);
        // The same fluent checks also consume a real exported Frontbase schema.
        writeFileSync(join(cwd, 'consumer.ts'), readFileSync(join(cwd, 'consumer.ts'), 'utf8') + modelChecks.replaceAll('table.name', 'publishedPages.title').replaceAll('table.version', 'publishedPages.version').replaceAll('.from(table)', '.from(publishedPages)'));
    }
    const upstreamConfig = JSON.parse(readFileSync(join(cwd, 'tsconfig.NodeNext.json'), 'utf8'));
    upstreamConfig.files = ['upstream.ts'];
    writeFileSync(join(cwd, 'tsconfig.upstream.json'), JSON.stringify(upstreamConfig, null, 2));
    const upstream = run(['exec', 'tsc', '-p', 'tsconfig.upstream.json', '--pretty', 'false']);
    experiment.profiles.upstreamOnly = { exit: upstream.status, diagnostics: (upstream.stdout?.match(/error TS\d+/g) ?? []).length };
    console.log(`${scenario.name}/upstreamOnly: exit ${upstream.status}, ${experiment.profiles.upstreamOnly.diagnostics} diagnostics`);
    writeFileSync(join(cwd, 'runtime.mjs'), `
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as backend from '@frontbase/backend';
import { getTableConfig, QueryBuilder } from 'drizzle-orm/sqlite-core';
import { is, Table, SQL, eq } from 'drizzle-orm';
for (const entry of ${JSON.stringify(prior.importEntries)}) await import(entry);
const schema = Object.entries(backend).filter(([, value]) => is(value, Table)).map(([key, table]) => {
    const config = getTableConfig(table);
    return { key, name: config.name, columns: config.columns.map(c => ({ name:c.name, dataType:c.dataType, columnType:c.columnType, notNull:c.notNull, hasDefault:c.hasDefault, default:c.default })) };
}).sort((a,b) => a.key.localeCompare(b.key));
assert.ok(schema.length > 0);
const qb = new QueryBuilder();
const selected = qb.select().from(backend.publishedPages).where(eq(backend.publishedPages.version, 1));
assert.ok(selected.getSQL() instanceof SQL);
assert.equal(typeof selected.toSQL().sql, 'string');
assert.ok(qb.select().from(backend.publishedPages).union(qb.select().from(backend.publishedPages)).getSQL() instanceof SQL);
const digest = createHash('sha256').update(JSON.stringify(schema)).digest('hex');
console.log(JSON.stringify({ entries: ${prior.importEntries.length}, tables: schema.length, digest, schema }));
`);
    const runtime = run([], join(cwd, 'runtime.mjs'));
    try { experiment.runtime = JSON.parse(runtime.stdout.trim()); } catch { experiment.runtimeFailed = true; }
    if (runtime.status !== 0 || runtime.error) experiment.runtimeFailed = true;
    persist();
}
evidence.diagnosticComplete = evidence.experiments.every(e => !e.installFailed && !e.runtimeFailed);
evidence.schemaMetadataAgreement = evidence.experiments.every(e => e.runtime?.digest === evidence.experiments[0].runtime?.digest);
for (const archive of prior.archives) {
    const path = join(source, 'archives', `${archive.name.replace('@', '').replace('/', '-')}-${archive.version}.tgz`);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), archive.sha256);
}
evidence.archivesUnchanged = true;
// Expected failing profiles are diagnostic outcomes, not hidden GREEN acceptance.
if (!evidence.diagnosticComplete) process.exitCode = 1;
persist();
console.log('Evidence: ' + join(output, 'evidence.json'));
