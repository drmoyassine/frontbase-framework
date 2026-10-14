import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration,createEducationLanding,defaultTemplateSettings} from '@frontbase/edge-core/directory/configuration';
import {migrateUp} from '../dist/db/migrations.js';
import {SiteConfigurationStore} from '../dist/compat/site-configuration-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {EditorialApprovalStore} from '../dist/compat/editorial-approval-store.js';
import {PagesStore} from '../dist/compat/pages-store.js';import {PageChangeStore} from '../dist/compat/page-change-store.js';
import {prepareLandingFromCapture} from '../dist/compat/landing-publication-prepare.js';
import {prepareChunkPublication} from '../dist/compat/site-publication-chunk-prepare.js';
import {resolveChunkPublicationPage} from '../dist/compat/site-publication-chunk-runtime.js';
import {renderPage} from '@frontbase/edge-core';
import {stableStringify} from '@frontbase/compiler/manifest';

const db=sqliteRunner('file:'+join(tmpdir(),`frontbase-home-${crypto.randomUUID()}.db`).replaceAll('\\','/'));await migrateUp(db);
const owner='home-owner',now='2026-10-12T12:00:00Z',config=emptyDirectoryConfiguration();
config.site={name:'Study options',destination:'USA',origin:'https://site.test',locale:'en'};config.datasourceId='PRIVATE_SOURCE';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table='public_'+role;m.scope={field:'country',value:22};m.fields.id='id';m.fields.title='title';if(role!=='city')m.fields.originalPath='path';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const draft=await new SiteConfigurationStore(db,owner).save(config,0,now);assert.ok(draft);
const approved=new EditorialApprovalStore(db,owner),docs=['article','page'].map((role,i)=>({id:`00000000-0000-4000-8000-00000000004${i}`,revision:1,...(role==='page'?{contentRole:'page'}:{}),originalPath:role==='page'?'/':'/guide/',title:role==='page'?'Original home':'Guide',excerpt:'Summary',body:[{kind:'paragraph',runs:[{text:'Reviewed content'}]}],language:'en',byline:null,publishedAt:null,coverUrl:null,coverAlt:'',reviewState:'requested',reviewNote:'PRIVATE_REVIEW'}));
const refs=[];
for(const doc of docs){const a=await approved.approve(doc,draft,'reviewer','Existing review',{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true},now);assert.ok(a);refs.push({id:doc.id,revision:1,fingerprint:a.fingerprint,contentRole:doc.contentRole??'article'});}
const simple=(role,i)=>({pageId:`00000000-0000-4000-8000-00000000001${i}`,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:[{id:'q',type:role==='directory'||role==='article-index'?'Repeater':'Container',props:{directoryQuery:{version:1,queryId:role==='directory'?'directory.program.list':role==='article-index'?'directory.article.list':`directory.${role==='editorial'?'page':role}.detail`,params:role==='directory'||role==='article-index'?{}:{path:'/sample/'}}},children:[{id:'title',type:'Heading',props:{recordBindings:{text:'title'}}}]}]}});
const templates=['directory','institution','program','article-index','article','editorial'].map(simple);templates[0].layout.content.push({id:'institutions',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.institution.list',params:{}}},children:[]});
const publicBase={summary:'Public',cover:null,coverAlt:'',logo:null},records={cities:[{id:1,title:'City'}],institutions:[{...publicBase,id:1,title:'College',cityId:1,originalPath:'/college/'}],programs:Array.from({length:8},(_,i)=>({...publicBase,id:i+1,title:'Program '+i,institutionId:1,originalPath:`/college/program-${i}/`})),articles:[],pages:[]};
for(const doc of docs){const r={...publicBase,id:doc.id,revision:doc.revision,title:doc.title,originalPath:doc.originalPath,summary:doc.excerpt,body:doc.body,language:doc.language,byline:null,publishedAt:null};records[doc.contentRole==='page'?'pages':'articles'].push(r);}
const store=new SitePublicationManifestStore(db,owner),baseHash=await store.prepare({configurationRevision:1,configuration:config,templates,approvals:refs,redirects:[{from:'/old-guide/',to:'/guide/'}]},records,now);
const review=new SitePublicationReviewStore(db,owner);await review.approve({hash:baseHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Fixture review'},'reviewer',now);
const pageId='00000000-0000-4000-8000-000000000099',settings=defaultTemplateSettings();settings.programCount=2;settings.articleCount=1;
const pages=new PagesStore(db,owner);await pages.create({name:'Landing',slug:'landing',title:'Original home',description:'Summary',layout_data:createEducationLanding(settings)},pageId,now);await pages.update(pageId,{isHomepage:true},now);
const state=await new PageChangeStore(db,owner).state(pageId),input={baseHash,homepageId:pageId,homepageStateHash:state.hash};
const result=await prepareLandingFromCapture(db,owner,draft,input,now),next=result.artifact;
assert.equal(next.index.filter(r=>r.originalPath==='/').length,0);assert.equal(next.staticPages.filter(p=>p.originalPath==='/').length,1);
assert.equal(stableStringify(next.configuration),stableStringify(config));assert.deepEqual(next.approvals,refs.filter(ref=>ref.contentRole!=='page'));assert.deepEqual(next.redirects,[{from:'/old-guide/',to:'/guide/'}]);assert.ok(await approved.get(docs[1].id,1,1));
const original=await store.get(baseHash);
// Full-selection preparation must omit only the replaced homepage approval,
// just as preparation from a reviewed capture does.
for(const template of templates)await pages.create({name:template.role,slug:template.role,title:template.title,layout_data:template.layout},template.pageId,now);
const selected=await prepareChunkPublication(db,{query:async()=>[]},owner,draft,'sqlite',{
    format:'chunked',expectedConfigurationRevision:1,pageIds:templates.map(t=>t.pageId),staticPageIds:[pageId],
    replaceEditorialHomepage:true,articles:refs,
},{id:'reviewer'},now);
assert.deepEqual(selected.artifact.approvals,refs.filter(ref=>ref.contentRole!=='page'));
assert.equal(selected.artifact.staticPages.filter(p=>p.originalPath==='/').length,1);
for(const family of ['institutions','programs','articles','cities']){const loaded=[],prior=[];for(const ref of next.chunks.filter(r=>r.collection===family))loaded.push(...(await store.loadChunk(next,ref)).records);for(const ref of original.chunks.filter(r=>r.collection===family))prior.push(...(await store.loadChunk(original,ref)).records);assert.equal(stableStringify(loaded),stableStringify(prior));}
const resolved=await resolveChunkPublicationPage(next,result.hash,owner,db,new Request('https://staging.test/'));const html=await renderPage(resolved.page.layout,{user:{secret:'PRIVATE_CANARY'},page:{},app:{},visitor:{},url:{},system:{},cookies:{},local:{},session:{}});
assert.equal(new JSDOM(html).window.document.querySelectorAll('a[href^="/college/program-"]').length,2);assert.ok(html.includes('method="get" action="/explore/"'));assert.ok(!html.includes('PRIVATE_'));assert.equal(resolved.document.canonicalUrl,'https://site.test/');
await assert.rejects(()=>prepareLandingFromCapture(db,'other-owner',draft,input,now));
await assert.rejects(()=>prepareLandingFromCapture(db,owner,draft,{...input,homepageStateHash:'0'.repeat(64)},now));
await assert.rejects(()=>prepareLandingFromCapture(db,owner,{...draft,configuration:{...config,site:{...config.site,name:'Changed'}}},input,now));
await pages.update(pageId,{isHomepage:false},now);const nonHome=await new PageChangeStore(db,owner).state(pageId);await assert.rejects(()=>prepareLandingFromCapture(db,owner,draft,{...input,homepageStateHash:nonHome.hash},now));
await pages.update(pageId,{isHomepage:true},now);const restored=await new PageChangeStore(db,owner).state(pageId);
const unreviewed=await store.prepare({configurationRevision:1,configuration:config,templates,approvals:refs},records,now);await assert.rejects(()=>prepareLandingFromCapture(db,owner,draft,{...input,baseHash:unreviewed,homepageStateHash:restored.hash},now));
console.log('landing publication: exact approved-record/configuration preservation, sole home route, bounded lists/search/canonical, owner/review/stale/configuration/namespace refusals PASS');
process.exit(0);
