import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { captureRouteInventory } from '../dist/compat/capture-route-inventory.js';
import { registerPageRouteAudit } from '../dist/compat/routes/page-route-audit.js';
import { migrateUp } from '../dist/db/migrations.js';
const db=sqliteRunner(':memory:'); await migrateUp(db);
// Literal synthetic fixture copied from the existing SEO acceptance, not live data.
const now='2026-10-07T08:00:00Z', config=emptyDirectoryConfiguration();
config.site={name:'USA',destination:'USA',origin:'https://study-in-usa.com',locale:'en'};config.datasourceId='PRIVATE_DATASOURCE';
for(const role of ['institution','program','city']) {const m=config.collections[role];m.table='PRIVATE_'+role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='wp_url';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const node=(id,queryId,params)=>({id,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params}},children:[{id:id+'-title',type:'Heading',props:{recordBindings:{text:'title'}}},{id:id+'-link',type:'Link',props:{text:'Details',recordBindings:{href:'originalPath'}}}]});
const templates=['directory','institution','program','article-index','article'].map((role,index)=>({pageId:`00000000-0000-4000-8000-00000000000${index}`,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:role==='directory'?[node('institutions','directory.institution.list',{}),node('programs','directory.program.list',{})]:role==='article-index'?[node('articles','directory.article.list',{})]:[node('detail',`directory.${role}.detail`,{path:'/WRONG-SAMPLE/'}),...(role==='institution'?[node('related','directory.program.list',{institutionId:999})]:[])]}}));
const base={summary:'Public summary',cover:null,coverAlt:'',logo:null};
const artifact={schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:1,configuration:config,templates,records:{
 cities:[{id:1,title:'Allentown'}],institutions:[{...base,id:512,title:'Muhlenberg College',originalPath:'/muhlenberg-college/',cityId:1}],
 programs:[{...base,id:46188,title:'Dental program',originalPath:'/old-parent/dental-program/',institutionId:512}],
 articles:[{...base,id:'00000000-0000-4000-8000-000000000099',revision:3,title:'Announcement',originalPath:'/blog/original-article/',body:[{kind:'paragraph',runs:[{text:'Reviewed public content'}]}],language:'en',byline:'Author',publishedAt:'2025-04-19T09:12:43Z'}]}};

assert.deepEqual(await captureRouteInventory(db,'alpha'),{identity:null,paths:[]});
const store=new SitePublicationStore(db,'alpha'),hash=await store.prepare(artifact,now);
assert.equal((await captureRouteInventory(db,'alpha')).identity,null); // prepared is not active
assert.ok(await store.activate(hash,null,now));
const before=JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'));
const inventory=await captureRouteInventory(db,'alpha');assert.equal(inventory.identity.hash,hash);
assert.deepEqual(inventory.paths.map(r=>[r.source,r.path]),[['directory',config.routes.directory],['blog',config.routes.blog],['institution','/muhlenberg-college/'],['program','/old-parent/dental-program/'],['article','/blog/original-article/']]);
assert.ok(!JSON.stringify(inventory).includes('PRIVATE_'));
assert.equal((await captureRouteInventory(db,'beta')).identity,null);
assert.equal(JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key')),before);
function appFor(runner){const app=new Hono();app.use('*',async(c,next)=>{c.set('tenant','alpha');c.set('principal',{user:{id:'test',role:'owner'},tenant:'alpha'});return next();});registerPageRouteAudit(app,runner);return app;}
await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',['collision','alpha','PRIVATE_TITLE','muhlenberg-college','{}',now,now]);
let response=await appFor(db).request('/api/project/page-route-audit/'),report=await response.json();
assert.equal(response.status,200);assert.equal(report.coverage,'stored-pages-and-active-capture');assert.equal(report.publicRecordsChecked,true);assert.equal(report.capture.hash,hash);assert.equal(report.resourcesChecked,6);assert.equal(report.status,'conflicts');assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
assert.ok(report.issues.some(i=>i.code==='potential_alias_conflict'&&i.resources.some(r=>r.source==='institution')));
let pointerReads=0;
const changing={query:async(sql,params)=>{const rows=await db.query(sql,params);if(params?.[1]==='site_publication:active:v1'&&++pointerReads===2) return rows.map(r=>({...r,value:JSON.stringify({...JSON.parse(r.value),generation:2})}));return rows;},exec:async()=>{throw Error('No writes');}};
response=await appFor(changing).request('/api/project/page-route-audit/');assert.equal(response.status,503);assert.equal((await response.json()).code,'namespace_changed');
for(const [name,runner] of [
 ['foreign',{query:async(sql,params)=>(await db.query(sql,params)).map(r=>({...r,tenant_slug:'beta'}))}],
 ['duplicate',{query:async(sql,params)=>{const r=await db.query(sql,params);return params?.[1]==='site_publication:active:v1'?[...r,...r]:r;}}],
 ['oversize',{query:async()=>[{tenant_slug:'alpha',key:'site_publication:active:v1',value:'x'.repeat(1025)}]}],
 ['hash',{query:async(sql,params)=>(await db.query(sql,params)).map(r=>params?.[1]===`site_publication:v1:${hash}`?{...r,value:r.value.replace('Muhlenberg College','Tampered')}:r)}],
]) {await assert.rejects(()=>captureRouteInventory(runner,'alpha'),undefined,name);response=await appFor(runner).request('/api/project/page-route-audit/');assert.equal(response.status,503,name);assert.ok(!(await response.text()).includes('PRIVATE_'));}
console.log('capture inventory: original paths/all families, inactive/foreign exclusion, owner/hash/size/duplicate refusal, no writes/secrets, endpoint conflict and pointer drift pass');
export { db, hash };
