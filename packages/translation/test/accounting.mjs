import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,basename,sep} from 'node:path';
import {fixture,deferred} from './job-fixtures.mjs';
import {SqliteTranslationAccountingPersistence} from '@frontbase/translation/adapters/sqlite-accounting';
import {translationAttemptAccounting} from '@frontbase/translation';
const hash='a'.repeat(64);
const setup=async(options={})=>fixture({...options,Persistence:SqliteTranslationAccountingPersistence});
const allowance=f=>({scope:f.scope,allowanceId:'batch',policyHash:hash,limitUnits:100,maxRequests:4,maxConcurrent:2});
const enqueue=async(f,id)=>{assert.equal(await f.store.enqueueJob(f.scope,f.intent(id)),'created');return await f.store.claimJob(f.scope,id,1000);};
const reservation=job=>({scope:job.scope,jobId:job.intent.jobId,leaseVersion:job.leaseVersion,allowanceId:'batch',policyHash:hash,reservedUnits:60});
const key=job=>({scope:job.scope,jobId:job.intent.jobId,leaseVersion:job.leaseVersion});
const policy=f=>translationAttemptAccounting(f.store,{scope:f.scope,allowanceId:'batch',policyHash:hash,reservedUnits:60,charge:u=>u.inputTokens+u.outputTokens});
{
 const f=await setup(),a=allowance(f);assert.equal(await f.store.createAllowance(a),'created');assert.equal(await f.store.createAllowance(a),'already-exists');assert.equal(await f.store.createAllowance({...a,limitUnits:200}),'conflict');
 const j1=await enqueue(f,'one'),j2=await enqueue(f,'two');const results=await Promise.all([f.store.reserveAttempt(reservation(j1)),f.store.reserveAttempt(reservation(j2))]);assert.equal(results.filter(Boolean).length,1,'competing reservations cannot overspend');
 assert.equal(await f.store.reserveAttempt(reservation(j1)),true,'idempotent reserved intent');assert.equal(await f.store.reserveAttempt({...reservation(j1),reservedUnits:61}),false,'different retry intent rejected');
 assert.equal(await f.store.dispatchAttempt(key(j1)),true);assert.equal(await f.store.dispatchAttempt(key(j1)),false,'no duplicate dispatch');assert.equal((await f.store.readJob(f.scope,'one')).dispatched,true);assert.equal(await f.store.releaseAttempt(key(j1)),false,'cannot refund a sent request');
 assert.equal(await f.store.settleAttempt(key(j1),25),true);assert.equal(await f.store.settleAttempt(key(j1),25),true);assert.equal(await f.store.settleAttempt(key(j1),0),false,'cannot alter settled charge');assert.equal(await f.store.reserveAttempt(reservation(j2)),true,'unused reservation released by known settlement');
 assert.equal(await f.store.releaseAttempt(key(j2)),true);assert.equal(await f.store.releaseAttempt(key(j2)),true);assert.equal(await f.store.dispatchAttempt(key(j2)),false,'released attempt cannot dispatch');
 assert.equal(await f.store.readAttempt({...key(j1),scope:{...f.scope,tenantId:'other'}}),null);assert.equal(await f.store.readAllowance({...f.scope,projectId:'other'},'batch'),null);
 f.close();
}
{
 const f=await setup();await f.store.createAllowance(allowance(f));const job=await enqueue(f,'unknown');await f.store.reserveAttempt(reservation(job));await f.store.dispatchAttempt(key(job));
 await f.store.cancelJob(f.scope,'unknown');assert.equal(await f.store.releaseAttempt(key(job)),false);assert.equal(await f.store.settleAttempt(key(job),null),true);assert.equal((await f.store.readAttempt(key(job))).state,'uncertain');assert.equal(await f.store.settleAttempt(key(job),0),false,'uncertain billing cannot be silently forgiven');
 const other=await enqueue(f,'other');assert.equal(await f.store.reserveAttempt(reservation(other)),false,'unknown cost still holds full reservation');f.close();
}
{
 const f=await setup();await f.store.createAllowance({...allowance(f),limitUnits:1000,maxRequests:1});const one=await enqueue(f,'request-one');await f.store.reserveAttempt(reservation(one));await f.store.dispatchAttempt(key(one));await f.store.settleAttempt(key(one),0);const two=await enqueue(f,'request-two');assert.equal(await f.store.reserveAttempt(reservation(two)),false,'request cap independent of zero cost');f.close();
}
{
 const f=await setup();await f.store.createAllowance({...allowance(f),limitUnits:1000,maxConcurrent:1});const one=await enqueue(f,'parallel-one'),two=await enqueue(f,'parallel-two');await f.store.reserveAttempt(reservation(one));assert.equal(await f.store.reserveAttempt(reservation(two)),false,'concurrency cap');f.advance(1001);assert.equal(await f.store.dispatchAttempt(key(one)),false,'expired lease cannot dispatch');assert.equal(await f.store.releaseAttempt(key(one)),true);f.close();
}
{
 const f=await setup();await f.store.createAllowance(allowance(f));const job=await enqueue(f,'overrun');await f.store.reserveAttempt(reservation(job));await f.store.dispatchAttempt(key(job));assert.equal(await f.store.settleAttempt(key(job),61),true);assert.equal((await f.store.readAttempt(key(job))).state,'uncertain');assert.equal(await f.store.releaseAttempt(key(job)),false);f.close();
}
{
 const f=await setup();await f.store.createAllowance(allowance(f));await f.store.enqueueJob(f.scope,f.intent('runner'));const provider=f.provider(()=>({text:'قدّم',usage:{inputTokens:20,outputTokens:5}}));const result=await f.runner(provider,{accounting:policy(f)}).runOnce(f.scope,'runner');assert.equal(result.status,'completed');assert.equal(provider.calls,1);assert.equal((await f.store.readAttempt({scope:f.scope,jobId:'runner',leaseVersion:1})).chargedUnits,25);await f.runner(provider,{accounting:policy(f)}).runOnce(f.scope,'runner');assert.equal(provider.calls,1);f.close();
}
{
 const f=await setup();await f.store.createAllowance({...allowance(f),limitUnits:0});await f.store.enqueueJob(f.scope,f.intent('denied'));const provider=f.provider();const result=await f.runner(provider,{accounting:policy(f)}).runOnce(f.scope,'denied');assert.equal(result.status,'failed');assert.equal(provider.calls,0,'no provider before allowance');f.close();
}
{
 const f=await setup();await f.store.createAllowance(allowance(f));await f.store.enqueueJob(f.scope,f.intent('failure'));const provider=f.provider(()=>{throw Error('private_provider_failure')});const result=await f.runner(provider,{accounting:policy(f)}).runOnce(f.scope,'failure');assert.equal(result.status,'failed','ambiguous call not automatically retried');assert.equal((await f.store.readAttempt({scope:f.scope,jobId:'failure',leaseVersion:1})).state,'uncertain');assert.ok(!JSON.stringify(result).includes('private_'));f.close();
}
{
 const f=await setup();await f.store.createAllowance(allowance(f));await f.store.enqueueJob(f.scope,f.intent('cancel'));const base=policy(f),provider=f.provider();const accounting={...base,dispatch:async job=>{await f.store.cancelJob(f.scope,'cancel');return base.dispatch(job);}};assert.equal((await f.runner(provider,{accounting}).runOnce(f.scope,'cancel')).status,'cancelled');assert.equal(provider.calls,0);assert.equal((await f.store.readAttempt({scope:f.scope,jobId:'cancel',leaseVersion:1})).state,'released');f.close();
}
{
 const f=await setup();await f.store.createAllowance(allowance(f));await f.store.enqueueJob(f.scope,f.intent('manual'));const provider=f.provider(async()=>{await f.engine.writeManual(f.scope,f.revision({text:'manual',revisionId:'human'}));return {text:'قدّم',usage:{inputTokens:20,outputTokens:5}};});const result=await f.runner(provider,{accounting:policy(f)}).runOnce(f.scope,'manual');assert.notEqual(result.status,'completed');assert.equal((await f.store.readAttempt({scope:f.scope,jobId:'manual',leaseVersion:1})).chargedUnits,25,'rejected revision still costs money');f.close();
}
{
 const dir=mkdtempSync(join(tmpdir(),'frontbase-accounting-'));const file=join(dir,'state.sqlite');const db=new DatabaseSync(file),f=await setup({db});await f.store.createAllowance(allowance(f));const job=await enqueue(f,'restart');await f.store.reserveAttempt(reservation(job));await f.store.dispatchAttempt(key(job));
 const secondDb=new DatabaseSync(file),second=new SqliteTranslationAccountingPersistence(secondDb,{clock:()=>f.now()});second.initialize();assert.equal((await second.readAttempt(key(job))).state,'dispatched');assert.equal(await second.releaseAttempt(key(job)),false);assert.equal(await second.settleAttempt(key(job),null),true);secondDb.close();f.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep)&&basename(dir).startsWith('frontbase-accounting-'));rmSync(dir,{recursive:true,force:true});
}
console.log('translation accounting PASS: atomic caps, tenant/project isolation, fenced one-time dispatch, no post-dispatch refund, idempotent settlement, uncertain charge retention, runner denial/cancellation/manual conflict and cross-connection restart');
