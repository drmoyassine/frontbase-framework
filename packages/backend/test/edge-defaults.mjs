/**
 * Edge-resource is_default enforcement (product parity): first-of-kind
 * auto-default, switch-on-create/update unsets the previous default,
 * delete-of-default promotes the next — on all four kinds, tenant-scoped.
 * is_default lives inside the encrypted config blob, so these tests exercise
 * the decrypt → modify → re-encrypt path end to end through the HTTP routes.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { sqliteRunner } from '@frontbase/edge-infra';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function request(app, method, path, body) {
    const init = { method };
    if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
    }
    return app.fetch(new Request(`http://edge-defaults.local${path}`, init));
}

async function harness() {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    let tenant = 'tenant-a';
    // A ticking clock: created_at must differ across rows for promote-order
    // assertions (the fixed clock of other suites would tie every row).
    let clock = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1) + clock).toISOString();
    const tick = () => { clock += 60_000; };
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({
            user: { id: `${tenant}-owner`, role: 'master_admin' },
            tenant,
        }),
        sessionSecret: 'edge-defaults-test-secret',
        now,
    });
    return { app, runner, setTenant: (value) => { tenant = value; }, tick };
}

const createCache = (app, n, extra = {}) => request(app, 'POST', '/api/edge-caches/', {
    name: `cache-${n}`,
    provider: 'upstash',
    cache_url: `https://cache-${n}.upstash.io`,
    ...extra,
});
const listCaches = async (app) => (await (await request(app, 'GET', '/api/edge-caches/')).json());

test('first cache of a kind becomes the default automatically', async () => {
    const { app } = await harness();
    const created = await createCache(app, 1);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).is_default, true);
    const list = await listCaches(app);
    assert.deepEqual(list.filter((r) => r.is_default).map((r) => r.name), ['cache-1']);
});

test('creating with is_default unsets the previous default; PUT switches it', async () => {
    const { app, tick } = await harness();
    await (await createCache(app, 1)).json();
    tick();
    const second = await (await createCache(app, 2, { is_default: true })).json();
    assert.equal(second.is_default, true);
    assert.deepEqual(
        (await listCaches(app)).filter((r) => r.is_default).map((r) => r.name),
        ['cache-2'],
    );
    tick();
    const third = await (await createCache(app, 3)).json();
    assert.equal(third.is_default, false, 'a later create without is_default must not steal the default');
    const updated = await request(app, 'PUT', `/api/edge-caches/${third.id}`, {
        name: 'cache-3',
        provider: 'upstash',
        cache_url: 'https://cache-3.upstash.io',
        cache_token: 'tok',
        is_default: true,
    });
    assert.equal((await updated.json()).is_default, true);
    assert.deepEqual(
        (await listCaches(app)).filter((r) => r.is_default).map((r) => r.name),
        ['cache-3'],
    );
});

test('deleting the default promotes the next resource by creation order', async () => {
    const { app, tick } = await harness();
    const one = await (await createCache(app, 1)).json();
    tick();
    const two = await (await createCache(app, 2)).json();
    tick();
    const three = await (await createCache(app, 3, { is_default: true })).json();
    const del = await request(app, 'DELETE', `/api/edge-caches/${three.id}`);
    assert.equal(del.status, 200);
    // cache-1 is the earliest remaining row — promotion follows creation order,
    // not the list endpoint's updated_at DESC ordering.
    assert.deepEqual(
        (await listCaches(app)).filter((r) => r.is_default).map((r) => r.name),
        ['cache-1'],
    );
    await request(app, 'DELETE', `/api/edge-caches/${one.id}`);
    await request(app, 'DELETE', `/api/edge-caches/${two.id}`);
    assert.deepEqual((await listCaches(app)).filter((r) => r.is_default), [], 'no default remains once every row is deleted');
    const again = await (await createCache(app, 4)).json();
    assert.equal(again.is_default, true, 'the next first-of-kind create re-auto-defaults');
});

test('batch delete of the default promotes the next resource', async () => {
    const { app, tick } = await harness();
    await (await createCache(app, 1)).json();
    tick();
    const two = await (await createCache(app, 2)).json();
    tick();
    await (await createCache(app, 3)).json();
    await request(app, 'PUT', `/api/edge-caches/${two.id}`, {
        name: 'cache-2',
        provider: 'upstash',
        cache_url: 'https://cache-2.upstash.io',
        is_default: true,
    });
    const res = await request(app, 'POST', '/api/edge-caches/batch/delete', { ids: [two.id] });
    assert.equal(res.status, 200);
    assert.deepEqual(
        (await listCaches(app)).filter((r) => r.is_default).map((r) => r.name),
        ['cache-1'],
    );
});

test('database kind: auto-default, switch, and delete-promote behave the same', async () => {
    const { app, tick } = await harness();
    const one = await (await request(app, 'POST', '/api/edge-databases/', {
        name: 'db-1', provider: 'postgres', db_url: 'postgres://db-1.example/db',
    })).json();
    assert.equal(one.is_default, true);
    tick();
    const two = await (await request(app, 'POST', '/api/edge-databases/', {
        name: 'db-2', provider: 'postgres', db_url: 'postgres://db-2.example/db', is_default: true,
    })).json();
    assert.equal(two.is_default, true);
    const listDatabases = async () => (await (await request(app, 'GET', '/api/edge-databases/')).json());
    assert.deepEqual(
        (await listDatabases()).filter((r) => r.is_default).map((r) => r.name),
        ['db-2'],
    );
    const updated = await request(app, 'PUT', `/api/edge-databases/${one.id}`, {
        name: 'db-1', provider: 'postgres', db_url: 'postgres://db-1.example/db', is_default: true,
    });
    assert.equal((await updated.json()).is_default, true);
    await request(app, 'DELETE', `/api/edge-databases/${one.id}`);
    assert.deepEqual(
        (await listDatabases()).filter((r) => r.is_default).map((r) => r.name),
        ['db-2'],
    );
});

test('queue and vector kinds enforce identically', async () => {
    const { app, tick } = await harness();
    const q1 = await (await request(app, 'POST', '/api/edge-queues/', {
        name: 'q-1', provider: 'qstash', queue_url: 'https://qstash-1.example.io',
    })).json();
    assert.equal(q1.is_default, true);
    tick();
    const q2 = await (await request(app, 'POST', '/api/edge-queues/', {
        name: 'q-2', provider: 'qstash', queue_url: 'https://qstash-2.example.io', is_default: true,
    })).json();
    assert.equal(q2.is_default, true);
    const queues = await (await request(app, 'GET', '/api/edge-queues/')).json();
    assert.deepEqual(queues.filter((r) => r.is_default).map((r) => r.name), ['q-2']);
    const v1 = await (await request(app, 'POST', '/api/edge-vectors/', {
        name: 'v-1', provider: 'libsql', vector_url: 'libsql://vec-1.turso.io',
    })).json();
    assert.equal(v1.is_default, true);
});

test('defaults are per tenant — a switch in one tenant never touches another', async () => {
    const { app, setTenant, tick } = await harness();
    await (await createCache(app, 1)).json();
    setTenant('tenant-b');
    const b1 = await (await createCache(app, 2)).json();
    assert.equal(b1.is_default, true, 'tenant-b is empty, so its first cache auto-defaults there too');
    tick();
    await (await createCache(app, 3, { is_default: true })).json();
    setTenant('tenant-a');
    const listA = await listCaches(app);
    assert.equal(listA.length, 1, 'tenant-a sees only its own cache');
    assert.deepEqual(listA.filter((r) => r.is_default).map((r) => r.name), ['cache-1']);
});

test('duplicate URL create still 409s before any default mutation', async () => {
    const { app } = await harness();
    await createCache(app, 1);
    const dup = await createCache(app, 1);
    assert.equal(dup.status, 409);
    const list = await listCaches(app);
    assert.equal(list.length, 1);
    assert.equal(list[0].is_default, true);
});

let failures = 0;
for (const [name, fn] of tests) {
    try {
        await fn();
        console.log(`  PASS ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`  FAIL ${name}\n    ${error.stack ?? error.message}`);
    }
}
console.log(`edge-defaults: ${tests.length - failures}/${tests.length} passed`);
if (failures) process.exit(1);
