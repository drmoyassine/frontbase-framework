// Synthetic full-host dispatch proof; no saved pilot database, external fetch or real activation.
import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { createCmsEngine } from '../dist/worker.mjs';
import { SitePublicationStore } from '../../../packages/backend/dist/compat/site-publication-store.js';
import { SitePublicationReviewStore } from '../../../packages/backend/dist/compat/site-publication-review-store.js';
const db=sqliteRunner(':memory:');
const host=await createCmsEngine({runner:db,sessionSecret:'synthetic-route-dispatch-secret'});
const now='2026-10-10T00:00:00Z';
await db.exec('INSERT INTO compat_pages (id,tenant_slug,name,slug,layout_data,is_published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    ['college','_root','Legacy college','College','{"root":{},"content":[{"id":"title","type":"Heading","props":{"text":"LEGACY_COLLEGE"}}]}',1,now,now]);
const call=path=>host.request('https://synthetic.example'+path,{headers:{accept:'text/html'}});
for(const path of ['/College','/College/','/%43ollege/']) {const r=await call(path);assert.equal(r.status,200,path);assert.ok((await r.text()).includes('LEGACY_COLLEGE'));}
assert.equal((await call('/college/')).status,404);
const configuration=emptyDirectoryConfiguration();configuration.site={name:'Synthetic',destination:'USA',origin:'https://synthetic.example',locale:'en'};configuration.datasourceId='synthetic';
for(const role of ['institution','program','city']) {const m=configuration.collections[role];m.table=role;m.scope={field:'country',value:22};m.fields.id='id';m.fields.title='title';if(role!=='city')m.fields.originalPath='path';}
configuration.collections.institution.fields.cityId='city_id';configuration.collections.program.fields.institutionId='institution_id';
const node=(id,queryId)=>({id,type:queryId.endsWith('.list')?'Repeater':'Container',props:{directoryQuery:{version:1,queryId,params:queryId.endsWith('.detail')?{path:'/WRONG-SAMPLE/'}:{}}},children:[{id:id+'-title',type:'Heading',props:{recordBindings:{text:'title'}}}]});
const artifact={schemaVersion:1,runtimeVersion:'directory-snapshot-v1',configurationRevision:1,configuration,
    templates:['directory','institution'].map((role,i)=>({pageId:`00000000-0000-4000-8000-00000000000${i}`,role,title:role,description:'',layout:{root:{siteConfiguration:{version:1,role}},content:[node('detail',role==='directory'?'directory.institution.list':'directory.institution.detail')]}})),
    records:{cities:[{id:1,title:'City'}],institutions:[{id:1,title:'CAPTURED_COLLEGE',cityId:1,originalPath:'/College/',summary:'',cover:null,coverAlt:'',logo:null}],programs:[],articles:[]}};
const store=new SitePublicationStore(db,'_root'),reviews=new SitePublicationReviewStore(db,'_root');
const hash=await store.prepare(artifact,now);await reviews.approve({hash,checks:{content:true,media:true,layout:true,urls:true,ctas:true},note:'Synthetic fixture'},'synthetic-reviewer',now);assert.ok(await reviews.activate(hash,null,now));
let r=await call('/College/');assert.equal(r.status,200);assert.equal(r.headers.get('x-site-version'),hash);const html=await r.text();assert.ok(html.includes('CAPTURED_COLLEGE'));assert.ok(!html.includes('LEGACY_COLLEGE'));assert.ok(html.includes('https://synthetic.example/College/'));
for(const path of ['/College','/%43ollege/','/college/','/missing/','/']) {r=await call(path);assert.equal(r.status,404,path);assert.ok(!(await r.text()).includes('LEGACY_COLLEGE'));}
r=await call('/explore/');assert.equal(r.status,200);assert.equal(r.headers.get('x-site-version'),hash);
r=await call('/api/project/page-route-audit/');assert.equal(r.status,401);assert.equal(r.headers.get('x-site-version'),null);
r=await call('/frontbase-setup/spa.js');assert.equal(r.headers.get('x-site-version'),null);assert.ok(!(await r.text()).includes('CAPTURED_COLLEGE'));
console.log('full-host route dispatch: legacy decode/slash, exact reviewed capture, no mutable/root fallback, API auth and reserved asset separation pass');
