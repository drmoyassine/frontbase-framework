/**
 * Regression proof for CF-22 database compatibility routes.
 *
 * The compat API must never treat the framework control database as a tenant's
 * configured datasource. Doing so exposes cross-tenant users, sessions, settings,
 * and encrypted credential rows through table-data or advanced-query.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
await runner.exec(
    `INSERT INTO users
       (id, tenant_slug, email, password_hash, role, created_at)
     VALUES (?,?,?,?,?,?)`,
    [
        'tenant-b-user',
        'tenant-b',
        'private@tenant-b.example',
        'tenant-b-password-hash',
        'owner',
        '2026-07-28T00:00:00.000Z',
    ],
);

const app = await createCompatApp({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({
        user: { id: 'tenant-a-owner', role: 'owner' },
        tenant: 'tenant-a',
    }),
    sessionSecret: 'database-security-regression-secret',
});

async function request(method, path, body) {
    return app.fetch(new Request(`http://security.local${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}

const tableRead = await request('GET', '/api/database/table-data/users/');
assert.equal(tableRead.status, 200);
const tableBody = await tableRead.json();
// Product parity: empty 200 when no datasource is configured. The security
// property is the leak checks below — the control DB must never surface.
assert.equal(tableBody.success, true);
assert.equal(tableBody.total, 0);
assert.equal(JSON.stringify(tableBody).includes('private@tenant-b.example'), false);
assert.equal(JSON.stringify(tableBody).includes('tenant-b-password-hash'), false);

const rawRead = await request('POST', '/api/database/advanced-query/', {
    query: 'SELECT * FROM users',
});
assert.equal(rawRead.status, 200);
const rawBody = await rawRead.json();
assert.equal(rawBody.success, false);
assert.equal(JSON.stringify(rawBody).includes('private@tenant-b.example'), false);
assert.equal(JSON.stringify(rawBody).includes('tenant-b-password-hash'), false);

const datasource = await request('POST', '/api/sync/datasources/', {
    name: 'tenant-a-local',
    type: 'sqlite',
    config: { url: ':memory:' },
});
assert.equal(datasource.status, 201);
const rawSqlWithDatasource = await request('POST', '/api/database/advanced-query/', {
    query: 'SELECT * FROM users',
});
// Raw SQL is never executed — only named Supabase RPCs are dispatched. The
// refusal arrives in the envelope (success:false), not as a status code.
const rawSqlBody = await rawSqlWithDatasource.json();
assert.equal(rawSqlWithDatasource.status, 200, 'advanced-query must accept named Supabase RPCs, never raw SQL');
assert.equal(rawSqlBody.success, false);
assert.equal(JSON.stringify(rawSqlBody).includes('private@tenant-b.example'), false);

const crafted = await request(
    'GET',
    '/api/database/table-data/users%22%20UNION%20SELECT%20*%20FROM%20users--/',
);
assert.ok(crafted.status === 400 || crafted.status === 404);

console.log('compat-database-security: PASS');
