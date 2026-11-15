import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {createLiveDirectoryQueries,createDirectoryQueries} from '@frontbase/compiler/queries/directory';
import {createEngine,directProvider} from '@frontbase/edge-core';
import {LiveLayoutPublicationStore,liveLayoutPublicationSchema} from '../dist/compat/live-layout-publication.js';
import {resolveLiveLayoutPage} from '../dist/compat/live-layout-runtime.js';
import {renderLiveLayoutPublication,resolveLiveLayoutSurface} from '../dist/compat/live-layout-serving.js';

const directory=await mkdtemp(join(tmpdir(),'frontbase-live-')),databaseUrl=pathToFileURL(join(directory,'state.db')).href;
const db=sqliteRunner(databaseUrl);
await db.exec('CREATE TABLE settings(tenant_slug TEXT,key TEXT,value TEXT,updated_at TEXT,PRIMARY KEY(tenant_slug,key))');
await db.exec('CREATE TABLE cities(id INTEGER PRIMARY KEY,title TEXT,country INTEGER)');
await db.exec('CREATE TABLE institutions(id INTEGER PRIMARY KEY,title TEXT,path TEXT,city_id INTEGER,country INTEGER)');
await db.exec('CREATE TABLE programs(id INTEGER PRIMARY KEY,title TEXT,path TEXT,institution_id INTEGER,country INTEGER)');
await db.exec('INSERT INTO cities VALUES(1,?,22)',['City']);
await db.exec('INSERT INTO institutions VALUES(1,?,?,1,22)',['First title','/first/']);
await db.exec('INSERT INTO programs VALUES(1,?,?,1,22)',['Program one','/program/']);
const configuration=emptyDirectoryConfiguration();
configuration.site={name:'Live site',origin:'https://live.example',locale:'en'};
configuration.datasourceId='source';
for(const [role,table] of [['city','cities'],['institution','institutions'],['program','programs']]){
 const mapping=configuration.collections[role];mapping.table=table;mapping.scope={field:'country',value:22};
 Object.assign(mapping.fields,{id:'id',title:'title',...(role==='city'?{}:{originalPath:'path'})});
}
configuration.collections.institution.fields.cityId='city_id';
configuration.collections.program.fields.institutionId='institution_id';
const block=(id,queryId)=>({id,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params:queryId.endsWith('.detail')?{path:'/sample/'}:{}}},children:[{id:id+'title',type:'Heading',props:{recordBindings:{text:'title'}}}]});
const templates=['directory','institution','program'].map((role,i)=>({pageId:'00000000-0000-4000-8000-00000000000'+i,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:[block(role,role==='directory'?'directory.institution.list':'directory.'+role+'.detail')]}}));
const binding={componentId:'live-list',dataSourceId:'frontbase:publication',tableName:'institutions',source:{kind:'publication',hash:'a'.repeat(64)},pagination:{enabled:true,pageSize:1,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:true,filters:{}},columnOverrides:{}};
const listPage={pageId:'00000000-0000-4000-8000-000000000009',originalPath:'/browse/',title:'Browse',description:'',layout:{root:{},content:[{id:'live-list',type:'Repeater',props:{binding},children:[{id:'live-title',type:'Heading',props:{text:'{{ record.title }}'}}]}]}};
const plan=liveLayoutPublicationSchema.parse({schemaVersion:3,runtimeVersion:'live-layout-v1',configuration,templates,staticPages:[listPage],locales:['en','ar']});
const store=new LiveLayoutPublicationStore(db,'one'),id=await store.prepare(plan,'2026-11-15T00:00:00Z');
const pointer=await store.publish(id,null,'2026-11-15T00:00:00Z');assert.ok(pointer);
const host={syncFor:()=>({getDatasource:async()=>({id:'source',kind:'sqlite',config:{url:databaseUrl}})}),accountConfigFor:async()=>null,externalFetch:async()=>{throw Error('unexpected network');}};
const options={host,liveQuery:async()=>{throw Error('unexpected view');}};
let response=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/'),options);
assert.equal(response.status,200);assert.equal(response.headers.get('X-Frontbase-Data'),'live');
assert.match(await response.text(),/First title/);
const fetchKeys = [];
const cold = {
 dialect: db.dialect,
 query: (sql, params) => { if (params?.[0] === 'one') fetchKeys.push(...params.slice(1)); return db.query(sql, params); },
 exec: (sql, params) => db.exec(sql, params),
};
const coldResult = await renderLiveLayoutPublication(cold,'one',new Request('https://live.example/first/'),options);
assert.equal(coldResult.status,200);
assert.equal(fetchKeys.filter(key=>String(key).startsWith('live_layout:index:')).length,1);
const fetchedArtifacts=fetchKeys.filter(key=>String(key).startsWith('live_layout:artifact:'));
assert.equal(fetchedArtifacts.length,1,'a cold request loads only its selected artifact');
const corrupt = {...cold, query:async (sql, params) => {
 const rows = await cold.query(sql, params);
 return params?.[1] === fetchedArtifacts[0] ? rows.map(row=>({...row,value:row.value+' '})) : rows;
}};
assert.equal((await renderLiveLayoutPublication(corrupt,'one',new Request('https://live.example/first/'),options)).status,503,'tampered artifact fails closed');
const {publicationHash}=await import('../dist/compat/publication-hash.js');
const legacy=await publicationHash(plan);
await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['one','live_layout:version:v1:'+legacy,JSON.stringify(plan),'2026-11-15T00:00:00Z']);
assert.deepEqual(await store.get(legacy),plan,'pre-split releases remain readable');

const withEditor = await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/'),{...options,frontendEditing:true});
assert.equal((await withEditor.text()).match(/\/api\/frontend-edit\/script\.js/g)?.length,1,'live document emits the editor once');
const head = await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/',{method:'HEAD'}),options);
assert.equal(head.status,200);
assert.equal(head.body,null);
assert.equal((await resolveLiveLayoutSurface(db,'one',new Request('https://live.example/first/'),options)).pageId,templates[1].pageId);
assert.equal(await store.publish(id,null,'2026-11-15T00:00:00Z'),null,'stale writer refused');
assert.equal(await new LiveLayoutPublicationStore(db,'two').active(),null,'tenant isolation');
const immutable=await store.get(id);
assert.throws(()=>{immutable.configuration.site.name='Changed';},TypeError,'cached authored layout cannot be mutated');
assert.throws(()=>{immutable.templates[0].layout.content[0].props.initialRows=[];},TypeError,'records cannot be attached to cached authored nodes');
assert.equal((await store.get(id)).configuration.site.name,'Live site');
assert.equal(immutable.displayPlans[templates[0].pageId].version,1,'publication persists display instructions');
const alteredPlan=structuredClone(immutable);
alteredPlan.displayPlans[templates[0].pageId].programs[0].columns.push('private_secret');
assert.equal(liveLayoutPublicationSchema.safeParse(alteredPlan).success,false,'arbitrary display plan cannot expose an unbound column');
const {liveDisplayPlan}=await import('../dist/compat/live-layout-publication.js');
assert.equal(liveDisplayPlan(plan,templates[0].pageId),liveDisplayPlan(plan,templates[0].pageId),'legacy plan compiled once without changing publication');


for(const forbidden of ['records','index','chunks','catalog','approvals']){
 assert.equal(liveLayoutPublicationSchema.safeParse({...plan,[forbidden]:[]}).success,false,forbidden+' cannot enter layout contract');
}
const seeded=structuredClone(plan);seeded.templates[0].layout.content[0].props.initialRows=[{title:'Frozen'}];
assert.equal(liveLayoutPublicationSchema.safeParse(seeded).success,false,'hydrated content refused');
// Reusing a compiled definition must never retain a previous request's runner.
const firstRunner=createLiveDirectoryQueries(configuration,'one','sqlite',async()=>[{total:1}]);
const secondRunner=createLiveDirectoryQueries(configuration,'one','sqlite',async()=>[{total:2}]);
assert.deepEqual(await firstRunner['directory.institution.count'].execute({},{tenant:'one'}),[{total:1}]);
assert.deepEqual(await secondRunner['directory.institution.count'].execute({},{tenant:'one'}),[{total:2}]);
await assert.rejects(()=>secondRunner['directory.institution.count'].execute({},{tenant:'two'}),/principal/);
const queries=createLiveDirectoryQueries(configuration,'one','sqlite',(sql,params)=>db.query(sql,params));
await assert.rejects(()=>queries['directory.institution.list'].execute({},{tenant:'other'}),/principal/);
const authoring=createDirectoryQueries(configuration,'one','sqlite',(sql,params)=>db.query(sql,params));
await assert.rejects(()=>authoring['directory.institution.list'].execute({},{tenant:'one'}),/principal/,'preview still requires principal');
const reader={queries,liveQuery:async()=>{throw Error('unexpected live view');},resolveRoute:async path=>{
 const matches=await Promise.all(['institution','program'].map(async role=>({role,rows:await queries['directory.'+role+'.detail'].execute({path},{tenant:'one'})})));
 const found=matches.filter(item=>item.rows.length);
 if(found.length>1)throw Error('live_route_ambiguous');
 return found.length?{role:found[0].role,row:found[0].rows[0]}:null;
}};
const render=async(path,locale='en')=>{
 const resolved=await resolveLiveLayoutPage(plan,id,'one',db,new Request('https://live.example'+path),reader,locale);
 if(!resolved)return null;
 const manifest={version:id,pages:{[new URL('https://live.example'+path).pathname]:resolved.page},queries:{}};
 const response=await createEngine({manifest,data:directProvider(manifest),environment:'edge',document:resolved.document}).fetch(new Request('https://live.example'+path));
 assert.equal(response.status,200);return {resolved,html:await response.text()};
};
assert.match((await render('/first/')).html,/First title/);
await db.exec('UPDATE institutions SET title=? WHERE id=1',['Edited immediately']);
assert.match((await render('/first/')).html,/Edited immediately/);
assert.equal((await render('/first/')).resolved.page.title,'Edited immediately','SEO reflects current row');
response=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/'),options);
assert.match(await response.text(),/Edited immediately/,'full HTTP renderer rereads adapter');
response=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/sitemap-live-institution-0.xml'),options);
assert.equal(response.status,200);assert.match(await response.text(),/\/first\//);
await db.exec('INSERT INTO institutions VALUES(2,?,?,1,22)',['New record','/new/']);
const listRequest=(componentId='live-list')=>new Request('https://live.example/browse/',{headers:{'X-Frontbase-List':encodeURIComponent(JSON.stringify({componentId,versionId:'default',page:1,pageSize:1,sortColumn:'title',direction:'asc',filters:[]}))}});
response=await renderLiveLayoutPublication(db,'one',listRequest(),options);
assert.equal(response.status,200);const currentList=await response.json();assert.equal(currentList.total,2);assert.equal(currentList.rows[0].title,'New record','pagination ignores obsolete source hash');
response=await renderLiveLayoutPublication(db,'one',listRequest('forged'),options);assert.equal(response.status,404,'only published elements may supply list reads');
assert.match((await render('/explore/?type=institution')).html,/New record/);
assert.match((await render('/new/')).html,/New record/,'new route without republish');
assert.equal((await queries['directory.institution.count'].execute({},{tenant:'one'}))[0].total,2);
assert.doesNotMatch((await render('/explore/?type=institution&q=New')).html,/Edited immediately/,'search current rows');
await db.exec('UPDATE institutions SET country=99 WHERE id=2');
assert.equal(await render('/new/'),null,'scope removal hides route');
await db.exec('DELETE FROM institutions WHERE id=1');
assert.equal(await render('/first/'),null,'deletion cannot fall back to saved content');
response=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/'),options);
assert.equal(response.status,404);
response=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/explore/',{headers:{'X-Frontbase-List':'invalid'}}),options);
assert.equal(response.status,400);
assert.equal(await render('/program/'),null,'related scope/deletion enforced');
assert.deepEqual((await store.active()).pointer,pointer,'no republishing during mutations');
const arabic=await render('/explore/?type=institution','ar');
assert.match(arabic.html,/dir="rtl"/);
assert.match(arabic.html,/lang="ar"/);
const failing={...reader,resolveRoute:async()=>{throw Error('upstream unavailable');}};
await assert.rejects(()=>resolveLiveLayoutPage(plan,id,'one',db,new Request('https://live.example/first/'),failing),/upstream/,'no snapshot fallback');
console.log('live layout serving: real adapter edits, insert/delete/routes/SEO/search/scope, unchanged publication, tenant isolation and RTL PASS');
await db.close?.();
await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
