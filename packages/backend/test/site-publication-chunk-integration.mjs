import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sqliteRunner} from '@frontbase/edge-infra';
import {emptyDirectoryConfiguration,migrateExploreRepeater} from '@frontbase/edge-core/directory/configuration';
import {readPublicationList} from '../dist/compat/publication-list-source.js';
import {prepareElementSettingsCapture,publishElementSettingsCapture} from '../dist/compat/element-settings-capture.js';
import {createDirectoryQueries} from '@frontbase/compiler/queries/directory';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {createCompatApp} from '../dist/compat/app.js';
import {PagesStore} from '../dist/compat/pages-store.js';
import {SiteConfigurationStore} from '../dist/compat/site-configuration-store.js';
import {EditorialApprovalStore} from '../dist/compat/editorial-approval-store.js';
import {SitePublicationStore} from '../dist/compat/site-publication-store.js';
import {SitePublicationManifestStore} from '../dist/compat/site-publication-manifest.js';
import {SitePublicationReviewStore} from '../dist/compat/site-publication-review-store.js';
import {createChunkDirectoryQueries} from '../dist/compat/site-publication-chunk-queries.js';
import {renderReviewedSitePublication} from '../dist/compat/site-publication-serving.js';
import {captureRouteInventory} from '../dist/compat/capture-route-inventory.js';

// Disposable control + canonical state. No owner credentials or real content/activation.
const databaseUrl='file:'+join(tmpdir(),`frontbase-chunk-integration-${crypto.randomUUID()}.db`).replaceAll('\\','/');
const db=sqliteRunner(databaseUrl);await migrateUp(db);
const now='2026-10-11T09:00:00Z',config=emptyDirectoryConfiguration();
config.site={name:'Education USA',destination:'USA',origin:'https://study-in-usa.com',locale:'en'};config.datasourceId='PRIVATE_SOURCE';
for(const role of ['institution','program','city']){const m=config.collections[role];m.table='catalog_'+role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')Object.assign(m.fields,{originalPath:'path',body:'body'});}
config.collections.institution.fields.cityId='city';config.collections.program.fields.institutionId='institution';
const article=config.collections.article;article.table='editorial_documents';article.scope={field:'country_id',value:22};
Object.assign(article.fields,{id:'id',title:'title',originalPath:'original_path',summary:'excerpt',body:'body_blocks',contentRole:'collection_role',sourceOrigin:'source_origin'});
await db.exec('CREATE TABLE catalog_city(id INTEGER,title TEXT,country INTEGER)');
await db.exec('CREATE TABLE catalog_institution(id INTEGER,title TEXT,path TEXT,city INTEGER,country INTEGER,body TEXT,private_contract TEXT)');
await db.exec('CREATE TABLE catalog_program(id INTEGER,title TEXT,path TEXT,institution INTEGER,country INTEGER,body TEXT,private_contract TEXT)');
await db.exec("INSERT INTO catalog_city VALUES(1,'City',22),(2,'Foreign',99)");
await db.exec("INSERT INTO catalog_institution VALUES(10,'Campus','/campus/',1,22,'Institution information','PRIVATE_CONTRACT'),(99,'Foreign','/foreign/',2,99,'Foreign','PRIVATE_CONTRACT'),(11,'Expansion',NULL,1,22,'Expanded','PRIVATE_CONTRACT')");
for(let i=1;i<=121;i++)await db.exec('INSERT INTO catalog_program VALUES(?,?,?,?,?,?,?)',[i,`Program ${String(i).padStart(3,'0')}`,`/old-parent/program-${i}/`,10,22,'Large public description '.repeat(1200),'PRIVATE_CONTRACT']);
await db.exec("INSERT INTO catalog_program VALUES(999,'Foreign','/foreign-program/',99,99,'Foreign','PRIVATE_CONTRACT')");
const queryNode=(id,queryId)=>({id,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params:queryId.endsWith('.detail')?{path:'/wrong-sample/'}:{}}},children:[{id:id+'-title',type:'Heading',props:{level:'2',recordBindings:{text:'title'}}},{id:id+'-link',type:'Link',props:{text:'Open',recordBindings:{href:'originalPath'}}},...(queryId==='directory.page.detail'||queryId==='directory.article.detail'?[{id:id+'-body',type:'Container',props:{recordBindings:{blocks:'body'}}}]:[])]});
const templates=['directory','institution','program','article-index','article','editorial'].map((role,i)=>({pageId:`00000000-0000-4000-8000-00000000000${i}`,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:role==='directory'?[{id:'browsing',type:'Container',props:{directoryBrowsing:{version:1,tabs:true,search:true,pagination:true}},children:[]},queryNode('institutions','directory.institution.list'),queryNode('programs','directory.program.list')]:role==='article-index'?[queryNode('articles','directory.article.list')]:[queryNode('detail',`directory.${role==='editorial'?'page':role}.detail`),...(role==='institution'?[queryNode('related','directory.program.list')]:role==='program'?[queryNode('parent','directory.institution.detail')]:[])]}}));
const pages=new PagesStore(db,'alpha');
for(const template of templates)await pages.create({name:template.role,slug:template.role,title:template.title,layout_data:template.layout},template.pageId,now);
const homeId='00000000-0000-4000-8000-000000000020',applyId='00000000-0000-4000-8000-000000000021';
await pages.create({name:'Home',slug:'home',is_homepage:true,title:'Home',layout_data:{root:{},content:[{id:'home',type:'Heading',props:{text:'Saved home'}},{id:'contact',type:'Link',props:{href:'mailto:counselor@studygram.me',text:'Email a counselor'}}]}},homeId,now);
await pages.create({name:'Apply',slug:'apply/',title:'Apply',layout_data:{root:{},content:[{id:'apply',type:'Heading',props:{text:'Existing apply page'}},{id:'whatsapp',type:'Link',props:{href:'https://wa.me/96550775711',text:'WhatsApp'}}]}},applyId,now);
await pages.update(homeId,{isHomepage:true},now);await db.exec('UPDATE compat_pages SET is_published=1 WHERE tenant_slug=? AND id=?',['alpha',homeId]);
const beforeApply=await pages.get(applyId),draft=await new SiteConfigurationStore(db,'alpha').save(config,0,now);
const approvalStore=new EditorialApprovalStore(db,'alpha');
const documents=['article','page'].map((contentRole,i)=>({id:`00000000-0000-4000-8000-00000000003${i}`,revision:2,...(contentRole==='page'?{contentRole}:{}),originalPath:contentRole==='page'?'/about-studygram/':'/original-announcement/',title:contentRole==='page'?'About Studygram':'Announcement',excerpt:'Public summary',body:[{kind:'paragraph',runs:[{text:`Reviewed ${contentRole} content without cover`}]}],language:'en',byline:null,publishedAt:null,coverUrl:null,coverAlt:'',reviewState:'requested',reviewNote:'PRIVATE_REVIEW_NOTE'}));
for(const document of documents)document.body.push({kind:'paragraph',runs:[
 {text:'Captured absolute link',href:'https://study-in-usa.com/about-studygram/'},
 {text:'External same-path link',href:'https://other.example/about-studygram/'},
 {text:'Unavailable local target',href:'https://study-in-usa.com/not-captured/'},
 {text:'Fragment target',href:'https://study-in-usa.com/about-studygram/#section'}]});
const editorialChecks={facts:true,language:true,media:true,formatting:true,urls:true,ctas:true};
for(const document of documents)assert.ok(await approvalStore.approve(document,draft,'owner','PRIVATE_EVIDENCE',editorialChecks,now));
const cipher=await createSecretCipher('disposable-chunk-secret');
await db.exec('INSERT INTO datasources(id,tenant_slug,name,kind,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[config.datasourceId,'alpha','Fixture','sqlite',await cipher.encrypt(JSON.stringify({url:databaseUrl})),now,now]);
let tenant='alpha',role='owner',authenticated=true;
const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authenticated?{id:'owner',role}:null,tenant}),sessionSecret:'disposable-chunk-secret',now:()=>now});
const call=(mode,input)=>app.request(`/api/project/site-configuration/publication/${mode}/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const selection={format:'chunked',expectedConfigurationRevision:1,pageIds:templates.map(t=>t.pageId),staticPageIds:[homeId,applyId],includeMappedCatalog:true,includeApprovedEditorial:true,redirects:[{from:'/blog/original-announcement/',to:'/original-announcement/'}]};
const prepared=await call('prepare',selection);assert.equal(prepared.status,200,await prepared.clone().text());
const candidate=await prepared.json(),hash=candidate.hash;
assert.equal(candidate.records.programs.length,121);assert.equal(candidate.records.institutions.length,1);assert.equal(candidate.records.articles.length,1);assert.equal(candidate.records.pages.length,3);
assert.deepEqual(candidate.skippedUnmapped,{institutions:1,programs:0});
assert.ok(!JSON.stringify(candidate).includes('PRIVATE_'));
assert.deepEqual(await pages.get(applyId),beforeApply);
const manifestStore=new SitePublicationManifestStore(db,'alpha'),manifest=await manifestStore.get(hash);
assert.equal(manifest.schemaVersion,2);assert.ok(manifest.chunks.reduce((n,c)=>n+c.bytes,0)>1024*1024);assert.equal(manifest.approvals.length,2);
assert.equal((await new SitePublicationStore(db,'alpha').activeVersion()),null);
assert.equal((await call('read',{hash})).status,200);
// A matching revision/fingerprint reference cannot approve a forged public payload.
const capturedRows={institutions:[],programs:[],cities:[],articles:[],pages:[]};
for(const ref of manifest.chunks)capturedRows[ref.collection].push(...(await manifestStore.loadChunk(manifest,ref)).records);
const forgedRows=structuredClone(capturedRows);forgedRows.pages[0].body=[{kind:'paragraph',runs:[{text:'Unapproved replacement'}]}];
const forgedHash=await manifestStore.prepare({configurationRevision:1,configuration:config,templates,staticPages:manifest.staticPages,approvals:manifest.approvals},forgedRows,now);
assert.equal((await call('review',{hash:forgedHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Forged content must fail'})).status,422);
assert.equal((await call('preview',{hash:forgedHash,path:'/about-studygram/'})).status,422);

for(const path of ['/','/apply/','/about-studygram/','/original-announcement/','/campus/','/old-parent/program-121/','/explore/','/blog/']){
 const preview=await call('preview',{hash,path});assert.equal(preview.status,200,path+': '+await preview.clone().text());
 const rendered=await app.request(`/api/project/site-configuration/publication/render/?hash=${hash}&path=${encodeURIComponent(path)}`);
 assert.equal(rendered.status,200,path);assert.equal(rendered.headers.get('x-robots-tag'),'noindex, nofollow');assert.ok(!(await rendered.text()).includes('PRIVATE_'));
}
const privateDirectory=await app.request(`/api/project/site-configuration/publication/render/?hash=${hash}&path=%2Fexplore%2F&type=program&page=2`);
assert.ok((await privateDirectory.text()).includes('hash='+hash));
const privateArticle=await app.request('/api/project/site-configuration/publication/render/?'+new URLSearchParams({hash,path:'/original-announcement/'}));
const privateArticleHtml=await privateArticle.text();assert.equal(privateArticle.status,200);
const previewLinks=[...privateArticleHtml.matchAll(/href="([^"]+)"/g)].map(match=>new URL(match[1].replaceAll('&amp;','&'),'https://publication-preview.invalid'));
assert.ok(previewLinks.some(link=>link.searchParams.get('hash')===hash&&link.searchParams.get('path')==='/about-studygram/'));
for(const unchanged of ['https://other.example/about-studygram/','https://publication-preview.invalid/not-captured/','https://publication-preview.invalid/about-studygram/#section'])assert.ok(previewLinks.some(link=>link.href===unchanged),unchanged);
assert.ok(privateArticleHtml.includes('href="/not-captured/"'));
assert.ok(privateArticleHtml.includes('href="/about-studygram/#section"'));
role='viewer';assert.equal((await call('prepare',selection)).status,403);assert.equal((await call('read',{hash})).status,403);role='owner';
authenticated=false;assert.equal((await call('read',{hash})).status,401);authenticated=true;
tenant='beta';assert.equal((await call('read',{hash})).status,404);assert.equal((await call('activate',{hash,expected:null})).status,503);tenant='alpha';
assert.equal((await call('activate',{hash,expected:null})).status,503); // review is separate
const reviewChecks={content:true,media:true,layout:true,urls:true,ctas:true};
assert.equal((await call('review',{hash,checks:reviewChecks,note:'Checked every synthetic route and contact action'})).status,200);
const firstResponse=await call('activate',{hash,expected:null});assert.equal(firstResponse.status,200,await firstResponse.clone().text());const first=(await firstResponse.json()).pointer;
assert.equal(first.generation,1);
const state=await app.request('/api/project/site-configuration/publication/state/'),live=await state.json();assert.equal(live.capture.runtimeVersion,'directory-chunks-v1');assert.equal(live.capture.counts.programs,121);assert.equal(live.capture.counts.pages,3);
const publicPage=path=>renderReviewedSitePublication(db,'alpha',new Request('https://usa.test'+path));
// Captured authoring preview and live delivery use identical query semantics.
const capturedPreview=async params=>app.request('/api/project/site-configuration/preview/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'published',expectedRevision:1,role:'program',mode:'list',params})});
const sortedPreview=await capturedPreview({sort:'title-desc',q:'Program 12',match:'startsWith'});assert.equal(sortedPreview.status,200,await sortedPreview.clone().text());
const sortedPayload=await sortedPreview.json();assert.equal(sortedPayload.source,'published');assert.equal(sortedPayload.captureHash,hash);assert.equal(sortedPayload.total,2);assert.deepEqual(sortedPayload.rows.map(row=>row.title),['Program 121','Program 120']);
const sortedLive=await publicPage('/explore/?type=program&q=Program+12&match=startsWith&sort=title-desc');assert.equal(sortedLive.status,200);const sortedHtml=await sortedLive.text();assert.ok(sortedHtml.indexOf('Program 121')<sortedHtml.indexOf('Program 120'));
assert.equal((await publicPage('/explore/?sort=malicious')).status,400);assert.equal((await publicPage('/explore/?match=malicious')).status,400);
const stalePreview=await app.request('/api/project/site-configuration/preview/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'published',expectedCapture:'0'.repeat(64),expectedRevision:1,role:'program',mode:'list',params:{}})});assert.equal(stalePreview.status,409);

const alias=await publicPage('/blog/original-announcement/');assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),'/original-announcement/');assert.equal(await alias.text(),'');assert.equal(alias.headers.get('x-site-version'),hash);
assert.equal((await publicPage('/blog/original-announcement/?q=x')).status,400);
const privateAlias=await app.request('/api/project/site-configuration/publication/render/?'+new URLSearchParams({hash,path:'/blog/original-announcement/'}));assert.equal(privateAlias.status,301);assert.equal(privateAlias.headers.get('location'),'/api/project/site-configuration/publication/render/?'+new URLSearchParams({hash,path:'/original-announcement/'}));assert.match(privateAlias.headers.get('cache-control'),/no-store/);assert.match(privateAlias.headers.get('x-robots-tag'),/noindex/);
const aliasHead=await renderReviewedSitePublication(db,'alpha',new Request('https://usa.test/blog/original-announcement/',{method:'HEAD'}));assert.equal(aliasHead.status,301);assert.equal(await aliasHead.text(),'');
const aliasChunkKey=`site_publication:chunk:v1:${manifest.chunks[0].hash}`,aliasChunkRaw=(await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha',aliasChunkKey]))[0].value;
await db.exec('DELETE FROM settings WHERE tenant_slug=? AND key=?',['alpha',aliasChunkKey]);assert.equal((await publicPage('/blog/original-announcement/')).status,503);
await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['alpha',aliasChunkKey,aliasChunkRaw,now]);
for(const [path,text] of [['/','Saved home'],['/apply/','Existing apply page'],['/about-studygram/','Reviewed page content'],['/original-announcement/','Reviewed article content'],['/campus/','Campus'],['/old-parent/program-121/','Program 121'],['/explore/?type=program&page=2','Program 013'],['/blog/','Announcement']]){
 const response=await publicPage(path);assert.equal(response.status,200,path);const body=await response.text();assert.ok(body.includes(text),path);assert.ok(!body.includes('PRIVATE_'));assert.ok(!body.includes('wrong-sample'));assert.equal(response.headers.get('x-site-version'),hash);assert.equal(response.headers.get('x-site-generation'),'1');
 assert.ok(body.includes('rel="canonical" href="https://study-in-usa.com'+path.split('?')[0]+'"'),path);
 if(path.includes('?'))assert.match(body,/noindex, follow/);
}
const programHtml=await (await publicPage('/old-parent/program-121/')).text();assert.ok(programHtml.includes('Campus'));assert.ok(!programHtml.includes('src=""'));
const sitemap=await publicPage('/sitemap.xml');assert.equal(sitemap.status,200);const xml=await sitemap.text();for(const path of ['apply/','about-studygram/','old-parent/program-121/'])assert.ok(xml.includes('https://study-in-usa.com/'+path));assert.ok(!xml.includes('foreign'));assert.ok(!xml.includes('PRIVATE_'));
assert.ok(!xml.includes('/blog/original-announcement/'));
const inventory=await captureRouteInventory(db,'alpha');assert.equal(inventory.paths.length,129);assert.ok(inventory.paths.some(row=>row.source==='page'&&row.path==='/about-studygram/'));assert.ok(inventory.paths.some(row=>row.path==='/blog/original-announcement/'));
const head=await renderReviewedSitePublication(db,'alpha',new Request('https://usa.test/about-studygram/',{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
for(const path of ['/missing/','/foreign/'])assert.equal((await publicPage(path)).status,404);
for(const query of ['country=99','page=0','q=a&q=b','page=9999','type=page'])assert.equal((await publicPage('/explore/?'+query)).status,400);
assert.equal((await call('activate',{hash,expected:null})).status,409); // stale retry
// Request reads only selected immutable chunks, never the canonical provider.
const reads=[];const traced={exec:db.exec.bind(db),query:async(sql,args)=>{reads.push({sql,args});return db.query(sql,args);}};
const queries=createChunkDirectoryQueries(manifest,'alpha',traced);
const pageRows=await queries['directory.program.list'].execute({offset:108,limit:12},{tenant:'alpha'});assert.equal(pageRows.length,13);assert.equal(pageRows[0].title,'Program 109');
assert.ok(reads.filter(row=>String(row.args?.[1]).startsWith('site_publication:chunk:')).length<manifest.chunks.length);assert.ok(reads.every(row=>!row.sql.includes('catalog_')));
await assert.rejects(()=>queries['directory.program.list'].execute({},{tenant:'beta'}));
await assert.rejects(()=>queries['directory.program.list'].execute({country:99},{tenant:'alpha'}));
await assert.rejects(()=>queries['directory.program.list'].execute({limit:49},{tenant:'alpha'}));
assert.equal((await queries['directory.article.list'].execute({},{tenant:'alpha'}))[0].body,undefined);
// Later canonical or template edits never modify the published version.
await db.exec("UPDATE catalog_program SET title='Mutable changed title' WHERE id=121");
await db.exec("UPDATE compat_pages SET title='Mutable layout title' WHERE tenant_slug='alpha'");
assert.ok((await (await publicPage('/old-parent/program-121/')).text()).includes('Program 121'));
// Exact approvals remain necessary even for an already-reviewed version.
const document=documents[1],approvalKey=`editorial_approval:v1:${document.id}:2:1`,approvalRaw=(await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha',approvalKey]))[0].value;
await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[JSON.stringify({...JSON.parse(approvalRaw),fingerprint:'b'.repeat(64)}),'alpha',approvalKey]);
assert.equal((await publicPage('/about-studygram/')).status,503);
assert.equal((await publicPage('/blog/original-announcement/')).status,503);
await assert.rejects(()=>new SitePublicationReviewStore(db,'alpha').activate(hash,first,now));
await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[approvalRaw,'alpha',approvalKey]);
// Roll back across formats through the same guarded pointer.
const base={summary:'',cover:null,coverAlt:'',logo:null},legacy={schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:1,configuration:config,templates:templates.filter(t=>!['article','article-index','editorial'].includes(t.role)),records:{cities:[{id:1,title:'City'}],institutions:[{...base,id:10,title:'Legacy campus',cityId:1,originalPath:'/campus/'}],programs:[],articles:[]}};
const store=new SitePublicationStore(db,'alpha'),legacyHash=await store.prepare(legacy,now);
assert.equal((await call('review',{hash:legacyHash,checks:reviewChecks,note:'Synthetic legacy rollback'})).status,200);
const rollbackResponse=await call('activate',{hash:legacyHash,expected:first});assert.equal(rollbackResponse.status,200);const rollback=(await rollbackResponse.json()).pointer;assert.equal(rollback.generation,2);assert.ok((await (await publicPage('/campus/')).text()).includes('Legacy campus'));
const restoreResponse=await call('activate',{hash,expected:rollback});assert.equal(restoreResponse.status,200);assert.equal((await restoreResponse.json()).pointer.generation,3);
// Standard Repeater conversion preserves reviewed data through an owner-bound snapshot adapter.
const convertedTemplates=manifest.templates.map(template=>template.role==='directory'?{...template,layout:migrateExploreRepeater(template.layout,hash,config)}:template);
const convertedHash=await manifestStore.prepareLayouts(hash,{templates:convertedTemplates,staticPages:manifest.staticPages},now);
assert.equal((await call('review',{hash:convertedHash,checks:reviewChecks,note:'Synthetic standard Repeater conversion'})).status,200);
assert.equal((await call('activate',{hash:convertedHash,expected:(await store.activeVersion()).pointer})).status,200);
const standardPage=await publicPage('/explore/?type=program');assert.equal(standardPage.status,200);const standardHtml=await standardPage.text();assert.ok(standardHtml.includes('Program 001'));assert.ok(standardHtml.includes('data-block-versions="institutions"'));assert.ok(!standardHtml.includes('PRIVATE_CONTRACT'));
assert.equal((await publicPage('/explore/?type=arbitrary')).status,200); // Default fallback on standard versions.
const listQuery={componentId:'institutions',versionId:'programs',page:0,pageSize:12,sortColumn:'title',direction:'desc',filters:[]};
const listRequest=input=>new Request('https://study-in-usa.com/explore/?type=program',{headers:{'X-Frontbase-List':encodeURIComponent(JSON.stringify(input))}});
const listResult=await renderReviewedSitePublication(db,'alpha',listRequest(listQuery));assert.equal(listResult.status,200);const listBody=await listResult.json();assert.equal(listBody.rows.length,12);assert.equal(listBody.total,121);assert.equal(listBody.rows[0].title,'Program 121');assert.ok(!JSON.stringify(listBody).includes('PRIVATE_'));assert.ok(listBody.rows.every(row=>row.body===undefined));
const filtered=await renderReviewedSitePublication(db,'alpha',listRequest({...listQuery,filters:[{column:'title',op:'eq',value:'Program 120'}]}));assert.equal((await filtered.json()).total,1);
assert.equal((await renderReviewedSitePublication(db,'alpha',listRequest({...listQuery,componentId:'not-a-page-element'}))).status,404);
assert.equal((await renderReviewedSitePublication(db,'alpha',listRequest({...listQuery,versionId:'not-a-version'}))).status,403);
const sourceBinding=convertedTemplates.find(template=>template.role==='directory').layout.content.find(node=>node.id==='institutions').props.binding;
await assert.rejects(()=>readPublicationList(db,'beta',sourceBinding,listQuery));
await assert.rejects(()=>readPublicationList(db,'alpha',sourceBinding,{...listQuery,pageSize:49}));
await assert.rejects(()=>readPublicationList(db,'alpha',sourceBinding,{...listQuery,filters:[{column:'private_contract',op:'eq',value:'PRIVATE_CONTRACT'}]}));
assert.equal((await call('activate',{hash,expected:(await store.activeVersion()).pointer})).status,200);
const migrationBefore=(await store.activeVersion()).pointer;
const migrated=await prepareElementSettingsCapture(db,'alpha',hash,now);
assert.deepEqual((await store.activeVersion()).pointer,migrationBefore); // preview never activates
const migratedArtifact=await store.getVersion(migrated.hash);
assert.deepEqual(migratedArtifact.chunks,manifest.chunks);assert.deepEqual(migratedArtifact.index,manifest.index);
await assert.rejects(()=>prepareElementSettingsCapture(db,'beta',hash,now));
await assert.rejects(()=>publishElementSettingsCapture(db,'alpha',hash,hash,'reviewer',now));
assert.deepEqual((await store.activeVersion()).pointer,migrationBefore);
const migratedPublished=await publishElementSettingsCapture(db,'alpha',hash,migrated.hash,'reviewer',now);
assert.equal(migratedPublished.pointer.hash,migrated.hash);
await assert.rejects(()=>prepareElementSettingsCapture(db,'alpha',hash,now));
await assert.rejects(()=>publishElementSettingsCapture(db,'alpha',hash,migrated.hash,'reviewer',now));
assert.equal((await call('activate',{hash,expected:(await store.activeVersion()).pointer})).status,200);
console.log('standard Repeater: reviewed source pinning, native SSR, first-match Programs version, paging/count/filter/order, unknown element/version and cross-owner/private-field refusals PASS');
// Missing chunks are terminal and prevent review/activation; no mutable fallback.
const chunk=manifest.chunks.find(ref=>ref.collection==='programs'),chunkKey=`site_publication:chunk:v1:${chunk.hash}`,chunkRaw=(await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha',chunkKey]))[0].value;
await db.exec('DELETE FROM settings WHERE tenant_slug=? AND key=?',['alpha',chunkKey]);
const missingPath=manifest.index.find(row=>row.chunkHash===chunk.hash).originalPath;assert.equal((await publicPage(missingPath)).status,503);assert.equal((await publicPage('/sitemap.xml')).status,503);
await assert.rejects(async()=>new SitePublicationReviewStore(db,'alpha').activate(hash,(await store.activeVersion()).pointer,now));
await db.exec('INSERT INTO settings(tenant_slug,key,value,updated_at) VALUES(?,?,?,?)',['alpha',chunkKey,chunkRaw,now]);
const bad=JSON.parse(chunkRaw);bad.records[0].title='Corrupted chunk';await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[JSON.stringify(bad),'alpha',chunkKey]);assert.equal((await publicPage(missingPath)).status,503);
await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[chunkRaw,'alpha',chunkKey]);
assert.equal((await publicPage(missingPath)).status,200);
// Bulk authoring retains scoped-page semantics and cannot silently include orphans.
let statement;const authoring=createDirectoryQueries(config,'alpha','sqlite',async(sql,args)=>{statement={sql,args};return [];});
await authoring['directory.page.list'].execute({},{tenant:'alpha',user:{id:'owner'}});assert.ok(statement.args.includes('page'));assert.ok(statement.args.includes(config.site.origin));
await db.exec("INSERT INTO catalog_program VALUES(122,'Orphan','/orphan/',12345,22,'body','PRIVATE_CONTRACT')");assert.equal((await call('prepare',selection)).status,422);await db.exec('DELETE FROM catalog_program WHERE id=122');
assert.equal((await call('prepare',{...selection,expectedConfigurationRevision:2})).status,409);
assert.equal((await call('prepare',{...selection,records:{programs:[]}})).status,422);
assert.equal((await call('prepare',{...selection,staticPageIds:[templates[0].pageId]})).status,422);
if(!process.argv.includes('--without-capacity')){
// Full pilot-sized synthetic catalog: late pages exceed the old 10,000 offset boundary.
const capacityRecords={cities:[{id:1,title:'City'}],institutions:[{...base,id:10,title:'Campus',originalPath:'/campus/',cityId:1}],articles:[],programs:Array.from({length:10049},(_,i)=>({...base,id:i+1,title:`Program ${String(i+1).padStart(5,'0')}`,originalPath:`/capacity/program-${i+1}/`,institutionId:10}))};
const capacityHash=await manifestStore.prepare({configurationRevision:1,configuration:config,templates:legacy.templates},capacityRecords,now),capacity=await manifestStore.get(capacityHash);
const lateQueries=createChunkDirectoryQueries(capacity,'alpha',db),late=await lateQueries['directory.program.list'].execute({offset:10032,limit:12},{tenant:'alpha'});assert.equal(late[0].title,'Program 10033');assert.equal(late.length,13);
assert.equal((await call('review',{hash:capacityHash,checks:reviewChecks,note:'Synthetic 10,049-program capacity and URL proof'})).status,200);
const capacityActivation=await call('activate',{hash:capacityHash,expected:(await store.activeVersion()).pointer});assert.equal(capacityActivation.status,200);
const latePage=await publicPage('/explore/?type=program&page=837');assert.equal(latePage.status,200);assert.ok((await latePage.text()).includes('Program 10033'));
const largeInventory=await captureRouteInventory(db,'alpha');assert.equal(largeInventory.paths.length,10051);
const namespaceResponse=await app.request('/api/project/page-route-audit/'),namespace=await namespaceResponse.json();assert.equal(namespaceResponse.status,200);assert.equal(namespace.publicRecordsChecked,true);assert.ok(namespace.resourcesChecked>=10051);
console.log('capacity: 10,049 captured programs, late offset 10,032, active namespace inventory and bounded page rendering PASS');
}
console.log('chunk publication integration: HTTP preparation/reopen/preview/review/CAS activation, >1 MiB/121 programs, directory/detail/parent/blog/page/home/apply/SEO/sitemap/HEAD, selective immutable reads, owner/no-leak/refusal and v1 rollback PASS');
