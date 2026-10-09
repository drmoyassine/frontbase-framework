import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { registerTemplatePreflightRoutes } from '../dist/compat/routes/template-preflight.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';

const db = sqliteRunner(':memory:'); await migrateUp(db);
const now = '2026-10-08T12:00:00Z'; let tenant = 'alpha', role = 'owner', authenticated = true, race = null;
for (const owner of ['alpha', 'beta']) await db.exec('INSERT INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    [owner + '-source', owner, 'Source', 'sqlite', '{"url":":memory:","token":"PRIVATE_CONNECTION_CANARY"}', now, now]);
for (const name of ['institutions', 'programs', 'cities']) await db.exec(`CREATE TABLE catalog_${name} (id INTEGER, title TEXT, country INTEGER, path TEXT, parent INTEGER, body TEXT)`);
const configuration = emptyDirectoryConfiguration(); configuration.site = {name:'USA', destination:'USA', origin:'https://usa.example', locale:'en'};
configuration.datasourceId = 'alpha-source'; configuration.routes.directory = '/explore/';
for (const [role, table] of [['institution','institutions'],['program','programs'],['city','cities']]) {
    const m = configuration.collections[role]; m.table = 'catalog_' + table; m.scope = {field:'country',value:22};
    Object.assign(m.fields, {id:'id',title:'title',body:'body'}); if (role !== 'city') m.fields.originalPath = 'path';
}
configuration.collections.institution.fields.cityId = 'parent'; configuration.collections.program.fields.institutionId = 'parent';
const body = () => ({schemaVersion:1,expectedRevision:0,configuration:structuredClone(configuration),pages:[{role:'directory',slug:'/explore/'},{role:'institution',slug:'institution-template'}]});
let probes = [], resolutions = [], writes = 0;
const control = {query:(...args)=>db.query(...args),exec:async()=>{writes++;throw new Error('Read-only route wrote control DB');}};
const app = new Hono(); app.use('*',async(c,next)=>{if(!authenticated)return c.json({},401);c.set('tenant',tenant);c.set('principal',{user:{id:'owner',role},tenant});return next();});
registerTemplatePreflightRoutes(app, control, async(owner,id)=>{
    resolutions.push([owner,id]); return {query:async(sql,params)=>{probes.push(sql);if(race){const fn=race;race=null;await fn();}return db.query(sql,params);},exec:async()=>{throw new Error('Provider write');}};
});
const call = (value=body(), suffix='', headers={'content-type':'application/json'})=>app.request('/api/project/template-preflight/'+suffix,{method:'POST',headers,body:typeof value==='string'?value:JSON.stringify(value)});
const snapshot = async()=>JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'))+JSON.stringify(await db.query('SELECT * FROM compat_pages ORDER BY tenant_slug,id'));
const before=await snapshot(); let response=await call(); assert.equal(response.status,200);
const result=await response.json(); assert.deepEqual(result,{schemaVersion:1,purpose:'destination-check',checksPassed:true,checkedCollections:['institution','program','city'],installAvailable:false,publicationAvailable:false,reservationCreated:false});
assert.equal(response.headers.get('cache-control'),'no-store'); assert.match(response.headers.get('x-robots-tag'),/noindex/);
assert.equal(await snapshot(),before);assert.equal(writes,0); assert.ok(probes.every(sql=>/^SELECT d\./.test(sql)&&sql.endsWith('WHERE 1 = 0')));
assert.ok(!JSON.stringify(result).includes('PRIVATE_')); assert.deepEqual(resolutions[0],['alpha','alpha-source']);

for (const bad of [{...body(),tenant:'beta'},{...body(),sql:'SELECT secret'}, {...body(),expectedRevision:1}]) assert.equal((await call(bad)).status,422);
assert.equal((await call('{broken')).status,422); assert.equal((await call(body(),'',{})).status,415);
assert.equal((await call(' '.repeat(65537))).status,413); assert.equal((await call(body(),'?tenant=beta')).status,422);
for (const slug of ['api/users','/frontbase-admin/','//explore/','/%65xplore/','../explore','explore?x=1','a\\b','/setup/']) {
    const candidate=body();candidate.pages[1].slug=slug; assert.equal((await call(candidate)).status,422,slug);
}
let candidate=body();candidate.pages[1].slug='EXPLORE';assert.equal((await call(candidate)).status,422);
candidate=body();candidate.pages[1].role='directory';assert.equal((await call(candidate)).status,422);
candidate=body();candidate.configuration.routes.directory='/other/';assert.equal((await call(candidate)).status,422);
candidate=body();candidate.configuration.collections.program.fields.institutionId='';assert.equal((await call(candidate)).status,422);
candidate=body();candidate.pages.push({role:'article',slug:'article-template'});assert.equal((await call(candidate)).status,422);

async function page(owner,slug,deleted=null) {await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?)',[owner+'-page',owner,'Existing',slug,'{}',now,now,deleted]);}
await page('beta','explore');assert.equal((await call()).status,200,'foreign page must not collide');
await page('alpha','/EXPLORE/',now);const collided=await snapshot();assert.equal((await call()).status,409);assert.equal(await snapshot(),collided,'deleted collision untouched');
await db.exec('UPDATE compat_pages SET slug=? WHERE tenant_slug=?',['%65xplore','alpha']);assert.equal((await call()).status,409,'unparseable legacy route must fail closed');
await db.exec('DELETE FROM compat_pages WHERE tenant_slug=?',['alpha']);
candidate=body();candidate.configuration.datasourceId='beta-source';let count=resolutions.length;assert.equal((await call(candidate)).status,403);assert.equal(resolutions.length,count,'foreign source never resolved');
tenant='beta';candidate=body();candidate.pages[0].slug='explore-new';candidate.configuration.routes.directory='/explore-new/';assert.equal((await call(candidate)).status,403);tenant='alpha';
await db.exec('UPDATE datasources SET kind=? WHERE tenant_slug=?',['wordpress_rest','alpha']);assert.equal((await call()).status,422);await db.exec('UPDATE datasources SET kind=? WHERE tenant_slug=?',['sqlite','alpha']);
candidate=body();candidate.configuration.collections.institution.fields.cover='missing_column';response=await call(candidate);assert.equal(response.status,503);assert.ok(!(await response.text()).includes('missing_column'),'opaque schema failure');
candidate=body();candidate.configuration.collections.city.table='missing_table';assert.equal((await call(candidate)).status,503);

for (const mutate of [()=>page('alpha','explore'),()=>new SiteConfigurationStore(db,'alpha').save(configuration,0,now),()=>db.exec('UPDATE datasources SET config=? WHERE tenant_slug=?',['PRIVATE_CHANGED_CONNECTION','alpha'])]) {
    race=mutate;assert.equal((await call()).status,409,'destination changed during probe');
    await db.exec('DELETE FROM compat_pages WHERE tenant_slug=?',['alpha']);await db.exec('DELETE FROM settings WHERE tenant_slug=?',['alpha']);
    await db.exec('UPDATE datasources SET config=? WHERE tenant_slug=?',['{"url":":memory:","token":"PRIVATE_CONNECTION_CANARY"}','alpha']);
}
await new SiteConfigurationStore(db,'alpha').save(configuration,0,now);count=probes.length;assert.equal((await call()).status,409);assert.equal(probes.length,count,'existing settings require upgrade');
await db.exec('UPDATE settings SET value=? WHERE tenant_slug=?',['PRIVATE_CORRUPT_CANARY','alpha']);response=await call();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE_'));
await db.exec('DELETE FROM settings WHERE tenant_slug=?',['alpha']);
await db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1001)
    INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,created_at,updated_at)
    SELECT 'bulk-'||i,'alpha','Existing','existing-'||i,'{}',?,? FROM n`,[now,now]);
assert.equal((await call()).status,409,'bounded namespace refuses an incomplete scan');
await db.exec('DELETE FROM compat_pages WHERE tenant_slug=?',['alpha']);
role='viewer';assert.equal((await call()).status,403);role='owner';authenticated=false;assert.equal((await call()).status,401);authenticated=true;
// Verify real app registration is behind its default-deny middleware, not only the fixture wrapper.
const integrated=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authenticated?{id:'owner',role}:null,tenant}),sessionSecret:'template-check-session',now:()=>now});
const integratedCall=()=>integrated.request('/api/project/template-preflight/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body())});
authenticated=false;assert.equal((await integratedCall()).status,401);authenticated=true;role='viewer';assert.equal((await integratedCall()).status,403);role='owner';
assert.equal(writes,0);
console.log('template-preflight: strict bounded input, reserved/duplicate/deleted/foreign routes, trusted owner/source, all-column real SQLite checks, no writes/rows/secrets, three race refusals, settings conflict/corruption and real-app auth pass');
process.exit(0);
