// Independent in-memory source faults. No source/dist overwrite or network.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const original = await readFile(new URL('../src/compat/route-namespace-audit.ts', import.meta.url), 'utf8');
let serial = 0;
async function load(source) {
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    return import('data:text/javascript;base64,' + Buffer.from(js + `\n// ${serial++}`).toString('base64'));
}
const row = (id, extra = {}) => ({ tenant_slug: 'alpha', id, slug: 'College', is_homepage: 0, deleted_at: null, ...extra });
const queryOnly = compat => ({ query: async sql => sql.includes('FROM compat_pages') ? structuredClone(compat) : [] });
async function evidence(api) {
    const foreign = await api.auditRouteNamespace(queryOnly([row('PRIVATE_FOREIGN', { tenant_slug: 'beta' })]), 'alpha', { includeFramework: false });
    assert.equal(foreign.status, 'unavailable', '[detector:foreign-row]');
    assert.equal(foreign.code, 'namespace_invalid', '[detector:foreign-row]');
    const deleted = await api.auditRouteNamespace(queryOnly([row('trashed', { deleted_at: 'yesterday' })]), 'alpha', {
        includeFramework: false, publicPaths: [{ source: 'institution', id: 'same', path: '/College' }],
    });
    assert.equal(deleted.status, 'conflicts', '[detector:tombstone]');
    const aliases = await api.auditRouteNamespace(queryOnly([row('original')]), 'alpha', {
        includeFramework: false, publicPaths: [{ source: 'institution', id: 'same', path: '/college/' }],
    });
    assert.equal(aliases.status, 'conflicts', '[detector:alias]');
    assert.equal(aliases.issues[0].code, 'potential_alias_conflict', '[detector:alias]');
    let reads = 0;
    const drift = await api.auditRouteNamespace({ query: async () => [row(++reads === 1 ? 'before' : 'after')] }, 'alpha', { includeFramework: false });
    assert.equal(drift.code, 'namespace_changed', '[detector:drift]');
    const clean = await api.auditRouteNamespace(queryOnly([row('owned')]), 'alpha', { includeFramework: false });
    assert.equal(clean.installAvailable, false, '[detector:no-admission]');
}
const faults = [
    ['foreign-row', 'row.tenant_slug !== owner || ', ''],
    ['tombstone', 'for (const row of before.compat) {', 'for (const row of before.compat.filter(row => row.deleted_at === null)) {'],
    ['alias', String.raw`(ref.path.replace(/\/$/, '') || '/').toLowerCase()`, 'ref.path'],
    ['drift', "if (JSON.stringify(before) !== JSON.stringify(after)) return unavailable('namespace_changed');", ''],
    ['no-admission', 'resourcesChecked: refs.length, truncated, installAvailable: false', 'resourcesChecked: refs.length, truncated, installAvailable: true'],
];
for (const [name, from, to] of faults) {
    assert.equal(original.split(from).length - 1, 1, `unique source fault: ${name}`);
    await evidence(await load(original));
    await assert.rejects(() => evidenceLoad(original.replace(from, to)), error => error.message.includes(`[detector:${name}]`));
    await evidence(await load(original));
    console.log(`detected - ${name}; original baseline restored in memory`);
}
async function evidenceLoad(source) { return evidence(await load(source)); }
assert.equal(await readFile(new URL('../src/compat/route-namespace-audit.ts', import.meta.url), 'utf8'), original);
console.log('5/5 independent namespace audit source faults detected; repository bytes unchanged.');
