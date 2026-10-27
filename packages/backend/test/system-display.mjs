/**
 * Phase 6 self-aware display: the system engine card's cache/queue binding
 * names resolve per tenant through the SAME resolver the runtime consumers use
 * (adopted is_default row name → env label → null) — the card never claims a
 * backing the worker lacks. Vector deliberately stays off the card (it surfaces
 * in its own Edge Resources tab — documented divergence).
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { sqliteRunner } from '@frontbase/edge-infra';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

async function harness(envServices) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    let tenant = 'tenant-a';
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: { id: `${tenant}-owner`, role: 'master_admin' }, tenant }),
        sessionSecret: 'system-display-test-secret',
        now: () => new Date(0).toISOString(),
        envServices,
    });
    const req = (method, path, body) => app.fetch(new Request(`http://display.local${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    }));
    const systemCard = async () => {
        const rows = await (await req('GET', '/api/edge-engines/')).json();
        const card = rows[0];
        assert.equal(card?.is_system, true, 'system engine listed first');
        return card;
    };
    return { req, systemCard, setTenant: (t) => { tenant = t; } };
}

test('engine card: adopted row names beat env labels; cards are per tenant', async () => {
    const h = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    const cache = await h.req('POST', '/api/edge-caches/', {
        name: 'prod-cache', provider: 'upstash', cache_url: 'https://prod.upstash.io',
    });
    assert.equal(cache.status, 201);
    const queue = await h.req('POST', '/api/edge-queues/', {
        name: 'prod-queue', provider: 'qstash', queue_url: 'https://qstash.example.io',
    });
    assert.equal(queue.status, 201);
    const card = await h.systemCard();
    assert.equal(card.edge_cache_name, 'prod-cache', 'adopted row name wins over the env label');
    assert.equal(card.edge_queue_name, 'prod-queue');
    // Same app, different tenant: no rows there → the shared env cache surfaces
    // its label; the undeclared queue kind stays honestly null.
    h.setTenant('tenant-b');
    const bCard = await h.systemCard();
    assert.equal(bCard.edge_cache_name, 'Upstash Redis (env)');
    assert.equal(bCard.edge_queue_name, null);
});

test('engine card: every listing surface agrees (list, by-scope, single GET)', async () => {
    const h = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    const scope = await (await h.req('GET', '/api/edge-engines/active/by-scope/full')).json();
    const single = await (await h.req('GET', '/api/edge-engines/local-edge')).json();
    assert.equal(scope[0]?.edge_cache_name, 'Upstash Redis (env)');
    assert.equal(single.id, 'local-edge');
    assert.equal(single.edge_cache_name, 'Upstash Redis (env)');
    assert.equal(single.is_system, true);
});

test('engine card: no env, no rows → honest nulls; descriptor fields intact', async () => {
    const h = await harness(undefined);
    const card = await h.systemCard();
    assert.equal(card.id, 'local-edge');
    assert.equal(card.provider, 'cloudflare');
    assert.equal(card.edge_db_name, 'Cloudflare D1');
    assert.equal(card.edge_cache_name, null);
    assert.equal(card.edge_queue_name, null);
});

test('engine card: vector adoption stays in its own tab — never a card binding', async () => {
    const h = await harness(undefined);
    const vector = await h.req('POST', '/api/edge-vectors/', {
        name: 'prod-vector', provider: 'libsql', vector_url: 'libsql://vec.example.io',
    });
    assert.equal(vector.status, 201);
    assert.equal((await vector.json()).is_default, true, 'auto-defaulted in the vector registry');
    const card = await h.systemCard();
    assert.equal(card.edge_cache_name, null);
    assert.equal(card.edge_queue_name, null);
    assert.ok(!('edge_vector_name' in card), 'the engine shape has no vector field (documented divergence)');
});

test('engine linkage: the adopted default row is the one the engine uses', async () => {
    const h = await harness(undefined);
    const first = await (await h.req('POST', '/api/edge-caches/', {
        name: 'first-cache', provider: 'upstash', cache_url: 'https://first.upstash.io',
    })).json();
    const second = await (await h.req('POST', '/api/edge-caches/', {
        name: 'second-cache', provider: 'upstash', cache_url: 'https://second.upstash.io',
    })).json();
    // First-of-kind auto-defaulted → the engine is linked to IT, not the second row.
    let rows = await (await h.req('GET', '/api/edge-caches/')).json();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(byId[first.id].engine_count, 1, 'default row shows the engine link');
    assert.equal(byId[first.id].linked_engines[0].name, 'Local Edge');
    assert.equal(byId[first.id].linked_engines[0].provider, 'cloudflare');
    assert.equal(byId[second.id].engine_count, 0, 'non-default row is unlinked');
    assert.deepEqual(byId[second.id].linked_engines, []);
    // Switching the default moves the link (the PUT path invalidates the
    // resolver — like the console dialog, the body carries config fields).
    await h.req('PUT', `/api/edge-caches/${second.id}`, {
        name: 'second-cache', cache_url: 'https://second.upstash.io', is_default: true,
    });
    rows = await (await h.req('GET', '/api/edge-caches/')).json();
    const after = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(after[second.id].engine_count, 1, 'the new default carries the link');
    assert.equal(after[first.id].engine_count, 0, 'the old default loses it');
    // Another tenant's list never sees this tenant's linkage.
    h.setTenant('tenant-b');
    const bRows = await (await h.req('GET', '/api/edge-caches/')).json();
    assert.equal(bRows.length, 0);
});

test('engine linkage: created_at is a parseable timestamp (the +00:00Z fix)', async () => {
    const h = await harness(undefined);
    const row = await (await h.req('POST', '/api/edge-caches/', {
        name: 'dated-cache', provider: 'upstash', cache_url: 'https://dated.upstash.io',
    })).json();
    assert.ok(!Number.isNaN(new Date(row.created_at).getTime()), `created_at parseable, got ${row.created_at}`);
    assert.ok(!Number.isNaN(new Date(row.updated_at).getTime()));
});

test('system-engine health-check: bindings report the resolution truth', async () => {
    const h = await harness({ cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' } });
    // Adopt a cache row so the cache binding reports the row's provider; the
    // queue/vector kinds stay unwired (env queue absent, no vector rows).
    await h.req('POST', '/api/edge-caches/', { name: 'prod-cache', provider: 'upstash', cache_url: 'https://prod.upstash.io' });
    const health = await (await h.req('GET', '/api/edge-engines/local-edge/health-check')).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.service, 'frontbase-edge');
    assert.equal(health.provider, 'cloudflare');
    assert.equal(health.bindings.stateDb.status, 'ok');
    assert.equal(health.bindings.stateDb.provider, 'Cloudflare D1');
    assert.equal(health.bindings.cache.status, 'ok');
    assert.equal(health.bindings.cache.provider, 'upstash');
    assert.equal(health.bindings.queue.status, 'not_configured');
    assert.equal(health.bindings.queue.provider, 'none');
    assert.equal(health.bindings.vector.status, 'not_configured');
    assert.ok(!('uptime_seconds' in health), 'serverless platform → no uptime');

    // An env-wired-only tenant sees the env cache binding and a configured
    // queue reported healthy by configuration (product parity — QStash can't
    // be pinged without publishing).
    const b = await harness({
        cache: { provider: 'upstash', url: 'https://env.upstash.io', token: 'env-tok' },
        queue: { provider: 'qstash', token: 'q-tok', url: 'https://qstash.example.io' },
    });
    const bHealth = await (await b.req('GET', '/api/edge-engines/local-edge/health-check')).json();
    assert.equal(bHealth.bindings.cache.provider, 'upstash', 'env-wired cache reports its provider');
    assert.equal(bHealth.bindings.cache.status, 'ok');
    assert.equal(bHealth.bindings.queue.status, 'ok', 'configured queue is healthy by configuration (product parity)');

    // Unknown ids stay 404 (the legacy stored-engine path is unchanged).
    const missing = await h.req('GET', '/api/edge-engines/no-such-engine/health-check');
    assert.equal(missing.status, 404);
});

let failures = 0;
for (const [name, fn] of tests) {
    try {
        await fn();
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failures++;
        console.log(`  ❌ ${name}\n     ${e.message}`);
    }
}
console.log(failures === 0 ? '\nsystem-display: PASS ✅' : `\nsystem-display: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
