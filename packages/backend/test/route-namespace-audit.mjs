import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { auditRouteNamespace, inspectNamespacePath } from '../dist/compat/route-namespace-audit.js';

let count = 0;
const test = async (name, run) => { await run(); count++; console.log(`ok - ${name}`); };
const row = (id, slug, extra = {}) => ({ tenant_slug: 'alpha', id, slug, is_homepage: 0, deleted_at: null, ...extra });
const fake = (compat = [], drafts = [], published = []) => ({ query: async (sql, params) => {
    assert.ok(sql.startsWith('SELECT ') && sql.includes('tenant_slug = ?') && sql.endsWith('LIMIT 1001'));
    assert.deepEqual(params, ['alpha']);
    return structuredClone(sql.includes('FROM compat_pages') ? compat : sql.includes('FROM drafts') ? drafts : published);
} });
const options = { includeFramework: true };
await test('conservative classifier preserves supported exact spelling and refuses aliases/reserved routes', async () => {
    for (const path of ['/', '/College/', '/college', '/old-parent/program/']) assert.equal(inspectNamespacePath(path), 'supported');
    for (const path of ['/builder/x', '/console/x', '/frontbase-setup/x', '/health/x', '/sw.js', '/robots.txt', '/API/x']) assert.equal(inspectNamespacePath(path), 'reserved');
    for (const path of ['College', '//College/', '/%43ollege/', '/a%2fb', '/a//b', '/a/../b', '/a?token=PRIVATE', '/a_b']) assert.equal(inspectNamespacePath(path), 'unsupported');
});
await test('real database owner-only reads are byte-preserving and framework draft/publication share identity', async () => {
    const db = sqliteRunner(':memory:'); await migrateUp(db);
    const now = '2026-10-10T00:00:00Z';
    await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,is_homepage,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', ['a', 'alpha', 'A', 'College', '{}', 0, now, now]);
    await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,is_homepage,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', ['foreign', 'beta', 'PRIVATE_FOREIGN', 'College', '{}', 1, now, now]);
    await db.exec('INSERT INTO drafts (slug,tenant_slug,layout_data,updated_at) VALUES (?,?,?,?)', ['framework', 'alpha', '{}', now]);
    await db.exec('INSERT INTO published_pages (slug,tenant_slug,title,layout_data,version,updated_at) VALUES (?,?,?,?,?,?)', ['framework', 'alpha', 'F', '{}', 1, now]);
    const snapshot = () => Promise.all(['compat_pages', 'drafts', 'published_pages'].map(table => db.query(`SELECT * FROM ${table} ORDER BY tenant_slug,slug`)));
    const before = JSON.stringify(await snapshot());
    const audited = await auditRouteNamespace({ query: (...args) => db.query(...args) }, 'alpha', options);
    assert.equal(audited.status, 'clear'); assert.equal(audited.resourcesChecked, 2); assert.equal(audited.installAvailable, false);
    assert.equal(JSON.stringify(await snapshot()), before);
    assert.ok(!JSON.stringify(audited).includes('PRIVATE_FOREIGN'));
});
await test('tombstones and separate families collide even when IDs match', async () => {
    const result = await auditRouteNamespace(fake([row('College', 'College', { deleted_at: '2026-10-09' })], [{ tenant_slug: 'alpha', slug: 'College' }]), 'alpha', options);
    assert.equal(result.status, 'conflicts'); assert.equal(result.issues[0].code, 'route_conflict');
    assert.deepEqual(result.issues[0].resources.map(r => r.source), ['compat', 'framework']);
    assert.equal(result.issues[0].resources[0].deleted, true);
    const mixed = await auditRouteNamespace(fake([row('one', 'College'), row('two', 'College'), row('three', 'college')]), 'alpha', options);
    assert.equal(mixed.status, 'conflicts');
    assert.deepEqual(mixed.issues.map(issue => issue.code), ['potential_alias_conflict', 'route_conflict']);
    assert.equal(mixed.issues.find(issue => issue.code === 'route_conflict').resources.length, 2);
});
await test('case/slash and public listing addresses create conservative conflicts without rewriting', async () => {
    const result = await auditRouteNamespace(fake([row('one', 'College')]), 'alpha', { ...options,
        publicPaths: [{ source: 'institution', id: '512', path: '/college/' }] });
    assert.equal(result.status, 'conflicts'); assert.equal(result.issues[0].code, 'potential_alias_conflict');
    assert.deepEqual(result.issues[0].resources.map(r => r.path), ['/College', '/college/']);
});
await test('home flags reserve root, including deleted home and independent literal public root', async () => {
    const result = await auditRouteNamespace(fake([row('one', 'home', { is_homepage: 1, deleted_at: 'yesterday' }), row('two', 'other', { is_homepage: 1 })]), 'alpha', options);
    assert.equal(result.status, 'conflicts'); assert.equal(result.issues[0].resources[0].path, '/');
    const publicHome = await auditRouteNamespace(fake([row('one', 'home', { is_homepage: 1 })]), 'alpha', { ...options, publicPaths: [{ source: 'template', id: 'home', path: '/' }] });
    assert.equal(publicHome.status, 'conflicts');
});
await test('unsupported stored boundary slashes and encoded paths refuse without echoing raw path', async () => {
    const result = await auditRouteNamespace(fake([row('one', 'College/'), row('two', '/College'), row('three', 'a?token=PRIVATE')]), 'alpha', options);
    assert.equal(result.status, 'conflicts'); assert.equal(result.issues.length, 3);
    assert.ok(result.issues.every(issue => issue.code === 'unsupported_path' && issue.resources[0].path === ''));
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
await test('ordering is deterministic and source input is not mutated', async () => {
    const rows = [row('one', 'College'), row('two', 'college'), row('three', 'another')];
    const paths = [{ source: 'institution', id: '512', path: '/College/' }, { source: 'program', id: '9', path: '/another/' }];
    const baseline = JSON.stringify([rows, paths]);
    const first = await auditRouteNamespace(fake(rows), 'alpha', { ...options, publicPaths: paths });
    const reverse = await auditRouteNamespace(fake([...rows].reverse()), 'alpha', { ...options, publicPaths: [...paths].reverse() });
    assert.deepEqual(first, reverse); assert.equal(JSON.stringify([rows, paths]), baseline);
});
await test('observed drift and provider faults return bounded refusals', async () => {
    let calls = 0;
    const drift = await auditRouteNamespace({ query: async () => [row('one', ++calls === 1 ? 'old' : 'new')] }, 'alpha', { includeFramework: false });
    assert.equal(drift.code, 'namespace_changed');
    const failed = await auditRouteNamespace({ query: async () => { throw new Error('PRIVATE_CONNECTION'); } }, 'alpha', options);
    assert.equal(failed.code, 'namespace_unavailable'); assert.ok(!JSON.stringify(failed).includes('PRIVATE'));
});
await test('foreign rows, duplicate persistence keys, malformed projections and overflow refuse', async () => {
    for (const rows of [[row('foreign', 'x', { tenant_slug: 'beta' })], [row('one', 'a'), row('one', 'b')], [row('one', 'a', { is_homepage: '1' })]]) {
        assert.equal((await auditRouteNamespace(fake(rows), 'alpha', options)).code, 'namespace_invalid');
    }
    assert.equal((await auditRouteNamespace(fake(Array.from({ length: 1001 }, (_, i) => row('r' + i, 'r' + i))), 'alpha', options)).code, 'namespace_too_large');
    assert.equal((await auditRouteNamespace(fake(), 'alpha', { ...options, publicPaths: [{ source: 'unknown', id: 'x', path: '/x' }] })).code, 'namespace_invalid');
    assert.equal((await auditRouteNamespace(fake(), 'alpha', { ...options, publicPaths: [{ source: 'institution', id: 'same', path: '/x' }, { source: 'institution', id: 'same', path: '/y' }] })).code, 'namespace_invalid');
    assert.equal((await auditRouteNamespace(fake(), '', options)).code, 'namespace_invalid');
});
await test('large conflict evidence is bounded and never grants installation', async () => {
    const result = await auditRouteNamespace(fake(Array.from({ length: 60 }, (_, i) => row('r' + i, 'same'))), 'alpha', options);
    assert.equal(result.status, 'conflicts'); assert.equal(result.truncated, true);
    assert.equal(result.issues[0].resources.length, 50); assert.equal(result.installAvailable, false);
});
await test('retired framework surfaces are not queried and caller options are frozen', async () => {
    const settings = { includeFramework: false, publicPaths: [{ source: 'institution', id: '1', path: '/one/' }] };
    let calls = 0;
    const result = await auditRouteNamespace({ query: async sql => {
        assert.ok(sql.includes('compat_pages')); calls++; settings.includeFramework = true; settings.publicPaths[0].path = '/changed/'; return [row('owned', 'one')];
    } }, 'alpha', settings);
    assert.equal(calls, 2); assert.equal(result.status, 'conflicts'); assert.equal(result.resourcesChecked, 2);
    assert.deepEqual(result.issues[0].resources.map(ref => ref.path), ['/one', '/one/']);
});
console.log(`${count}/11 read-only namespace audit groups passed; installer remains unavailable.`);
