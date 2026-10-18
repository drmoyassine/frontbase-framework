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
export const now='2026-10-17T00:00:00Z';
export async function allowanceFixture({bytes=65536,maxRequests=1}={}) {
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
