import assert from 'node:assert/strict';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

let passed = 0, failed = 0;
async function fixture() {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async (request) => ({
            user: { id: 'owner-' + (request.headers.get('x-test-tenant') ?? 'tenant-a'), role: 'master_admin' },
            tenant: request.headers.get('x-test-tenant') ?? 'tenant-a',
        }),
        now: () => '2026-10-09T00:00:00.000Z',
    });
    const request = async (method, path, body, tenant = 'tenant-a') => {
        const response = await app.fetch(new Request('http://primary.local' + path, {
            method, headers: { 'x-test-tenant': tenant, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
            body: body === undefined ? undefined : JSON.stringify(body),
        }));
        return { status: response.status, body: await response.json() };
    };
    const create = async (name, config = {}, tenant = 'tenant-a') => {
        const result = await request('POST', '/api/auth-forms/', { name, type: 'login', config }, tenant);
        assert.equal(result.status, 201); assert.equal(result.body.success, true);
        return result.body.data.id;
    };
    const set = async (id, tenant = 'tenant-a') => {
        const result = await request('PUT', `/api/auth-forms/${id}/set-primary/`, undefined, tenant);
        assert.equal(result.status, 200); assert.equal(result.body.success, true);
        assert.equal(result.body.data.is_primary, true);
    };
    const get = async (tenant = 'tenant-a') => (await request('GET', '/api/auth-forms/primary/', undefined, tenant)).body;
    const row = async (id, tenant = 'tenant-a') => (await runner.query('SELECT * FROM auth_forms WHERE id = ? AND tenant_slug = ?', [id, tenant]))[0];
    return { runner, app, request, create, set, get, row };
}
async function test(name, execute) {
    try { await execute(await fixture()); passed++; console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + ': ' + error.message); }
}
await test('create, set primary, retrieve and switch two forms', async ({ create, set, get, row }) => {
    const first = await create('First'), second = await create('Second');
    await set(first); assert.equal((await get()).data?.id, first);
    await set(second); assert.equal((await get()).data?.id, second);
    assert.equal((await row(first)).is_primary, 0); assert.equal((await row(second)).is_primary, 1);
});
await test('metadata edit cannot resurrect stale configuration primary or clear chosen primary', async ({ create, set, get, request, row }) => {
    const old = await create('Old configuration primary', { is_primary: true });
    const chosen = await create('Chosen', { is_primary: false });
    await set(chosen);
    assert.equal((await request('PUT', `/api/auth-forms/${old}/`, { name: 'Old renamed' })).body.success, true);
    assert.equal((await row(old)).is_primary, 0, 'metadata edit must retain cleared persisted flag');
    assert.equal((await request('PUT', `/api/auth-forms/${chosen}/`, { name: 'Chosen renamed' })).body.success, true);
    assert.equal((await row(chosen)).is_primary, 1, 'metadata edit must retain selected persisted flag');
    assert.equal((await get()).data?.id, chosen);
});
await test('inactive selected primary has no active/default fallback', async ({ create, set, get, request }) => {
    await create('Active old config', { is_primary: true });
    const created = await request('POST', '/api/auth-forms/', { name: 'Inactive chosen', type: 'login', config: {}, is_active: false });
    assert.equal(created.status, 201); assert.equal(created.body.success, true);
    const inactive = created.body.data.id;
    assert.equal((await request('GET', `/api/auth-forms/${inactive}/`)).body.data.is_active, false,
        'supported top-level creation field persists inactivity before primary selection');
    await set(inactive);
    const result = await get(); assert.equal(result.success, false); assert.equal(result.data, null);
    assert.equal((await request('GET', `/api/auth-forms/${inactive}/`)).body.data.is_primary, true);
});
await test('tenant switching and cross-owner IDs preserve both owners', async ({ create, set, get, request, row }) => {
    const a = await create('A'), b = await create('B', {}, 'tenant-b');
    await set(b, 'tenant-b'); await set(a);
    assert.equal((await get('tenant-a')).data?.id, a); assert.equal((await get('tenant-b')).data?.id, b);
    for (const path of [`/api/auth-forms/${a}/set-primary/`, `/api/auth-forms/${a}/`]) {
        const result = await request('PUT', path, { name: 'Foreign rename' }, 'tenant-b');
        assert.equal(result.body.success, false); assert.equal(result.body.data, null);
    }
    assert.equal((await row(a)).is_primary, 1); assert.equal((await row(b, 'tenant-b')).is_primary, 1);
});
await test('column wins disagreement; null fallback and malformed configuration remain readable', async ({ runner, get, request }) => {
    const insert = async (id, primary, config) => runner.exec(
        'INSERT INTO auth_forms (id, tenant_slug, name, type, config, is_primary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, 'tenant-a', id, 'login', config, primary, '2026-10-09T00:00:00.000Z', '2026-10-09T00:00:00.000Z']);
    await insert('column-zero', 0, '{"is_primary":true}');
    assert.equal((await get()).success, false);
    await runner.exec('DELETE FROM auth_forms WHERE tenant_slug = ?', ['tenant-a']);
    await insert('column-one', 1, '{"is_primary":false}');
    assert.equal((await get()).data?.id, 'column-one');
    await runner.exec('DELETE FROM auth_forms WHERE tenant_slug = ?', ['tenant-a']);
    await insert('nullable-column', null, '{"is_primary":true}');
    assert.equal((await get()).data?.id, 'nullable-column');
    assert.equal((await request('GET', '/api/auth-forms/nullable-column/')).body.data.is_primary, true);
    await runner.exec('DELETE FROM auth_forms WHERE tenant_slug = ?', ['tenant-a']);
    await insert('malformed-config', 1, '{invalid');
    assert.equal((await get()).data?.id, 'malformed-config');
});
await test('explicit configuration primary edits retain existing accepted semantics', async ({ create, set, get, request, row }) => {
    const id = await create('Explicit', { is_primary: false });
    await set(id);
    const cleared = await request('PUT', `/api/auth-forms/${id}/`, { config: { is_primary: false } });
    assert.equal(cleared.body.success, true); assert.equal((await row(id)).is_primary, 0); assert.equal((await get()).success, false);
    const selected = await request('PUT', `/api/auth-forms/${id}/`, { config: { is_primary: true } });
    assert.equal(selected.body.success, true); assert.equal((await get()).data?.id, id);
    assert.equal((await request('PUT', `/api/auth-forms/${id}/`, { config: {} })).body.success, true);
    assert.equal((await row(id)).is_primary, 1);
});
await test('default authorization refuses anonymous primary access and mutation', async ({ runner }) => {
    const anonymous = await createCompatApp({ makeRunner: async () => runner, now: () => '2026-10-09T00:00:00.000Z' });
    for (const [method, path] of [['GET', '/api/auth-forms/primary/'], ['POST', '/api/auth-forms/'], ['PUT', '/api/auth-forms/invented/set-primary/']]) {
        const response = await anonymous.fetch(new Request('http://primary.local' + path, { method }));
        assert.equal(response.status, 401);
    }
});
console.log(`auth primary: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
