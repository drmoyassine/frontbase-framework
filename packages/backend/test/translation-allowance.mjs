import assert from 'node:assert/strict';
import {sqliteRunner} from '@frontbase/edge-infra';
import {TranslationLifecycle} from '@frontbase/edge-core/localization';
import {SqliteTranslationAccountingPersistence} from '../../translation/dist/adapters/sqlite-accounting.js';
import {fixture} from '../../translation/test/job-fixtures.mjs';
import {accountingTransports} from '../../translation/test/accounting-transports.mjs';
import {migrateUp} from '../dist/db/migrations.js';
import {createSecretCipher} from '../dist/db/secret-cipher.js';
import {Phase2Store} from '../dist/db/phase2-store.js';
import {SyncStore} from '../dist/compat/sync-store.js';
import {TranslationGenerationStore,translationMessages} from '../dist/compat/translation-generation.js';
import {TranslationStorageStore} from '../dist/compat/translation-storage.js';
import {prepareTranslationAllowance,configuredTranslationAllowanceRunner,translationAllowanceReviewSchema} from '../dist/compat/translation-allowance.js';

globalThis.fetch=()=>{throw Error('raw_network_forbidden')};
const now='2026-10-17T00:00:00Z';
async function setup({bytes=65536,maxRequests=1}={}) {
    const db=sqliteRunner(':memory:');await migrateUp(db);
    const cipher=await createSecretCipher('allowance-private-fixture'),accountsFor=tenant=>new Phase2Store(db,tenant,cipher);
    const accounts=accountsFor('alpha');
    const account=async key=>accounts.upsertEdgeResource({id:'ai',name:'AI',kind:'provider',provider:'openai',status:'active',config:await cipher.encrypt(JSON.stringify({api_key:key}))},now);
    await account('PRIVATE_AI');
    const sync=new SyncStore(db,'alpha',cipher),syncFor=tenant=>new SyncStore(db,tenant,cipher);
    const datasource=async(url='https://data.example.test',key='PRIVATE_DB')=>sync.updateDatasource('data',{config:{url,serviceKey:key}},now);
    await sync.createDatasource({name:'Data',kind:'supabase',config:{url:'https://data.example.test',serviceKey:'PRIVATE_DB'}},'data',now);
    const storage=new TranslationStorageStore(db,'alpha'),selection={version:1,datasourceId:'data',endpoint:'postgrest',namespace:'translations'};
    const saved=await storage.save(selection,0,now),scope={tenantId:'alpha',projectId:saved.projectId};
    const configuration={version:1,accountId:'ai',model:'fixture-model',sourceLocale:'en',targetLocales:['ar'],promptVersion:'plain-v1',maxOutputTokens:100};
    const generation=new TranslationGenerationStore(db,'alpha');await generation.save(configuration,0,now);
    const f=await fixture({Persistence:SqliteTranslationAccountingPersistence}),transport=accountingTransports(f.store),engine=new TranslationLifecycle(f.store);
    const source=await engine.syncSource(scope,{...f.unit,scope},null,f.context);
    const secondSource=await engine.syncSource(scope,{...f.unit,scope,resource:{...f.unit.resource,messageId:'second'}},null,f.context);
    const intent=id=>{const item=id==='two'?secondSource:source;return ({version:1,unitId:item.unitId,sourceVersion:item.sourceVersion,sourceFingerprint:item.sourceFingerprint,contextFingerprint:item.contextFingerprint,expectedHead:null,locale:'ar',revisionId:'rev-'+id,jobId:id,providerId:'ai',promptVersion:'plain-v1',maxAttempts:1})};
    const review={allowanceId:'reviewed',unit:'provider-request',maxRequests,maxConcurrent:1,maxMessageBytes:bytes,jobs:[intent('one'),intent('two')]};
    const calls=[];let aiCalls=0,hook=async()=>{},dispatchHook=async()=>{},usage=true,throwAI=false,missingCapability=false;
    const host={syncFor,accountsFor,accountConfigFor:async()=>null,externalFetch:async(input,init)=>{
        const req=input instanceof Request?input:new Request(input,init),body=await req.json();calls.push({url:req.url,body,authorization:req.headers.get('authorization'),apikey:req.headers.get('apikey')});
        if(new URL(req.url).host==='api.openai.com'){
            aiCalls++;assert.equal(body.max_completion_tokens,100);await hook();if(throwAI)throw Error('PRIVATE_PROVIDER_BODY');
            return Response.json({choices:[{finish_reason:'stop',message:{content:'قدّم'}}],...(usage?{usage:{prompt_tokens:20,completion_tokens:5}}:{})});
        }
        const accounting=req.url.endsWith('/translation_accounting_request');
        if(accounting&&missingCapability)return new Response('PRIVATE_REMOTE', {status:404});
        const value=await (accounting?transport.accounting:transport.jobs).call(body.p_operation,body.p_scope,body.p_input);
        if(accounting&&body.p_operation==='dispatch')await dispatchHook();
        return Response.json(value);
    }};
    return {db,f,host,review,source,scope,generation,configuration,storage,selection,sync,account,datasource,calls,intent,
        aiCalls:()=>aiCalls,setHook:fn=>{hook=fn},setDispatchHook:fn=>{dispatchHook=fn},withoutUsage:()=>{usage=false},throwAI:()=>{throwAI=true},missing:()=>{missingCapability=true},available:()=>{missingCapability=false},
        prepare:(input=review)=>prepareTranslationAllowance(host,db,'alpha',input,now),
        configured:()=>configuredTranslationAllowanceRunner(host,db,'alpha'),
        enqueue:async id=>{assert.equal(await f.store.enqueueJob(scope,intent(id)),'created')},
        close:()=>{f.close();db.close?.()},
    };
}
const denied=promise=>assert.rejects(promise,e=>e.message==='translation_allowance_unavailable');
const key=(f,id)=>({scope:f.scope,jobId:id,leaseVersion:1});
{
    const f=await setup();const plan=await f.prepare();assert.equal(f.aiCalls(),0);assert.deepEqual(await f.prepare(),plan);
    const saved=await f.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha','translation_allowance:v1']);assert.ok(!String(saved[0].value).includes('PRIVATE_'));
    await denied(f.prepare({...f.review,allowanceId:'fresh'}));await denied(f.prepare({...f.review,maxRequests:2}));
    await f.enqueue('one');await f.enqueue('two');await f.enqueue('unreviewed');const session=await f.configured();session.scope.tenantId='untrusted-caller-mutation';
    assert.equal((await session.runOnce('one')).status,'completed');
    assert.equal((await f.f.store.readAttempt(key(f,'one'))).chargedUnits,1,'request units are not provider token usage');
    assert.equal((await session.runOnce('two')).lastError,'denied','request budget applies across distinct units');assert.equal(f.aiCalls(),1);
    await session.runOnce('unreviewed');assert.equal((await f.f.store.readJob(f.scope,'unreviewed')).lastError,'denied');assert.equal(f.aiCalls(),1);
    f.close();
}
{
    const f=await setup();const results=await Promise.allSettled([f.prepare(),f.prepare({...f.review,allowanceId:'competitor'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1,'one immutable host allocation wins');f.close();
}
{
    const f=await setup({bytes:1});await f.prepare();await f.enqueue('one');const s=await f.configured();await s.runOnce('one');assert.equal(f.aiCalls(),0);assert.equal((await f.f.store.readJob(f.scope,'one')).lastError,'denied');f.close();
}
{
    const f=await setup();await f.prepare();await f.enqueue('one');await f.account('PRIVATE_ROTATED_AI');await f.datasource('https://data.example.test','PRIVATE_ROTATED_DB');
    const s=await f.configured();await s.runOnce('one');assert.equal(f.aiCalls(),1);assert.ok(f.calls.some(c=>c.authorization==='Bearer PRIVATE_ROTATED_AI'));assert.ok(f.calls.some(c=>c.apikey==='PRIVATE_ROTATED_DB'));f.close();
}
for(const change of ['generation','storage','url']){
    const f=await setup();await f.prepare();await f.enqueue('one');const s=await f.configured();
    if(change==='generation')await f.generation.save({...f.configuration,model:'other-model'},1,now);
    if(change==='storage')await f.storage.save(f.selection,1,now);
    if(change==='url')await f.datasource('https://retarget.example.test');
    await denied(f.configured());await s.runOnce('one');assert.equal(f.aiCalls(),0,change+' pauses existing runner');
    await denied(f.prepare({...f.review,allowanceId:'new-budget'}));f.close();
}
{
    const f=await setup();await f.prepare();await f.enqueue('one');const s=await f.configured();
    f.setDispatchHook(()=>f.generation.save({...f.configuration,model:'changed-after-dispatch'},1,now));
    await s.runOnce('one');assert.equal(f.aiCalls(),0,'last guard before AI invocation');assert.equal((await f.f.store.readAttempt(key(f,'one'))).state,'uncertain');f.close();
}
{
    const f=await setup();await f.prepare();await f.enqueue('one');const s=await f.configured();
    f.setHook(()=>f.storage.save(null,1,now));await s.runOnce('one');assert.equal(f.aiCalls(),1);assert.equal((await f.f.store.readAttempt(key(f,'one'))).chargedUnits,1,'retarget cannot erase original-ledger charge');await denied(f.configured());f.close();
}
for(const unknown of ['missing-usage','provider-failure']){
    const f=await setup();await f.prepare();await f.enqueue('one');if(unknown==='missing-usage')f.withoutUsage();else f.throwAI();
    const s=await f.configured();await s.runOnce('one');assert.equal((await f.f.store.readAttempt(key(f,'one'))).state,'uncertain');await s.runOnce('one');assert.equal(f.aiCalls(),1,'unknown request is never silently retried');f.close();
}
{
    const f=await setup();f.missing();await denied(f.prepare());
    // A failed remote setup leaves the host checkpoint, so another allocation cannot replace it.
    await denied(f.prepare({...f.review,allowanceId:'replacement'}));f.available();await f.prepare();assert.equal(f.aiCalls(),0);f.close();
}
{
    const f=await setup();await f.prepare();await denied(configuredTranslationAllowanceRunner(f.host,f.db,'beta'));
    await f.db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',['PRIVATE_CORRUPT','alpha','translation_allowance:v1']);await denied(f.configured());await denied(f.prepare());assert.equal(f.aiCalls(),0);f.close();
}
{
    const f=await setup();await f.prepare();assert.equal(await f.f.store.enqueueJob(f.scope,{...f.intent('one'),revisionId:'changed-intent'}),'created');const s=await f.configured();assert.equal((await s.runOnce('one')).lastError,'denied');assert.equal(f.aiCalls(),0);f.close();
}
{
    const f=await setup();await f.prepare();await f.enqueue('one');await f.enqueue('two');const left=await f.configured(),right=await f.configured();await Promise.all([left.runOnce('one'),right.runOnce('two')]);assert.equal(f.aiCalls(),1,'competing host workers share one allowance');f.close();
}
assert.equal(translationAllowanceReviewSchema.safeParse({unit:'USD'}).success,false);
console.log('translation allowance PASS: immutable host allocation, reviewed intents, request/byte bounds, fresh credentials, config/destination pauses, pre-call guard, original-ledger settlement, unknown holds and safe failures; no real network');
