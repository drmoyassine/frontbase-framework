import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp,createSecretCipher,migrateUp } from '@frontbase/backend';
import { buildArtifact } from '../src/template-source.mjs';
import { validateTemplateArtifact,mergeArtifactUpgrade } from '../src/artifact.mjs';
import { planInstall,initialReceipt,layoutHash } from '../src/recovery-plan.mjs';
import { createSqliteDatasource,installTemplate } from '../src/install.mjs';
import usa from '../fixtures/usa.json' with {type:'json'};

let passed=0;const pass=name=>console.log(`ok ${++passed} - ${name}`);
const artifact=buildArtifact(1,{institution:'/i/',program:'/p/',article:'/a/'});
const bindings={...usa.bindings,datasourceId:'test-content'};
const control=sqliteRunner(':memory:');await migrateUp(control);
const principal={tenant:'proof-owner'};
const app=await createCompatApp({makeRunner:async()=>control,resolvePrincipal:async()=>({user:{id:'owner',role:'owner'},tenant:principal.tenant}),sessionSecret:'synthetic-recovery-proof-only'});
await createSqliteDatasource(control,{id:'test-content',tenant:principal.tenant,name:'Synthetic',url:':memory:',cipher:await createSecretCipher('synthetic-recovery-proof-only')});
async function destination(){
 const cfgResponse=await app.request('/api/project/site-configuration/');assert.equal(cfgResponse.status,200);const cfg=await cfgResponse.json();
 const pagesResponse=await app.request('/api/pages/');assert.equal(pagesResponse.status,200);const pages=(await pagesResponse.json()).data;
 const metadata=await control.query('SELECT id,is_published,deleted_at FROM compat_pages WHERE tenant_slug=?',[principal.tenant]);
 for(const page of pages){const row=metadata.find(x=>x.id===page.id);assert.ok(row);page.isPublished=!!row.is_published;page.deleted=!!row.deleted_at;}
 return {owner:principal.tenant,revision:cfg.revision,configuration:cfg.draft?.configuration??null,pages,
     datasources:(await control.query('SELECT id,kind,tenant_slug FROM datasources WHERE tenant_slug=?',[principal.tenant])).map(x=>({id:x.id,kind:x.kind,owner:x.tenant_slug}))};
}
const input={artifact,bindings,detailSamplePaths:usa.bindings.detailSamplePaths};
let state=await destination(),plan=planInstall({...input,destination:state});
assert.equal(plan.blocked,false);assert.equal(plan.actions.length,5);assert.ok(plan.actions.every(x=>x.kind==='create'));pass('fresh plan resolves five destination-bound pages without writing');
assert.equal((await destination()).revision,0);
const receipt=initialReceipt(plan,state.owner);
const cloned=structuredClone(input);assert.deepEqual(planInstall({...input,destination:state}),plan);assert.deepEqual(input,cloned);pass('deterministic plan leaves inputs and destination unchanged');
for(const mutate of [d=>d.datasources=[],d=>d.datasources[0].owner='another-owner',d=>d.datasources[0].kind='wordpress_rest']) {
 const bad=structuredClone(state);mutate(bad);assert.throws(()=>planInstall({...input,destination:bad}),/capability/);
}pass('actual SQL kind and datasource ownership are required');
for(const mutate of [a=>a.extra=true,a=>a.requiredCapabilities=[],a=>a.requiredCapabilities[0].required=false,a=>a.pages=null,a=>a.pages[0].slug='../bad',a=>a.artifact.templateVersion='1',a=>a.pages[0].layout.content[0].props.credentials='x',a=>a.pages[0].layout.content[0].props.other=['sb_secret_FAKE_0123456789'],a=>a.notes=['sb_secret_FAKE_0123456789'],a=>a.configuration.site.origin='https://bound.example']) {
 const bad=structuredClone(artifact);mutate(bad);assert.equal(validateTemplateArtifact(bad).ok,false);assert.throws(()=>planInstall({...input,artifact:bad,destination:state}),/artifact-invalid/);
}pass('malformed, bound and scalar/array secret-shaped exports are refused before writes');
const duplicate=structuredClone(artifact);duplicate.pages[0].layout.content.push(structuredClone(duplicate.pages[0].layout.content[0]));assert.equal(validateTemplateArtifact(duplicate).ok,false);pass('duplicate layout identities are refused');
let r=await app.request('/api/project/site-configuration/',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,expectedRevision:0,configuration:plan.configuration})});assert.equal(r.status,200);receipt.configurationRevision=(await r.json()).revision;
for(const action of plan.actions.slice(0,2)) {
 const p=action.page;r=await app.request('/api/pages/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:p.name,title:p.title??p.name,slug:p.slug,layoutData:p.layout})});assert.equal(r.status,201);
 const row=(await r.json()).data;receipt.pages.push({slug:p.slug,id:row.id,layoutHash:layoutHash(p.layout)});
}
state=await destination();plan=planInstall({...input,destination:state,receipt});assert.equal(plan.blocked,false);assert.equal(plan.configurationAction,'keep');assert.equal(plan.actions.filter(x=>x.kind==='create').length,3);assert.equal(plan.actions.filter(x=>x.kind==='keep').length,2);pass('known partial install resumes only missing pages using exact server receipts');
const pending=structuredClone(receipt);pending.phase='uncertain';pending.intent={kind:'page',slug:'programs'};
assert.deepEqual(planInstall({...input,destination:state,receipt:pending}).actions,[]);pass('ambiguous outcome is blocked, never automatically replayed');
const identical=structuredClone(state);assert.equal(planInstall({...input,destination:identical}).blocked,true);pass('identical existing content without ownership receipt is not adopted');
for(const mutate of [d=>d.revision++,d=>d.configuration.site.name='Owner edited',d=>d.pages[0].name='Owner renamed',d=>d.pages[0].layoutData.content[0].props.text='Owner edited',d=>d.pages.splice(0,1),d=>d.pages[0].id='replacement',d=>d.pages[0].isPublished=true,d=>d.pages[0].deleted=true]) {
 const changed=structuredClone(state);mutate(changed);assert.equal(planInstall({...input,destination:changed,receipt}).blocked,true);
}pass('configuration revision, edits, deletions and replacements refuse recovery writes');
assert.throws(()=>planInstall({...input,destination:state,receipt:{...receipt,owner:'other'}}),/receipt-mismatch/);assert.throws(()=>planInstall({...input,bindings:{...bindings,site:{...bindings.site,locale:'hu'}},destination:state,receipt}),/receipt-mismatch/);pass('cross-owner and changed bindings cannot reuse receipts');
for(const action of plan.actions.filter(x=>x.kind==='create')) {
 const p=action.page;r=await app.request('/api/pages/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:p.name,title:p.title??p.name,slug:p.slug,layoutData:p.layout})});assert.equal(r.status,201);const row=(await r.json()).data;receipt.pages.push({slug:p.slug,id:row.id,layoutHash:layoutHash(p.layout)});
}
receipt.phase='complete';state=await destination();const complete=planInstall({...input,destination:state,receipt});assert.equal(complete.blocked,false);assert.ok(complete.actions.every(x=>x.kind==='keep'));assert.equal(state.revision,1);assert.equal(state.pages.length,5);pass('completed same-plan retry has no creates or configuration rewrite');
await assert.rejects(()=>installTemplate({app,artifact,bindings,skipChecks:true}),/bypass/);pass('internal validation bypass is refused');

const previous=artifact.pages[0].layout,next=buildArtifact(2).pages[0].layout;
const deleted=structuredClone(previous);deleted.content=deleted.content.filter(n=>n.id!=='tpl-directory-heading');let merge=mergeArtifactUpgrade({previousLayout:previous,liveLayout:deleted,nextLayout:next});assert.ok(!merge.layout.content.some(n=>n.id==='tpl-directory-heading'));pass('owner-deleted template nodes are not resurrected');
const custom=structuredClone(previous);custom.content[1].props.text='Owner custom';const removedNext=structuredClone(next);removedNext.content=removedNext.content.filter(n=>n.id!=='tpl-directory-heading');merge=mergeArtifactUpgrade({previousLayout:previous,liveLayout:custom,nextLayout:removedNext});assert.ok(merge.layout.content.some(n=>n.props?.text==='Owner custom'));pass('customized nodes removed from next template remain preserved');
const reordered=structuredClone(previous);[reordered.content[0],reordered.content[1]]=[reordered.content[1],reordered.content[0]];merge=mergeArtifactUpgrade({previousLayout:previous,liveLayout:reordered,nextLayout:next});assert.ok(merge.errors.includes('owner-order-needs-review'));assert.deepEqual(merge.layout,reordered);pass('owner reorder requires review and returns unchanged live layout');
const collision=structuredClone(previous);collision.content.push(structuredClone(next.content.at(-1)));collision.content.at(-1).props.text='Owner future id';merge=mergeArtifactUpgrade({previousLayout:previous,liveLayout:collision,nextLayout:next});assert.ok(merge.errors.length);assert.deepEqual(merge.layout,collision);pass('new template identity collision refuses an applicable merge');
const noncolliding=structuredClone(artifact);noncolliding.pages.forEach(p=>p.slug+='-new');const before=await destination();await assert.rejects(()=>installTemplate({app,artifact:noncolliding,bindings}),/existing configuration/);assert.deepEqual(await destination(),before);pass('fresh installer never replaces existing settings even with noncolliding slugs');
console.log(`recovery contract passed: ${passed} grouped checks`);
