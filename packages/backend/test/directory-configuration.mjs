import assert from 'node:assert/strict';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration, directoryConfigurationSchema } from '@frontbase/edge-core/directory/configuration';
import { migrateUp } from '../dist/db/migrations.js';

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
let tenant = 'alpha';
const now = '2026-10-05T12:00:00Z';
for (const [id, owner] of [['alpha-source', 'alpha'], ['beta-source', 'beta']]) await runner.exec(
    'INSERT INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, owner, 'Fixture source', 'supabase', '{}', now, now]);
const app = await createCompatApp({ makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'owner', role: 'owner' }, tenant }), sessionSecret: 'directory-local-test-session', now: () => now });
const request = (method, path, body) => app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function fixture(destination, scope) {
    const c = emptyDirectoryConfiguration();
    c.site = { name: `Study in ${destination}`, destination, origin: `https://example-${destination.toLowerCase()}.test`, locale: 'en' };
    c.datasourceId = 'alpha-source';
    for (const role of ['institution', 'program', 'city']) {
        const r = c.collections[role]; r.table = role + 's';
        Object.assign(r.fields, { id: 'id', title: 'title', originalPath: 'path' });
        r.scope = { field: 'country_code', value: scope };
    }
    c.collections.program.fields.institutionId = 'institution_id'; c.collections.institution.fields.cityId = 'city_id';
    return directoryConfigurationSchema.parse(c);
}
const layout = config => ({ root: { directoryConfiguration: config, unrelated: 'preserved' }, content: [] });
const usa = fixture('USA', 'US');
const created = await request('POST', '/api/pages/', { name: 'Directory', slug: 'directory', layoutData: layout(usa) });
assert.equal(created.status, 201);
const page = (await created.json()).data;
assert.deepEqual(page.layoutData.root.directoryConfiguration, usa);
const version = (await (await request('POST', `/api/pages/${page.id}/versions/`, { label: 'USA settings' })).json()).data;
const hungary = fixture('Hungary', 'HU');
assert.equal((await request('PUT', `/api/pages/${page.id}/layout/`, { layoutData: layout(hungary) })).status, 200);
const reload = await (await request('GET', `/api/pages/${page.id}/`)).json();
assert.deepEqual(reload.data.layoutData.root.directoryConfiguration, hungary);
assert.equal(reload.data.layoutData.root.unrelated, 'preserved');
const oldVersion = await (await request('GET', `/api/pages/${page.id}/versions/${version.id}/`)).json();
assert.deepEqual(oldVersion.data.layoutData.root.directoryConfiguration, usa);
assert.equal((await request('POST', `/api/pages/${page.id}/rollback/`, { version_id: version.id })).status, 200);
const restored = await (await request('GET', `/api/pages/${page.id}/`)).json();
assert.deepEqual(restored.data.layoutData.root.directoryConfiguration, usa);
const publication = await request('POST', `/api/pages/${page.id}/publish/local/`);
assert.equal(publication.status, 422);
assert.equal((await publication.json()).code, 'directory_runtime_pending');

for (const mutate of [c => { c.serviceRoleKey = 'never-persist-this-secret'; }, c => { c.contacts.whatsapp = 'javascript:alert(1)'; },
    c => { c.routes.directory = '/a/%2e%2e/b/'; }, c => { c.collections.program.table = 'programs; drop table'; }, c => { c.version = 2; }]) {
    const bad = structuredClone(usa); mutate(bad);
    for (const [method, path, body] of [
        ['POST', '/api/pages/', { name: 'Bad', slug: 'bad', layoutData: layout(bad) }],
        ['PUT', `/api/pages/${page.id}/`, { layoutData: layout(bad) }],
        ['PUT', `/api/pages/${page.id}/layout/`, { layoutData: layout(bad) }],
    ]) {
        const response = await request(method, path, body);
        assert.equal(response.status, 422);
        assert.ok(!(await response.text()).includes('never-persist-this-secret'));
    }
}
const foreign = structuredClone(usa); foreign.datasourceId = 'beta-source';
assert.equal((await request('PUT', `/api/pages/${page.id}/layout/`, { layoutData: layout(foreign) })).status, 403);
tenant = 'beta';
assert.equal((await request('GET', `/api/pages/${page.id}/`)).status, 404);
assert.equal((await request('PUT', `/api/pages/${page.id}/layout/`, { layoutData: layout(foreign) })).status, 404);
assert.equal((await request('GET', `/api/pages/${page.id}/versions/${version.id}/`)).status, 404);
tenant = 'alpha';
assert.deepEqual((await (await request('GET', `/api/pages/${page.id}/`)).json()).data.layoutData.root.directoryConfiguration, usa);
const draft = await request('POST', '/api/pages/', { name: 'Draft', slug: 'draft', layoutData: layout(emptyDirectoryConfiguration()) });
assert.equal(draft.status, 201);
const legacy = await request('POST', '/api/pages/', { name: 'Legacy', slug: 'legacy', layoutData: { root: {}, content: [] } });
const legacyId = (await legacy.json()).data.id;
assert.equal((await request('POST', `/api/pages/${legacyId}/publish/local/`)).status, 200);
console.log('Directory configuration: persistence, versions, rollback, two destinations, validation, datasource/page tenant isolation and publication gate PASS');
