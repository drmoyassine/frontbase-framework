import {JSDOM} from 'jsdom';
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
await ext.exec("INSERT INTO institutions VALUES(1,'Campus One','Summary one',22),(2,'Campus Two','Summary two',22),(3,'Campus Three','Summary three',22)");
await ext.exec('CREATE VIEW live_institutions AS SELECT id,title,summary,country_id FROM institutions');
// A second, oversized source proves the localized scan refuses honestly beyond its bound
// instead of silently sorting a window.
await ext.exec('CREATE TABLE institutions_big(id INTEGER PRIMARY KEY,title TEXT,summary TEXT,country_id INTEGER)');
for(let chunk=0;chunk<7;chunk++){const rows=[];for(let i=chunk*167+1;i<=Math.min(1001,(chunk+1)*167);i++)rows.push(`(${i},'Big Campus ${i}','Big summary ${i}',22)`);if(rows.length)await ext.exec('INSERT INTO institutions_big VALUES'+rows.join(','));}
await ext.exec('CREATE VIEW big_view AS SELECT id,title,summary,country_id FROM institutions_big');
let auth=true,role='owner',owner=tenant;
const app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:f.host.externalFetch,resolvePrincipal:async()=>({user:auth?{id:'editor',role}:null,tenant:owner})});
const post=async(path,body,status=201)=>{const r=await app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status,await r.clone().text());return r.json();};
const ds=await post('/api/sync/datasources/',{name:'Campuses live',type:'sqlite',config:{url}});
const view=await post(`/api/sync/datasources/${ds.id}/views/`,{name:'Admitted campuses',target_table:'live_institutions',filters:[{field:'country_id',operator:'eq',value:22}]});
const big=await post('/api/sync/datasources/',{name:'Big live',type:'sqlite',config:{url}});
const bigView=await post(`/api/sync/datasources/${big.id}/views/`,{name:'Big campuses',target_table:'institutions_big',filters:[]});
const config=emptyDirectoryConfiguration();config.site={name:'Campus site',destination:'USA',origin:'https://campus.test',locale:'en'};config.datasourceId='content';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table=role+'s';m.scope={field:'country_id',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='originalPath';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const binding={componentId:'team-list',dataSourceId:String(ds.id),tableName:'live_institutions',viewId:String(view.id),viewName:'Admitted campuses',pagination:{enabled:true,pageSize:12,page:0},sorting:{enabled:true,column:'title',direction:'asc'},filtering:{searchEnabled:false,filters:{}},columnOverrides:{}};
const listNode=(id,controls={})=>({id,type:'Repeater',props:{binding:structuredClone(binding),...controls},children:[{id:id+'-title',type:'Heading',props:{text:'{{ record.title }}'}},{id:id+'-summary',type:'Paragraph',props:{content:'{{ record.summary }}'}}]});
const teamLayout={root:{},content:[{id:'head',type:'Heading',props:{text:'Our campuses'}},listNode('team-list')]};
const interactiveLayout={root:{},content:[{id:'head2',type:'Heading',props:{text:'Interactive campuses'}},listNode('interactive-list',{controls:{count:true}})]};
// A title filter authored as released text: in Arabic only the row whose released title contains
// "a" (Gamma) matches, while the source title filter matches every Campus row.
const mixedLayout={root:{},content:[{id:'mixed-head',type:'Heading',props:{text:'Match list'}},{id:'mixed-list',type:'Repeater',props:{binding:{...structuredClone(binding),hiddenFilters:[{column:'title',operator:'contains',value:'a'}]}},children:[{id:'mixed-title',type:'Heading',props:{text:'{{ record.title }}'}},{id:'mixed-summary',type:'Paragraph',props:{content:'{{ record.summary }}'}}]}]};
const tableLayout={root:{},content:[{id:'table-head',type:'Heading',props:{text:'Table list'}},{id:'table-list',type:'DataTable',props:{binding:structuredClone(binding)},children:[]}]};
const scopedLayout={root:{},content:[{id:'scoped-list',type:'Repeater',props:{binding:{...structuredClone(binding),hiddenFilters:[{column:'id',operator:'gte',value:2}]},controls:{count:true}},children:[{id:'scoped-title',type:'Heading',props:{text:'{{ record.title }}'}}]}]};
const gridLayout={root:{},content:[{id:'grid-list',type:'Grid',props:{binding:{...structuredClone(binding),columnOrder:['title','summary']}},children:[]}]};
const bigLayout={root:{},content:[{id:'big-head',type:'Heading',props:{text:'Big list'}},{id:'big-list',type:'Repeater',props:{binding:{...structuredClone(binding),dataSourceId:String(big.id),tableName:'institutions_big',viewId:String(bigView.id),viewName:'Big campuses'}},children:[{id:'big-title',type:'Heading',props:{text:'{{ record.title }}'}},{id:'big-summary',type:'Paragraph',props:{content:'{{ record.summary }}'}}]}]};
const manifests=new SitePublicationManifestStore(f.db,tenant);
const hash=await manifests.prepare({configurationRevision:1,configuration:config,templates:[],staticPages:[
 {pageId:'00000000-0000-4000-8000-00000000a002',title:'Home',description:'',originalPath:'/',layout:{root:{},content:[{id:'home-head',type:'Heading',props:{text:'Welcome'}}]}},
 {pageId:'00000000-0000-4000-8000-00000000a000',title:'Campuses',description:'Campus directory',originalPath:'/team/',layout:teamLayout},
 {pageId:'00000000-0000-4000-8000-00000000a001',title:'Interactive',description:'',originalPath:'/interactive/',layout:interactiveLayout},
 {pageId:'00000000-0000-4000-8000-00000000a003',title:'Match',description:'',originalPath:'/mixed/',layout:mixedLayout},
 {pageId:'00000000-0000-4000-8000-00000000a004',title:'Table',description:'',originalPath:'/table/',layout:tableLayout},
 {pageId:'00000000-0000-4000-8000-00000000a007',title:'Scoped',description:'',originalPath:'/scoped/',layout:scopedLayout},
 {pageId:'00000000-0000-4000-8000-00000000a006',title:'Grid',description:'',originalPath:'/grid/',layout:gridLayout},
 {pageId:'00000000-0000-4000-8000-00000000a005',title:'Big',description:'',originalPath:'/big/',layout:bigLayout}]},{cities:[],institutions:[],programs:[],articles:[]},now);
const reviews=new SitePublicationReviewStore(f.db,tenant);
await reviews.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Live-list fixture reviewed'},'reviewer',now);
await reviews.activate(hash,null,now);
await protectPublishedLiveSource(f.db,tenant,ds.id,now);
await protectPublishedLiveSource(f.db,tenant,big.id,now);
const liveQuery=publishedLiveQuery(request=>app.fetch(request));
const root='/api/project/translation-batches/homepage/';
async function call(path,body,status=200){const r=await app.request('https://campus.test'+root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.equal(r.status,status,JSON.stringify(value));assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|frontbase-live-i18n/);return value;}
const html=async path=>{const r=await renderReviewedSitePublication(f.db,tenant,new Request('https://campus.test'+path),{liveQuery});return {status:r?.status,headers:r?.headers,text:await r?.text()};};
// Released Arabic renames the three Campus titles so localized order/filter diverge from source.
const arabicText=source=>source==='Campus One'?'زيتون':source==='Campus Two'?'تفاح':source==='Campus Three'?'جمعية Gamma':'عربي '+source;
async function translate(path,saveAll=false){
    let review=await call(`review/?locale=ar&path=${path}`);
    const fields=saveAll?review.fields:review.fields.filter(field=>['Campus One','Summary one','Campus Two','Summary two','Campus Three','Summary three'].includes(field.source));
    const entries=fields.map(field=>({id:field.id,token:field.token,text:arabicText(field.source)}));
    // The save endpoint caps one request at 20 entries; the console batches by 16 too.
    for(let i=0;i<entries.length;i+=16)await call('save/',{locale:'ar',token:review.token,path,entries:entries.slice(i,i+16)});
    review=await call(`review/?locale=ar&path=${path}`);
    const prepared=await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true,path,policy:{missing:'source-fallback',outdated:'source-fallback'}});
    await call('publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:true});
}
try{
    // English serve resolves rows live through the saved view, anonymously (published-views-only).
    let page=await html('/team/');assert.equal(page.status,200);assert.ok(page.text.includes('Campus One'));assert.ok(!page.text.includes('عربي'));
    assert.ok(page.text.indexOf('Campus One')<page.text.indexOf('Campus Three')&&page.text.indexOf('Campus Three')<page.text.indexOf('Campus Two'),'source serve orders by source title');
    // Source /mixed/ keeps every row: the contains-'a' hidden filter matches every Campus title.
    const sourceMixed=await html('/mixed/');assert.equal(sourceMixed.status,200);
    assert.ok(sourceMixed.text.includes('Campus One')&&sourceMixed.text.includes('Campus Three'));
    // Review the team page: rendered live rows surface as record units beside the page copy.
    let review=await call('review/?locale=ar&path=/team/');assert.equal(review.complete,false);
    const recordFields=review.fields.filter(field=>['Campus One','Summary one','Campus Two','Summary two','Campus Three','Summary three'].includes(field.source));
    assert.equal(recordFields.length,6,'each rendered row field is one record unit');
    assert.ok(review.fields.some(field=>field.source==='Our campuses'));
    // A strict release cannot serve a live-bound page honestly: refuse with the precise code.
    const strict=await app.request('https://campus.test'+root+'prepare/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({locale:'ar',token:review.token,approveTranslations:true,path:'/team/',policy:{missing:'block',outdated:'block'}})});
    assert.equal(strict.status,409);assert.equal((await strict.json()).code,'live_release_per_unit_required');
    // Save Arabic for the record units only; chrome stays missing and per-unit fallback covers it.
    await call('save/',{locale:'ar',token:review.token,path:'/team/',entries:recordFields.map(field=>({id:field.id,token:field.token,text:arabicText(field.source)}))});
    review=await call('review/?locale=ar&path=/team/');
    const prepared=await call('prepare/',{locale:'ar',token:review.token,approveTranslations:true,path:'/team/',policy:{missing:'source-fallback',outdated:'source-fallback'}});
    await call('publish/',{hash:prepared.hash,expected:prepared.expected,approveTranslations:true});
    const arabic=await html('/ar/team/');assert.equal(arabic.status,200);assert.equal(arabic.headers.get('Content-Language'),'ar');
    assert.ok(arabic.text.includes('زيتون'));assert.ok(arabic.text.includes('عربي Summary two'));
    assert.ok(arabic.text.includes('Our campuses'),'untranslated chrome stays source under per-unit fallback');
    // Localized sort runs over the WHOLE released dataset: Arabic title order, not source order.
    assert.ok(arabic.text.indexOf('تفاح')<arabic.text.indexOf('جمعية Gamma')&&arabic.text.indexOf('جمعية Gamma')<arabic.text.indexOf('زيتون'),'localized sort orders by released titles');
    // Translate the filtered page too: same released titles, one contains-'a' title filter.
    await translate('/mixed/');
    const localizedMixed=await html('/ar/mixed/');assert.equal(localizedMixed.status,200);
    assert.ok(localizedMixed.text.includes('جمعية Gamma'),'the released title containing "a" matches the localized filter');
    assert.ok(localizedMixed.text.includes('عربي Summary three'));
    assert.ok(!localizedMixed.text.includes('زيتون')&&!localizedMixed.text.includes('تفاح')&&!localizedMixed.text.includes('Campus One')&&!localizedMixed.text.includes('Campus Two'),'rows whose released title lacks "a" leave the localized result');
    // A live-bound DataTable refuses translation outright: it renders a skeleton and fetches rows
    // in the visitor's browser with no locale channel, so no honest localized serve exists.
    const table=await call('review/?locale=ar&path=/table/');
    assert.ok(table.fields.some(field=>field.source==='Campus One'),'tables expose their live row fields');
    await translate('/table/');
    const tablePage=await html('/ar/table/');assert.equal(tablePage.status,200);assert.ok(tablePage.text.includes('data-react-component="DataTable"'));
    const browserProps=text=>{const element=new JSDOM(text).window.document.querySelector('[data-react-component]');return JSON.parse(element.getAttribute('data-react-props')??element.getAttribute('data-fb-props'));};
    assert.equal(browserProps(tablePage.text).binding._localePath,'/ar/table/','hydrated tables retain the locale path');
    const listFetch=async(path,componentId,changes={},status=200)=>{
        const query={componentId,versionId:'default',page:0,pageSize:1,sortColumn:'title',direction:'asc',filters:[],...changes};
        const response=await renderReviewedSitePublication(f.db,tenant,new Request('https://campus.test'+path,{headers:{'X-Frontbase-List':encodeURIComponent(JSON.stringify(query))}}),{liveQuery});
        assert.equal(response.status,status,await response.clone().text());return {body:await response.json(),language:response.headers.get('Content-Language')};
    };
    await translate('/grid/');const gridPage=await html('/ar/grid/');assert.equal(gridPage.status,200);assert.ok(gridPage.text.includes('data-react-component="Grid"'));
    const gridFetch=await listFetch('/ar/grid/','grid-list');assert.equal(gridFetch.body.rows[0].title,'تفاح');
    await translate('/scoped/');const hidden=await listFetch('/ar/scoped/','scoped-list',{filters:[{column:'id',op:'eq',value:1}]});assert.equal(hidden.body.total,0,'authored hidden filters remain mandatory when omitted by the browser');
    const tableFetch=await listFetch('/ar/table/','table-list');assert.equal(tableFetch.body.rows[0].title,'تفاح');assert.equal(tableFetch.body.total,3);assert.equal(tableFetch.language,'ar');
    const arabicOnly=await listFetch('/ar/table/','table-list',{filters:[{column:'title',op:'contains',value:'زيتون'}]});assert.equal(arabicOnly.body.total,1,'Arabic-only search must not prefilter the source title');assert.equal(arabicOnly.body.rows[0].title,'زيتون');
    const second=await listFetch('/ar/table/','table-list',{page:1});assert.equal(second.body.rows[0].title,'جمعية Gamma');
    const numeric=await listFetch('/ar/table/','table-list',{sortColumn:'id'});assert.equal(numeric.body.rows[0].title,'زيتون','source-key sorting still joins localized text');
    const unlocalized=await listFetch('/table/','table-list');assert.equal(unlocalized.body.rows[0].title,'Campus One');assert.equal(unlocalized.language,null);
    await listFetch('/ar/table/','missing',{},404);
    await listFetch('/ar/table/','table-list',{versionId:'forged'},403);
    await listFetch('/ar/table/','table-list',{sortColumn:'title;DROP TABLE'},422);
    await ext.exec("INSERT INTO institutions VALUES(99,'Forbidden','Outside saved view',77)");
    const scoped=await listFetch('/ar/table/','table-list',{filters:[{column:'country_id',op:'eq',value:77}]});assert.equal(scoped.body.total,0,'visitor predicates cannot bypass saved-view membership');
    // Beyond the bounded full-dataset scan the localized serve refuses instead of sorting a window.
    await translate('/big/',true);
    const oversized=await html('/ar/big/');assert.equal(oversized.status,503);
    // THE DEMO PIN: a source-record change reflects on the very next serve — the changed title
    // drops its stale Arabic (fresh source wins), localized ORDER follows the fresh effective
    // title, and untouched fields keep their released Arabic. No 503.
    await ext.exec("UPDATE institutions SET title='Renamed Campus' WHERE id=1");
    const after=await html('/ar/team/');assert.equal(after.status,200,'a live source change must not brick the localized page');
    assert.ok(after.text.includes('Renamed Campus'));assert.ok(!after.text.includes('زيتون'));
    assert.ok(after.text.includes('تفاح'));assert.ok(after.text.includes('عربي Summary one'),'untouched fields keep their released Arabic');
    assert.ok(after.text.indexOf('Renamed Campus')<after.text.indexOf('تفاح'),'localized sort follows the fresh effective title');
    // The same drift flows into localized filtering: the renamed row matches contains-'a' again.
    const mixedAfter=await html('/ar/mixed/');assert.equal(mixedAfter.status,200);
    assert.ok(mixedAfter.text.includes('Renamed Campus'));assert.ok(!mixedAfter.text.includes('تفاح'));
    // Live membership: a new source row joins with fresh source text (no unit exists yet).
    await ext.exec("INSERT INTO institutions VALUES(4,'Campus Four','Summary four',22)");
    const grown=await html('/ar/team/');assert.equal(grown.status,200);assert.ok(grown.text.includes('Campus Four'));assert.ok(grown.text.includes('Summary four'));
    assert.ok(grown.text.indexOf('Campus Four')<grown.text.indexOf('Renamed Campus')&&grown.text.indexOf('Renamed Campus')<grown.text.indexOf('تفاح'),'grown membership takes its localized-sort position');
    // English page unaffected throughout: source text, source order.
    const english=await html('/team/');assert.ok(english.text.includes('Renamed Campus'));assert.ok(!english.text.includes('عربي'));
    assert.ok(english.text.indexOf('Campus Four')<english.text.indexOf('Renamed Campus'),'English order stays source order');
    // Interactive live lists refuse translation with the precise code at review time.
    const interactive=await call('review/?locale=ar&path=/interactive/');
    assert.ok(interactive.fields.some(field=>field.source==='Next'),'visible list chrome is reviewable');await translate('/interactive/',true);
    const interactivePage=await html('/ar/interactive/');assert.equal(interactivePage.status,200);assert.ok(interactivePage.text.includes('data-react-component="Repeater"'));assert.ok(interactivePage.text.includes('عربي Next'),'released chrome reaches the browser binding');assert.equal(browserProps(interactivePage.text).binding._localeLabels.next,'عربي Next');
    const interactiveFetch=await listFetch('/ar/interactive/','interactive-list');assert.equal(interactiveFetch.body.rows[0].title,'تفاح');
    auth=false;await listFetch('/ar/table/','table-list',{pageSize:2});auth=true;
    owner='other';await listFetch('/ar/table/','table-list',{},503);owner=tenant;
    console.log('translation-live-list: live-bound page localization (per-unit release fence, full-dataset localized sort/filter, fresh-join source reaction, membership growth, Repeater/Table/Grid interactive locale continuation + beyond-scan refusal) PASS');
}finally{}
