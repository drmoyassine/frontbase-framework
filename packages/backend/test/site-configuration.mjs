import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { createCompatApp } from '../dist/compat/app.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';
import { migrateUp } from '../dist/db/migrations.js';

const runner = sqliteRunner(':memory:'); await migrateUp(runner);
let tenant = 'alpha', role = 'owner', authenticated = true;
const now = '2026-10-06T12:00:00Z';
for (const [id, owner] of [['alpha-source', 'alpha'], ['beta-source', 'beta']]) await runner.exec('INSERT INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, owner, 'Source', 'supabase', '{}', now, now]);
const app = await createCompatApp({ makeRunner: async () => runner, resolvePrincipal: async () => ({ user: authenticated ? { id: 'editor', role } : null, tenant }), sessionSecret: 'site-configuration-test-session', now: () => now });
const request = (method, body) => app.request('/api/project/site-configuration/', { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const config = emptyDirectoryConfiguration(); config.site.name = 'USA'; config.datasourceId = 'alpha-source';
const save = (expectedRevision, configuration = config, extras = {}) => request('PUT', { schemaVersion: 1, expectedRevision, configuration, ...extras });
assert.equal((await request('GET')).status, 200);
assert.deepEqual(await (await request('GET')).json(), { draft: null, revision: 0, readiness: ['configuration'], publicationAvailable: false });

// Actual SQLite conditional insert/update races, not a fake runner predicting SQL.
const creations = await Promise.all([save(0), save(0)]);
assert.deepEqual(creations.map(r => r.status).sort(), [200, 409]);
const first = await (await request('GET')).json(); assert.equal(first.revision, 1); assert.deepEqual(first.draft.configuration, config);
const updates = await Promise.all([save(1, { ...config, site: { ...config.site, name: 'Editor A' } }), save(1, { ...config, site: { ...config.site, name: 'Editor B' } })]);
assert.deepEqual(updates.map(r => r.status).sort(), [200, 409]);
const second = await (await request('GET')).json(); assert.equal(second.revision, 2);
assert.equal((await save(0)).status, 409);
assert.equal((await save(2, config, { tenant: 'beta' })).status, 422);
assert.equal((await save(2, { ...config, secret_key: 'PRIVATE_TEST_SECRET' })).status, 422);
assert.equal((await save(2, { ...config, datasourceId: 'beta-source' })).status, 403);
assert.equal((await save(2, config, { schemaVersion: 99 })).status, 422);
assert.equal((await save(-1)).status, 422);
role = 'viewer'; assert.equal((await save(2)).status, 403); role = 'owner';
authenticated = false; assert.equal((await request('GET')).status, 401); assert.equal((await save(2)).status, 401); authenticated = true;
tenant = 'beta'; assert.equal((await (await request('GET')).json()).revision, 0);
assert.equal((await save(0)).status, 403);
tenant = 'alpha'; assert.equal((await (await request('GET')).json()).revision, 2);

const big = await app.request('/api/project/site-configuration/', { method: 'PUT', body: ' '.repeat(65537) }); assert.equal(big.status, 413);
const malformed = await app.request('/api/project/site-configuration/', { method: 'PUT', body: '{invalid' }); assert.equal(malformed.status, 422);
// Unrestricted legacy project merge is not an alternate write to the dedicated key.
await app.request('/api/project/', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ site_configuration: { revision: 999 } }) });
assert.equal((await (await request('GET')).json()).revision, 2);
assert.equal((await request('POST')).status, 404); // No activation endpoint.
const store = new SiteConfigurationStore(runner, 'alpha'); assert.equal((await store.get()).revision, 2);
await runner.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?', ['PRIVATE_CORRUPT_TEST_SECRET', 'alpha', 'site_configuration:v1']);
const errors = []; const originalError = console.error; console.error = (...values) => errors.push(values.map(String).join(' '));
try {
    const corrupt = await request('GET'); assert.equal(corrupt.status, 500); assert.ok(!(await corrupt.text()).includes('PRIVATE_CORRUPT_TEST_SECRET'));
    assert.equal((await save(0)).status, 500); // Corrupt state never treated as a missing first draft.
    assert.ok(!errors.join(' ').includes('PRIVATE_CORRUPT_TEST_SECRET'));
} finally { console.error = originalError; }
console.log('site-configuration: SQLite create/update races, ownership, strict schema, auth, role, bounds and opaque corruption passed; publication unavailable');
