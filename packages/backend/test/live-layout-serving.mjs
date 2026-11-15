import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {homepageDisplayFields} from '@frontbase/edge-core/localization';
import {createLiveDirectoryQueries,createDirectoryQueries} from '@frontbase/compiler/queries/directory';
import {createEngine,directProvider} from '@frontbase/edge-core';
import {LiveLayoutPublicationStore,liveLayoutPublicationSchema} from '../dist/compat/live-layout-publication.js';
import {resolveLiveLayoutPage} from '../dist/compat/live-layout-runtime.js';
import {renderLiveLayoutPublication,resolveLiveLayoutSurface} from '../dist/compat/live-layout-serving.js';
import {requestLiveLayoutHost} from '../dist/compat/live-layout-reader.js';

let credentialVersion=1,connectionReads=0;
const credentialHost={syncFor:owner=>({getDatasource:async id=>{
 connectionReads++;return {id,kind:'supabase',config:{owner,credentialVersion}};
}}),accountConfigFor:async()=>null,externalFetch:fetch};
const pageHost=requestLiveLayoutHost(credentialHost);
const [firstConnection,secondConnection]=await Promise.all([pageHost.syncFor('one').getDatasource('same'),pageHost.syncFor('one').getDatasource('same')]);
assert.equal(connectionReads,1,'content and translations share one current datasource read');
firstConnection.config.credentialVersion=99;
assert.equal(secondConnection.config.credentialVersion,1,'consumers cannot mutate each other');
assert.equal((await pageHost.syncFor('two').getDatasource('same')).config.owner,'two','memo is owner scoped');
credentialVersion=2;
assert.equal((await requestLiveLayoutHost(credentialHost).syncFor('one').getDatasource('same')).config.credentialVersion,2,'next page sees credential rotation');
assert.equal(await requestLiveLayoutHost({...credentialHost,syncFor:()=>({getDatasource:async()=>null})}).syncFor('one').getDatasource('same'),null,'next page sees removed datasource');
const adapterHost=Object.create(credentialHost);
adapterHost.accountConfigFor=async()=>null;
adapterHost.accountConfigFor.persistRefresh=async()=>({refreshed:true});
adapterHost.externalFetch=async function(){assert.equal(this,undefined,'native fetch must remain a detached function');return new Response('ok');};
const wrappedHost=requestLiveLayoutHost(adapterHost);
assert.strictEqual(wrappedHost.accountConfigFor,adapterHost.accountConfigFor);
assert.strictEqual(wrappedHost.externalFetch,adapterHost.externalFetch,'do not wrap native fetch with a changed receiver');
assert.deepEqual(await wrappedHost.accountConfigFor.persistRefresh('one','account',{},{}),{refreshed:true},'credential-refresh persistence is retained');
const fetchAdapter=wrappedHost.externalFetch;
assert.equal(await (await fetchAdapter('https://example.com')).text(),'ok');

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
const listPage={pageId:'00000000-0000-4000-8000-000000000009',originalPath:'/browse/',title:'Browse',description:'',layout:{root:{},content:[{id:'live-list',type:'Repeater',props:{binding},children:[{id:'live-title',type:'Heading',props:{text:'{{ record.title }}'}}]},{id:'browse-heading',type:'Heading',props:{text:'Browse institutions'}}]}};
const plan=liveLayoutPublicationSchema.parse({schemaVersion:3,runtimeVersion:'live-layout-v1',configuration,templates,staticPages:[listPage],locales:['en','ar']});
const store=new LiveLayoutPublicationStore(db,'one');
const withoutIds=await store.prepare(plan,'2026-11-15T00:00:00Z');
await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['one','translation_storage:v1','malformed','2026-11-15T00:00:00Z']);
assert.equal(await store.prepare(plan,'2026-11-15T00:00:00Z'),withoutIds,'malformed translation settings do not block source publication');
const prior=await store.open(withoutIds);
assert.equal((await prior.loadLayout(prior.layout.staticPages[0])).translationIds,undefined,'older split artifacts are readable');
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',[JSON.stringify({revision:1,projectId:'proof-project',configuration:null}),'one','translation_storage:v1']);
const id=await store.prepare(plan,'2026-11-15T00:00:00Z');
const pointer=await store.publish(id,null,'2026-11-15T00:00:00Z');assert.ok(pointer);
for(const malformed of [null,[],{},[id,1],{hash:id},{hash:id,generation:'1'},{hash:id,generation:0},
 {hash:id,generation:-1},{hash:id,generation:1.5},{hash:id,generation:Number.MAX_SAFE_INTEGER+1},
 {hash:id.toUpperCase(),generation:1},{hash:id.slice(1),generation:1},{hash:id,generation:1,extra:true}]){
 const badPointer={...db,query:async(sql,params)=>params?.[1]==='live_layout:active:v1'?[{value:JSON.stringify(malformed)}]:db.query(sql,params)};
 await assert.rejects(()=>new LiveLayoutPublicationStore(badPointer,'one').activeForServing(),/layout_pointer_invalid/,'strict persisted-pointer bounds');
}
const maxPointer={...db,query:async(sql,params)=>params?.[1]==='live_layout:active:v1'?[{value:JSON.stringify({hash:id,generation:Number.MAX_SAFE_INTEGER})}]:db.query(sql,params)};
assert.equal((await new LiveLayoutPublicationStore(maxPointer,'one').activeForServing()).pointer.generation,Number.MAX_SAFE_INTEGER);
await assert.rejects(()=>new LiveLayoutPublicationStore(maxPointer,'one').publish(id,{hash:id,generation:Number.MAX_SAFE_INTEGER},'now'),/layout_pointer_invalid/,'generation cannot overflow');
const open=await store.open(id),artifact=await open.loadLayout(open.layout.staticPages[0]);
assert.equal(artifact.directoryPlan.version,1,'publication compiles directory and landing instructions');
assert.ok(Object.isFrozen(artifact.directoryPlan));
assert.ok(Object.isFrozen(open.layout.configuration.collections.program.fields));
assert.deepEqual(artifact.translationIds.scope,{tenantId:'one',projectId:'proof-project'});
assert.equal(artifact.translationIds.pageId,listPage.pageId);
assert.ok(artifact.translationIds.entries.some(([key])=>key.includes('browse-heading')),'authoring compiles stable layout fields');
assert.doesNotMatch(JSON.stringify(artifact.translationIds),/Browse institutions|First title|Program one/,'no materialized text in published identity plan');
const host={syncFor:()=>({getDatasource:async()=>({id:'source',kind:'sqlite',config:{url:databaseUrl}})}),accountConfigFor:async()=>null,externalFetch:async()=>{throw Error('unexpected network');}};
const options={host,liveQuery:async()=>{throw Error('unexpected view');}};
let response=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/'),options);
assert.equal(response.status,200);assert.equal(response.headers.get('X-Frontbase-Data'),'live');
const preparedHtml=await response.text();assert.match(preparedHtml,/First title/);
const withoutDirectoryPlan={...options,prepared:{pointer,layout:open.layout,loadLayout:async page=>{
 const {directoryPlan,...olderArtifact}=await open.loadLayout(page);return structuredClone(olderArtifact);
}}};
const olderResponse=await renderLiveLayoutPublication(db,'one',new Request('https://live.example/first/'),withoutDirectoryPlan);
assert.equal(olderResponse.status,200);
assert.equal(await olderResponse.text(),preparedHtml,'legacy artifacts without directory plans render identically');
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
const surface=await resolveLiveLayoutSurface(db,'one',new Request('https://live.example/first/'),options);
assert.equal(surface.pageId,templates[1].pageId);
const detail=homepageDisplayFields(surface.layout).find(field=>field.text==='First title');
assert.equal(detail.fieldKey,'title','live detail title remains a record field');
assert.deepEqual(detail.record,{connectionId:'frontbase:publication',collection:'institutions',key:[{column:'id',value:1}]});
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
