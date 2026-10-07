/** Isolated local state only. Proves reviewed capture dispatch in the SAME CMS host. */
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { sqliteRunner } from '@frontbase/edge-infra';
import { PagesStore, TenantStore } from '@frontbase/backend';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { sitePublicationArtifactSchema } from '@frontbase/edge-core/directory/publication';
import { createCmsEngine } from './worker.js';

// Test-only internal stores load from their compiled package so transitive deps resolve there.
// Bundling relative backend source would root external imports in cf-full's strict pnpm tree.
const {SitePublicationStore}=await import(new URL('../../../packages/backend/dist/compat/site-publication-store.js',import.meta.url).href);
const {SitePublicationReviewStore}=await import(new URL('../../../packages/backend/dist/compat/site-publication-review-store.js',import.meta.url).href);

const runner=sqliteRunner('file:'+join(tmpdir(),`frontbase-host-publication-${randomUUID()}.db`).replaceAll('\\','/'));
const now='2026-10-07T12:00:00Z';
const host=await createCmsEngine({runner,sessionSecret:'isolated-publication-host-fixture'});
const loginBaseline=await host.request('https://local.test/frontbase-admin/login');
const config=emptyDirectoryConfiguration();
config.site={name:'Captured USA',destination:'USA',origin:'https://study-in-usa.com',locale:'en'};config.datasourceId='PRIVATE_SOURCE';
for(const role of ['institution','program','city'] as const){const collection=config.collections[role];collection.table='PRIVATE_'+role;collection.scope={field:'country',value:22};collection.fields.id='id';collection.fields.title='title';if(role!=='city')collection.fields.originalPath='wp_url';}
config.collections.institution.fields.cityId='city_id';config.collections.program.fields.institutionId='institution_id';
const queryNode=(id:string,queryId:string)=>({id,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params:queryId.endsWith('.list')?{}:{path:'/WRONG-SAMPLE/'}}},children:[{id:id+'-title',type:'Heading',props:{recordBindings:{text:'title'}}}]});
const artifact=sitePublicationArtifactSchema.parse({schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:1,configuration:config,
    templates:['directory','institution'].map((role,index)=>({pageId:`00000000-0000-4000-8000-00000000000${index}`,role,title:'Captured '+role,description:'Captured description',layout:{root:{siteConfiguration:{version:1,role}},content:[queryNode(role,`directory.institution.${role==='directory'?'list':'detail'}`),{id:role+'-logo',type:'Navbar',props:{logo:{useProjectLogo:true,showIcon:true,text:'Captured'}}}]}})),
    records:{institutions:[{id:512,title:'Reviewed institution',originalPath:'/institution/',cityId:1,summary:'Approved summary',body:null,cover:null,coverAlt:'',logo:null}],programs:[],cities:[{id:1,title:'Captured city'}],articles:[]}});
const legacy=new PagesStore(runner,'_root');
await legacy.create({name:'LEGACY_DECOY',slug:'legacy-only',layout_data:{root:{},content:[{id:'legacy',type:'Heading',props:{text:'LEGACY_DECOY'}}]}},'legacy-decoy',now);
await runner.exec('UPDATE compat_pages SET is_published=1 WHERE tenant_slug=? AND id=?',['_root','legacy-decoy']);
await runner.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_slug,key) DO UPDATE SET value=excluded.value',['_root','project',JSON.stringify({faviconUrl:'https://mutable.invalid/PRIVATE_FAVICON.png'}),now]);
assert.ok((await (await host.request('https://local.test/legacy-only')).text()).includes('LEGACY_DECOY'));
const store=new SitePublicationStore(runner,'_root'),review=new SitePublicationReviewStore(runner,'_root');
const hash=await store.prepare(artifact,now),checks={content:true,media:true,layout:true,urls:true,ctas:true};
await review.approve({hash,checks,note:'PRIVATE_REVIEW_NOTE'},'fixture-reviewer',now);
const first=await review.activate(hash,null,now);assert.ok(first);
let response=await host.request('https://spoofed.test/institution/',{headers:{'x-forwarded-host':'attacker.test'}});
assert.equal(response.status,200);assert.equal(response.headers.get('x-site-version'),hash);assert.equal(response.headers.get('cache-control'),'no-store');
let html=await response.text();assert.ok(html.includes('Reviewed institution'));assert.ok(html.includes('rel="canonical" href="https://study-in-usa.com/institution/"'));assert.ok(!html.includes('PRIVATE_'));assert.ok(html.includes("serviceWorker.register('/sw.js')"));
response=await host.request('https://local.test/institution/',{method:'HEAD'});assert.equal(response.status,200);assert.equal(response.headers.get('x-site-version'),hash);assert.equal(await response.text(),'');
for(const path of ['/legacy-only','/','/missing/']){response=await host.request('https://local.test'+path);assert.equal(response.status,404);assert.ok(!(await response.text()).includes('LEGACY_DECOY'));}
assert.equal((await host.request('https://local.test/api/project/site-configuration/')).status,401);
const loginAfter=await host.request('https://local.test/frontbase-admin/login');assert.equal(loginAfter.status,loginBaseline.status);assert.equal(loginAfter.headers.get('location'),loginBaseline.headers.get('location'));
assert.equal((await host.request('https://local.test/',{headers:{accept:'application/json'}})).status,200);
const sw=await host.request('https://local.test/sw.js');assert.equal(sw.status,200);assert.equal(sw.headers.get('cache-control'),'no-cache');
const listeners:Record<string,(event:any)=>void>={};let claimed=false,skipped=false,intercepted=false;
runInNewContext(await sw.text(),{self:{addEventListener:(type:string,callback:(event:any)=>void)=>{listeners[type]=callback;},skipWaiting:async()=>{skipped=true;},clients:{claim:async()=>{claimed=true;}}},URL,Request,Response,TextEncoder,TextDecoder,crypto:globalThis.crypto,console});
listeners.install!({waitUntil:()=>{}});listeners.activate!({waitUntil:()=>{}});listeners.fetch!({request:new Request('https://local.test/institution/'),respondWith:()=>{intercepted=true;}});
assert.ok(skipped&&claimed);assert.equal(intercepted,false); // emitted current SW replaces older workers, leaves navigation on network
const changed=structuredClone(artifact);changed.records.institutions[0]!.title='Reviewed update';
const next=await store.prepare(changed,now);await review.approve({hash:next,checks,note:'Update'},'fixture-reviewer',now);
const second=await review.activate(next,first,now);assert.ok(second);response=await host.request('https://local.test/institution/');assert.equal(response.headers.get('x-site-version'),next);assert.ok((await response.text()).includes('Reviewed update'));
await review.activate(hash,second,now);response=await host.request('https://local.test/institution/');assert.equal(response.headers.get('x-site-version'),hash);assert.equal(response.headers.get('x-site-generation'),'3');
await runner.exec('DELETE FROM settings WHERE tenant_slug=? AND key=?',['_root',`site_publication:review:v1:${hash}`]);response=await host.request('https://local.test/legacy-only');assert.equal(response.status,503);assert.equal(await response.text(),'Site unavailable');

const cloud=await createCmsEngine({runner,sessionSecret:'isolated-publication-cloud-fixture',cloud:{baseDomain:'frontbase.test'}});
const tenants=new TenantStore(runner);await tenants.createTenant('acme','Acme',now);await tenants.createTenant('globex','Globex',now);
await tenants.updateTenant('acme',{plan:'free',status:'active'});await tenants.updateTenant('globex',{plan:'free',status:'active'});
const acme=new SitePublicationStore(runner,'acme'),acmeReview=new SitePublicationReviewStore(runner,'acme');
await acme.prepare(artifact,now);await acmeReview.approve({hash,checks,note:'Acme'},'acme-reviewer',now);await acmeReview.activate(hash,null,now);
response=await cloud.request('https://acme.frontbase.test/institution/',{headers:{host:'acme.frontbase.test'}});assert.equal(response.status,200);assert.equal(response.headers.get('x-site-version'),hash);
response=await cloud.request('https://globex.frontbase.test/institution/',{headers:{host:'globex.frontbase.test'}});assert.equal(response.status,404);assert.equal(response.headers.get('x-site-version'),null);
assert.equal((await cloud.request('https://unknown.frontbase.test/institution/',{headers:{host:'unknown.frontbase.test'}})).status,404);
console.log('publication host: inactive compatibility, terminal failures, captured metadata, HEAD, infrastructure routes, network-only SW lifecycle, update/rollback and Cloud owner isolation passed');
