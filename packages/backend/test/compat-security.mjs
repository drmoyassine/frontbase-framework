/**
 * CF-22 Gate 2 — secret lifecycle + tenant isolation security proof.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async (request) => {
        const tenant = request.headers.get('x-test-tenant') ?? 'tenant-a';
        return { user: { id: `owner-${tenant}`, role: 'owner' }, tenant };
    },
    sessionSecret: 'compat-security-secret-012345678901234567890',
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    now: () => '2026-07-28T00:00:00.000Z',
});
const req = (tenant, method, path, body) => app.fetch(new Request('http://security.local' + path, {
    method,
    headers: {
        'x-test-tenant': tenant,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
}));

const createdResponse = await req('tenant-a', 'POST', '/api/edge-api-keys', {
    name: 'Production',
    scope: 'management',
});
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.match(created.key, /^fbk_/);

const stored = await runner.query(
    `SELECT k.key_hash, s.ciphertext, s.revealed_at
     FROM edge_api_keys k JOIN edge_api_key_secrets s
       ON s.key_id = k.id AND s.tenant_slug = k.tenant_slug
     WHERE k.tenant_slug = ? AND k.id = ?`,
    ['tenant-a', created.id],
);
assert.match(String(stored[0].key_hash), /^[a-f0-9]{64}$/);
assert.ok(String(stored[0].ciphertext).startsWith('enc:'));
assert.ok(!JSON.stringify(stored).includes(created.key), 'raw key must never persist');

const tenantBList = await (await req('tenant-b', 'GET', '/api/edge-api-keys')).json();
assert.equal(tenantBList.keys.length, 0);
assert.equal((await req('tenant-b', 'GET', `/api/edge-api-keys/${created.id}/reveal`)).status, 404);
assert.equal((await req('tenant-b', 'PUT', `/api/edge-api-keys/${created.id}`, { is_active: false })).status, 404);
assert.equal((await req('tenant-b', 'DELETE', `/api/edge-api-keys/${created.id}`)).status, 204);

const stillOwned = await (await req('tenant-a', 'GET', '/api/edge-api-keys')).json();
assert.equal(stillOwned.keys.length, 1, 'tenant B must not delete tenant A key');

const reveal = await req('tenant-a', 'GET', `/api/edge-api-keys/${created.id}/reveal`);
assert.equal(reveal.status, 200);
assert.equal((await reveal.json()).key, created.key);
assert.equal((await req('tenant-a', 'GET', `/api/edge-api-keys/${created.id}/reveal`)).status, 410);

const cleared = await runner.query(
    'SELECT ciphertext, revealed_at FROM edge_api_key_secrets WHERE tenant_slug = ? AND key_id = ?',
    ['tenant-a', created.id],
);
assert.equal(cleared[0].ciphertext, null, 'recoverable material must be erased after reveal');
assert.ok(cleared[0].revealed_at);
const audit = await runner.query(
    'SELECT action FROM security_audit_events WHERE tenant_slug = ? AND resource_id = ? ORDER BY created_at',
    ['tenant-a', created.id],
);
assert.ok(audit.some((row) => row.action === 'edge_api_key_created'));
assert.ok(audit.some((row) => row.action === 'edge_api_key_revealed'));

assert.equal((await req('tenant-a', 'POST', '/api/edge-api-keys', {
    name: 'Invalid',
    scope: 'root',
})).status, 400);

console.log('compat-security: PASS ✅');
