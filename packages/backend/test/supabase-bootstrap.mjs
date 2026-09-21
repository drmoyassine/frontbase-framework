/**
 * First-time Supabase datasource setup must use the Management API. The
 * PostgREST runner cannot install execute_query/execute_sql because it calls
 * those RPCs. This gate pins the Management-only bootstrap path.
 */
import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { SyncStore } from '../dist/compat/sync-store.js';
import { KeyValueStore } from '../dist/compat/store.js';
import { createSecretCipher } from '../dist/index.js';
import { registerSyncRoutes } from '../dist/compat/routes/sync.js';
import { Hono } from 'hono';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const tenant = 'acme';
const calls = [];
const externalFetch = async (input, init) => {
    calls.push({ url: String(input), body: String(init?.body), token: init?.headers?.Authorization });
    return new Response(JSON.stringify([]), { status: 200 });
};
const accountConfigFor = async (configuredTenant, accountId) => {
    assert.equal(configuredTenant, tenant);
    assert.equal(accountId, 'supa-account');
    return { access_token: 'management-token', project_ref: 'abcdefgh', service_role_key: 'service-role-key' };
};
const app = new Hono();
const secretCipher = await createSecretCipher('supabase-bootstrap-test-secret-0123456789');
app.use('*', async (context, next) => {
    context.set('tenant', tenant);
    context.set('principal', { user: { id: 'u1', role: 'owner' }, tenant });
    await next();
});
registerSyncRoutes(
    app, runner,
    (configuredTenant) => new SyncStore(runner, configuredTenant, secretCipher),
    (configuredTenant) => new KeyValueStore(runner, configuredTenant),
    externalFetch,
    () => '2026-09-19T00:00:00.000Z',
    '', accountConfigFor,
);
const request = (path, body) => app.fetch(new Request(`https://console.local${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

const created = await request('/api/sync/datasources/', {
    name: 'Connected Supabase', type: 'supabase', provider_account_id: 'supa-account',
});
assert.equal(created.status, 201);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://api.supabase.com/v1/projects/abcdefgh/database/query');
assert.equal(calls[0].token, 'Bearer management-token');
assert.match(calls[0].body, /execute_query/);
assert.match(calls[0].body, /execute_sql/);

const manual = await request('/api/sync/datasources/', {
    name: 'Manual Supabase', type: 'supabase',
    api_url: 'https://abcdefgh.supabase.co', service_role_key: 'service-role-key',
});
assert.equal(manual.status, 201);
assert.equal(calls.length, 1, 'manual key-only setup must not pretend to bootstrap');
console.log('supabase datasource bootstrap: PASS');
