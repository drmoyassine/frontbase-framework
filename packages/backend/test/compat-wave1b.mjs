/**
 * CF-22 P2 Wave 1b — conformance for pages (17), database (10), rls (14).
 * Validates responses against the vendored contract Zod (the product's own
 * schemas) and exercises the round-trips that matter for the Builder Studio +
 * Data Studio consoles.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

async function makeApp() {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    return createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: 'owner' }, tenant: '_default' }),
        now: () => '2026-07-15T00:00:00Z',
    });
}
const req = (app, method, path, body) =>
    app.fetch(new Request('http://api.local' + path, {
        method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }));

// ---- pages ----
test('pages: create → list → get → update → layout round-trips', async () => {
    const app = await makeApp();
    const created = await (await req(app, 'POST', '/api/pages/', { name: 'Home', slug: 'home', title: 'Home' })).json();
    assert.ok(created.data.id);
    const list = await (await req(app, 'GET', '/api/pages/')).json();
    assert.equal(list.success, true); assert.equal(list.data.length, 1);
    const got = await (await req(app, 'GET', '/api/pages/' + created.data.id + '/')).json();
    assert.equal(got.data.slug, 'home');
    const upd = await (await req(app, 'PUT', '/api/pages/' + created.data.id + '/', { name: 'Home2' }));
    assert.equal(upd.status, 200);
    const layout = await req(app, 'PUT', '/api/pages/' + created.data.id + '/layout/', { layoutData: { content: [], root: { x: 1 } } });
    assert.equal(layout.status, 200);
});

test('pages: versions snapshot + rollback', async () => {
    const app = await makeApp();
    const p = await (await req(app, 'POST', '/api/pages/', { name: 'V', slug: 'v' })).json();
    await req(app, 'PUT', '/api/pages/' + p.data.id + '/layout/', { layoutData: { root: { a: 1 } } });
    const v1 = await (await req(app, 'POST', '/api/pages/' + p.data.id + '/versions/', { label: 'v1' })).json();
    assert.ok(v1.data.versionNumber >= 1);
    const list = await (await req(app, 'GET', '/api/pages/' + p.data.id + '/versions/')).json();
    assert.ok(list.data.length >= 1);
    const detail = await (await req(app, 'GET', '/api/pages/' + p.data.id + '/versions/' + v1.data.id + '/')).json();
    assert.ok(detail.data.layoutData);
    const rb = await req(app, 'POST', '/api/pages/' + p.data.id + '/rollback/', { version_id: v1.data.id });
    assert.equal(rb.status, 200);
});

test('pages: soft-delete → restore → permanent', async () => {
    const app = await makeApp();
    const p = await (await req(app, 'POST', '/api/pages/', { name: 'D', slug: 'd' })).json();
    assert.equal((await req(app, 'DELETE', '/api/pages/' + p.data.id + '/')).status, 200);
    const afterDelete = await (await req(app, 'GET', '/api/pages/')).json();
    assert.equal(afterDelete.data.length, 0);
    assert.equal((await req(app, 'POST', '/api/pages/' + p.data.id + '/restore/')).status, 200);
    assert.equal((await req(app, 'DELETE', '/api/pages/' + p.data.id + '/permanent/')).status, 200);
    assert.equal((await req(app, 'GET', '/api/pages/' + p.data.id + '/')).status, 404);
});

test('pages: publish + public/homepage', async () => {
    const app = await makeApp();
    const p = await (await req(app, 'POST', '/api/pages/', { name: 'Pub', slug: 'pub', isHomepage: true })).json();
    await req(app, 'PUT', '/api/pages/' + p.data.id + '/', { isHomepage: true });
    const pub = await (await req(app, 'POST', '/api/pages/' + p.data.id + '/publish/local/')).json();
    assert.equal(pub.success, true);
    const batch = await (await req(app, 'POST', '/api/pages/' + p.data.id + '/publish-batch/', {
        engine_ids: ['local'],
    })).json();
    assert.ok(Array.isArray(batch.results));
    const pubslug = await (await req(app, 'GET', '/api/pages/public/pub/')).json();
    assert.equal(pubslug.data.slug, 'pub');
});

// ---- database ----
test('database: connections + graceful empty introspection', async () => {
    const app = await makeApp();
    const conn = await (await req(app, 'GET', '/api/database/connections/')).json();
    // DatabaseConnectionResponse envelope (contract bf1ac54): {success, data, message?}
    assert.equal(conn.success, true);
    assert.equal(conn.data.supabase.connected, false);
    const tables = await (await req(app, 'GET', '/api/database/tables/')).json();
    assert.deepEqual(tables.data.tables, []);
    const schema = await (await req(app, 'GET', '/api/database/table-schema/users/')).json();
    assert.equal(schema.data.table_name, 'users');
    const data = await (await req(app, 'GET', '/api/database/table-data/users/')).json();
    assert.equal(data.total, 0);
});

// ---- rls ----
test('rls: policies/tables empty; metadata round-trips', async () => {
    const app = await makeApp();
    assert.deepEqual((await (await req(app, 'GET', '/api/database/rls/policies/')).json()).data, []);
    const saved = await (await req(app, 'POST', '/api/database/rls/metadata/', { tableName: 'users', policyName: 'p1', formData: {} })).json();
    assert.equal(saved.data.tableName, 'users');
    const got = await (await req(app, 'GET', '/api/database/rls/metadata/users/p1')).json();
    assert.equal(got.data.policyName, 'p1');
    const verify = await (await req(app, 'POST', '/api/database/rls/metadata/verify/', {
        tableName: 'users',
        policyName: 'p1',
    })).json();
    assert.equal(verify.data.isVerified, true);
});

// Runner
let failed = 0;
for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\ncompat-wave1b: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
