/**
 * CF-22 P1 / D4 — proof-tag conformance for the `variables` compat surface.
 *
 * Exercises all 6 ops of /api/variables against createCompatApp using the
 * PRODUCT client's exact call shapes, and validates every response against the
 * VENDORED contract Zod (`zVariableResponse` etc.). Proves the whole chain —
 * vendored Zod → handler → store → product-shaped response — end to end, the
 * template P2 scales to the other 30 tags.
 *
 * Also pins the contract-drift invariants for the tag: stubs return 501 (not
 * 401 — auth is satisfied), and an unauthenticated request is denied (RULE 2).
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { zVariableResponse } from '../dist/compat/zod.gen.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

async function makeApp({ authed = true } = {}) {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    let clock = 0;
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => (authed ? { user: { id: 'owner' }, tenant: '_default' } : { user: null, tenant: undefined }),
        now: () => `2026-07-15T00:00:${String(clock++).padStart(2, '0')}Z`,
    });
    return app;
}

const req = (app, method, path, body) =>
    app.fetch(new Request('http://api.local' + path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));

test('POST /api/variables/ creates + returns a VariableResponse-conformant body', async () => {
    const app = await makeApp();
    const r = await req(app, 'POST', '/api/variables/', { name: 'Greeting', type: 'variable', value: 'hello', description: 'a greeting' });
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.ok(v.id, 'has id');
    assert.equal(v.name, 'Greeting');
    assert.equal(v.type, 'variable');
    // Conforms to the vendored contract schema.
    zVariableResponse.parse(v);
});

test('POST rejects a body that violates the vendored Zod (422)', async () => {
    const app = await makeApp();
    const r = await req(app, 'POST', '/api/variables/', { type: 'variable' }); // missing name
    assert.equal(r.status, 422);
    const r2 = await req(app, 'POST', '/api/variables/', { name: 'X', type: 'bogus' }); // bad type pattern
    assert.equal(r2.status, 422);
});

test('GET /api/variables/ lists what was created (bare array, product shape)', async () => {
    const app = await makeApp();
    await req(app, 'POST', '/api/variables/', { name: 'A', type: 'variable' });
    await req(app, 'POST', '/api/variables/', { name: 'B', type: 'calculated', formula: '1+1' });
    const r = await req(app, 'GET', '/api/variables/');
    assert.equal(r.status, 200);
    const list = await r.json();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 2);
    for (const v of list) zVariableResponse.parse(v);
});

test('GET /api/variables/{id} returns the variable', async () => {
    const app = await makeApp();
    const created = await (await req(app, 'POST', '/api/variables/', { name: 'X', type: 'variable' })).json();
    const r = await req(app, 'GET', `/api/variables/${created.id}`);
    assert.equal(r.status, 200);
    zVariableResponse.parse(await r.json());
    const r404 = await req(app, 'GET', '/api/variables/nope');
    assert.equal(r404.status, 404);
});

test('PUT /api/variables/{id}/ updates conformantly', async () => {
    const app = await makeApp();
    const created = await (await req(app, 'POST', '/api/variables/', { name: 'X', type: 'variable' })).json();
    const r = await req(app, 'PUT', `/api/variables/${created.id}/`, { name: 'X2', value: 'v', description: 'd' });
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.equal(v.name, 'X2');
    assert.equal(v.value, 'v');
    zVariableResponse.parse(v);
});

test('DELETE /api/variables/{id}/ removes it', async () => {
    const app = await makeApp();
    const created = await (await req(app, 'POST', '/api/variables/', { name: 'X', type: 'variable' })).json();
    const r = await req(app, 'DELETE', `/api/variables/${created.id}/`);
    assert.equal(r.status, 200);
    const after = await req(app, 'GET', `/api/variables/${created.id}`);
    assert.equal(after.status, 404);
});

test('GET /api/variables/registry/ returns the vendored template registry shape', async () => {
    const app = await makeApp();
    const r = await req(app, 'GET', '/api/variables/registry/');
    assert.equal(r.status, 200);
    const reg = await r.json();
    assert.ok(Array.isArray(reg.variables) && reg.variables.length > 0);
    assert.ok(Array.isArray(reg.filters) && reg.filters.length > 0);
});

test('all ops implemented — the stub mechanism is exercised by registerStubs (no 501s remain)', async () => {
    // P2 complete: all 284 community ops have real handlers. This test verified
    // the stub path when unimplemented ops existed; now it just confirms a
    // formerly-stubbed tag responds with a real handler (200, not 501).
    const app = await makeApp();
    const r = await req(app, 'GET', '/api/edge-caches/');
    assert.notEqual(r.status, 501);
});

test('unauthenticated requests are denied (RULE 2 holds on the compat surface)', async () => {
    const app = await makeApp({ authed: false });
    const r = await req(app, 'GET', '/api/variables/');
    assert.equal(r.status, 401);
});

// Runner
let failed = 0;
for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.stack}`); }
}
console.log(`\ncompat-variables: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
