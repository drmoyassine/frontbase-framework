import assert from 'node:assert/strict';
import {allowanceFixture as setup, now} from './translation-allowance-fixture.mjs';
import {configuredTranslationAllowanceRunner,translationAllowanceReviewSchema} from '../dist/compat/translation-allowance.js';
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
