import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
import { SitePublicationStore } from '../dist/compat/site-publication-store.js';
import { SitePublicationReviewStore } from '../dist/compat/site-publication-review-store.js';
import { renderReviewedSitePublication } from '../dist/compat/site-publication-serving.js';
import { migrateUp } from '../dist/db/migrations.js';
import { SiteConfigurationStore } from '../dist/compat/site-configuration-store.js';

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

const request = (path, method='GET') => new Request('https://spoofed.test'+path, {method,headers:{'x-forwarded-host':'attacker.test'}});
const checks={content:true,media:true,layout:true,urls:true,ctas:true};
const store=new SitePublicationStore(db,'seo'),review=new SitePublicationReviewStore(db,'seo');
const sitemap = () => renderReviewedSitePublication(db,'seo',request('/sitemap.xml'));
assert.equal(await sitemap(),null);
const capture=structuredClone(artifact);
capture.records.institutions[0].title='College " ><script>EVIL</script> &';
capture.records.institutions[0].summary='Summary " ><script>EVIL</script> &';
capture.records.institutions[0].cover='https://media.test/cover.webp';
capture.records.institutions[0].coverAlt='Cover " <evil> &';
capture.records.articles[0].language='ar';
// Literal ampersands and encoded XML-sensitive characters stay escaped in sitemap URLs.
capture.records.articles[0].originalPath='/blog/a&b%3Ctest%3E/';
const hash=await store.prepare(capture,now);
await review.approve({hash,checks,note:'SEO fixture'},'reviewer',now);
const first=await review.activate(hash,null,now);
let response=await sitemap();assert.equal(response.status,200);
assert.equal(response.headers.get('content-type'),'application/xml; charset=utf-8');
assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
assert.equal(response.headers.get('x-site-version'),hash);assert.equal(response.headers.get('x-site-generation'),'1');
const xml=await response.text();
assert.equal((xml.match(/<url>/g)||[]).length,5);
for(const path of ['/explore/','/blog/','/muhlenberg-college/','/old-parent/dental-program/','/blog/a&amp;b%3Ctest%3E/'])assert.ok(xml.includes('https://study-in-usa.com'+path));
assert.ok(!/PRIVATE_|spoofed|attacker|lastmod|reviewer|SEO fixture/.test(xml));
response=await renderReviewedSitePublication(db,'seo',request('/sitemap.xml','HEAD'));assert.equal(response.status,200);assert.equal(await response.text(),'');assert.equal(response.headers.get('x-site-version'),hash);
response=await renderReviewedSitePublication(db,'seo',request('/muhlenberg-college/'));assert.equal(response.headers.get('x-robots-tag'),'index, follow');
let html=await response.text();assert.ok(html.includes('<meta name="robots" content="index, follow">'));
assert.ok(html.includes('property="og:title" content="College &quot; &gt;&lt;script&gt;EVIL&lt;/script&gt; &amp;"'));
assert.ok(html.includes('property="og:image" content="https://media.test/cover.webp"'));
assert.ok(html.includes('property="og:image:alt" content="Cover &quot; &lt;evil&gt; &amp;"'));
assert.ok(html.includes('property="og:url" content="https://study-in-usa.com/muhlenberg-college/"'));
assert.ok(!html.includes('<script>EVIL</script>'));assert.ok(!html.includes('spoofed.test'));
for(const query of ['?page=2','?q=College','?type=program','?q=']) {
 response=await renderReviewedSitePublication(db,'seo',request('/explore/'+query));assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'noindex, follow');
 html=await response.text();assert.ok(html.includes('name="robots" content="noindex, follow"'));assert.ok(html.includes('rel="canonical" href="https://study-in-usa.com/explore/"'));
}
response=await renderReviewedSitePublication(db,'seo',request(capture.records.articles[0].originalPath));html=await response.text();assert.ok(html.includes('<html lang="ar">'));assert.ok(html.includes('property="og:type" content="article"'));assert.ok(!html.includes('property="og:image"'));
for(const path of ['/sitemap.xml?x=1','/explore/?unknown=1','/explore/?page=2&page=3','/muhlenberg-college/?q=x'])assert.equal((await renderReviewedSitePublication(db,'seo',request(path))).status,503);
assert.equal((await renderReviewedSitePublication(db,'seo',request('/not-captured/'))).status,404);
assert.equal(await renderReviewedSitePublication(db,'foreign',request('/sitemap.xml')),null);
// Changed mutable drafts cannot affect either public metadata or sitemap.
await new SiteConfigurationStore(db,'seo').save({...config,site:{...config.site,origin:'https://mutable.test'}},0,now);
assert.equal(await (await sitemap()).text(),xml);
const next=structuredClone(capture);next.records.articles=[];next.records.institutions[0].title='Updated capture';
const nextHash=await store.prepare(next,now);
const injected=await store.activate(nextHash,first,now);response=await sitemap();assert.equal(response.status,503);assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
await review.approve({hash:nextHash,checks,note:'Second SEO fixture'},'reviewer',now);
const second=await review.activate(nextHash,injected,now);response=await sitemap();assert.equal(response.headers.get('x-site-version'),nextHash);assert.equal(response.headers.get('x-site-generation'),String(second.generation));
let nextXml=await response.text();assert.equal((nextXml.match(/<url>/g)||[]).length,3);assert.ok(!nextXml.includes('/blog/'));
const rollback=await review.activate(hash,second,now);response=await sitemap();assert.equal(response.headers.get('x-site-generation'),String(rollback.generation));assert.equal(await response.text(),xml);
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?',['{}','seo',`site_publication:review:v1:${hash}`]);response=await renderReviewedSitePublication(db,'seo',request('/sitemap.xml','HEAD'));assert.equal(response.status,503);assert.equal(await response.text(),'');
for(const path of ['/sitemap.xml','/sitemap.xml/','/SITEMAP.XML','/%73itemap.xml']) {const invalid=structuredClone(capture);invalid.records.institutions[0].originalPath=path;assert.equal(sitePublicationArtifactSchema.safeParse(invalid).success,false);}
await assert.rejects(()=>renderReviewedSitePublication(db,'seo',request('/sitemap.xml','POST')),/publication_method_invalid/);
const articleOnly=structuredClone(capture);articleOnly.records.institutions=[];articleOnly.records.programs=[];articleOnly.records.cities=[];articleOnly.templates=articleOnly.templates.filter(template=>['article-index','article'].includes(template.role));
const articleStore=new SitePublicationStore(db,'article-only'),articleReview=new SitePublicationReviewStore(db,'article-only');const articleHash=await articleStore.prepare(articleOnly,now);await articleReview.approve({hash:articleHash,checks,note:'Article only'},'reviewer',now);await articleReview.activate(articleHash,null,now);
const articleXml=await (await renderReviewedSitePublication(db,'article-only',request('/sitemap.xml'))).text();assert.equal((articleXml.match(/<url>/g)||[]).length,2);assert.ok(!articleXml.includes('/explore/'));
// A pointer changing during exact-review read cannot mix the first capture with a second version.
const coherentStore=new SitePublicationStore(db,'coherent'),coherentReview=new SitePublicationReviewStore(db,'coherent');
await coherentStore.prepare(capture,now);await coherentStore.prepare(next,now);
for(const version of [hash,nextHash])await coherentReview.approve({hash:version,checks,note:'Coherent capture'},'reviewer',now);
const coherentFirst=await coherentReview.activate(hash,null,now);let activeReads=0,shifted=false;
const switchingDb={exec:db.exec.bind(db),query:async(sql,args)=>{const rows=await db.query(sql,args);
 if(args?.[0]==='coherent'&&args?.[1]==='site_publication:active:v1')activeReads++;
 if(!shifted&&args?.[0]==='coherent'&&args?.[1]===`site_publication:review:v1:${hash}`){shifted=true;await coherentReview.activate(nextHash,coherentFirst,now);}return rows;}};
response=await renderReviewedSitePublication(switchingDb,'coherent',request('/sitemap.xml'));assert.equal(response.headers.get('x-site-version'),hash);assert.equal(response.headers.get('x-site-generation'),'1');assert.equal(await response.text(),xml);assert.equal(activeReads,1);assert.equal((await coherentStore.active()).pointer.hash,nextHash);
for(const cover of ['https://media.test/cover.svg','https://media.test/cover.webp?token=PRIVATE','http://media.test/cover.webp']){const invalid=structuredClone(capture);invalid.records.institutions[0].cover=cover;assert.equal(sitePublicationArtifactSchema.safeParse(invalid).success,false);}
console.log('captured publication SEO: PASS (metadata, indexing, sitemap, owner/review/version, HEAD/update/rollback)');
