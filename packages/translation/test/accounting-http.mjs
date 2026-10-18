import assert from 'node:assert/strict';
import {accountingTransports} from './accounting-transports.mjs';
import {PostgrestTranslationAccountingPersistence} from '@frontbase/translation/adapters/postgrest-accounting';
import {TranslationLifecycle,TranslationJobRunner} from '@frontbase/translation';
import {SqliteTranslationAccountingPersistence} from '@frontbase/translation/adapters/sqlite-accounting';
import {fixture} from './job-fixtures.mjs';
import {runAccountingConformance} from './accounting-conformance.mjs';
const capability={protocol:'frontbase-translation-accounting',version:1,jobProtocolVersion:1},calls=[];

await runAccountingConformance(async()=>{
 const f=await fixture({Persistence:SqliteTranslationAccountingPersistence}),t=accountingTransports(f.store,calls),store=new PostgrestTranslationAccountingPersistence(t.jobs,t.accounting);await store.initialize();
 return {...f,store,engine:new TranslationLifecycle(store),runner:(provider,options={})=>new TranslationJobRunner(store,provider,{authorize:async()=>true,...options})};
});
const jobs={call:async()=>({protocol:'frontbase-translation-postgrest',version:1})},scope={tenantId:'tenant',projectId:'project'},key={scope,jobId:'job',leaseVersion:1};
const unready=new PostgrestTranslationAccountingPersistence(jobs,{call:async()=>{throw Error('PRIVATE_CREDENTIAL')}});await assert.rejects(unready.readAttempt(key),/uninitialized/);await assert.rejects(unready.initialize(),e=>e.message==='translation_accounting_rpc_failed');await assert.rejects(unready.reserveAttempt({...key,allowanceId:'batch',policyHash:'a'.repeat(64),reservedUnits:5}),/uninitialized/);
for(const answer of [{...capability,version:2},{...capability,jobProtocolVersion:2},{...capability,secret:'unexpected'}]){const bad=new PostgrestTranslationAccountingPersistence(jobs,{call:async()=>answer});await assert.rejects(bad.initialize());}
const privateLegacy=new PostgrestTranslationAccountingPersistence({call:async()=>({protocol:'PRIVATE_REMOTE_KEY',version:1})},{call:async()=>capability});await assert.rejects(privateLegacy.initialize(),e=>e.message==='translation_accounting_rpc_failed');
const privateReply=new PostgrestTranslationAccountingPersistence(jobs,{call:async()=>({...capability,protocol:'PRIVATE_REMOTE_KEY'})});await assert.rejects(privateReply.initialize(),e=>e.message==='translation_accounting_response_invalid');
let answer;const malformed=new PostgrestTranslationAccountingPersistence(jobs,{call:async op=>op==='capabilities'?capability:answer});await malformed.initialize();
const attempt={...key,allowanceId:'batch',policyHash:'a'.repeat(64),reservedUnits:10,state:'reserved',chargedUnits:null};
for(const patch of [{scope:{...scope,tenantId:'foreign'}},{jobId:'foreign'},{leaseVersion:2},{state:'settled',chargedUnits:null},{state:'reserved',chargedUnits:1},{state:'released',chargedUnits:null}]){answer={...attempt,...patch};await assert.rejects(malformed.readAttempt(key));}
answer={scope:{...scope,projectId:'foreign'},allowanceId:'batch',policyHash:'a'.repeat(64),limitUnits:100,maxRequests:3,maxConcurrent:1};await assert.rejects(malformed.readAllowance(scope,'batch'),/scope_mismatch/);answer={...answer,scope,allowanceId:'wrong'};await assert.rejects(malformed.readAllowance(scope,'batch'),/key_mismatch/);
await assert.rejects(malformed.reserveAttempt({...key,allowanceId:'batch',policyHash:'a'.repeat(64),reservedUnits:5,sql:'forbidden'}));
answer='true';await assert.rejects(malformed.dispatchAttempt(key));
assert.ok(calls.includes('accounting:dispatch'));console.log('accounting HTTP PASS: shared adapter conformance, explicit capabilities, v1 compatibility, strict scope/key/state/result validation and safe failures');
