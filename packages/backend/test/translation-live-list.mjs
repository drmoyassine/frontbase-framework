import assert from 'node:assert/strict';
import {allowanceFixture,now} from './translation-allowance-fixture.mjs';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {createCompatApp} from '../dist/compat/app.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {publishedLiveQuery} from '../dist/compat/published-live-query.js';
import {protectPublishedLiveSource} from '../dist/compat/published-live-access.js';
import {migrateUp} from '../dist/db/migrations.js';
const f=await allowanceFixture(),tenant='alpha';
// The live store is a real sqlite file the data-execute proxy opens independently of the app DB
// (pilot-live-lists pattern): source edits below must be visible to the next public serve.
const url='file:'+join(mkdtempSync(join(tmpdir(),'frontbase-live-i18n-')),'campuses.db').replaceAll('\\','/'),ext=sqliteRunner(url);
await ext.exec('CREATE TABLE institutions(id INTEGER PRIMARY KEY,title TEXT,summary TEXT,country_id INTEGER)');
await ext.exec("INSERT INTO institutions VALUES(1,'Campus One','Summary one',22),(2,'Campus Two','Summary two',22)");
await ext.exec('CREATE VIEW live_institutions AS SELECT id,title,summary,country_id FROM institutions');
let auth=true,role='owner',owner=tenant;
const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,resolvePrincipal:async()=>({user:auth?{id:'editor',role}:null,tenant:owner})});
const post=async(path,body,status=201)=>{const r=await app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status,await r.clone().text());return r.json();};
const ds=await post('/api/sync/datasources/',{name:'Campuses live',type:'sqlite',config:{url}});
const view=await post(`/api/sync/datasources/${ds.id}/views/`,{name:'Admitted campuses',target_table:'live_institutions',filters:[{field:'country_id',operator:'eq',value:22}]});
const config=emptyDirectoryConfiguration();config.site={name:'Campus site',destination:'USA',origin:'https://campus.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role+'s';m.scope={field:'country_id',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='originalPath';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const binding={componentId:'team-list',dataSourceId:String(ds.id),tableName:'live_institutions',viewId:String(view.id),viewName:'Admitted campuses',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}};
const listNode=(id,controls={})=>({id,type:'Repeater',props:{binding:structuredClone(binding),...controls},children:[{id:id+'-title',type:'Heading',props:{text:'{{ record.title }}'}},{id:id+'-summary',type:'Paragraph',props:{content:'{{ record.summary }}'}}]});
const teamLayout={root:{},content:[{id:'head',type:'Heading',props:{text:'Our campuses'}},listNode('team-list')]};
const interactiveLayout={root:{},content:[{id:'head2',type:'Heading',props:{text:'Interactive campuses'}},listNode('interactive-list',{controls:{count:true}})]};
const manifests=new SitePublicationManifestStore(f.db,tenant);
const hash=await manifests.prepare({configurationRevision:1,configuration:config,templates:[],staticPages:[
 {pageId:'00000000-0000-4000-8000-00000000a002',title:'Home',description:'',originalPath:'/',layout:{root:{},content:[{id:'home-head',type:'Heading',props:{text:'Welcome'}}]}},
 {pageId:'00000000-0000-4000-8000-00000000a000',title:'Campuses',description:'Campus directory',originalPath:'/team/',layout:teamLayout},
 {pageId:'00000000-0000-4000-8000-00000000a001',title:'Interactive',description:'',originalPath:'/interactive/',layout:interactiveLayout}]},{cities:[],institutions:[],programs:[],articles:[]},now);
const reviews=new SitePublicationReviewStore(f.db,tenant);
await reviews.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Live-list fixture reviewed'},'reviewer',now);
await reviews.activate(hash,null,now);
await protectPublishedLiveSource(f.db,tenant,ds.id,now);
const liveQuery=publishedLiveQuery(request=>app.fetch(request));
const root='/api/project/translation-batches/homepage/';
async function call(path,body,status=200){const r=await app.request('https://campus.test'+root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|frontbase-live-i18n/);return value;}
const html=async path=>{const r=await renderReviewedSitePublication(f.db,tenant,new Request('https://campus.test'+path),{liveQuery});return {status:r?.status,headers:r?.headers,text:await r?.text()};};
try{
 // English serve resolves rows live through the saved view, anonymously (published-views-only).
 let page=await html('/team/');assert.equal(page.status,200);assert.ok(page.text.includes('Campus One'));assert.ok(!page.text.includes('عربي'));
 // Review the page: rendered live rows surface as record units beside the page copy.
 let review=await call('review/?locale=ar&path=/team/');assert.equal(review.complete,false);
 const recordFields=review.fields.filter(field=>['Campus One','Summary one','Campus Two','Summary two'].includes(field.source));
 assert.equal(recordFields.length,4,'each rendered row field is one record unit');
 assert.ok(review.fields.some(field=>field.source==='Our campuses'));
 // A strict release cannot serve a live-bound page honestly: refuse with the precise code.
 const strict=await app.request('https://campus.test'+root+'prepare/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'ar',token:review.token,approveTranslations:true,path:'/team/',policy:{missing:'block',outdated:'block'}})});
 assert.equal(strict.status,409);assert.equal((await strict.json()).code,'live_release_per_unit_required');
 // Save Arabic for the record units only; chrome stays missing and per-unit fallback covers it.
 await call('save/',{locale:'ar',token:review.token,path:'/team/',entries:recordFields.map(field=>({id:field.id,token:field.token,text:'عربي '+field.source}))});
 review=await call('review/?locale=ar&path=/team/');
 const prepared=await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true,path:'/team/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
 await call('publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:true});
 const arabic=await html('/ar/team/');assert.equal(arabic.status,200);assert.equal(arabic.headers.get('Content-Language'),'ar');
 assert.ok(arabic.text.includes('عربي Campus One'));assert.ok(arabic.text.includes('عربي Summary two'));
 assert.ok(arabic.text.includes('Our campuses'),'untranslated chrome stays source under per-unit fallback');
 // THE DEMO PIN: a source-record change reflects on the very next serve — the changed field
 // drops its stale Arabic (fresh source wins) while untouched fields keep theirs. No 503.
 await ext.exec("UPDATE institutions SET title='Renamed Campus' WHERE id=1");
 const after=await html('/ar/team/');assert.equal(after.status,200,'a live source change must not brick the localized page');
 assert.ok(after.text.includes('Renamed Campus'));assert.ok(!after.text.includes('عربي Renamed'));assert.ok(!after.text.includes('عربي Campus One'));
 assert.ok(after.text.includes('عربي Summary one'),'untouched fields keep their released Arabic');
 // Live membership: a new source row joins with fresh source text (no unit exists yet).
 await ext.exec("INSERT INTO institutions VALUES(3,'Campus Three','Summary three',22)");
 const grown=await html('/ar/team/');assert.equal(grown.status,200);assert.ok(grown.text.includes('Campus Three'));assert.ok(grown.text.includes('Summary three'));
 // English page unaffected throughout.
 const english=await html('/team/');assert.ok(english.text.includes('Renamed Campus'));assert.ok(!english.text.includes('عربي'));
 // Interactive live lists refuse translation with the precise code at review time.
 const interactive=await call('review/?locale=ar&path=/interactive/',undefined,422);
 assert.equal(interactive.code,'localized_interactive_list_not_supported');
 console.log('translation-live-list: live-bound page localization (per-unit release fence, fresh-join source reaction, membership growth, interactive refusal) PASS');
}finally{}
