/** Synthetic-only approvals in a temporary database. Never touches the saved pilot. */
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration,siteConfigurationDraftSchema } from '@frontbase/edge-core/directory/configuration';
import { sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
const require=createRequire(import.meta.url),{build}=require('../../../node_modules/esbuild');
const {createCmsEngine}=await import('../dist/worker.mjs');
const {EditorialApprovalStore}=await import('../../../packages/backend/dist/compat/editorial-approval-store.js');
const {SitePublicationStore}=await import('../../../packages/backend/dist/compat/site-publication-store.js');
const {SitePublicationReviewStore}=await import('../../../packages/backend/dist/compat/site-publication-review-store.js');
const evidence=mkdtempSync(join(tmpdir(),'frontbase-template-proof-'));
const bundle=resolve('test/.template-generators-proof.mjs');
await build({stdin:{contents:"export {addDirectoryTemplate} from '../../../packages/console/src/components/builder/directory/addDirectoryTemplate.ts'; export {addSharedPageHeader} from '../../../packages/console/src/components/builder/directory/linkSharedConfiguration.ts';",resolveDir:resolve('test'),loader:'ts'},bundle:true,platform:'node',packages:'external',format:'esm',outfile:bundle});
const {addDirectoryTemplate,addSharedPageHeader}=await import(pathToFileURL(bundle).href);
const db=sqliteRunner('file:'+join(evidence,'state.db').replaceAll('\\','/'));
const host=await createCmsEngine({runner:db,sessionSecret:'isolated-template-proof'});
const now='2026-10-07T12:00:00Z',config=emptyDirectoryConfiguration();
config.site={name:'Reusable editorial site',destination:'Destination',origin:'https://editorial.example.test',locale:'en-GB'};
config.datasourceId='PRIVATE_SOURCE';
for(const role of ['institution','program','city']) {const c=config.collections[role];c.table='PRIVATE_'+role;c.scope={field:'country',value:22};c.fields.id='id';c.fields.title='title';if(role!=='city')c.fields.originalPath='wp_url';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const draft=siteConfigurationDraftSchema.parse({schemaVersion:1,revision:1,configuration:config});
await db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)',['_root','site_configuration:v1',JSON.stringify(draft),now]);
const approval=new EditorialApprovalStore(db,'_root');
const snapshots=[],documents=[];
for(const [index,coverUrl,publishedAt] of [[0,null,'2025-04-19T23:30:00-02:00'],[1,'https://media.example.test/cover.png',null]]) {
 const document={id:`00000000-0000-4000-8000-00000000009${index}`,revision:1,originalPath:`/blog/original-${index}/`,title:`Article ${index}: `+'A long institution and scholarship announcement '.repeat(4),excerpt:'A long summary that remains readable across narrow and wide screens. '.repeat(10),body:[{kind:'heading',level:2,runs:[{text:'A long section heading about international study and scholarships'}]},{kind:'paragraph',runs:[{text:'Meaningful editorial body text with readable paragraphs. '.repeat(50)}]},{kind:'paragraph',runs:[{text:'Escaped <script>alert(1)</script> and literal {{ user.private }} '}]}],language:'en',byline:'Public author',publishedAt,coverUrl,coverAlt:'Synthetic cover',reviewState:'requested',reviewNote:'PRIVATE_ARTICLE_REVIEW'};
 documents.push(document);
 const approved=await approval.approve(document,draft,'synthetic-reviewer','PRIVATE_APPROVAL_NOTE',{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true},now);assert.ok(approved);
 const snapshot=await approval.snapshot(document.id,1,draft,approved.fingerprint);assert.ok(snapshot);
 const {excerpt,coverUrl:cover,...rest}=snapshot;snapshots.push({...rest,summary:excerpt,cover,logo:null});
}
const templates=['article-index','article'].map((role,index)=>{
 let page={layoutData:{root:{siteConfiguration:{version:1,role}},content:[]}};
 page.layoutData=addSharedPageHeader(page);page.layoutData=addDirectoryTemplate(page,{version:1,queryId:role==='article'?'directory.article.detail':'directory.article.list',params:role==='article'?{path:'/WRONG_AUTHORING_SAMPLE/'}:{}});
 return {pageId:`00000000-0000-4000-8000-00000000000${index}`,role,title:role,description:'Editorial fixture',layout:page.layoutData};
});
const artifact=sitePublicationArtifactSchema.parse({schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:1,configuration:config,templates,records:{institutions:[],programs:[],cities:[],articles:snapshots}});
const store=new SitePublicationStore(db,'_root'),review=new SitePublicationReviewStore(db,'_root');
const hash=await store.prepare(artifact,now);await review.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'PRIVATE_SITE_REVIEW'},'synthetic-reviewer',now);assert.ok(await review.activate(hash,null,now));
const responses=new Map();
for(const path of ['/blog/','/blog/original-0/','/blog/original-1/']) {
 const response=await host.request('https://editorial.example.test'+path);assert.equal(response.status,200);assert.equal(response.headers.get('x-site-version'),hash);assert.equal(response.headers.get('cache-control'),'no-store');
 const html=await response.text();assert.ok(!html.includes('PRIVATE_'));assert.ok(!html.includes('<script>alert(1)'));assert.ok(!html.includes('WRONG_AUTHORING_SAMPLE'));assert.ok(!html.includes('Email a counselor'));assert.ok(!html.includes('>WhatsApp<'));assert.ok(html.includes('Reusable editorial site'));assert.ok(html.includes('Destination'));assert.ok(html.includes('rel="canonical" href="https://editorial.example.test'+path+'"'));
 if(path==='/blog/') {assert.ok(html.includes('href="/blog/original-0/"'));assert.ok(html.includes('href="/blog/original-1/"'));}
 if(path.endsWith('0/')) assert.ok(html.includes('20 April 2025'));
 if(path.endsWith('1/')) {assert.ok(html.includes('https://media.example.test/cover.png'));assert.ok(!html.includes('Original publication date'));}
 responses.set(path,html);writeFileSync(join(evidence,path==='/blog/'?'index.html':path.includes('0/')?'empty-cover.html':'cover.html'),html);
}
const updated=structuredClone(artifact);updated.configuration.contacts={email:'counselor@example.test',whatsapp:'https://wa.me/123456789'};
const configuredDraft=siteConfigurationDraftSchema.parse({schemaVersion:1,revision:2,configuration:updated.configuration});
await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',[JSON.stringify(configuredDraft),'_root','site_configuration:v1']);
updated.configurationRevision=2;updated.configuration=configuredDraft.configuration;updated.records.articles=[];
for(const document of documents) {
 const previous=await approval.get(document.id,1,1);assert.ok(previous);
 assert.equal(await approval.snapshot(document.id,1,configuredDraft,previous.fingerprint),null);
 const approved=await approval.approve(document,configuredDraft,'synthetic-reviewer','PRIVATE_CONFIGURED_APPROVAL',{facts:true,language:true,media:true,formatting:true,urls:true,ctas:true},now);assert.ok(approved);
 const snapshot=await approval.snapshot(document.id,1,configuredDraft,approved.fingerprint);assert.ok(snapshot);
 const {excerpt,coverUrl:cover,...rest}=snapshot;updated.records.articles.push({...rest,summary:excerpt,cover,logo:null});
}
const fullHash=await store.prepare(updated,now);await review.approve({hash:fullHash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Synthetic configured contacts'},'synthetic-reviewer',now);assert.ok(await review.activate(fullHash,(await store.active()).pointer,now));
const configured=await (await host.request('https://editorial.example.test/blog/')).text();assert.ok(configured.includes('mailto:counselor@example.test'));assert.ok(configured.includes('https://wa.me/123456789'));
// Network browser requests use the same normal host dispatcher, no injected CSS.
const server=createServer(async(req,res)=>{try {const response=await host.request(`http://127.0.0.1${req.url}`,{headers:{host:'127.0.0.1'}});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500);res.end(String(error));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
// Visible deterministic raster fixture; no remote media or connected bucket access.
const chunk=(kind,bytes)=>{const type=Buffer.from(kind),input=Buffer.concat([type,bytes]);let crc=0xffffffff;for(const byte of input){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(bytes.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,input,sum]);};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(480,0);ihdr.writeUInt32BE(180,4);ihdr[8]=8;ihdr[9]=2;
const pixels=Buffer.alloc((480*3+1)*180);for(let y=0;y<180;y++)for(let x=0;x<480;x++){const offset=y*(480*3+1)+1+x*3;pixels[offset]=26+Math.floor(x/8);pixels[offset+1]=98+Math.floor(y/6);pixels[offset+2]=110;}
const cover=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const browserProjection=await build({stdin:{contents:`import {projectDirectoryRecords} from '@frontbase/edge-core/directory/configuration'; export function date(value,locale){const layout={root:{},content:[{id:'dates',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.article.list',params:{}}},children:[{id:'date',type:'Paragraph',props:{recordBindings:{text:'publishedAt',format:'date'}}}]}]};return projectDirectoryRecords(layout,new Map([['dates',[{publishedAt:value}]]]),{locale}).content[0].children[0].props.text||'';}`,resolveDir:resolve('.'),loader:'js'},bundle:true,platform:'browser',format:'iife',globalName:'TemplateProjectionFixture',write:false});
const browser=await chromium.launch({headless:true}),results=[];
try {
 const context=await browser.newContext({serviceWorkers:'block',timezoneId:'Pacific/Honolulu'});
 await context.route('https://media.example.test/**',route=>route.fulfill({contentType:'image/png',body:cover}));
 const page=await context.newPage();
 for(const contacts of ['configured','empty']) {
  const target=contacts==='configured'?fullHash:hash;assert.ok(await review.activate(target,(await store.active()).pointer,now));
 for(const width of [375,768,1280]) for(const path of ['/blog/','/blog/original-0/','/blog/original-1/']) {
  await page.setViewportSize({width,height:900});await page.goto(origin+path);await page.waitForLoadState('networkidle');
  await page.addScriptTag({content:browserProjection.outputFiles[0].text});
  const browserDates=await page.evaluate(()=>[TemplateProjectionFixture.date('2025-04-19T23:30:00-02:00','en-GB'),TemplateProjectionFixture.date('2025-04-19','fr'),TemplateProjectionFixture.date('2025-02-29','en')]);
  assert.deepEqual(browserDates,['20 April 2025','19 avril 2025','']);
  const proof=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,columns:getComputedStyle(document.querySelector('.grid')||document.body).gridTemplateColumns,images:[...document.querySelectorAll('img')].map(img=>({loaded:img.complete&&img.naturalWidth>0,src:img.getAttribute('src')})),links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),body:document.body.innerText}));
  assert.equal(proof.overflow,0,`${path}@${width}`);assert.equal(proof.links.includes('mailto:counselor@example.test'),contacts==='configured');assert.equal(proof.links.includes('https://wa.me/123456789'),contacts==='configured');assert.ok(!proof.body.includes('PRIVATE_'));
  if(path==='/blog/') {assert.equal(proof.columns.split(' ').length,width<768?1:width<1024?2:3);assert.ok(proof.links.includes('/blog/original-0/'));await page.getByRole('link',{name:'Read article'}).first().click();assert.ok(page.url().endsWith('/blog/original-0/'));await page.goto(origin+path);}
  else {assert.ok(!proof.body.includes('Read article'));if(path.endsWith('0/')) {assert.equal(proof.images.length,0);assert.ok(proof.body.includes('20 April 2025'));}else {assert.ok(proof.images.some(image=>image.loaded));}}
  await page.screenshot({path:join(evidence,`${contacts}-${path==='/blog/'?'index':path.includes('0/')?'empty':'covered'}-${width}.png`),fullPage:true});results.push({contacts,path,width,overflow:proof.overflow,columns:proof.columns,images:proof.images});
 }
 }
 writeFileSync(join(evidence,'results.json'),JSON.stringify({syntheticOnly:true,hash,configuredHash:fullHash,results},null,2));
 console.log(JSON.stringify({syntheticOnly:true,evidence,viewportChecks:results.length,contacts:'empty hidden; configured visible',dates:'UTC captured locale and browser projection parity',normalCss:true}));
}finally {await browser.close();await new Promise(resolve=>server.close(resolve));rmSync(bundle,{force:true});}
