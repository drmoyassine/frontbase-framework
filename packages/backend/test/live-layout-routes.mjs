import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {migrateUp} from '../dist/db/migrations.js';
import {createCompatApp} from '../dist/compat/app.js';
import {LiveLayoutPublicationStore} from '../dist/compat/live-layout-publication.js';
import {savedViewUsage} from '../dist/compat/view-usage.js';
import {protectPublishedLiveSource,publishedLiveReadAllowed} from '../dist/compat/published-live-access.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SiteConfigurationStore} from '../dist/compat/site-configuration-store.js';
const db=sqliteRunner(':memory:');await migrateUp(db);
const now='2026-11-15T00:00:00Z',owner='alpha';let tenant=owner,role='owner',authed=true;
const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authed?{id:'admin',role}:null,tenant}),sessionSecret:'isolated-layout-test',now:()=>now});
const pages=new PagesStore(db,owner);
const page=await pages.create({name:'Home',slug:'home',layout_data:{root:{},content:[{id:'title',type:'Heading',props:{text:'Layout only'}}]}},crypto.randomUUID(),now);
await pages.update(page.id,{isHomepage:true},now);await pages.publish(page.id,'local',now);
const config=emptyDirectoryConfiguration();config.site={name:'Test',origin:'https://example.com',locale:'en'};config.datasourceId='source';
await new SiteConfigurationStore(db,owner).save(config,0,now);
const input={pageIds:[page.id],locales:['en'],expectedConfigurationRevision:1};
const post=(action,body)=>app.request('/api/project/live-layout/'+action+'/',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost'},body:JSON.stringify(body)});
try{
 for(const denied of ['member','viewer','editor']){role=denied;assert.equal((await post('prepare',input)).status,403);}role='owner';
 authed=false;assert.equal((await post('prepare',input)).status,401);authed=true;
 tenant='other';assert.equal((await post('prepare',input)).status,409);tenant=owner;
 assert.equal((await post('prepare',{...input,expectedConfigurationRevision:2})).status,409);
 assert.equal((await post('prepare',{...input,pageIds:[page.id,page.id]})).status,422);
 assert.equal((await post('prepare',{...input,records:[{title:'Frozen'}]})).status,422);
 assert.equal((await post('prepare',{...input,extra:'x'.repeat(66000)})).status,413);
 const response=await post('prepare',input);assert.equal(response.status,200,await response.clone().text());const prepared=await response.json();
 const active=await app.request('/api/project/live-layout/');assert.equal((await active.json()).pointer,null,'prepare never publishes');
 tenant='other';assert.equal((await post('publish',{hash:prepared.hash,expected:null})).status,404);tenant=owner;
 assert.equal((await app.request('/api/project/live-layout/render/?hash='+prepared.hash+'&path='+encodeURIComponent('//evil.example'))).status,422);
 // Missing live views are diagnosed against the tenant-owned resource APIs.
 const layout={root:{},content:[{id:'list',type:'Repeater',props:{binding:{componentId:'list',dataSourceId:'source',viewId:'missing',tableName:'rows',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}}}}]};
 await pages.update(page.id,{layoutData:layout},now);
 const invalid=await post('prepare',input);assert.equal(invalid.status,422);const issue=await invalid.json();assert.equal(issue.code,'publication_elements_incomplete');assert.equal(issue.elementIssues[0].elementId,'list');
 layout.content[0].props.binding.dataSourceId='';
 layout.content[0].props.binding.viewId='';
 await pages.update(page.id,{layoutData:layout},now);
 const unbound=await post('prepare',input);
 assert.equal(unbound.status,422);
 assert.equal((await unbound.json()).elementIssues[0].code,'binding_invalid');
 const liveStore=new LiveLayoutPublicationStore(db,owner);await liveStore.publish(prepared.hash,null,now);
 for(const path of ['site-configuration/publication/prepare/','site-configuration/publication/activate/','translation-batches/homepage/prepare/','translation-batches/homepage/publish/']){
  const retired=await app.request('/api/project/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(retired.status,410);assert.equal((await retired.json()).code,'snapshot_publication_retired');
 }
 const workspace=await app.request('/api/project/translation-batches/homepage/workspace/');assert.equal((await workspace.json()).mode,'live');
 const history=await app.request('/api/project/site-configuration/publication/read/',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(history.status,422,'historical read keeps its existing validation instead of being retired');
 const binding={componentId:'explore',dataSourceId:'source',viewId:'institutions',tableName:'rows',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:false},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}};
 const explore={root:{siteConfiguration:{version:1,role:'directory'}},content:[{id:'explore',type:'Repeater',props:{binding},versions:[{id:'programs',name:'Programs',when:'url.type == "program"',overrides:{props:{binding:{...binding,viewId:'programs'}}}}]}]};
 const blog={root:{siteConfiguration:{version:1,role:'article-index'}},content:[{id:'articles',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.article.list',params:{}}}}]};
 const detail=(role)=>({root:{siteConfiguration:{version:1,role}},content:[]});
 const entries=[['directory','Explore',explore],['article-index','Blog',blog],['institution','Institution detail',detail('institution')],['program','Program detail',detail('program')],['article','Blog article',detail('article')]];
 const templates=await Promise.all(entries.map(async ([role,title,layout])=>{
    const saved=await pages.create({name:title,slug:role,layout_data:layout},crypto.randomUUID(),now);
    return {role,title,layout,pageId:saved.id,description:''};
 }));
 const usageConfig={...config,detailViews:{institution:'institutions',program:'programs',article:'articles'},directoryViewProjection:{logoReplacements:[]}};
 await new SiteConfigurationStore(db,owner).save(usageConfig,1,now);
 const activeVersion=await liveStore.active();
 const usageHash=await liveStore.prepare({schemaVersion:3,runtimeVersion:'live-layout-v1',configuration:usageConfig,templates,staticPages:[],locales:['en']},now);
 await liveStore.publish(usageHash,activeVersion.pointer,now);
 const usage=await savedViewUsage(db,owner);
 assert.deepEqual(usage.institutions.map(({name,version,state})=>[name,version,state]),[
    ['Explore','Default','Published'],['Institution detail','Detail source','Published'],['Program detail','Institution relationship','Published'],
 ]);
 assert.deepEqual(usage.programs.map(({name,version,state})=>[name,version,state]),[
    ['Explore','Programs','Published'],['Program detail','Detail source','Published'],
 ]);
 assert.deepEqual(usage.articles.map(({name,version,state})=>[name,version,state]),[
    ['Blog','Record list','Published'],['Blog article','Detail source','Published'],
 ]);
 assert.deepEqual(Object.keys(await savedViewUsage(db,'foreign')),[]);
 await protectPublishedLiveSource(db,owner,'source',now);
 assert.equal(await publishedLiveReadAllowed(db,owner,'source','institutions',{table_name:'rows',columns:'*',joins:[]}),false);
 console.log('live layout routes: admin/tenant boundary, bounded requests, no implicit publish, strict contract and element diagnostics PASS');
}finally{await db.close?.();}
