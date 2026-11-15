import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {migrateUp} from '../dist/db/migrations.js';
import {createCompatApp} from '../dist/compat/app.js';
import {LiveLayoutPublicationStore} from '../dist/compat/live-layout-publication.js';
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
 const liveStore=new LiveLayoutPublicationStore(db,owner);await liveStore.publish(prepared.hash,null,now);
 for(const path of ['site-configuration/publication/prepare/','site-configuration/publication/activate/','translation-batches/homepage/prepare/','translation-batches/homepage/publish/']){
  const retired=await app.request('/api/project/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(retired.status,410);assert.equal((await retired.json()).code,'snapshot_publication_retired');
 }
 const workspace=await app.request('/api/project/translation-batches/homepage/workspace/');assert.equal((await workspace.json()).mode,'live');
 const history=await app.request('/api/project/site-configuration/publication/read/',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(history.status,422,'historical read keeps its existing validation instead of being retired');
 console.log('live layout routes: admin/tenant boundary, bounded requests, no implicit publish, strict contract and element diagnostics PASS');
}finally{await db.close?.();}
