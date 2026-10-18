import assert from 'node:assert/strict';
import {allowanceFixture as setup,now} from './translation-allowance-fixture.mjs';
import {closeTranslationAllowance} from '../dist/compat/translation-allowance.js';
import {deferred} from '../../translation/test/job-fixtures.mjs';
const KEY='translation_allowance:v1';
const unavailable=p=>assert.rejects(p,e=>e.message==='translation_allowance_reconciliation_unavailable');
const denied=p=>assert.rejects(p,e=>e.message==='translation_allowance_unavailable');
const rawClose=(f,plan,unknownDisposition='hold',maxJobs=4)=>closeTranslationAllowance(f.host,f.db,'alpha',{policyHash:plan.policyHash,unknownDisposition,maxJobs},now);
async function close(...args){let result;await assert.doesNotReject(async()=>{result=await rawClose(...args)});return result;}
const next=(f,id)=>({...f.review,allowanceId:id,jobs:[f.intent('job-'+id)]});
const attemptKey=f=>({scope:f.scope,jobId:'one',leaseVersion:1});
async function reserved(f,plan,dispatch=false){await f.enqueue('one');const job=await f.f.store.claimJob(f.scope,'one',1000);assert.ok(job);assert.equal(await f.f.store.reserveAttempt({...attemptKey(f),allowanceId:f.review.allowanceId,policyHash:plan.policyHash,reservedUnits:1}),true);if(dispatch)assert.equal(await f.f.store.dispatchAttempt(attemptKey(f)),true);}
async function activeId(f){return JSON.parse((await f.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha',KEY]))[0].value).plan.review.allowanceId;}
{
 const f=await setup(),plan=await f.prepare();await f.enqueue('one');const old=await f.configured();
 const closed=await close(f,plan);assert.equal(closed.phase,'closed');assert.equal((await f.f.store.readJob(f.scope,'one')).status,'cancelled');assert.equal(closed.totals.consumedRequests,0);
 assert.deepEqual(await close(f,plan),closed);await old.runOnce('one');assert.equal(f.aiCalls(),0);await denied(f.configured());
 const review=next(f,'next');await f.prepare(review);assert.equal(await activeId(f),'next');await unavailable(rawClose(f,plan));
 await f.enqueue('job-next');await (await f.configured()).runOnce('job-next');assert.equal(f.aiCalls(),1);
 const archive=await f.db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?',['alpha','translation_allowance_archive:v1:reviewed']);assert.equal(JSON.parse(archive[0].value).policyHash,plan.policyHash);f.close();
}
{
 const f=await setup(),plan=await f.prepare();await reserved(f,plan);const result=await close(f,plan);assert.equal(result.phase,'closed');assert.equal(result.totals.releasedRequests,1);assert.equal((await f.f.store.readAttempt(attemptKey(f))).state,'released');f.close();
}
{
 const f=await setup(),plan=await f.prepare();await reserved(f,plan,true);
 const held=await close(f,plan);assert.equal(held.phase,'closing');assert.equal(held.totals.retainedUnknownRequests,1);await denied(f.prepare(next(f,'blocked')));
 const closed=await close(f,plan,'count-as-consumed');assert.equal(closed.phase,'closed');assert.equal(closed.totals.consumedRequests,1);assert.equal(closed.totals.retainedUnknownRequests,1);assert.equal((await f.f.store.readAttempt(attemptKey(f))).state,'dispatched','acknowledgment never refunds/rewrites the original ledger');
 await f.prepare(next(f,'explicit-fresh'));f.close();
}
{
 const f=await setup(),plan=await f.prepare();await f.enqueue('one');f.withoutUsage();await (await f.configured()).runOnce('one');assert.equal((await close(f,plan)).phase,'closing');assert.equal((await close(f,plan,'count-as-consumed')).totals.consumedRequests,1);assert.equal((await f.f.store.readAttempt(attemptKey(f))).state,'uncertain');f.close();
}
{
 const f=await setup(),plan=await f.prepare();await f.enqueue('one');const worker=await f.configured(),started=deferred(),finish=deferred();
 f.setHook(async()=>{started.resolve();await finish.promise});const running=worker.runOnce('one');await started.promise;
 assert.equal((await close(f,plan)).phase,'closing');await close(f,plan,'count-as-consumed');await f.prepare(next(f,'after-inflight'));
 finish.resolve();await running;assert.equal((await f.f.store.readAttempt(attemptKey(f))).chargedUnits,1);assert.equal((await f.f.store.readJob(f.scope,'one')).status,'cancelled');assert.equal((await f.f.store.read(f.scope,f.source.unitId,'ar')).head,null,'cancelled provider result cannot publish a draft');assert.equal(f.aiCalls(),1);f.close();
}
{
 const f=await setup(),plan=await f.prepare();await f.enqueue('one');const worker=await f.configured(),original=f.host.externalFetch;
 f.host.externalFetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init),body=await req.clone().json();if(req.url.endsWith('translation_accounting_request')&&body.p_operation==='capabilities')return new Response('PRIVATE_FAILURE',{status:503});return original(req);};
 await unavailable(rawClose(f,plan));await worker.runOnce('one');assert.equal(f.aiCalls(),0,'durable freeze blocks already-created worker despite failed reconciliation');await denied(f.prepare(next(f,'cannot-reset')));
 f.host.externalFetch=original;assert.equal((await close(f,plan)).phase,'closed');f.close();
}
{
 const f=await setup(),plan=await f.prepare();await f.storage.save(null,1,now);await f.generation.save(null,1,now);assert.equal((await close(f,plan)).phase,'closed','reconcile original destination after settings cleared; no current AI account required');f.close();
}
{
 const f=await setup(),plan=await f.prepare();await f.datasource('https://retarget.example.test');await unavailable(rawClose(f,plan));await denied(f.prepare(next(f,'other')));
 await f.datasource('https://data.example.test','PRIVATE_ROTATED_RECOVERY');assert.equal((await close(f,plan)).phase,'closed');assert.ok(f.calls.some(c=>c.apikey==='PRIVATE_ROTATED_RECOVERY'));f.close();
}
for(const operation of ['cancel','release']){
 const f=await setup(),plan=await f.prepare();if(operation==='release')await reserved(f,plan);else await f.enqueue('one');const original=f.host.externalFetch;
 f.host.externalFetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init),body=await req.clone().json();if(body.p_operation===operation)return Response.json(false);return original(req);};
 await unavailable(rawClose(f,plan));await denied(f.prepare(next(f,'not-proven')));f.host.externalFetch=original;assert.equal((await close(f,plan)).phase,'closed');f.close();
}
{
 const f=await setup(),plan=await f.prepare();await reserved(f,plan);await f.f.store.markJobDispatched(f.scope,'one',1);await unavailable(rawClose(f,plan));assert.equal((await f.f.store.readAttempt(attemptKey(f))).state,'reserved','job dispatch evidence cannot be erased by releasing an inconsistent reservation');f.close();
}
{
 const f=await setup(),plan=await f.prepare();await close(f,plan);const late=next(f,'late'),fast=next(f,'fast'),blocked=deferred(),release=deferred(),exec=f.db.exec.bind(f.db);
 f.db.exec=async(sql,args)=>{if(sql.startsWith('UPDATE settings SET value')&&args[0].includes('"allowanceId":"late"')){blocked.resolve();await release.promise;}return exec(sql,args);};
 const pending=f.prepare(late);await blocked.promise;await f.prepare(fast);release.resolve();await denied(pending);assert.equal(await activeId(f),'fast','stale allocation CAS cannot replace a newer reviewed allowance');assert.equal(await f.f.store.readAllowance(f.scope,'late'),null);f.db.exec=exec;
 const fastPlan=await f.prepare(fast);await close(f,fastPlan);await denied(f.prepare({...next(f,'reviewed')}));assert.equal(await activeId(f),'fast','archived allowance ID cannot poison or resurrect the active checkpoint');f.close();
}
{
 const f=await setup(),plan=await f.prepare();const outcomes=await Promise.all([close(f,plan),close(f,plan)]);assert.equal(outcomes[0].phase,'closed');assert.deepEqual(outcomes[0],outcomes[1]);
 await f.db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?',['PRIVATE_CORRUPT','alpha','translation_allowance_lifecycle:v1:'+plan.policyHash]);await unavailable(rawClose(f,plan));await denied(f.prepare(next(f,'corrupt')));f.close();
}
{
 const f=await setup(),review={...f.review,jobs:Array.from({length:9},(_,i)=>f.intent('chunk-'+i))},plan=await f.prepare(review);
 for(const intent of review.jobs)await f.enqueue(intent.jobId);
 let result;let rounds=0;
 do{const before=f.calls.length;result=await close(f,plan);assert.ok(f.calls.length-before<=24,'bounded RPC work per continuation');rounds++;assert.ok(rounds<10);}while(result.phase!=='closed');
 assert.ok(rounds>1,'cursor survives multiple independent invocations');assert.equal(result.totals.consumedRequests,0);f.close();
}
{
 const f=await setup(),review={...f.review,jobs:Array.from({length:6},(_,i)=>f.intent('cursor-'+i))},plan=await f.prepare(review);
 assert.equal((await close(f,plan)).cursor,4);
 const blocked=deferred(),release=deferred(),exec=f.db.exec.bind(f.db);let hold=true;
 f.db.exec=async(sql,args)=>{if(hold&&sql.startsWith('UPDATE settings SET value')&&args[0].includes('"stage":"cancel","cursor":5')){hold=false;blocked.resolve();await release.promise;}return exec(sql,args);};
 const slow=close(f,plan,'hold',1);await blocked.promise;await close(f,plan);assert.equal((await close(f,plan)).phase,'closed');release.resolve();assert.equal((await slow).phase,'closed','stale cursor cannot overwrite closed receipt');f.db.exec=exec;f.close();
}
{
 const f=await setup(),plan=await f.prepare();assert.equal((await close(f,plan,'hold',2)).stage,'reconcile');await f.enqueue('one');
 assert.equal((await close(f,plan)).stage,'cancel','late enqueue restarts fencing rather than bypassing it');assert.equal((await close(f,plan)).phase,'closed');assert.equal((await f.f.store.readJob(f.scope,'one')).status,'cancelled');f.close();
}
console.log('translation allowance lifecycle PASS: durable freeze, job fencing, proof-based release, explicit unknown consumption without ledger rewrite, original-destination recovery, in-flight cancellation, immutable history and competing replacement CAS; no real network');
