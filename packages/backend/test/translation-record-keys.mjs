import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
import { extractRecordInput } from '../dist/compat/translation-inputs.js';
import { translationUnitId } from '@frontbase/edge-core/localization';
const root = '/api/project/translation-batches/';
const composite = [{ column: 'tenant_id', value: 'acme' }, { column: 'slug', value: 'main' }];
const selection = { kind: 'record', datasourceId: 'data', endpoint: 'postgrest', table: 'institutions', keyColumns: composite, field: 'title' };
const pin = f => ({ storage: { scope: f.scope }, generation: { sourceLocale: 'en' } });
async function setup() {
    const f = await allowanceFixture(), reads = [];
    await f.sync.createView({ datasource_id: 'data', name: 'Composite views', target_table: 'institutions', visible_columns: ['tenant_id', 'slug', 'title'], filters: [] }, 'comp', now);
    const rows = { 'slug,tenant_id,title': [{ tenant_id: 'acme', slug: 'main', title: 'Discover institutions' }], 'id,title': [{ id: 1, title: 'Discover institutions' }] };
    const original = f.host.externalFetch; f.host.externalFetch = async (input, init) => {
        const request = new Request(input, init), u = new URL(request.url);
        if (request.method === 'GET' && u.pathname.endsWith('/institutions')) {
            reads.push(request);
            const select = (u.searchParams.get('select') ?? '').split(',').sort().join(',');
            if (select === 'slug,tenant_id,title') {
                assert.equal(u.searchParams.get('tenant_id'), 'eq.acme'); assert.equal(u.searchParams.get('slug'), 'eq.main');
                assert.equal(u.searchParams.get('limit'), '2'); assert.equal(request.headers.get('accept-profile'), 'public');
            } else if (select === 'id,title') { assert.equal(u.searchParams.get('id'), 'eq.1'); assert.equal(u.searchParams.get('limit'), '2'); }
            else return Response.json([], { status: 400 });
            return Response.json(rows[select]);
        } return original(request);
    };
    let tenant = 'alpha', role = 'owner', authenticated = true;
    const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now, externalFetch: f.host.externalFetch, translationExecutionEnabled: true,
        resolvePrincipal: async () => ({ user: authenticated ? { id: 'editor', role } : null, tenant }) });
    const request = (path, method = 'GET', body) => app.request(root + path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { ...f, reads, request, rows };
}
{
    const f = await setup();
    // Composite keys resolve exactly one row and carry the normalized key into the unit.
    assert.equal((await (await f.request('record-field/', 'POST', selection)).json()).text, 'Discover institutions');
    assert.equal(f.reads.length, 1); assert.equal(f.aiCalls(), 0);
    const input = await extractRecordInput(f.host, 'alpha', selection, pin(f));
    assert.deepEqual(input.unit.resource.key, [{ column: 'tenant_id', value: 'acme' }, { column: 'slug', value: 'main' }]);
    assert.equal(input.context.role, 'record-field');
    // Key order is identity-irrelevant: both spellings resolve to one translation unit.
    const flipped = await extractRecordInput(f.host, 'alpha', { ...selection, keyColumns: [...composite].reverse() }, pin(f));
    assert.deepEqual(flipped.unit.resource.key, [{ column: 'slug', value: 'main' }, { column: 'tenant_id', value: 'acme' }]);
    assert.equal(await translationUnitId(f.scope, flipped.unit.resource), await translationUnitId(f.scope, input.unit.resource), 'identity canonicalizes key part order');
    // Planning both spellings is one unit twice, refused like any duplicate selection.
    const planInput = { targetLocale: 'ar', selections: [selection, { ...selection, keyColumns: [...composite].reverse() }], limits: { maxRequests: 2, maxConcurrent: 1, maxMessageBytes: 65536 } };
    assert.equal((await f.request('plans/', 'POST', planInput)).status, 422, 'key order must not duplicate a unit in one plan');
    f.close();
}
{
    const f = await setup(); f.rows['slug,tenant_id,title'] = [{ tenant_id: 'acme', slug: 'main', title: 'Discover institutions' }, { tenant_id: 'acme', slug: 'main', title: 'Ambiguous duplicate' }];
    assert.equal((await f.request('record-field/', 'POST', selection)).status, 422, 'ambiguous composite keys refuse instead of picking a row');
    assert.equal(f.reads.length, 1); f.close();
}
{
    const f = await setup();
    for (const [name, bad] of [
        ['both key forms', { ...selection, keyColumn: 'id', keyValue: '1' }],
        ['no key form', { kind: 'record', datasourceId: 'data', endpoint: 'postgrest', table: 'institutions', field: 'title' }],
        ['duplicate column', { ...selection, keyColumns: [...composite, { column: 'tenant_id', value: 'acme' }] }],
        ['key column equals field', { ...selection, keyColumns: [{ column: 'title', value: 'x' }] }],
        ['empty key', { ...selection, keyColumns: [] }],
        ['over the 16-part bound', { ...selection, keyColumns: Array.from({ length: 17 }, (_, i) => ({ column: 'c' + i, value: i })) }],
        ['non-integer number part', { ...selection, keyColumns: [{ column: 'tenant_id', value: 'acme' }, { column: 'rank', value: 1.5 }] }],
    ]) assert.equal((await f.request('record-field/', 'POST', bad)).status, 422, name);
    assert.equal(f.reads.length, 0, 'invalid key grammar never reaches PostgREST');
    // Legacy single-key selections keep working unchanged.
    const single = { kind: 'record', datasourceId: 'data', endpoint: 'postgrest', table: 'institutions', keyColumn: 'id', keyValue: '1', field: 'title' };
    assert.equal((await (await f.request('record-field/', 'POST', single)).json()).text, 'Discover institutions');
    assert.deepEqual((await extractRecordInput(f.host, 'alpha', single, pin(f))).unit.resource.key, [{ column: 'id', value: 1 }], 'key normalizes to the stored row value');
    f.close();
}
{
    const f = await setup();
    // View selections accept the same composite grammar and stay inside visible columns.
    const view = { kind: 'view-record', viewId: 'comp', endpoint: 'postgrest', keyColumns: composite, field: 'title' };
    assert.equal((await (await f.request('view-field/', 'POST', view)).json()).text, 'Discover institutions');
    assert.equal((await f.request('view-field/', 'POST', { ...view, keyColumns: [{ column: 'country', value: 'USA' }, { column: 'slug', value: 'main' }] })).status, 422, 'invisible key columns refuse');
    assert.equal((await f.request('view-field/', 'POST', { ...view, keyColumns: [...composite, { column: 'extra', value: 1 }] })).status, 422);
    f.close();
}
console.log('translation record keys PASS: composite key grammar, exactly-one-row ambiguity refusal, order-insensitive identity, plan dedupe and legacy single-key compatibility');
