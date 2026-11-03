import assert from 'node:assert/strict';
import { TranslationLifecycle } from '@frontbase/translation';
import { PostgrestTranslationJobPersistence } from '@frontbase/translation/adapters/postgrest';
import { fixture, scope, unit } from './job-fixtures.mjs';

// Contract test double. Actual SQL/HTTP lifecycle proof is the separately invoked live suite.
const f = await fixture(); const calls = [];
try {
    const transport = { async call(operation, owner, input) {
        calls.push({ operation, owner, input });
        const dispatch = {
            capabilities: () => ({ protocol: 'frontbase-translation-postgrest', version: 1 }),
            read: () => f.store.read(owner, input.unitId, input.locale ?? undefined),
            'read-source': () => f.store.readSourceVersion(owner, input.unitId, input.version),
            'read-revision': () => f.store.readRevision(owner, input.unitId, input.locale, input.revisionId),
            'list-revisions': () => f.store.listRevisions(owner, input.unitId, input.locale, input.limit),
            'find-approved-head': () => f.store.findApprovedHead(owner, input.locale, input.fingerprint, input.excludeUnitId),
            cas: () => f.store.compareAndSwap(owner, input.unitId, input.expectedVersion, input.change),
            enqueue: () => f.store.enqueueJob(owner, input.intent),
            'read-job': () => f.store.readJob(owner, input.jobId),
            'ready-jobs': () => f.store.listReadyJobs(owner, input.limit),
            claim: () => f.store.claimJob(owner, input.jobId, input.leaseMs),
            renew: () => f.store.renewJob(owner, input.jobId, input.leaseVersion, input.leaseMs),
            dispatch: () => f.store.markJobDispatched(owner, input.jobId, input.leaseVersion),
            fail: () => f.store.failJob(owner, input.jobId, input.leaseVersion, { code: input.code, retryable: input.retryable, delayMs: input.delayMs }),
            cancel: () => f.store.cancelJob(owner, input.jobId),
        };
        return JSON.parse(JSON.stringify(await dispatch[operation]()));
    } };
    const store = new PostgrestTranslationJobPersistence(transport), engine = new TranslationLifecycle(store);
    await store.initialize();
    assert.equal((await store.read(scope, f.source.unitId)).source.unit.text, unit.text);
    assert.equal((await store.readSourceVersion(scope, f.source.unitId, 1)).context.role, 'button');
    assert.equal((await engine.writeManual(scope, f.revision())).status, 'committed');
    assert.equal((await store.readRevision(scope, f.source.unitId, 'ar', 'revision')).text, 'قدّم');
    assert.deepEqual((await store.listRevisions(scope, f.source.unitId, 'ar', 5)).map(item => item.revisionId), ['revision']);
    assert.deepEqual(await store.listRevisions({ ...scope, tenantId: 'other' }, f.source.unitId, 'ar', 5), []);
    await assert.rejects(store.listRevisions(scope, f.source.unitId, 'ar', 101));
    const hostileHistory = new PostgrestTranslationJobPersistence({ async call() { return [{ ...await store.readRevision(scope, f.source.unitId, 'ar', 'revision'), unitId: 'f'.repeat(64) }]; } });
    await assert.rejects(hostileHistory.listRevisions(scope, f.source.unitId, 'ar', 5), /key_mismatch/);
    assert.equal((await store.findApprovedHead(scope, 'ar', f.source.sourceFingerprint, 'f'.repeat(64))).revision.revisionId, 'revision');
    assert.equal(await store.findApprovedHead(scope, 'ar', f.source.sourceFingerprint, f.source.unitId), null);
    await assert.rejects(store.findApprovedHead(scope, 'ar', 'not-a-fingerprint', f.source.unitId));
    const hostileMemory = new PostgrestTranslationJobPersistence({ async call() { return { unitId: 'f'.repeat(64), revision: JSON.parse(JSON.stringify(await store.readRevision(scope, f.source.unitId, 'ar', 'revision'))) }; } });
    await assert.rejects(hostileMemory.findApprovedHead(scope, 'ar', f.source.sourceFingerprint, f.source.unitId), /key_mismatch/);
    assert.equal((await store.read({ ...scope, tenantId: 'other' }, f.source.unitId)).source, null);
    const second = await engine.syncSource(scope, { ...unit, resource: { ...unit.resource, messageId: 'second' } }, null);
    const intent = f.intent('http', { unitId: second.unitId, sourceFingerprint: second.sourceFingerprint, contextFingerprint: second.contextFingerprint });
    assert.equal(await store.enqueueJob(scope, intent), 'created');
    assert.deepEqual(await store.listReadyJobs(scope, 5), ['http']);
    const job = await store.claimJob(scope, 'http', 60000); assert.equal(job.status, 'leased');
    assert.equal(await store.renewJob(scope, 'http', job.leaseVersion, 60000), true);
    assert.equal(await store.markJobDispatched(scope, 'http', job.leaseVersion), true);
    assert.equal(await store.failJob(scope, 'http', job.leaseVersion, { code: 'provider-error', retryable: true, delayMs: 0 }), true);
    assert.equal((await store.readJob(scope, 'http')).status, 'queued');
    assert.equal(await store.cancelJob(scope, 'http'), true);
    await assert.rejects(store.listReadyJobs(scope, 1000));
    await assert.rejects(store.claimJob(scope, 'http', 1));
    await assert.rejects(store.enqueueJob(scope, { ...intent, secret: 'must refuse' }));
    const hostile = new PostgrestTranslationJobPersistence({ async call() { return { version: 0, source: null, head: { text: 'incomplete' } }; } });
    await assert.rejects(hostile.read(scope, f.source.unitId, 'ar'));
    const foreign = new PostgrestTranslationJobPersistence({ async call() { return { version: 1, source: { ...(await f.store.read(scope, f.source.unitId)).source,
        unit: { ...unit, scope: { ...scope, tenantId: 'foreign' } } }, head: null }; } });
    await assert.rejects(foreign.read(scope, f.source.unitId), /scope_mismatch/);
    const error = new PostgrestTranslationJobPersistence({ async call() { throw Error('private connection details'); } });
    await assert.rejects(error.read(scope, f.source.unitId), e => e.message === 'translation_rpc_failed');
    assert.ok(calls.every(call => !('sql' in call.input)));
    const {accountingTransports}=await import('./accounting-transports.mjs');
    const batched=new PostgrestTranslationJobPersistence(accountingTransports(f.store).jobs);
    assert.deepEqual(await batched.readMany(scope,[f.source.unitId,second.unitId],'ar'),await Promise.all([f.source.unitId,second.unitId].map(id=>store.read(scope,id,'ar'))));
    assert.equal((await batched.readRevisions(scope,[{unitId:f.source.unitId,revisionId:'revision'}],'ar'))[0].text,'قدّم');
    assert.deepEqual(await batched.readMany({...scope,projectId:'other'},[f.source.unitId],'ar'),[{version:0,source:null,head:null}]);
    await assert.rejects(batched.readMany(scope,Array.from({length:501},()=>f.source.unitId),'ar'));
    await assert.rejects(batched.readMany(scope,[f.source.unitId,f.source.unitId],'ar'));
    const moreIds=[f.source.unitId,...Array.from({length:66},(_,i)=>i.toString(16).padStart(64,'0'))];
    const expected=await batched.readMany(scope,moreIds,'ar');
    assert.deepEqual(await f.store.readMany(scope,moreIds,'ar'),expected);
    assert.deepEqual(await f.store.readMany({...scope,tenantId:'foreign'},[f.source.unitId],'ar'),[{version:0,source:null,head:null}]);
    const revisionKeys=[{unitId:f.source.unitId,revisionId:'revision'},{unitId:f.source.unitId,revisionId:'missing'}];
    assert.deepEqual(await f.store.readRevisions(scope,revisionKeys,'ar'),await batched.readRevisions(scope,revisionKeys,'ar'));
    const wrongBatch=new PostgrestTranslationJobPersistence({call:async()=>[{unitId:second.unitId,snapshot:await f.store.read(scope,f.source.unitId,'ar')}]});
    await assert.rejects(wrongBatch.readMany(scope,[f.source.unitId],'ar'),/key_mismatch/);
    const foreignBatch=new PostgrestTranslationJobPersistence({call:async()=>[{unitId:f.source.unitId,snapshot:{version:1,source:{...(await f.store.read(scope,f.source.unitId)).source,unit:{...unit,scope:{...scope,tenantId:'foreign'}}},head:null}}]});
    await assert.rejects(foreignBatch.readMany(scope,[f.source.unitId],'ar'),/scope_mismatch/);
    const wrongRevisionBatch=new PostgrestTranslationJobPersistence({call:async()=>[{unitId:f.source.unitId,revisionId:'revision',revision:{...await f.store.readRevision(scope,f.source.unitId,'ar','revision'),locale:'fr'}}]});
    await assert.rejects(wrongRevisionBatch.readRevisions(scope,[{unitId:f.source.unitId,revisionId:'revision'}],'ar'),/key_mismatch/);
} finally { f.close(); }
console.log('translation PostgREST adapter: PASS (typed transport test double; live SQL proof is separate)');
