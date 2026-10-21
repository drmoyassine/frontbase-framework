import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';
const root = '/api/project/translation-batches/page-preview/';
const f = await allowanceFixture(), pages = new PagesStore(f.db, 'alpha');
const nodes = [{ id:'title', type:'Heading', props:{content:'Explore institutions'} }, { id:'bound', type:'Repeater', children:[{id:'child',type:'Text',props:{content:'Do not translate record template'}}] }];
const versionedNodes = [
 { id:'hero', type:'Heading', props:{content:'Study in the USA'}, versions:[
  { id:'ar-variant', name:'Arabic variant', overrides:{props:{content:'Version override'}} },
  { id:'same', name:'Equal text', overrides:{props:{content:'Study in the USA'}} }] },
 { id:'plain', type:'Text', props:{content:'Plain body'} },
 { id:'wrap', type:'Text', props:{content:'Wrapper'}, versions:[
  { id:'kids', name:'Kids', overrides:{children:[{ id:'kid', type:'Text', props:{content:'Override child text'} }]} }] },
 { id:'panel', type:'Text', props:{content:'Bound source'}, versions:[
  { id:'bk', name:'Bound alternative', overrides:{props:{binding:{resource:'x'}}} }] }];
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
 // Block Version alternatives: true overrides own distinct units; equal text shares Default; bound stays excluded.
 await pages.create({name:'Programs',slug:'programs',layout_data:{content:versionedNodes,root:{}}},'programs',now);
 const vp0=await req('programs/?locale=ar');assert.equal(vp0.status,200);const v0=await vp0.json();
 assert.deepEqual(v0.fields.map(field=>(field.selection.versionId??'')+'·'+field.selection.blockId),
  ['·hero','ar-variant·hero','·plain','·wrap','kids·kid','·panel'],'equal-text alternative shares Default; bound alternatives excluded');
 const alt=v0.fields[1];assert.equal(alt.selection.versionId,'ar-variant');assert.equal(alt.source,'Version override');assert.equal(alt.state,'missing');
 assert.equal(v0.fields[4].source,'Override child text');assert.equal(v0.fields[4].selection.versionId,'kids');
 const savedAlt=await save(alt,'نص البديل');assert.equal(savedAlt.status,200);const v1=await savedAlt.json();
 assert.equal(v1.fields[1].state,'draft');assert.equal(v1.fields[1].translation,'نص البديل');assert.equal(v1.fields[1].provenance,'manual');
 assert.equal(v1.fields[0].state,'missing','the Default unit is untouched by an alternative draft');
 for(const versionId of ['same','default','nope'])
  assert.equal((await save({...alt,selection:{...alt.selection,versionId},token:alt.token},'x')).status,409,versionId+' must not own a unit');
 const localization=await import('@frontbase/edge-core/localization');
 const altStored=await f.f.store.read(f.scope,await localization.translationUnitId(f.scope,
  {kind:'component',documentId:'programs',blockId:'hero',versionId:'ar-variant',propertyPath:['props','content']}),'ar');
 assert.equal(altStored.head?.provenance,'manual');
 const protectAlt=await new localization.TranslationLifecycle(f.f.store).writeGenerated(f.scope,{version:1,unitId:altStored.head.unitId,locale:'ar',
  sourceVersion:altStored.head.sourceVersion,sourceFingerprint:altStored.head.sourceFingerprint,contextFingerprint:altStored.head.contextFingerprint,
  revisionId:'alt-generated',expectedHead:altStored.head.revisionId,text:'replacement'});
 assert.equal(protectAlt.reason,'manual-protected','version-owned units get the same manual protection');
 const batchFields=await app.request('/api/project/translation-batches/sources/programs/');assert.equal(batchFields.status,200);
 assert.deepEqual((await batchFields.json()).items.map(item=>item.selection),[
  {pageId:'programs',blockId:'hero',field:'content'},{pageId:'programs',blockId:'plain',field:'content'},
  {pageId:'programs',blockId:'wrap',field:'content'},{pageId:'programs',blockId:'panel',field:'content'}],'the batch flow stays Default-only');
 // Allowlist parity with the release surfaces: the six text types expose the release key order and
 // Link/Button/Badge/Image/Input/Textarea/Select plain display fields are batch-selectable. One
 // translatable field per node still holds — later keys on the same node stay release-only.
 await pages.create({name:'Widgets',slug:'widgets',layout_data:{content:[
  {id:'doc-link',type:'Link',props:{text:'Apply now',label:'Apply label',ariaLabel:'Apply here',href:'/apply/'}},
  {id:'go-btn',type:'Button',props:{label:'Press me'}},
  {id:'pic',type:'Image',props:{src:'https://cdn.example.org/x.png',alt:'Campus photo'}},
  {id:'find',type:'Input',props:{placeholder:'Search programs'}}],root:{}}},'widgets',now);
 const wideFields=await app.request('/api/project/translation-batches/sources/widgets/');assert.equal(wideFields.status,200);
 assert.deepEqual((await wideFields.json()).items.map(item=>item.selection),[
  {pageId:'widgets',blockId:'doc-link',field:'text'},{pageId:'widgets',blockId:'go-btn',field:'label'},
  {pageId:'widgets',blockId:'pic',field:'alt'},{pageId:'widgets',blockId:'find',field:'placeholder'}],'first-present plain display field per node');
 const wp=await req('widgets/?locale=ar');assert.equal(wp.status,200,await wp.clone().text());const wv=await wp.json();
 assert.deepEqual(wv.fields.map(field=>field.selection.field),['text','label','alt','placeholder']);
 assert.ok(!wv.fields.some(field=>field.selection.field==='ariaLabel'),'per-node single field: remaining keys stay release-only');
 const btnField=wv.fields[1];assert.equal(btnField.source,'Press me');
 const savedBtn=await save(btnField,'اضغط هنا');assert.equal(savedBtn.status,200,await savedBtn.clone().text());
 assert.equal((await savedBtn.json()).fields[1].translation,'اضغط هنا');
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
