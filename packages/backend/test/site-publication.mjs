import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createHash } from 'node:crypto';
import { stableStringify } from '@frontbase/compiler';
import { createSnapshotDirectoryQueries } from '@frontbase/compiler/queries/directory';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { SitePublicationReviewStore } from '../dist/compat/site-publication-review-store.js';
import { resolveReviewedSitePublication, renderReviewedSitePublication } from '../dist/compat/site-publication-serving.js';
import { resolveSitePublicationPage } from '../dist/compat/site-publication-runtime.js';
import { migrateUp } from '../dist/db/migrations.js';
import { prepareSitePublication,sitePreparationRequestSchema } from '../dist/compat/site-publication-prepare.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { EditorialApprovalStore } from '../dist/compat/editorial-approval-store.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';
import { createEngine,directProvider,configureEngine } from '@frontbase/edge-core';
import { createCompatApp } from '../dist/compat/app.js';
import { createSecretCipher } from '../dist/db/secret-cipher.js';

const databaseUrl='file:'+join(tmpdir(),`frontbase-publication-${crypto.randomUUID()}.db`).replaceAll('\\','/');
const db=sqliteRunner(databaseUrl);await migrateUp(db);
const now='2026-10-07T08:00:00Z', config=emptyDirectoryConfiguration();
config.site={name:'USA',destination:'USA',origin:'https://study-in-usa.com',locale:'en'};config.datasourceId='PRIVATE_DATASOURCE';
for(const role of ['institution','program','city']) {const m=config.collections[role];m.table='PRIVATE_'+role;m.scope={field:'country',value:22};Object.assign(m.fields,{id:'id',title:'title'});if(role!=='city')m.fields.originalPath='wp_url';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const node=(id,queryId,params)=>({id,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params}},children:[{id:id+'-title',type:'Heading',props:{recordBindings:{text:'title'}}},{id:id+'-link',type:'Link',props:{text:'Details',recordBindings:{href:'originalPath'}}}]});
const templates=['directory','institution','program','article-index','article'].map((role,index)=>({pageId:`00000000-0000-4000-8000-00000000000${index}`,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:role==='directory'?[node('institutions','directory.institution.list',{}),node('programs','directory.program.list',{})]:role==='article-index'?[node('articles','directory.article.list',{})]:[node('detail',`directory.${role}.detail`,{path:'/WRONG-SAMPLE/'}),...(role==='institution'?[node('related','directory.program.list',{institutionId:999})]:[])]}}));
const base={summary:'Public summary',cover:null,coverAlt:'',logo:null};
const artifact={schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:1,configuration:config,templates,records:{
 cities:[{id:1,title:'Allentown'}],institutions:[{...base,id:512,title:'Muhlenberg College',originalPath:'/muhlenberg-college/',cityId:1}],
 programs:[{...base,id:46188,title:'Dental program',originalPath:'/old-parent/dental-program/',institutionId:512}],
 articles:[{...base,id:'00000000-0000-4000-8000-000000000099',revision:3,title:'Announcement',originalPath:'/blog/original-article/',body:[{kind:'paragraph',runs:[{text:'Reviewed public content'}]}],language:'en',byline:'Author',publishedAt:'2025-04-19T09:12:43Z'}]}};
const store=new SitePublicationStore(db,'alpha');
for(const mutate of [a=>a.records.programs[0].institutionId=999,a=>a.records.institutions[0].cityId=999,a=>a.records.articles[0].privateEvidence='PRIVATE',a=>a.templates.pop(),a=>a.templates[0].layout.root.siteConfiguration.role='program',a=>a.templates[1].layout.content=[],a=>a.templates[1].layout.content[0].binding={datasourceId:'PRIVATE'},a=>a.records.programs[0].originalPath='/muhlenberg-college',a=>a.records.programs[0].originalPath='/api/private',a=>a.records.programs[0].originalPath='/muhlenberg%2dcollege/']) {
 const invalid=structuredClone(artifact);mutate(invalid);assert.equal(sitePublicationArtifactSchema.safeParse(invalid).success,false);
}
const hash=await store.prepare(artifact,now);assert.equal(hash,createHash('sha256').update(stableStringify(sitePublicationArtifactSchema.parse(artifact))).digest('hex'));
for(const path of ['/builder/private','/static/icon.png','/setup','/console','/admin','/frontbase-setup/spa.js']) {
 const invalid=structuredClone(artifact);invalid.records.institutions[0].originalPath=path;
 assert.equal(sitePublicationArtifactSchema.safeParse(invalid).success,false);
}
const guardedStore=new SitePublicationStore(db,'guarded'),guardedReview=new SitePublicationReviewStore(db,'guarded');
await guardedStore.prepare(artifact,now);
const publicRequest=new Request('https://usa.test/muhlenberg-college/');
assert.deepEqual(await resolveReviewedSitePublication(db,'guarded',publicRequest),{status:'inactive'});
assert.equal(await renderReviewedSitePublication(db,'guarded',publicRequest),null);
await assert.rejects(()=>renderReviewedSitePublication(db,'guarded',new Request(publicRequest.url,{method:'POST'})),/publication_method_invalid/);
await assert.rejects(()=>resolveReviewedSitePublication(db,'',publicRequest),/publication_owner_required/);
await assert.rejects(()=>guardedReview.activate(hash,null,now),/publication_review_required/);
assert.equal(await guardedStore.active(),null);
const checks={content:true,media:true,layout:true,urls:true,ctas:true};
await guardedReview.approve({hash,checks,note:'Reviewed original capture'},'owner',now);
const guardedFirst=await guardedReview.activate(hash,null,now);assert.equal(guardedFirst.generation,1);
const servedFirst=await resolveReviewedSitePublication(db,'guarded',publicRequest);assert.equal(servedFirst.status,'resolved');assert.equal(servedFirst.hash,hash);assert.equal(servedFirst.generation,1);assert.equal(servedFirst.result.page.title,'Muhlenberg College');assert.ok(!JSON.stringify(servedFirst).includes('PRIVATE_'));
const publicHtml=await renderReviewedSitePublication(db,'guarded',publicRequest);
assert.equal(publicHtml.status,200);assert.equal(publicHtml.headers.get('cache-control'),'no-store');assert.equal(publicHtml.headers.get('x-site-version'),hash);assert.equal(publicHtml.headers.get('x-site-generation'),'1');
const publicBody=await publicHtml.text();assert.ok(publicBody.includes('Muhlenberg College'));assert.ok(!publicBody.includes('PRIVATE_'));assert.ok(!publicBody.includes('serviceWorker.register'));
assert.ok(publicBody.includes('<html lang="en">'));assert.ok(publicBody.includes('rel="canonical" href="https://study-in-usa.com/muhlenberg-college/"'));
// Capture-bound metadata must not read the host's mutable favicon, even for a Navbar.
configureEngine({resolveFaviconUrl:async()=>{throw new Error('MUTABLE_FAVICON_LOOKUP');}});
assert.equal((await renderReviewedSitePublication(db,'guarded',publicRequest)).status,200);
const neutralizingHtml=await renderReviewedSitePublication(db,'guarded',publicRequest,{swBundle:'network-only-fixture'});assert.ok((await neutralizingHtml.text()).includes("serviceWorker.register('/sw.js')"));
configureEngine({});
const publicHead=await renderReviewedSitePublication(db,'guarded',new Request(publicRequest.url,{method:'HEAD'}));assert.equal(publicHead.status,200);assert.equal(publicHead.headers.get('x-site-version'),hash);assert.equal(await publicHead.text(),'');
const terminalMissing=await renderReviewedSitePublication(db,'guarded',new Request('https://usa.test/missing/'));assert.equal(terminalMissing.status,404);assert.equal(terminalMissing.headers.get('cache-control'),'no-store');assert.equal(terminalMissing.headers.get('x-robots-tag'),'noindex, nofollow');
const invalidHead=await renderReviewedSitePublication(db,'guarded',new Request('https://usa.test/explore/?country=99',{method:'HEAD'}));assert.equal(invalidHead.status,400);assert.equal(await invalidHead.text(),'');
for(const params of ['country=99','type=foreign','q=a&q=b','page=0','page=01','page=-1','page=1.5','page=9999','q='+ 'x'.repeat(101)]) {
 const request=new Request('https://usa.test/explore/?'+params);
 assert.equal((await resolveReviewedSitePublication(db,'guarded',request)).status,'invalid');
 const response=await renderReviewedSitePublication(db,'guarded',request);
 assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(response.headers.get('x-site-version'),null);assert.equal(await response.text(),'Invalid request');
}
const lastPage=Math.floor(10000/config.browsing.pageSize)+1;
assert.equal((await renderReviewedSitePublication(db,'guarded',new Request('https://usa.test/explore/?page='+lastPage))).status,200);
assert.equal((await renderReviewedSitePublication(db,'guarded',new Request('https://usa.test/explore/?page='+(lastPage+1)))).status,400);
assert.equal((await renderReviewedSitePublication(db,'guarded',new Request('https://usa.test/not-captured/?page=0'))).status,404);
assert.deepEqual(await resolveReviewedSitePublication(db,'guarded',new Request('https://usa.test/missing/')),{status:'missing'});
assert.deepEqual(await resolveReviewedSitePublication(db,'guarded',new Request('https://usa.test/explore/?country=99')),{status:'invalid'});
const guardedNextArtifact=structuredClone(artifact);guardedNextArtifact.records.institutions[0].title='Reviewed update';
const guardedNextHash=await guardedStore.prepare(guardedNextArtifact,now);
// A caller bypassing the internal reviewed wrapper cannot make the public reader serve an unreviewed capture.
const injected=await guardedStore.activate(guardedNextHash,guardedFirst,now);
assert.deepEqual(await resolveReviewedSitePublication(db,'guarded',publicRequest),{status:'unavailable'});
const unreviewedResponse=await renderReviewedSitePublication(db,'guarded',publicRequest);assert.equal(unreviewedResponse.status,503);assert.equal(await unreviewedResponse.text(),'Site unavailable');
assert.equal((await renderReviewedSitePublication(db,'guarded',new Request('https://usa.test/explore/?page=0'))).status,503);
await guardedStore.activate(hash,injected,now);
const guardedCurrent=(await guardedStore.active()).pointer;
await assert.rejects(()=>guardedReview.activate(guardedNextHash,guardedCurrent,now),/publication_review_required/);assert.deepEqual((await guardedStore.active()).pointer,guardedCurrent);
await guardedReview.approve({hash:guardedNextHash,checks,note:'Reviewed changed capture'},'owner',now);
const guardedSecond=await guardedReview.activate(guardedNextHash,guardedCurrent,now);assert.equal(guardedSecond.generation,4);
assert.equal(await guardedReview.activate(hash,guardedFirst,now),null);
const servedSecond=await resolveReviewedSitePublication(db,'guarded',publicRequest);assert.equal(servedSecond.status,'resolved');assert.equal(servedSecond.result.page.title,'Reviewed update');assert.notEqual(servedSecond.result.version,servedFirst.result.version);assert.notEqual(servedSecond.result.cacheKey,servedFirst.result.cacheKey);
const guardedRollback=await guardedReview.activate(hash,guardedSecond,now);assert.equal(guardedRollback.generation,5);
const servedRollback=await resolveReviewedSitePublication(db,'guarded',publicRequest);assert.equal(servedRollback.status,'resolved');assert.equal(servedRollback.result.version,servedFirst.result.version);assert.equal(servedRollback.result.page.title,'Muhlenberg College');
await new SitePublicationStore(db,'guarded-other').prepare(artifact,now);
assert.deepEqual(await resolveReviewedSitePublication(db,'guarded-other',publicRequest),{status:'inactive'});
await assert.rejects(()=>new SitePublicationReviewStore(db,'guarded-other').activate(hash,null,now),/publication_review_required/);
const guardedReviewKey=`site_publication:review:v1:${hash}`,guardedEvidence=(await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',['guarded',guardedReviewKey]))[0].value;
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',[JSON.stringify({...JSON.parse(guardedEvidence),hash:'b'.repeat(64)}),'guarded',guardedReviewKey]);
await assert.rejects(()=>guardedReview.activate(hash,guardedRollback,now),/publication_review_unavailable/);assert.deepEqual((await guardedStore.active()).pointer,guardedRollback);
assert.deepEqual(await resolveReviewedSitePublication(db,'guarded',publicRequest),{status:'unavailable'});
// Real owned control layouts + fixed-scope SQLite canonical captures, no raw browser rows.
await db.exec('CREATE TABLE PRIVATE_city (id INTEGER,title TEXT,country INTEGER)');
await db.exec('CREATE TABLE PRIVATE_institution (id INTEGER,title TEXT,wp_url TEXT,city_id INTEGER,country INTEGER)');
await db.exec('CREATE TABLE PRIVATE_program (id INTEGER,title TEXT,wp_url TEXT,institution_id INTEGER,country INTEGER)');
await db.exec("INSERT INTO PRIVATE_city VALUES (1,'Allentown',22),(2,'Foreign city',99)");
await db.exec("INSERT INTO PRIVATE_institution VALUES (512,'Muhlenberg College','/muhlenberg-college/',1,22),(2,'Foreign institution','/foreign/',2,99)");
await db.exec("INSERT INTO PRIVATE_program VALUES (46188,'Dental program','/old-parent/dental-program/',512,22),(2,'Foreign program','/foreign-program/',2,99)");
const draft=await new SiteConfigurationStore(db,'alpha').save(config,0,now);
for(const template of templates)await new PagesStore(db,'alpha').create({name:'Internal title',title:template.title,slug:template.role,layout_data:template.layout},template.pageId,now);
const article=artifact.records.articles[0], document={id:article.id,revision:3,originalPath:article.originalPath,title:article.title,excerpt:article.summary,body:article.body,language:article.language,byline:article.byline,publishedAt:article.publishedAt,coverUrl:null,coverAlt:'',reviewState:'requested',reviewNote:'PRIVATE_REVIEW'};
const approved=await new EditorialApprovalStore(db,'alpha').approve(document,draft,'owner','PRIVATE_EVIDENCE',{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true},now);
const selection={expectedConfigurationRevision:1,pageIds:templates.map(t=>t.pageId),institutionPaths:['/muhlenberg-college/'],programPaths:['/old-parent/dental-program/'],articles:[{id:article.id,revision:3,fingerprint:approved.fingerprint}]};
assert.equal(sitePreparationRequestSchema.safeParse({...selection,records:artifact.records}).success,false);
const prepare=(request=selection,tenant='alpha',version=draft)=>prepareSitePublication(db,db,tenant,version,'sqlite',request,{id:'owner'},now);
const captured=await prepare();assert.equal(captured.artifact.templates[1].title,'institution');assert.equal(captured.artifact.records.programs[0].institutionId,512);assert.equal(captured.artifact.records.articles[0].revision,3);
assert.ok(!JSON.stringify(captured.artifact.records).includes('PRIVATE_'));
// A browser serializes raw Unicode. Preparation must refuse, never rename or persist it.
for (const [role,table,id,path,original] of [
 ['institution','PRIVATE_institution',512,'/caf\u00e9/','/muhlenberg-college/'],
 ['program','PRIVATE_program',46188,'/old-parent/\u533b\u5b66/','/old-parent/dental-program/'],
]) {
    await db.exec(`UPDATE ${table} SET wp_url=? WHERE id=?`,[path,id]);
    const settingsBefore=JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'));
    try {
        await assert.rejects(()=>prepare({...selection,[role+'Paths']:[path]}),/publication_route_serialization/);
        assert.equal(JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key')),settingsBefore);
        assert.equal((await db.query(`SELECT wp_url FROM ${table} WHERE id=?`,[id]))[0].wp_url,path);
    } finally {await db.exec(`UPDATE ${table} SET wp_url=? WHERE id=?`,[original,id]);}
}
await assert.rejects(()=>prepare({...selection,institutionPaths:['/foreign/']}));
const unicodeArticle={...document,revision:4,originalPath:'/\u6587\u7ae0/'};
const unicodeApproval=await new EditorialApprovalStore(db,'alpha').approve(unicodeArticle,draft,'owner','Synthetic URL check',{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true},now);
let settingsBefore=JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'));
await assert.rejects(()=>prepare({...selection,articles:[{id:article.id,revision:4,fingerprint:unicodeApproval.fingerprint}]}),/publication_route_serialization/);
assert.equal(JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key')),settingsBefore);
for(const route of ['directory','blog']){
    const owner='url-'+route,configuration=structuredClone(config);configuration.routes[route]='/caf\u00e9/';
    const version=await new SiteConfigurationStore(db,owner).save(configuration,0,now);
    for(const template of templates)await new PagesStore(db,owner).create({name:'Synthetic',slug:template.role,layout_data:template.layout},template.pageId,now);
    const approval=await new EditorialApprovalStore(db,owner).approve(document,version,'owner','Synthetic route check',{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true},now);
    settingsBefore=JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'));
    await assert.rejects(()=>prepare({...selection,articles:[{id:article.id,revision:3,fingerprint:approval.fingerprint}]},owner,version),/publication_route_serialization/);
    assert.equal(JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key')),settingsBefore);
}
// Already encoded spelling is retained byte-for-byte and resolves as requested.
await db.exec('UPDATE PRIVATE_institution SET wp_url=? WHERE id=?',['/caf%C3%A9/',512]);
try {
    const encoded=await prepare({...selection,institutionPaths:['/caf%C3%A9/']});
    assert.equal(encoded.artifact.records.institutions[0].originalPath,'/caf%C3%A9/');
    assert.ok(await resolveSitePublicationPage(encoded.artifact,encoded.hash,'alpha',new Request('https://usa.test/caf%C3%A9/')));
} finally {await db.exec('UPDATE PRIVATE_institution SET wp_url=? WHERE id=?',['/muhlenberg-college/',512]);}
await assert.rejects(()=>prepare(selection,'beta'));
await assert.rejects(()=>prepare({...selection,expectedConfigurationRevision:2}));
await assert.rejects(()=>prepare({...selection,articles:[{...selection.articles[0],fingerprint:'a'.repeat(64)}]}));
const approvalKey=`editorial_approval:v1:${article.id}:3:1`, approvalRaw=(await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',['alpha',approvalKey]))[0].value;
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',[JSON.stringify({...JSON.parse(approvalRaw),fingerprint:'b'.repeat(64)}),'alpha',approvalKey]);
await assert.rejects(()=>prepare(),/approval_unavailable/);
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',[approvalRaw,'alpha',approvalKey]);
await assert.rejects(()=>prepare({...selection,institutionPaths:[]})); // cannot publish a program without its parent
await db.exec('UPDATE compat_pages SET is_published = 1 WHERE tenant_slug = ? AND id = ?',['alpha',templates[0].pageId]);await assert.rejects(()=>prepare());
await db.exec('UPDATE compat_pages SET is_published = 0 WHERE tenant_slug = ? AND id = ?',['alpha',templates[0].pageId]);
const cipher=await createSecretCipher('publication-fixture-secret');
await db.exec('INSERT INTO datasources (id,tenant_slug,name,kind,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',[config.datasourceId,'alpha','Fixture','sqlite',await cipher.encrypt(JSON.stringify({url:databaseUrl})),now,now]);
let role='owner',tenant='alpha',authenticated=true;
const app=await createCompatApp({makeRunner:async()=>db,resolvePrincipal:async()=>({user:authenticated?{id:'owner',role}:null,tenant}),sessionSecret:'publication-fixture-secret',now:()=>now});
const call=(mode,input)=>app.request(`/api/project/site-configuration/publication/${mode}/`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const apiPrepared=await call('prepare',selection);assert.equal(apiPrepared.status,200);assert.equal(apiPrepared.headers.get('cache-control'),'no-store');
const candidate=await apiPrepared.json();assert.equal(candidate.publicationAvailable,false);assert.equal(candidate.hash,captured.hash);assert.ok(!JSON.stringify(candidate).includes('PRIVATE_'));
await db.exec('UPDATE PRIVATE_institution SET wp_url=? WHERE id=?',['/caf\u00e9/',512]);
try {
    const before=JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key'));
    const response=await call('prepare',{...selection,institutionPaths:['/caf\u00e9/']});assert.equal(response.status,422);
    const error=await response.json();assert.equal(error.code,'publication_route_serialization');assert.ok(error.detail.includes('original encoding'));assert.ok(!JSON.stringify(error).includes('caf'));
    assert.equal(JSON.stringify(await db.query('SELECT * FROM settings ORDER BY tenant_slug,key')),before);
}finally{await db.exec('UPDATE PRIVATE_institution SET wp_url=? WHERE id=?',['/muhlenberg-college/',512]);}
const readInput={hash:candidate.hash};
const reviewInput={hash:candidate.hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'PRIVATE_SITE_REVIEW'};
assert.equal((await call('review',{...reviewInput,reviewer:'forged'})).status,422);
assert.equal((await call('review',{...reviewInput,checks:{...reviewInput.checks,content:false}})).status,422);
assert.equal((await call('review',{...reviewInput,note:' '})).status,422);
role='viewer';assert.equal((await call('review',reviewInput)).status,403);role='owner';
authenticated=false;assert.equal((await call('review',reviewInput)).status,401);authenticated=true;
tenant='beta';assert.equal((await call('review',reviewInput)).status,422);tenant='alpha';
const reviewed=await call('review',reviewInput);assert.equal(reviewed.status,200);assert.equal((await reviewed.json()).publicationAvailable,false);
const storedReview=JSON.parse((await db.query('SELECT value FROM settings WHERE tenant_slug = ? AND key = ?',['alpha',`site_publication:review:v1:${candidate.hash}`]))[0].value);
assert.equal(storedReview.reviewer,'owner');assert.equal(storedReview.reviewedAt,now);assert.equal(storedReview.note,'PRIVATE_SITE_REVIEW');
assert.equal((await call('review',{...reviewInput,note:'overwrite'})).status,409);
assert.equal((await store.active()),null); // private review cannot activate any route
await new SitePublicationStore(db,'beta').prepare(captured.artifact,now);
tenant='beta';const foreignRecovery=await call('read',readInput);assert.equal(foreignRecovery.status,200);assert.equal((await foreignRecovery.json()).review,null);tenant='alpha';
// Preserve the earlier missing-candidate cross-owner checks while proving reviews do not leak between identical owned captures.
await db.exec('DELETE FROM settings WHERE tenant_slug = ? AND key = ?',['beta',`site_publication:v1:${candidate.hash}`]);
const recovered=await call('read',readInput);assert.equal(recovered.status,200);assert.equal(recovered.headers.get('cache-control'),'no-store');
const recovery=await recovered.json();assert.equal(recovery.configurationRevision,1);assert.equal(recovery.routes.directory,config.routes.directory);assert.equal(recovery.publicationAvailable,false);assert.ok(!JSON.stringify(recovery).includes('PRIVATE_'));assert.equal(recovery.records.articles[0].body,undefined);
assert.equal(recovery.review,now);
assert.equal((await call('read',{...readInput,tenant:'alpha'})).status,422);assert.equal((await call('read',{hash:'a'.repeat(64)})).status,404);
const previewInput={hash:candidate.hash,path:'/muhlenberg-college/'};
const preview=await call('preview',previewInput);assert.equal(preview.status,200);assert.equal((await preview.json()).page.title,'Muhlenberg College');
const renderPreview=()=>app.request(`/api/project/site-configuration/publication/render/?hash=${candidate.hash}&path=${encodeURIComponent('/muhlenberg-college/')}`);
const rendered=await renderPreview();assert.equal(rendered.status,200);assert.equal(rendered.headers.get('x-robots-tag'),'noindex, nofollow');assert.equal(rendered.headers.get('cache-control'),'no-store');const previewHtml=await rendered.text();assert.ok(previewHtml.includes('Muhlenberg College'));assert.ok(previewHtml.includes('hash='+candidate.hash));assert.ok(previewHtml.includes('path=%2Fold-parent%2Fdental-program%2F'));
role='viewer';assert.equal((await call('read',readInput)).status,403);assert.equal((await call('prepare',selection)).status,403);assert.equal((await call('preview',previewInput)).status,403);assert.equal((await renderPreview()).status,403);role='owner';
authenticated=false;assert.equal((await call('read',readInput)).status,401);assert.equal((await call('preview',previewInput)).status,401);assert.equal((await renderPreview()).status,401);authenticated=true;
tenant='beta';assert.equal((await call('read',readInput)).status,404);assert.equal((await call('preview',previewInput)).status,404);assert.equal((await renderPreview()).status,404);tenant='alpha';
assert.equal((await call('prepare',{...selection,records:artifact.records})).status,422);
assert.equal((await call('preview',{...previewInput,params:{country:99}})).status,422);
assert.equal((await call('preview',{...previewInput,hash:'a'.repeat(64)})).status,404);
assert.equal((await call('preview',{...previewInput,path:'/no-record/'})).status,404);
assert.equal((await call('prepare',{...selection,expectedConfigurationRevision:2})).status,409);
assert.equal((await call('prepare',{...selection,programPaths:['/foreign-program/']})).status,422);
await new SiteConfigurationStore(db,'alpha').save(config,1,now);await assert.rejects(()=>prepare(),/publication_configuration_conflict/);
assert.equal((await call('read',readInput)).status,200); // reopening never recaptures current settings
assert.equal(await store.prepare(artifact,now),hash);assert.equal(await store.active(),null);
assert.equal(await new SitePublicationStore(db,'beta').get(hash),null);
await assert.rejects(()=>new SitePublicationStore(db,'beta').activate(hash,null,now));
const winners=await Promise.all([store.activate(hash,null,now),store.activate(hash,null,now)]);assert.equal(winners.filter(Boolean).length,1);
// Force both admissions to read the SAME prior pointer before either conditional write.
const forcedRace=async(expected,target)=>{
 let arrivals=0,release;const barrier=new Promise(resolve=>release=resolve);
 const racing={exec:db.exec.bind(db),query:async(sql,args)=>{const rows=await db.query(sql,args);
  if(args[0]==='race' && args[1]==='site_publication:active:v1'){if(++arrivals===2)release();await barrier;}return rows;}};
 const raceStore=new SitePublicationStore(racing,'race');
 const results=await Promise.all([raceStore.activate(target,expected,now),raceStore.activate(target,expected,now)]);
 assert.equal(results.filter(Boolean).length,1);return results.find(Boolean);
};
const raceStore=new SitePublicationStore(db,'race');await raceStore.prepare(artifact,now);
const raceFirst=await forcedRace(null,hash);assert.equal(raceFirst.generation,1);
assert.equal((await forcedRace(raceFirst,hash)).generation,2);
const first=await store.active();assert.equal(first.pointer.generation,1);
artifact.records.institutions[0].title='Later draft';assert.equal((await store.get(hash)).records.institutions[0].title,'Muhlenberg College');
const next=await store.prepare(artifact,now);assert.notEqual(next,hash);
assert.equal(await store.activate(next,null,now),null);
const second=await store.activate(next,first.pointer,now);assert.equal(second.generation,2);
assert.equal(await store.activate(hash,first.pointer,now),null); // stale rollback cannot overwrite a later release
const rollback=await store.activate(hash,second,now);assert.equal(rollback.generation,3);assert.equal((await store.active()).artifact.records.institutions[0].title,'Muhlenberg College');
const registry=createSnapshotDirectoryQueries(first.artifact,'alpha');
await assert.rejects(()=>registry['directory.program.list'].execute({}, {tenant:'beta'}));
await assert.rejects(()=>registry['directory.program.list'].execute({provider_id:'PRIVATE'}, {tenant:'alpha'}));
await assert.rejects(()=>registry['directory.program.list'].execute({limit:49}, {tenant:'alpha'}));
assert.deepEqual(await registry['directory.program.list'].execute({institutionId:999},{tenant:'alpha'}),[]);
assert.equal((await registry['directory.article.list'].execute({},{tenant:'alpha'}))[0].body,undefined);
const render=path=>resolveSitePublicationPage(first.artifact,hash,'alpha',new Request('https://usa.test'+path));
for(const [path,title] of [['/muhlenberg-college/','Muhlenberg College'],['/old-parent/dental-program/','Dental program'],['/blog/original-article/','Announcement']]){
 const result=await render(path);assert.equal(result.page.title,title);assert.ok(JSON.stringify(result.page.layout).includes(title));assert.ok(!JSON.stringify(result.page).includes('PRIVATE_'));assert.ok(result.version.startsWith(hash));
}
const institution=await render('/muhlenberg-college/');assert.ok(JSON.stringify(institution.page.layout).includes('Dental program'));assert.ok(!JSON.stringify(institution.page.layout).includes('WRONG-SAMPLE'));
const related=structuredClone(first.artifact);related.templates.find(page=>page.role==='program').layout.content.push(node('parent','directory.institution.detail',{path:'/WRONG-SAMPLE/'}));
assert.ok(JSON.stringify((await resolveSitePublicationPage(related,hash,'alpha',new Request('https://usa.test/old-parent/dental-program/'))).page.layout).includes('Muhlenberg College'));
const manifest={version:'fixture',pages:{},queries:{}};
const engine=createEngine({manifest,data:directProvider(manifest),environment:'edge',resolvePublishedPage:async(path,request)=>(await resolveSitePublicationPage(first.artifact,hash,'alpha',request))?.page??null});
for(const [path,title] of [['/muhlenberg-college/','Muhlenberg College'],['/old-parent/dental-program/','Dental program'],['/blog/original-article/','Announcement']]) {
 const response=await engine.request('https://usa.test'+path);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes(title));assert.ok(!html.includes('PRIVATE_'));assert.ok(!html.includes('WRONG-SAMPLE'));
}
assert.equal((await engine.request('https://usa.test/missing/')).status,404);
assert.equal(await render('/missing/'),null);
await assert.rejects(()=>render('/explore/?type=foreign'));
await assert.rejects(()=>render('/explore/?q=a&q=b'));
await assert.rejects(()=>render('/explore/?page=9999'));
const explore=await render('/explore/?type=program&q=Dental');assert.ok(JSON.stringify(explore.page.layout).includes('Dental program'));
assert.equal(explore.cacheKey,(await render('/explore/?type=program&q=%20Dental%20')).cacheKey);
assert.notEqual(explore.cacheKey,(await render('/explore/?type=institution')).cacheKey);
assert.notEqual(institution.cacheKey,(await resolveSitePublicationPage((await store.get(next)),next,'alpha',new Request('https://usa.test/muhlenberg-college/'))).cacheKey);
assert.notEqual(institution.cacheKey,(await resolveSitePublicationPage(first.artifact,hash,'beta',new Request('https://usa.test/muhlenberg-college/'))).cacheKey);
// Opt-in visitor browsing operates over the same captured slice, never the datasource.
const browsable=structuredClone(artifact);
browsable.templates[0].layout.content.unshift({id:'browse',type:'Container',props:{directoryBrowsing:{version:1,tabs:true,search:true,pagination:true}},children:[]});
for(let n=1;n<=13;n++)browsable.records.institutions.push({...base,id:600+n,title:`Campus ${String(n).padStart(2,'0')}`,originalPath:`/campus-${n}/`,cityId:1});
browsable.templates[0].layout.content.push({id:'program-nav',type:'Link',props:{text:'Find captured programs',href:'/explore/?type=program&q=Dental'}});
const browsableHash=await store.prepare(browsable,now);
const browsingResult=await resolveSitePublicationPage(browsable,browsableHash,'alpha',new Request('https://usa.test/explore/?type=institution'));
assert.equal(browsingResult.page.layout.content[0].props.directoryBrowsingState[0].hasNext,true);
const browsingLast=await resolveSitePublicationPage(browsable,browsableHash,'alpha',new Request('https://usa.test/explore/?type=institution&page=2'));
assert.equal(browsingLast.page.layout.content[0].props.directoryBrowsingState[0].hasNext,false);
assert.equal(browsingLast.page.layout.content[0].props.directoryBrowsingState[0].page,2);
const browsingFiltered=await resolveSitePublicationPage(browsable,browsableHash,'alpha',new Request('https://usa.test/explore/?type=institution&q=Campus%2001'));
assert.equal(browsingFiltered.page.layout.content[0].props.directoryBrowsingState[0].hasNext,false);
const browsingProgram=await resolveSitePublicationPage(browsable,browsableHash,'alpha',new Request('https://usa.test/explore/?type=program'));
assert.equal(browsingProgram.page.layout.content[0].props.directoryBrowsingState[0].collection,'program');
assert.ok(JSON.stringify(browsingProgram.page.layout).includes('Dental program'));assert.ok(!JSON.stringify(browsingProgram.page.layout).includes('Campus 01'));
const privateBrowsingResponse=await app.request(`/api/project/site-configuration/publication/render/?hash=${browsableHash}&path=%2Fexplore%2F&type=institution&page=2&q=Campus`);
assert.equal(privateBrowsingResponse.status,200);
const privateBrowsingBody=await privateBrowsingResponse.text();
assert.ok(privateBrowsingBody.includes('name="hash" value="'+browsableHash+'"'));assert.ok(privateBrowsingBody.includes('name="path" value="/explore/"'));
assert.ok(privateBrowsingBody.includes('>Previous</a>'));assert.ok(!privateBrowsingBody.includes('>Next</a>'));
assert.ok(privateBrowsingBody.includes('hash='+browsableHash+'&amp;path=%2Fexplore%2F&amp;type=program&amp;q=Campus'));
assert.ok(privateBrowsingBody.includes('hash='+browsableHash+'&amp;path=%2Fexplore%2F&amp;type=program&amp;q=Dental'));
assert.equal(privateBrowsingResponse.headers.get('x-robots-tag'),'noindex, nofollow');assert.ok(!privateBrowsingBody.includes('PRIVATE_'));
tenant='beta';assert.equal((await app.request(`/api/project/site-configuration/publication/render/?hash=${browsableHash}&path=%2Fexplore%2F`)).status,404);tenant='alpha';
role='viewer';assert.equal((await app.request(`/api/project/site-configuration/publication/render/?hash=${browsableHash}&path=%2Fexplore%2F`)).status,403);role='owner';
console.log('directory browsing runtime: filtered page boundaries, collection selection, capture-bound private GET controls and owner refusal passed');
// At-rest corruption is opaque and cannot be republished or overwritten by an identical retry.
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',[JSON.stringify({...first.artifact,configurationRevision:2}),'alpha',`site_publication:v1:${hash}`]);
await assert.rejects(()=>store.get(hash),/publication_unavailable/);await assert.rejects(()=>store.active(),/publication_unavailable/);await assert.rejects(()=>store.prepare(first.artifact,now),/publication_unavailable/);
assert.equal((await renderReviewedSitePublication(db,'alpha',new Request('https://usa.test/explore/?page=0'))).status,503);
const failedDb={...db,query:async()=>{throw new Error('publication_params_invalid');}};
assert.equal((await renderReviewedSitePublication(failedDb,'alpha',new Request('https://usa.test/explore/'))).status,503);
console.log('site publication: immutable capture/integrity, CAS races, owner isolation, coherent rollback, original URLs, parent binding, registered snapshot queries and version/parameter cache separation passed');
