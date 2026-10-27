/**
 * Turso provider unit tests — resolveTurso (pure) + enrichTurso (async, best-effort).
 *
 * Covers:
 *   (a) resolver maps stored fields → runner shape `{ url, authToken }`,
 *       honoring both connect-payload (`db_url`+`db_token`) and registry-entry
 *       (`url`+`token`) field names, plus the `databases`-array fallback.
 *   (b) enricher discovers databases via the Turso Management API and merges a
 *       `databases` array into the config.
 *   (c) enricher returns the input UNCHANGED when the fetch fails, when no
 *       `api_token` is present, and when a `databases` registry already exists.
 */
import { strict as assert } from 'node:assert';
import { resolveTurso, enrichTurso } from '../dist/compat/providers/turso.js';

let testsPassed = 0;
async function test(name, fn) {
    await fn();
    testsPassed += 1;
    console.log(`  ok - ${name}`);
}

// ----- stubbed fetch ---------------------------------------------------------
// Records outbound calls so each assertion can verify request shape.
let calls = [];
function stubFetch(routes) {
    calls = [];
    return async (input, init = {}) => {
        const url = String(input);
        const method = String(init.method ?? 'GET');
        calls.push({ url, method, headers: init.headers ?? {} });
        const handler = routes[url];
        if (!handler) return new Response('not found', { status: 404 });
        const { status = 200, body = {} } = handler(init);
        return Response.json(body, { status });
    };
}
const fetchThrowing = async () => { throw new Error('network_down'); };

const ORGS_URL = 'https://api.turso.tech/v1/organizations';
const dbsUrl = (slug) => `https://api.turso.tech/v1/organizations/${slug}/databases`;

// =============================================================================
// (a) resolveTurso — PURE field mapping
// =============================================================================
console.log('resolveTurso (pure):');
await test('maps connect-payload fields db_url + db_token', () => {
    const out = resolveTurso({ db_url: 'libsql://db-a.turso.io', db_token: 'tok-a' });
    assert.deepEqual(out, { url: 'libsql://db-a.turso.io', authToken: 'tok-a' });
});

await test('maps registry-entry fields url + token', () => {
    const out = resolveTurso({ url: 'libsql://db-b.turso.io', token: 'tok-b' });
    assert.deepEqual(out, { url: 'libsql://db-b.turso.io', authToken: 'tok-b' });
});

await test('prefers db_url over url, and token over db_token/authToken', () => {
    const out = resolveTurso({
        db_url: 'libsql://primary.turso.io', url: 'libsql://shadow.turso.io',
        token: 'first', db_token: 'second', authToken: 'third',
    });
    // Contract: db_url ?? url  and  token ?? db_token ?? authToken.
    assert.deepEqual(out, { url: 'libsql://primary.turso.io', authToken: 'first' });
});

await test('falls back to authToken alias when token/db_token absent', () => {
    const out = resolveTurso({ db_url: 'libsql://db-c.turso.io', authToken: 'alt-tok' });
    assert.deepEqual(out, { url: 'libsql://db-c.turso.io', authToken: 'alt-tok' });
});

await test('returns empty url/authToken when no fields present', () => {
    const out = resolveTurso({});
    assert.deepEqual(out, { url: '', authToken: '' });
});

await test('falls back into databases array selected by db_name', () => {
    const config = {
        databases: [
            { id: 'u1', name: 'users', url: 'libsql://users.turso.io', token: 'u-tok' },
            { id: 'o1', name: 'orders', url: 'libsql://orders.turso.io', token: 'o-tok' },
        ],
        db_name: 'orders',
    };
    assert.deepEqual(resolveTurso(config), { url: 'libsql://orders.turso.io', authToken: 'o-tok' });
});

await test('falls back into databases array selected by db_id, keeping explicit token', () => {
    const config = {
        api_token: 'acct-tok',
        databases: [
            { id: 'u1', name: 'users', url: 'libsql://users.turso.io' },
        ],
        db_id: 'u1',
        // explicit per-DB token wins over the (absent) entry token
        token: 'explicit',
    };
    assert.deepEqual(resolveTurso(config), { url: 'libsql://users.turso.io', authToken: 'explicit' });
});

await test('does not dip into databases when a direct url is present', () => {
    const out = resolveTurso({
        db_url: 'libsql://direct.turso.io', db_token: 'd-tok',
        databases: [{ id: 'x', name: 'x', url: 'libsql://other.turso.io', token: 'o' }],
    });
    assert.deepEqual(out, { url: 'libsql://direct.turso.io', authToken: 'd-tok' });
});

// =============================================================================
// (b) enrichTurso — merges discovered databases
// =============================================================================
console.log('enrichTurso (success path):');
await test('discovers databases across orgs and merges a databases array', async () => {
    const fetchImpl = stubFetch({
        [ORGS_URL]: () => ({ body: [{ slug: 'acme' }, { slug: 'beta' }] }),
        [dbsUrl('acme')]: () => ({ body: { databases: [
            { hostname: 'db1-acme.turso.io', name: 'db1', group: 'default', regions: ['ams'] },
        ] } }),
        [dbsUrl('beta')]: () => ({ body: [
            { hostname: 'db2-beta.turso.io', Name: 'db2' },
        ] }),
    });
    const out = await enrichTurso({ api_token: 'tok' }, fetchImpl);

    // Both org endpoints hit, Bearer auth header sent on every call.
    assert.equal(calls.length, 3);
    for (const c of calls) {
        assert.equal(c.headers.Authorization, 'Bearer tok', `${c.url} missing bearer`);
    }

    assert.ok(Array.isArray(out.databases), 'databases array merged');
    assert.equal(out.databases.length, 2);
    assert.deepEqual(out.databases[0], {
        id: 'db1', name: 'db1', url: 'libsql://db1-acme.turso.io',
        org: 'acme', group: 'default', regions: ['ams'],
    });
    assert.deepEqual(out.databases[1], {
        id: 'db2', name: 'db2', url: 'libsql://db2-beta.turso.io',
        org: 'beta', group: '', regions: [],
    });
    // Original field carried through.
    assert.equal(out.api_token, 'tok');
});

await test('scopes discovery to the requested org when org is present', async () => {
    const fetchImpl = stubFetch({
        [ORGS_URL]: () => ({ body: [{ slug: 'acme' }, { slug: 'beta' }] }),
        [dbsUrl('acme')]: () => ({ body: { databases: [{ hostname: 'a.turso.io', name: 'a' }] } }),
        [dbsUrl('beta')]: () => ({ body: { databases: [{ hostname: 'b.turso.io', name: 'b' }] } }),
    });
    const out = await enrichTurso({ api_token: 'tok', org: 'beta' }, fetchImpl);

    // Only the beta databases endpoint is hit (orgs list always fetched).
    assert.ok(calls.some((c) => c.url === dbsUrl('beta')));
    assert.ok(!calls.some((c) => c.url === dbsUrl('acme')), 'acme should be skipped');
    assert.equal(out.databases.length, 1);
    assert.equal(out.databases[0].org, 'beta');
});

await test('does not overwrite a pre-existing manual databases registry', async () => {
    const existing = [{ id: 'm1', name: 'manual', url: 'libsql://m.turso.io', token: 'm-tok' }];
    const fetchImpl = stubFetch({});
    const out = await enrichTurso({ api_token: 'tok', databases: existing }, fetchImpl);

    assert.equal(calls.length, 0, 'no fetch should happen when registry exists');
    assert.equal(out.databases, existing, 'same array reference preserved');
});

await test('returns input unchanged when no api_token is present', async () => {
    const fetchImpl = stubFetch({});
    const out = await enrichTurso({ db_url: 'libsql://x.turso.io', token: 't' }, fetchImpl);
    assert.equal(calls.length, 0);
    assert.deepEqual(out, { db_url: 'libsql://x.turso.io', token: 't' });
});

// =============================================================================
// (c) enrichTurso — best-effort failure handling
// =============================================================================
console.log('enrichTurso (failure / best-effort):');
await test('returns input unchanged when fetch throws', async () => {
    const out = await enrichTurso({ api_token: 'tok', db_url: 'libsql://x.turso.io' }, fetchThrowing);
    assert.deepEqual(out, { api_token: 'tok', db_url: 'libsql://x.turso.io' });
    assert.ok(!Array.isArray(out.databases), 'no databases merged on failure');
});

await test('returns input unchanged when orgs endpoint errors (non-200)', async () => {
    const fetchImpl = stubFetch({
        [ORGS_URL]: () => ({ status: 401, body: { detail: 'unauthorized' } }),
    });
    const out = await enrichTurso({ api_token: 'bad' }, fetchImpl);
    assert.equal(calls.length, 1);
    assert.deepEqual(out, { api_token: 'bad' });
});

await test('skips an org whose databases endpoint errors but keeps the others', async () => {
    const fetchImpl = stubFetch({
        [ORGS_URL]: () => ({ body: [{ slug: 'acme' }, { slug: 'beta' }] }),
        [dbsUrl('acme')]: () => ({ status: 500, body: {} }),
        [dbsUrl('beta')]: () => ({ body: { databases: [{ hostname: 'b.turso.io', name: 'b' }] } }),
    });
    const out = await enrichTurso({ api_token: 'tok' }, fetchImpl);
    assert.ok(Array.isArray(out.databases));
    assert.equal(out.databases.length, 1);
    assert.equal(out.databases[0].name, 'b');
});

console.log(`\nAll ${testsPassed} Turso provider tests passed.`);
