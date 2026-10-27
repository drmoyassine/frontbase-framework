import {templateRoute,validateTemplateRoutes} from '../dist/compat/template-route.js';
import {publicationRecordContext} from '../dist/compat/publication-record-context.js';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { migrateUp } from '../dist/db/migrations.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';
import { SitePublicationManifestStore } from '../dist/compat/site-publication-manifest.js';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { pagesWorkspace } from '../dist/compat/pages-workspace.js';
import { registerPagesWorkspaceRoutes } from '../dist/compat/routes/pages-workspace.js';
import {templateUrlSettings,saveTemplateUrlSettings} from '../dist/compat/template-policy.js';
import {emptyTemplatePolicy} from '@frontbase/edge-core/template-policy';
import {templateListingIds} from '../dist/compat/template-listing.js';
import {resolveChunkPublicationPage} from '../dist/compat/site-publication-chunk-runtime.js';

const db = sqliteRunner(':memory:'); await migrateUp(db);
const now = '2026-10-12T18:00:00Z', owner = 'workspace-owner', pages = new PagesStore(db, owner);
const cfg = emptyDirectoryConfiguration(); cfg.site = {name:'Public site',destination:'USA',origin:'https://public.test',locale:'en'}; cfg.datasourceId='owned-source';
for (const role of ['institution','program','city']) { const m=cfg.collections[role];m.table=role;m.fields.id='id';m.fields.title='title';m.scope={field:'country',value:22};if(role!=='city')m.fields.originalPath='path'; }
cfg.collections.institution.fields.cityId='city_id';cfg.collections.program.fields.institutionId='institution_id';
const draft=await new SiteConfigurationStore(db,owner).save(cfg,0,now);assert.ok(draft);
const templates=[];
for (const role of ['directory','institution','program']) {
 const id=crypto.randomUUID(), queries=role==='directory'?['directory.institution.list','directory.program.list']:[`directory.${role}.detail`];
 const layout={root:{siteConfiguration:{version:1,role}},content:queries.map((q,i)=>({id:'q'+i,type:q.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId:q,params:q.endsWith('.list')?{}:{path:'/college/'}}},children:[]}))};
 await pages.create({name:role,slug:'draft-'+role,title:role,layout_data:layout},id,now);templates.push({pageId:id,role,title:role,description:'',layout});
}
const homeId=crypto.randomUUID(), home={root:{},content:[]};await pages.create({name:'Homepage',slug:'home',title:'Homepage',layout_data:home},homeId,now);await pages.update(homeId,{isHomepage:true},now);
const tempId=crypto.randomUUID();await pages.create({name:'Editorial migration review · Temporary',slug:'temporary'},tempId,now);
const foreignId=crypto.randomUUID();await new PagesStore(db,'foreign').create({name:'PRIVATE_FOREIGN',slug:'private'},foreignId,now);
const base={summary:'',cover:null,coverAlt:'',logo:null},records={cities:[{id:1,title:'City'}],institutions:[{...base,id:1,title:'College',cityId:1,originalPath:'/college/'}],programs:[{...base,id:2,title:'Program',institutionId:1,originalPath:'/college/program/'}],articles:[],pages:[]};
const hash=await new SitePublicationManifestStore(db,owner).prepare({configurationRevision:1,configuration:cfg,templates,staticPages:[{pageId:homeId,originalPath:'/',title:'Homepage',description:'',layout:home}]},records,now);
await new SitePublicationStore(db,owner).activate(hash,null,now);

const pageId=templates[2].pageId, original=await pages.get(pageId), settings=await templateUrlSettings(db,owner,pageId);
assert.equal(settings.records.length,1);assert.equal(settings.records[0].identity,'programs:2');
const policy=emptyTemplatePolicy();policy.defaults.values={title:'{{ record.title }} · Site'};
policy.overrides['programs:2']={values:{notice:'Contact us',listed:false},locales:{ar:{title:'برنامج عربي'}}};
const saved=await saveTemplateUrlSettings(db,owner,pageId,settings.revision,policy,now);assert.ok(saved);
assert.notEqual(saved.revision,settings.revision);assert.deepEqual(JSON.parse((await pages.get(pageId)).layout_data).content,JSON.parse(original.layout_data).content);
assert.equal(await saveTemplateUrlSettings(db,owner,pageId,settings.revision,policy,now),null);
await assert.rejects(()=>templateUrlSettings(db,'foreign',pageId));
await assert.rejects(()=>saveTemplateUrlSettings(db,owner,pageId,saved.revision,{...policy,overrides:{'programs:private':{values:{title:'forged'}}}},now));
assert.equal((await new SitePublicationStore(db,owner).activeVersion()).pointer.hash,hash);
const captured=await new SitePublicationStore(db,owner).getVersion(hash);captured.templates.find(row=>row.pageId===pageId).layout.root.templatePolicy=policy;
assert.deepEqual(await templateListingIds(db,owner,captured,'programs'),[]);
const rendered=await resolveChunkPublicationPage(captured,hash,owner,db,new Request('https://public.test/college/program/'),null,undefined,undefined,'ar');
assert.equal(rendered.page.title,'برنامج عربي');assert.equal(rendered.page.layout.root.publicationRecordContext.settings.notice,'Contact us');
const app=new Hono();app.use('*',async(c,next)=>{c.set('tenant',owner);c.set('principal',{user:{role:c.req.header('x-test-role')??'owner'}});await next();});registerPagesWorkspaceRoutes(app,db);
const path='/api/project/template-urls/'+pageId+'/';
assert.equal((await app.request(path,{headers:{'x-test-role':'user'}})).status,403);
assert.equal((await app.request(path,{method:'PUT',headers:{'x-test-role':'user'},body:'{}'})).status,403);
assert.equal((await app.request(path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({revision:settings.revision,policy})})).status,409);
assert.equal((await app.request(path,{method:'PUT',body:'x'.repeat(180001)})).status,413);
assert.equal((await app.request(path,{method:'PUT',body:'{'})).status,422);
assert.equal((await app.request('/api/project/template-urls/'+foreignId+'/')).status,404);
console.log('template URLs: tenant/admin guards, CAS, settings preservation, staged publication, hidden listing with preserved detail, Arabic SSR PASS');

const retained={index:[{collection:'pages',id:'notice',originalPath:'/old-program/',title:'Old program'}],templates:[{role:'program',pageId:'program-template',layout:{root:{templatePolicy:{...emptyTemplatePolicy(),attachedRoutes:[{source:'pages:notice',recordId:99,parentId:10}]}}}}]};
validateTemplateRoutes(retained);assert.equal(templateRoute(retained,'/old-program/').role,'program');
assert.deepEqual(publicationRecordContext(retained,'/old-program/'),{recordId:99,parentId:10,collection:'programs',attached:true,path:'/old-program/',settings:{}});
assert.throws(()=>validateTemplateRoutes({...retained,templates:[...retained.templates,...retained.templates]}));
assert.throws(()=>validateTemplateRoutes({...retained,index:[]}));
console.log('retained routes: exact source identity, reusable program template, trusted real record context and duplicate/orphan denial PASS');

assert.throws(()=>templateRoute({...retained,templates:[...retained.templates,...retained.templates]},'/old-program/'));

const freshSettings=await templateUrlSettings(db,owner,pageId);
const previewBody={revision:freshSettings.revision,policy:freshSettings.policy,identity:'programs:2',locale:'ar'};
let preview=await app.request(path+'preview/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(previewBody)});
assert.equal(preview.status,200);assert.equal((await preview.json()).title,'برنامج عربي');
assert.equal((await app.request(path+'preview/',{method:'POST',headers:{'x-test-role':'user'},body:'{}'})).status,403);
assert.equal((await app.request(path+'preview/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...previewBody,identity:'programs:foreign'})})).status,422);
assert.equal((await new SitePublicationStore(db,owner).activeVersion()).pointer.hash,hash);
console.log('SEO preview: actual renderer, Arabic metadata, unknown-record/admin refusal and no publication side effects PASS');

// Actual query execution must preserve selections beyond the old 100-ID leaf limit.
const {executeSingleTableRpc}=await import('../dist/compat/single-table-rpc.js');
await db.exec('CREATE TABLE membership_fixture (id INTEGER PRIMARY KEY, title TEXT)');
for(let id=1;id<=220;id++)await db.exec('INSERT INTO membership_fixture VALUES (?,?)',[id,'Record '+id]);
const selection=Array.from({length:185},(_,i)=>i+1);
const input={table_name:'membership_fixture',columns:'*',joins:[],page:1,page_size:10,filters:[{column:'id',op:'in',value:selection},{column:'id',op:'gt',value:100}],sort_col:'id',sort_dir:'asc'};
const selected=await executeSingleTableRpc(db,'sqlite',input,[{field:'id',operator:'lt',value:180}]);
assert.equal(selected.total,79);assert.deepEqual(selected.rows.map(row=>row.id),Array.from({length:10},(_,i)=>101+i));
await assert.rejects(()=>executeSingleTableRpc(db,'sqlite',{...input,filters:[{column:'id',op:'in',value:Array(1001).fill(1)}]}),/invalid_in_filter/);
await assert.rejects(()=>executeSingleTableRpc(db,'sqlite',{...input,filters:[{column:'not_a_column',op:'in',value:selection}]}));
console.log('template membership: 185 IDs, intersected view scope, pagination/counts, bounded invalid selection PASS');

const {templatePolicyPresentation,localizedPolicyRecord}=await import('../dist/compat/template-policy-runtime.js');
const articleLayout={root:{templatePolicy:{...emptyTemplatePolicy(),defaults:{values:{title:'{{ record.title }} · Site'}}}},content:[{id:'article-heading',type:'Heading',props:{text:'عنوان المقال',translationRecord:{connectionId:'frontbase:publication',collection:'articles',key:[{column:'id',value:'article-1'}]},translationSources:{text:'title'}}}]};
const articleRecord={id:'article-1',title:'Raw article',summary:'Raw summary'},articleRoute={collection:'articles',recordId:'article-1'};
const firstSeo=templatePolicyPresentation(articleLayout,articleRecord,'articles:article-1','en',articleRoute);assert.equal(firstSeo.values.title,'Raw article · Site');
const localizedSeo=templatePolicyPresentation(articleLayout,localizedPolicyRecord(articleLayout,firstSeo.record,articleRoute),'articles:article-1','ar',articleRoute);assert.equal(localizedSeo.values.title,'عنوان المقال · Site');
console.log('article SEO: raw semantic identity, localized visible title, single suffix across locale reprojection PASS');
