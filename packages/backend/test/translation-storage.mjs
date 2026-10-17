import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';
import { SyncStore } from '../dist/compat/sync-store.js';
import { TranslationStorageStore, configuredTranslationStorage, resolveTranslationStorage } from '../dist/compat/translation-storage.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';

globalThis.fetch = async () => { throw Error('unexpected_raw_transport'); };
const runner = sqliteRunner(':memory:'); await migrateUp(runner);
const secret = 'translation-settings-test-key', cipher = await createSecretCipher(secret), now = '2026-10-17T00:00:00Z';
const stores = new Map(); const syncFor = tenant => { if (!stores.has(tenant)) stores.set(tenant, new SyncStore(runner, tenant, cipher)); return stores.get(tenant); };
const calls = []; let tenant = 'alpha', role = 'owner', authenticated = true, failure = false, redirect = false;
const externalFetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init); const body = await req.json();
    calls.push({ url: req.url, headers: Object.fromEntries(req.headers), body, redirect: req.redirect });
    if (failure) throw Error('PRIVATE_TRANSLATION_TEST_SECRET');
    if (redirect) return new Response('', { status: 302, headers: { location: 'https://127.0.0.1/private' } });
    return Response.json(body.p_operation === 'capabilities' ? { protocol: 'frontbase-translation-postgrest', version: 1 } : { source: null, head: null, version: 0 });
};
for (const [id, owner, kind, config] of [
    ['a','alpha','supabase',{ api_url: 'https://alpha.example.test', service_role_key: 'PRIVATE_ALPHA' }],
    ['b','beta','supabase',{ api_url: 'https://beta.example.test', service_role_key: 'PRIVATE_BETA' }],
    ['unsupported','alpha','sqlite',{}],
    ['private','alpha','supabase',{ url: 'https://127.0.0.1', serviceKey: 'PRIVATE_ALPHA' }],
    ['anon','alpha','supabase',{ url: 'https://alpha.example.test', anon_key: 'PRIVATE_ANON' }],
    ['account','alpha','supabase',{ provider_account_id: 'connected-a' }],
    ['foreign-account','alpha','supabase',{ provider_account_id: 'connected-b' }],
]) await syncFor(owner).createDatasource({name:id,kind,config},id,now);
const site = emptyDirectoryConfiguration(); site.datasourceId = 'a'; await new SiteConfigurationStore(runner,'alpha').save(site,0,now);
const app = await createCompatApp({ makeRunner: () => runner, sessionSecret: secret, now: () => now, externalFetch,
    resolvePrincipal: async () => ({ user: authenticated ? { id:'editor',role } : null, tenant }),
});
const endpoint = '/api/project/translation-storage/';
const selection = (datasourceId='a', endpoint='supabase') => ({version:1,datasourceId,endpoint,namespace:'translations'});
const request = (method, body, suffix='') => app.request(endpoint+suffix,{method,headers:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const check = input => request('POST',input,'check/');
const save = (expectedRevision,configuration=selection()) => request('PUT',{expectedRevision,configuration});
let response = await request('GET'); assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
let options = await response.json(); assert.equal(options.contentDatasourceId,'a');assert.equal(options.revision,0);assert.equal(options.configuration,null);
assert.ok(!JSON.stringify(options).includes('PRIVATE_'));assert.ok(!JSON.stringify(options).includes('example.test'));assert.ok(!options.datasources.some(s=>s.id==='b'));assert.equal(options.datasources.find(s=>s.id==='unsupported').supported,false);
assert.equal((await check(selection())).status,200);assert.equal(calls.length,2);assert.equal(calls[0].url,'https://alpha.example.test/rest/v1/rpc/translation_request');
assert.equal(calls[0].redirect,'manual');assert.equal(calls[0].headers.apikey,'PRIVATE_ALPHA');assert.equal(calls[0].headers['content-profile'],'translations');assert.equal(calls[1].body.p_scope.tenantId,'alpha');assert.ok(calls[1].body.p_scope.projectId.length>10);assert.deepEqual(calls.map(c=>c.body.p_operation),['capabilities','read']);
assert.equal((await check(selection('a','postgrest'))).status,200);assert.equal(calls.at(-1).url,'https://alpha.example.test/rpc/translation_request');
const callsBefore = calls.length;
for (const id of ['b','unsupported','private','anon','foreign-account']) { response=await check(selection(id)); assert.equal(response.status,422);assert.ok(!(await response.text()).includes('PRIVATE_')); }
assert.equal(calls.length,callsBefore,'unowned/unsupported/private/public-key/missing account refused before transport');
for (const input of [{...selection(),projectId:'forged-project'},{...selection(),tenant:'beta'},{...selection(),url:'https://beta.example.test'},{...selection(),namespace:'public'}]) assert.equal((await check(input)).status,422);
assert.equal((await request('PUT',{expectedRevision:0,configuration:selection(),tenant:'beta'})).status,422);
assert.equal((await request('PUT',{expectedRevision:0,configuration:selection(),projectId:'forged'})).status,422);
response=await check('x'.repeat(5000));assert.equal(response.status,413);
// The manual HTTP UI uses ordinary datasource creation; secrets remain encrypted and omitted from its response.
response=await app.request('/api/sync/datasources/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Native HTTP',type:'supabase',api_url:'https://native.example.test',service_role_key:'PRIVATE_MANUAL'})});
assert.equal(response.status,201);const manual=await response.json();assert.ok(!JSON.stringify(manual).includes('PRIVATE_MANUAL'));
const rawConfig=await runner.query('SELECT config FROM datasources WHERE tenant_slug = ? AND id = ?',['alpha',manual.id]);assert.ok(String(rawConfig[0].config).startsWith('enc:'));
response=await app.request('/api/sync/datasources/'+manual.id+'/',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Renamed HTTP',api_url:'',service_role_key:''})});assert.equal(response.status,200);assert.equal((await syncFor('alpha').getDatasource(manual.id)).config.service_role_key,'PRIVATE_MANUAL');
assert.equal((await check(selection(manual.id,'postgrest'))).status,200);assert.equal(calls.at(-1).url,'https://native.example.test/rpc/translation_request');
role='viewer';for(const [method,body,suffix] of [['GET',undefined,''],['PUT',{expectedRevision:0,configuration:selection()},''],['POST',selection(),'check/']])assert.equal((await request(method,body,suffix)).status,403);role='owner';
authenticated=false;assert.equal((await request('GET')).status,401);assert.equal((await save(0)).status,401);authenticated=true;
failure=true;response=await check(selection());assert.equal(response.status,422);assert.ok(!(await response.text()).includes('PRIVATE_'));failure=false;
redirect=true;assert.equal((await check(selection())).status,422);redirect=false;
const raceStore=new TranslationStorageStore(runner,'race-store');await raceStore.save(null,0,now);const directRace=await Promise.all([raceStore.save(selection(),1,now),raceStore.save(selection(),1,now)]);assert.equal(directRace.filter(Boolean).length,1,'CAS must have exactly one update winner');
const creations=await Promise.all([save(0),save(0)]);assert.deepEqual(creations.map(r=>r.status).sort(),[200,409]);
const updates=await Promise.all([save(1),save(1)]);assert.deepEqual(updates.map(r=>r.status).sort(),[200,409]);assert.equal((await save(0)).status,409);
tenant='beta';assert.equal((await (await request('GET')).json()).revision,0);assert.equal((await save(0)).status,422);tenant='alpha';
// Resolve connected accounts with the same tenant, and honor rotated server credentials without storing them in settings.
let key='ROTATED_ONE';const accountConfigFor=async(t,id)=>t==='alpha'&&id==='connected-a'?{url:'https://account.example.test',serviceKey:key}:null;
const host={syncFor,externalFetch,accountConfigFor};
await new TranslationStorageStore(runner,'alpha').save(selection('account','postgrest'),2,now);
const identity=(await new TranslationStorageStore(runner,'alpha').get()).projectId;assert.ok(identity);
const otherInstance=sqliteRunner(':memory:');await migrateUp(otherInstance);const otherSettings=await new TranslationStorageStore(otherInstance,'alpha').save(selection(),0,now);assert.notEqual(otherSettings.projectId,identity,'separate hosts with the same tenant name get isolated project identities');
let session=await configuredTranslationStorage(host,runner,'alpha');await session.persistence.initialize();assert.equal(calls.at(-1).headers.apikey,'ROTATED_ONE');assert.equal(session.configurationRevision,3);assert.equal(session.scope.projectId,identity);
key='ROTATED_TWO';session=await configuredTranslationStorage(host,runner,'alpha');await session.persistence.initialize();assert.equal(calls.at(-1).headers.apikey,'ROTATED_TWO');
await assert.rejects(resolveTranslationStorage(host,'beta',selection('account'),'local-project'));
await assert.rejects(resolveTranslationStorage(host,'alpha',selection('foreign-account'),'local-project'));
assert.ok(!JSON.stringify(await new TranslationStorageStore(runner,'alpha').get()).includes('ROTATED_'));
assert.equal((await save(3,null)).status,200);assert.equal((await new TranslationStorageStore(runner,'alpha').get()).projectId,identity);await assert.rejects(configuredTranslationStorage(host,runner,'alpha'),/unconfigured/);
// Corrupt persisted configuration is not treated as an empty first save; inputs never escape.
await runner.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',['PRIVATE_CORRUPT_TEST_SECRET','alpha','translation_storage:v1']);
response=await request('GET');assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE_'));assert.equal((await save(0)).status,422);
console.log('translation-storage: PASS (owned settings, CAS races, role/auth, HTTP/profile, scope, guards, account rotation, no-leak, no migrations)');
