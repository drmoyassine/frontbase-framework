import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve,basename,sep} from 'node:path';
import {fixture,deferred} from './job-fixtures.mjs';
import {SqliteTranslationAccountingPersistence} from '@frontbase/translation/adapters/sqlite-accounting';
import {runAccountingConformance} from './accounting-conformance.mjs';
const setup=async(options={})=>fixture({...options,Persistence:SqliteTranslationAccountingPersistence});
const allowance=f=>({scope:f.scope,allowanceId:'batch',policyHash:'a'.repeat(64),limitUnits:100,maxRequests:4,maxConcurrent:2});
const enqueue=async(f,id)=>{assert.equal(await f.store.enqueueJob(f.scope,f.intent(id)),'created');return await f.store.claimJob(f.scope,id,1000);};
const key=j=>({scope:j.scope,jobId:j.intent.jobId,leaseVersion:j.leaseVersion});
const reservation=j=>({...key(j),allowanceId:'batch',policyHash:'a'.repeat(64),reservedUnits:60});
await runAccountingConformance(setup);
{
 const dir=mkdtempSync(join(tmpdir(),'frontbase-accounting-'));const file=join(dir,'state.sqlite');const db=new DatabaseSync(file),f=await setup({db});await f.store.createAllowance(allowance(f));const job=await enqueue(f,'restart');await f.store.reserveAttempt(reservation(job));await f.store.dispatchAttempt(key(job));
 const secondDb=new DatabaseSync(file),second=new SqliteTranslationAccountingPersistence(secondDb,{clock:()=>f.now()});second.initialize();assert.equal((await second.readAttempt(key(job))).state,'dispatched');assert.equal(await second.releaseAttempt(key(job)),false);assert.equal(await second.settleAttempt(key(job),null),true);secondDb.close();f.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep)&&basename(dir).startsWith('frontbase-accounting-'));rmSync(dir,{recursive:true,force:true});
}
console.log('translation accounting PASS: atomic caps, tenant/project isolation, fenced one-time dispatch, no post-dispatch refund, idempotent settlement, uncertain charge retention, runner denial/cancellation/manual conflict and cross-connection restart');
