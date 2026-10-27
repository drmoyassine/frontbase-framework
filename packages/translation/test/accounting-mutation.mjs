import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SqliteTranslationAccountingPersistence as Persistence} from '@frontbase/translation/adapters/sqlite-accounting';
import {TranslationJobRunner as Runner,translationAttemptAccounting} from '@frontbase/translation';
import {fixture} from './job-fixtures.mjs';
let caught=0;const hash='a'.repeat(64);
const budget=f=>({scope:f.scope,allowanceId:'batch',policyHash:hash,limitUnits:100,maxRequests:4,maxConcurrent:2});
const setup=async(P=Persistence,R=Runner)=>{const f=await fixture({Persistence:P,Runner:R});await f.store.createAllowance(budget(f));return f;};
const job=async(f,id)=>{await f.store.enqueueJob(f.scope,f.intent(id));return f.store.claimJob(f.scope,id,1000);};
const key=j=>({scope:j.scope,jobId:j.intent.jobId,leaseVersion:j.leaseVersion});
const reserve=j=>({...key(j),allowanceId:'batch',policyHash:hash,reservedUnits:60});
const policy=f=>translationAttemptAccounting(f.store,{scope:f.scope,allowanceId:'batch',policyHash:hash,reservedUnits:60,charge:u=>u.inputTokens+u.outputTokens});
async function fault(name,file,before,after,exported,gate){
 await gate(exported==='TranslationJobRunner'?Runner:Persistence);
 const url=new URL('../dist/'+file,import.meta.url),source=await readFile(url,'utf8');assert.equal(source.split(before).length,2,name+' unique anchor');
 const changed=source.replace(before,after).replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,url).href)).replace(/from (['"])zod\1/g,'from '+JSON.stringify(import.meta.resolve('zod')));
 const module=await import('data:text/javascript;base64,'+Buffer.from(changed).toString('base64'));await assert.rejects(()=>gate(module[exported]),undefined,'fault escaped: '+name);caught++;console.log('accounting fault caught: '+name);
}
const file='adapters/sqlite-accounting.js',exp='SqliteTranslationAccountingPersistence';
await fault('allowance upper bound',file,'totals.used + value.reservedUnits > allowance.limitUnits','false',exp,async P=>{const f=await setup(P);try{const a=await job(f,'a'),b=await job(f,'b');assert.equal(await f.store.reserveAttempt(reserve(a)),true);assert.equal(await f.store.reserveAttempt(reserve(b)),false);}finally{f.close();}});
await fault('concurrency cap',file,'totals.concurrent >= allowance.maxConcurrent','false',exp,async P=>{const f=await setup(P);try{await f.store.createAllowance({...budget(f),allowanceId:'parallel',limitUnits:1000,maxConcurrent:1});const a=await job(f,'a'),b=await job(f,'b');assert.equal(await f.store.reserveAttempt({...reserve(a),allowanceId:'parallel'}),true);assert.equal(await f.store.reserveAttempt({...reserve(b),allowanceId:'parallel'}),false);}finally{f.close();}});
await fault('no post-dispatch refund',file,"!['reserved', 'released'].includes(value.state)",'false',exp,async P=>{const f=await setup(P);try{const a=await job(f,'a');await f.store.reserveAttempt(reserve(a));await f.store.dispatchAttempt(key(a));assert.equal(await f.store.releaseAttempt(key(a)),false);}finally{f.close();}});
await fault('live dispatch lease',file,"value.state !== 'reserved' || !this.live(job, key.leaseVersion)","value.state !== 'reserved'",exp,async P=>{const f=await setup(P);try{const a=await job(f,'a');await f.store.reserveAttempt(reserve(a));f.advance(1001);assert.equal(await f.store.dispatchAttempt(key(a)),false);}finally{f.close();}});
await fault('attempt owner predicate',file,'SELECT body FROM ${this.prefix}attempts WHERE tenant_id=? AND project_id=? AND job_id=? AND lease_version=?','SELECT body FROM ${this.prefix}attempts WHERE ? IS NOT NULL AND ? IS NOT NULL AND job_id=? AND lease_version=?',exp,async P=>{const f=await setup(P);try{const a=await job(f,'a');await f.store.reserveAttempt(reserve(a));assert.equal(await f.store.readAttempt({...key(a),scope:{...f.scope,tenantId:'foreign'}}),null);}finally{f.close();}});
await fault('duplicate dispatch',file,"value.state !== 'reserved' || !this.live(job, key.leaseVersion) || job.dispatched",'false || !this.live(job, key.leaseVersion) || false',exp,async P=>{const f=await setup(P);try{const a=await job(f,'a');await f.store.reserveAttempt(reserve(a));assert.equal(await f.store.dispatchAttempt(key(a)),true);assert.equal(await f.store.dispatchAttempt(key(a)),false);}finally{f.close();}});
await fault('immutable settlement',file,'return value.chargedUnits === charge','return true',exp,async P=>{const f=await setup(P);try{const a=await job(f,'a');await f.store.reserveAttempt(reserve(a));await f.store.dispatchAttempt(key(a));await f.store.settleAttempt(key(a),25);assert.equal(await f.store.settleAttempt(key(a),0),false);}finally{f.close();}});
await fault('uncertain retry policy','jobs.js','!accounting && (timedOut','true && (timedOut','TranslationJobRunner',async R=>{const f=await setup(Persistence,R);try{await f.store.enqueueJob(f.scope,f.intent('a'));const result=await f.runner(f.provider(()=>{throw Error('fixture')}),{accounting:policy(f)}).runOnce(f.scope,'a');assert.equal(result.status,'failed');}finally{f.close();}});
assert.equal(caught,8);console.log('accounting mutation PASS 8/8 in-memory source faults; source/index unchanged');
