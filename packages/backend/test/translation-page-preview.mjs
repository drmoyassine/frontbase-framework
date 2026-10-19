import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';
const root = '/api/project/translation-batches/page-preview/';
const f = await allowanceFixture(), pages = new PagesStore(f.db, 'alpha');
const nodes = [{ id:'title', type:'Heading', props:{content:'Explore institutions'} }, { id:'bound', type:'Repeater', children:[{id:'child',type:'Text',props:{content:'Do not translate record template'}}] }];
await pages.create({name:'Home',slug:'home',layout_data:{content:nodes,root:{}}},'home',now);
await new PagesStore(f.db,'beta').create({name:'Other',slug:'other',layout_data:{content:nodes,root:{}}},'foreign',now);
let role='owner', tenant='alpha', authenticated=true, unavailable=false;
for(const key of ['translation_batch:v1:held','translation_allowance:v1']) await f.db.exec('INSERT INTO settings (tenant_slug,key,value,updated_at) VALUES (?,?,?,?)',['alpha',key,'preserved-held-marker',now]);
let app=await createCompatApp({makeRunner:()=>f.db,sessionSecret:'allowance-private-fixture',now:()=>now,externalFetch:(...args)=>{if(unavailable)throw Error('PRIVATE_REMOTE');return f.host.externalFetch(...args)},
 resolvePrincipal:async()=>({user:authenticated?{id:'editor',role}:null,tenant})});
async function req(path,body){return app.request(root+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
async function preview(){const r=await req('home/?locale=ar');assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('cache-control'),'no-store');const v=await r.json();assert.doesNotMatch(JSON.stringify(v),/PRIVATE_|serviceKey|data\.example/);return v;}
const save=(field,text)=>req('field/',{selection:field.selection,locale:'ar',token:field.token,text});
try {
 const original=(await pages.get('home')).layout_data;
 let p=await preview();assert.equal(p.fields.length,1);assert.equal(p.fields[0].state,'missing');
 const stale=p.fields[0], r=await save(stale,'استكشاف المؤسسات');assert.equal(r.status,200,await r.clone().text());p=await r.json();
 assert.equal(p.fields[0].state,'draft');assert.equal(p.fields[0].provenance,'manual');assert.equal(p.fields[0].translation,'استكشاف المؤسسات');
 assert.equal((await pages.get('home')).layout_data,original,'manual draft must not edit page');
 assert.equal((await save(stale,'stale writer')).status,409);assert.equal((await preview()).fields[0].translation,'استكشاف المؤسسات');
 assert.equal((await save(p.fields[0],'<script>bad</script>')).status,409);
 assert.equal((await req('home/?locale=fr')).status,422);assert.equal((await req('foreign/?locale=ar')).status,422);
 for(const denied of ['viewer','user']){role=denied;assert.equal((await req('home/?locale=ar')).status,403);assert.equal((await save(p.fields[0],'x')).status,403);}role='owner';
 authenticated=false;assert.equal((await req('home/?locale=ar')).status,401);assert.equal((await save(p.fields[0],'x')).status,401);authenticated=true;
 tenant='beta';assert.equal((await req('home/?locale=ar')).status,422);assert.equal((await save(p.fields[0],'x')).status,409);tenant='alpha';
 await pages.update('home',{layoutData:{content:[{...nodes[0],props:{content:'Source changed'}},nodes[1]],root:{}}},now);
 assert.equal((await save(p.fields[0],'outdated writer')).status,409);p=await preview();assert.equal(p.fields[0].state,'outdated');assert.equal(p.fields[0].translation,null);
 const current=p.fields[0];const results=await Promise.all([save(current,'إصدار واحد'),save(current,'إصدار آخر')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 p=await preview();assert.equal(p.fields[0].state,'draft');
 const {TranslationLifecycle}=await import('@frontbase/edge-core/localization');
 const stored=await f.f.store.read(f.scope,await (await import('@frontbase/edge-core/localization')).translationUnitId(f.scope,{kind:'component',documentId:'home',blockId:'title',versionId:'default',propertyPath:['props','content']}), 'ar');
 const manual=stored.head;const protectedResult=await new TranslationLifecycle(f.f.store).writeGenerated(f.scope,{version:1,unitId:manual.unitId,locale:manual.locale,sourceVersion:manual.sourceVersion,sourceFingerprint:manual.sourceFingerprint,contextFingerprint:manual.contextFingerprint,revisionId:'new-generated',expectedHead:manual.revisionId,text:'replacement'});
 assert.equal(protectedResult.reason,'manual-protected');
 unavailable=true;const outage=await req('home/?locale=ar');assert.equal(outage.status,422);assert.doesNotMatch(await outage.text(),/PRIVATE_REMOTE/);unavailable=false;
 // Configuration changes invalidate the optimistic token even when the page is untouched.
 await f.generation.save({...f.configuration,targetLocales:['ar','fr']},1,now);assert.equal((await save(p.fields[0],'old settings')).status,409);
 assert.equal(f.aiCalls(),0);const retained=await f.db.query("SELECT value FROM settings WHERE key LIKE 'translation_batch:%' OR key LIKE 'translation_allowance:%'");assert.equal(retained.length,2);assert.ok(retained.every(row=>row.value==='preserved-held-marker'),'held batches/allowances unchanged');
 console.log('translation-page-preview: manual reload, source isolation, CAS, freshness, auth/tenant, settings and zero-provider gates pass');
} finally { f.close(); }
