import assert from 'node:assert/strict';
import {savedViewFilters} from '@frontbase/edge-core/saved-view-filters';
import {executeSingleTableRpc} from '../dist/compat/single-table-rpc.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration,liveViewBindings} from '@frontbase/edge-core/directory/configuration';
import {publicationTemplateSchema} from '@frontbase/edge-core/directory/publication';
import {applyBlockVersion} from '@frontbase/edge-core/block-versions';
import {migrateUp} from '../dist/db/migrations.js';
import {createCompatApp} from '../dist/compat/app.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {publishedLiveQuery} from '../dist/compat/published-live-query.js';
import {projectPublicationListRows} from '../dist/compat/publication-list-source.js';
import {resolvePublicationVersionPage} from '../dist/compat/site-publication-runtime.js';
import {convertPilotLiveLists,pilotLiveViewPlan} from '../dist/compat/pilot-live-lists.js';
import {publicationHash} from '../dist/compat/publication-hash.js';
import {PageChangeStore} from '../dist/compat/page-change-store.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {protectPublishedLiveSource} from '../dist/compat/published-live-access.js';

const control=sqliteRunner(':memory:');await migrateUp(control);
const url='file:'+join(mkdtempSync(join(tmpdir(),'frontbase-pilot-live-')),'catalog.db').replaceAll('\\','/'),data=sqliteRunner(url);
await data.exec('CREATE TABLE institutions(id INTEGER PRIMARY KEY,title TEXT,originalPath TEXT,country_id INTEGER,private_contract TEXT)');
await data.exec("INSERT INTO institutions VALUES(1,'Campus One','/one/',22,'SECRET'),(2,'Campus Two','/two/',22,'SECRET'),(3,'Excluded','/excluded/',22,'SECRET'),(4,'Foreign','/foreign/',99,'SECRET')");
await data.exec('CREATE VIEW live_institutions AS SELECT id,title,originalPath,country_id FROM institutions');
let tenant='fixture',authenticated=true,role='owner';
const app=await createCompatApp({makeRunner:async()=>control,resolvePrincipal:async()=>({tenant,user:authenticated?{id:'owner',role}:null}),sessionSecret:'synthetic-pilot-live-proof'});
const post=async(path,body)=>{const response=await app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,201,await response.clone().text());return response.json();};
const ds=await post('/api/sync/datasources/',{name:'Synthetic live',type:'sqlite',config:{url}});
const view=await post(`/api/sync/datasources/${ds.id}/views/`,{name:'Admitted institutions',target_table:'live_institutions',filters:[{field:'country_id',operator:'eq',value:22},{field:'id',operator:'in',value:[1,2]}]});
const configuration=emptyDirectoryConfiguration();configuration.site={name:'Fixture',destination:'USA',origin:'https://study-in-usa.com',locale:'en'};configuration.datasourceId=ds.id;
for(const role of ['institution','program','city']){const mapping=configuration.collections[role];mapping.table=role+'s';mapping.scope={field:'country_id',value:22};Object.assign(mapping.fields,{id:'id',title:'title'});if(role!=='city')Object.assign(mapping.fields,{originalPath:'originalPath',body:'body'});}
configuration.collections.institution.fields.cityId='city_id';configuration.collections.program.fields.institutionId='institution_id';
Object.assign(configuration.collections.article,{table:'editorial_documents',scope:{field:'country_id',value:22}});Object.assign(configuration.collections.article.fields,{id:'id',title:'title',originalPath:'original_path',body:'body_blocks',contentRole:'collection_role',sourceOrigin:'source_origin'});
const views={datasourceId:ds.id,institutions:{id:view.id,name:view.name,target_table:'live_institutions',columns:['id','title','originalPath','country_id']},programs:{id:'programs',name:'Programs',target_table:'live_programs',columns:['id','title','originalPath']},articles:{id:'articles',name:'Articles',target_table:'live_articles',columns:['id','title','originalPath']}};
const legacy={root:{siteConfiguration:{version:1,role:'directory'}},content:[{id:'list',type:'Repeater',props:{binding:{componentId:'list',dataSourceId:'frontbase:publication',tableName:'institutions',source:{kind:'publication',hash:'a'.repeat(64)},pagination:{enabled:true,pageSize:1,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}},controls:{count:true,search:true,searchColumn:'title'}},children:[{id:'title',type:'Heading',props:{text:'{{ record.title }}'}},{id:'link',type:'Link',props:{text:'Open',href:'{{ record.originalPath }}'}}],versions:[{id:'programs',name:'Programs',when:'url.type == "program"',overrides:{props:{binding:{componentId:'list',dataSourceId:'frontbase:publication',tableName:'programs',source:{kind:'publication',hash:'a'.repeat(64)},pagination:{enabled:true,pageSize:1,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}}}}}]}]};
const layout=convertPilotLiveLists(legacy,views);assert.equal(legacy.content[0].props.binding.source.kind,'publication');assert.equal(liveViewBindings(layout).length,2);assert.equal(applyBlockVersion(layout.content[0],'programs').props.binding.viewId,'programs');
assert.deepEqual(layout.content[0].children,legacy.content[0].children);
const teaser=convertPilotLiveLists({root:{directoryLanding:{version:1}},content:[{id:'teaser',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.program.list',params:{limit:6}},directoryControls:{version:1,search:true,pagination:true}},children:[]}]},views);
assert.equal(teaser.content[0].props.binding.pagination.enabled,false);assert.equal(teaser.content[0].props.controls.search,false);assert.equal(teaser.content[0].props.binding.pagination.pageSize,6);
const bad=structuredClone(layout);bad.content[0].props.binding.dataRequest={headers:{Authorization:'SECRET'}};assert.equal(publicationTemplateSchema.safeParse({pageId:'00000000-0000-4000-8000-000000000001',role:'directory',title:'Test',description:'',layout:bad}).success,false);
const plan=await pilotLiveViewPlan({configuration,index:[{collection:'institutions',id:1,originalPath:'/one/',parentId:1},{collection:'programs',id:2,originalPath:'/program/',parentId:1},{collection:'articles',id:'article',revision:7,originalPath:'/article/'}]},'fixture','a'.repeat(64));
for(const item of plan){assert(item.sql.includes('security_invoker=true'));assert(item.sql.includes('REVOKE ALL'));assert(!item.sql.includes('CREATE TABLE'));assert(!item.sql.includes('private_contract'));assert(!/\bWHERE\b|JOIN \(VALUES/.test(item.sql));assert(savedViewFilters(item.filters).length>1);}
assert(JSON.stringify(plan[2].filters).includes('revision'));assert(JSON.stringify(plan[0].filters).includes('cityId'));
// Static-page fixture isolates live SSR/hydration transport from legacy catalog queries.
const staticLayout={...layout,root:{}};staticLayout.content[0].versions=undefined;
const manifests=new SitePublicationManifestStore(control,'fixture'),hash=await manifests.prepare({configurationRevision:1,configuration,templates:[],staticPages:[{pageId:'00000000-0000-4000-8000-000000000001',title:'Live fixture',description:'',originalPath:'/',layout:staticLayout}]},{institutions:[],programs:[],cities:[],articles:[]},'2026-10-15T00:00:00Z');
const reviews=new SitePublicationReviewStore(control,'fixture');await reviews.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Synthetic live fixture'},'owner','2026-10-15T00:00:00Z');await reviews.activate(hash,null,'2026-10-15T00:00:00Z');
const liveQuery=publishedLiveQuery(request=>app.fetch(request));
await protectPublishedLiveSource(control,'fixture',ds.id,'2026-10-15T00:00:00Z');
authenticated=false;
await resolvePublicationVersionPage(await manifests.get(hash),hash,'fixture',control,new Request('https://fixture.invalid/'),null,liveQuery);
const render=async(path='/')=>{const response=await renderReviewedSitePublication(control,'fixture',new Request('https://fixture.invalid'+path),{liveQuery});assert.equal(response.status,200);return response.text();};
let html=await render();assert(html.includes('Campus One'));assert(!html.includes('Excluded'));assert(!html.includes('SECRET'));
await data.exec("UPDATE institutions SET title='AAA Live change' WHERE id=2");html=await render();assert(html.includes('AAA Live change'));
let projected=await projectPublicationListRows(staticLayout,control,'fixture',new Request('https://fixture.invalid/?page=2'),null,liveQuery);assert.deepEqual(projected.content[0].props.initialRows.map(row=>row.title),['Campus One']);
projected=await projectPublicationListRows(staticLayout,control,'fixture',new Request('https://fixture.invalid/?q=missing'),null,liveQuery);assert.equal(projected.content[0].props.initialTotal,0);assert.deepEqual(projected.content[0].props.initialRows,[]);
const requestBody={dataRequest:{fetchStrategy:'proxy',datasourceId:ds.id,viewId:view.id,body:{table_name:'live_institutions',columns:'*',joins:[],page:1,page_size:10,filters:[],sort_col:'title',sort_dir:'asc'}}};
const result=await (await app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requestBody)})).json();assert.equal(result.total,2);assert(!JSON.stringify(result).includes('SECRET'));
for(const bypass of [
 {...requestBody.dataRequest,viewId:undefined,body:{...requestBody.dataRequest.body,table_name:'institutions'}},
 {...requestBody.dataRequest,body:{...requestBody.dataRequest.body,table_name:'institutions'}},
 {...requestBody.dataRequest,body:{...requestBody.dataRequest.body,query:'SELECT * FROM institutions'}},
 {...requestBody.dataRequest,body:{...requestBody.dataRequest.body,joins:[{type:'left',table:'institutions',on:'id=id'}]}},
 {...requestBody.dataRequest,viewId:'unpublished-view'},
])assert.equal((await app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataRequest:bypass})})).status,403);
for(const [method,path]of [['GET','/api/data/institutions/1'],['POST','/api/data/institutions'],['PATCH','/api/data/institutions/1']])assert.equal((await app.request(path,{method,...(method==='GET'?{}:{headers:{'content-type':'application/json'},body:JSON.stringify({title:'ATTACK'})})})).status,403);
assert.equal((await data.query('SELECT title FROM institutions WHERE id=1'))[0].title,'Campus One');
tenant='other';const denied=await app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requestBody)});assert.equal(denied.status,403);
tenant='fixture';authenticated=true;
// The real Data entry point must expose the same saved assets used by public lists.
const listed=await (await app.request('/api/sync/datasources/')).json();assert.equal(listed[0].views[0].id,view.id);
const assets=await (await app.request('/api/sync/views/')).json();assert.equal(assets[0].id,view.id);assert(assets[0].usage.some(use=>use.state==='Published'&&use.componentId==='list'));
const patchView=body=>app.request(`/api/sync/views/${view.id}/`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const nested=[{field:'country_id',operator:'eq',value:22},{logic:'or',conditions:[{logic:'and',conditions:[{field:'id',operator:'eq',value:1},{field:'title',operator:'contains',value:'Campus'}]},{field:'id',operator:'in',value:[2]}]}];
let edited=await patchView({filters:nested,default_sort:{column:'title',direction:'desc'},expected_updated_at:view.updated_at});assert.equal(edited.status,200,await edited.clone().text());
assert.equal((await patchView({filters:[],expected_updated_at:'stale'})).status,409);
const currentEdit=await edited.json();const races=await Promise.all([patchView({name:'Concurrent A',expected_updated_at:currentEdit.updated_at}),patchView({name:'Concurrent B',expected_updated_at:currentEdit.updated_at})]);assert.deepEqual(races.map(response=>response.status).sort(),[200,409]);
assert.equal((await patchView({filters:[{field:'id; DROP TABLE institutions',operator:'eq',value:1}]})).status,422);
assert.equal((await patchView({filters:[{field:'private_contract',operator:'eq',value:'SECRET'}]})).status,422);
const preview=await app.request(`/api/sync/views/${view.id}/preview/`,{method:'POST',headers:{'content-type':'application/json'},body:'{"page":1}'});assert.equal(preview.status,200);assert.equal((await preview.json()).total,2);
authenticated=false;
let hiddenAttack=structuredClone(requestBody);hiddenAttack.dataRequest.body.filters=[{column:'id',op:'eq',value:3}];
assert.equal((await (await app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(hiddenAttack)})).json()).total,0);
authenticated=true;
assert.equal((await patchView({filters:[{field:'id',operator:'in',value:[1]}]})).status,200);
authenticated=false;assert.equal((await (await app.request('/api/data/execute',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requestBody)})).json()).total,1);
authenticated=true;assert.equal((await patchView({filters:[{field:'country_id',operator:'eq',value:22},{field:'id',operator:'in',value:[1,2]}],default_sort:null})).status,200);
const large=await executeSingleTableRpc(data,'sqlite',{table_name:'live_institutions',columns:'*',joins:[],page:1,page_size:10,filters:[],sort_col:'title',sort_dir:'asc',search_query:'',search_cols:[]},[{field:'id',operator:'in',value:Array.from({length:1100},(_,i)=>i+1)}]);assert.equal(large.total,4);
await data.exec('CREATE TABLE json_catalog(id INTEGER PRIMARY KEY,meta TEXT)');await data.exec('INSERT INTO json_catalog VALUES(?,?),(?,?)',[1,JSON.stringify({active:true,tags:['USA']}),2,JSON.stringify({active:false})]);
const jsonRows=await executeSingleTableRpc(data,'sqlite',{table_name:'json_catalog',columns:'*',joins:[],page:1,page_size:10,filters:[],sort_col:'id',sort_dir:'asc',search_query:'',search_cols:[]},[{field:'meta',operator:'eq',value:{active:true,tags:['USA']}}]);assert.equal(jsonRows.total,1);assert.equal(jsonRows.rows[0].id,1);
assert.throws(()=>savedViewFilters([{field:'meta',operator:'eq',value:JSON.parse('{"__proto__":{"admin":true}}')}]));
assert.throws(()=>savedViewFilters([{logic:'or',conditions:[]}]));assert.throws(()=>savedViewFilters([{field:'id',operator:'execute',value:'DROP'}]));
tenant='other';assert.equal((await app.request('/api/sync/views/')).status,200);assert.deepEqual(await (await app.request('/api/sync/views/')).json(),[]);assert.equal((await app.request(`/api/sync/views/${view.id}/`)).status,404);tenant='fixture';
console.log('saved views: discovery, published usage, nested/typed/large filters, live edits, preview, ordering, stale edit and owner/private/injection refusals PASS');
// Trust-boundary fixture: seed a server-owned plan, not caller-supplied layouts or SQL.
const now='2026-10-15T00:00:00Z',pages=new PagesStore(control,tenant),changes=new PageChangeStore(control,tenant),pageId='00000000-0000-4000-8000-000000000001';
const draftLayout=structuredClone(staticLayout);draftLayout.content.push({id:'pending-design',type:'Heading',props:{text:'OWNER PENDING DESIGN'}});
await pages.create({name:'Home',slug:'home',layout_data:draftLayout},pageId,now);
const source=await manifests.get(hash),candidateHash=await manifests.prepareLayouts(hash,{templates:[],staticPages:source.staticPages.map(page=>({...page,title:'Live candidate'}))},now);
const planKey=async extra=>{
 const plan={baseHash:hash,hash:candidateHash,views,drafts:[{id:pageId,stateHash:(await changes.state(pageId)).hash,layout:draftLayout}],...extra},planHash=await publicationHash(plan);
 await control.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_slug,key) DO UPDATE SET value=excluded.value',[tenant,`live_list_migration:v1:${planHash}`,JSON.stringify(plan),now]);return {plan,planHash};
};
const publish=planHash=>app.request('/api/project/live-list-migration/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'publish',baseHash:hash,planHash})});
let stored=await planKey({});
role='viewer';assert.equal((await publish(stored.planHash)).status,403);role='owner';
assert.equal((await app.request('/api/project/live-list-migration/',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(4097)})).status,413);
await control.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[JSON.stringify({...stored.plan,note:'tampered'}),tenant,`live_list_migration:v1:${stored.planHash}`]);assert.equal((await publish(stored.planHash)).status,409);
stored=await planKey({});await pages.update(pageId,{title:'Concurrent owner edit'},now);assert.equal((await publish(stored.planHash)).status,409);
stored=await planKey({});const accepted=await publish(stored.planHash);assert.equal(accepted.status,200,await accepted.clone().text());
assert((await pages.get(pageId)).layout_data.includes('OWNER PENDING DESIGN'));
assert(!(await render()).includes('OWNER PENDING DESIGN'));assert.equal((await publish(stored.planHash)).status,409);
const stale=await planKey({drafts:[]});assert.equal((await publish(stale.planHash)).status,409);
console.log('pilot-live-lists: PASS (ordinary source/version conversion, bounded publication, guarded SQL projection, live SSR/query parity, exact count, source update, paging/search and owner/private-field refusal)');
console.log('pilot live migration: PASS (admin/size gates, exact server plan, draft CAS, stale-base refusal, published/draft design separation)');
