import assert from 'node:assert/strict';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { sqliteRunner } from '@frontbase/edge-infra';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({
        user: { id: 'owner-a', role: 'owner' },
        tenant: 'tenant-a',
    }),
    sessionSecret: 'cf22-parity-foundation-secret',
    now: () => '2026-07-29T00:00:00.000Z',
});

function request(method, path, body) {
    return app.fetch(new Request(`http://parity.local${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}

async function expectJson(method, path, status, expected, body) {
    const response = await request(method, path, body);
    assert.equal(response.status, status, `${method} ${path} status`);
    const text = await response.text();
    let actual;
    try {
        actual = JSON.parse(text);
    } catch {
        assert.fail(`${method} ${path} returned non-JSON: ${text}`);
    }
    assert.deepEqual(actual, expected, `${method} ${path} body`);
}

const absent = '00000000-0000-4000-8000-000000000000';

// The shared middleware converts route-specific failure objects to FastAPI's
// HTTPException envelope without leaking opaque exception details.
await expectJson(
    'POST',
    `/api/actions/drafts/${absent}/publish`,
    404,
    { detail: 'Draft not found' },
);

// Mutating or testing an absent resource must never fabricate success.
await expectJson('DELETE', `/api/actions/drafts/${absent}`, 404, { detail: 'Draft not found' });
await expectJson('POST', `/api/actions/drafts/${absent}/test`, 404, { detail: 'Draft not found' }, {});
await expectJson(
    'POST',
    `/api/actions/drafts/${absent}/test-node/${absent}`,
    404,
    { detail: 'Draft not found' },
    {},
);
await expectJson(
    'GET',
    `/api/actions/executions/${absent}/production/${absent}`,
    404,
    { detail: `Engine not found: ${absent}` },
);

for (const [kind, base, testSuffix, detail] of [
    ['cache', '/api/edge-caches', '/test', `Edge cache '${absent}' not found`],
    ['queue', '/api/edge-queues', '/test/', `Edge queue '${absent}' not found`],
    ['vector', '/api/edge-vectors', '/test', 'Vector store not found'],
]) {
    await expectJson('POST', `${base}/${absent}${testSuffix}`, 404, { detail });
    await expectJson('DELETE', `${base}/${absent}`, 404, { detail });
    void kind;
}

for (const [method, path, body] of [
    ['GET', `/api/edge-providers/${absent}/credentials`, undefined],
    ['POST', `/api/edge-providers/retest/${absent}`, undefined],
    ['POST', `/api/edge-providers/discover-by-account/${absent}`, null],
    ['POST', `/api/edge-providers/create-resource-by-account/${absent}`, { resource_type: 'parity', name: 'parity' }],
    ['POST', `/api/edge-providers/${absent}/list-engines`, null],
    ['POST', `/api/edge-providers/${absent}/turso-databases`, { name: 'parity', url: 'parity', token: 'parity' }],
    ['DELETE', `/api/edge-providers/${absent}/turso-databases/${absent}`, null],
    ['POST', `/api/edge-providers/${absent}/turso-databases/${absent}/test`, null],
    ['DELETE', `/api/edge-providers/${absent}`, undefined],
]) {
    await expectJson(method, path, 404, { detail: 'Provider account not found' }, body);
}

console.log('compat parity foundation: error envelope + existence checks PASS');
