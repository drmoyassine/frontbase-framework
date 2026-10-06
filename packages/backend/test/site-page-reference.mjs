import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration, sitePageRoles } from '@frontbase/edge-core/directory/configuration';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { PagesStore } from '../dist/compat/pages-store.js';
const runner = sqliteRunner(':memory:'); await migrateUp(runner); let tenant = 'alpha'; let authenticated = true;
const app = await createCompatApp({ makeRunner: async () => runner, resolvePrincipal: async () => authenticated ? { user: { id: 'owner', role: 'owner' }, tenant } : { user: null, tenant }, sessionSecret: 'local-page-reference-test' });
const req = (method, path, body) => app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const config = emptyDirectoryConfiguration(); config.site.name = 'USA';
const save = revision => req('PUT', '/api/project/site-configuration/', { schemaVersion: 1, expectedRevision: revision, configuration: config });
const layout = role => ({ root: { custom: 'preserved', siteConfiguration: { version: 1, role } }, content: [{ id: 'owner-node', type: 'Text', props: { text: 'Owner content' } }] });
assert.equal((await req('POST', '/api/pages/', { name: 'Missing shared', slug: 'missing-shared', layoutData: layout('program') })).status, 422);
assert.equal((await save(0)).status, 200);
for (const role of sitePageRoles) {
    const response = await req('POST', '/api/pages/', { name: role, slug: 'linked-' + role, layoutData: layout(role) }); assert.equal(response.status, 201);
    const page = (await response.json()).data; const before = JSON.stringify(page.layoutData.content);
    const version = (await (await req('POST', `/api/pages/${page.id}/versions/`, { label: 'Linked role' })).json()).data;
    const refused = await req('POST', `/api/pages/${page.id}/publish/local/`); assert.equal(refused.status, 422); assert.equal((await refused.json()).code, 'directory_runtime_pending');
    const copy = layout(role); copy.root.directoryConfiguration = config;
    assert.equal((await req('PUT', `/api/pages/${page.id}/layout/`, { layoutData: copy })).status, 422);
    for (const reference of [{ version: 2, role }, { version: 1, role: 'unknown' }, { version: 1, role, tenant: 'beta' }]) {
        const bad = layout(role); bad.root.siteConfiguration = reference;
        assert.equal((await req('PUT', `/api/pages/${page.id}/`, { layoutData: bad })).status, 422);
    }
    const bound = layout(role); bound.content[0].props.siteBindings = { text: 'private.secret' };
    assert.equal((await req('PUT', `/api/pages/${page.id}/layout/`, { layoutData: bound })).status, 422);
    tenant = 'beta'; assert.equal((await req('GET', `/api/pages/${page.id}/`)).status, 404);
    assert.equal((await req('PUT', `/api/pages/${page.id}/layout/`, { layoutData: layout(role) })).status, 422); // Missing owned configuration; no foreign fallback.
    tenant = 'alpha'; assert.equal((await req('POST', `/api/pages/${page.id}/rollback/`, { version_id: version.id })).status, 200);
    const read = (await (await req('GET', `/api/pages/${page.id}/`)).json()).data;
    assert.equal(JSON.stringify(read.layoutData.content), before); assert.equal(read.layoutData.root.custom, 'preserved');
}
authenticated = false; assert.equal((await req('POST', '/api/pages/', { name: 'No', slug: 'no', layoutData: layout('program') })).status, 401);
authenticated = true;
const queryLayout = layout('institution');
queryLayout.content.push({ id:'query', type:'Repeater', props:{directoryQuery:{version:1,queryId:'directory.program.list',params:{institutionId:512}}},children:[{id:'record',type:'Text',props:{text:'Template',recordBindings:{text:'title'}}}] });
assert.equal((await req('POST','/api/pages/',{name:'Bound',slug:'bound',layoutData:queryLayout})).status,201);
const orphan=structuredClone(queryLayout);delete orphan.root.siteConfiguration;
assert.equal((await req('POST','/api/pages/',{name:'Orphan',slug:'orphan',layoutData:orphan})).status,422);
const privateField=structuredClone(queryLayout);privateField.content[1].children[0].props.recordBindings.text='provider_id';
assert.equal((await req('POST','/api/pages/',{name:'Private',slug:'private',layoutData:privateField})).status,422);
const legacy = (await (await req('POST', '/api/pages/', { name: 'Legacy', slug: 'legacy-online', layoutData: { root: {}, content: [] } })).json()).data;
assert.equal((await req('POST', `/api/pages/${legacy.id}/publish/local/`)).status, 200);
assert.equal((await req('PUT', `/api/pages/${legacy.id}/layout/`, { layoutData: layout('institution') })).status, 409);
const store = new PagesStore(runner, 'alpha');
assert.equal(await store.update(legacy.id, { layoutData: layout('institution') }, new Date().toISOString()), null);
assert.equal(await store.setLayout(legacy.id, layout('institution'), new Date().toISOString()), null); // Atomic guard, even if route preflight races.
await store.unpublish(legacy.id, new Date().toISOString());
assert.equal((await req('PUT', `/api/pages/${legacy.id}/layout/`, { layoutData: layout('institution') })).status, 200);
const linkedVersion = (await (await req('POST', `/api/pages/${legacy.id}/versions/`, {})).json()).data;
assert.equal((await store.publish(legacy.id, 'local', new Date().toISOString())).success, false);
await store.setLayout(legacy.id, { root: {}, content: [] }, new Date().toISOString());
await store.publish(legacy.id, 'local', new Date().toISOString());
assert.equal((await req('POST', `/api/pages/${legacy.id}/rollback/`, { version_id: linkedVersion.id })).status, 409);
assert.equal(await store.rollback(legacy.id, linkedVersion.id, new Date().toISOString()), null);
const racingPage = (await (await req('POST', '/api/pages/', { name: 'Race', slug: 'race', layoutData: { root: {}, content: [] } })).json()).data;
let raced = false;
const racingRunner = { ...runner, exec: async (sql, params) => {
    if (!raced && sql.startsWith('UPDATE compat_pages SET is_published = 1')) {
        raced = true; await store.setLayout(racingPage.id, layout('program'), new Date().toISOString());
    }
    return runner.exec(sql, params);
} };
assert.equal((await new PagesStore(racingRunner, 'alpha').publish(racingPage.id, 'local', new Date().toISOString())).success, false);
assert.equal((await store.get(racingPage.id)).is_published, 0);
console.log('Shared page references: seven roles, schema, owner-only resolution, copy conflicts, layout preservation, versions/rollback and publication refusal PASS');
