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
    await assert.rejects(batched.readMany(scope,[f.source.unitId,'not-a-hash'],'ar'));
    await assert.rejects(batched.readMany({...scope,tenantId:''},[f.source.unitId],'ar'));
    await assert.rejects(batched.readMany(scope,[f.source.unitId],'not a locale'));
    const moreIds=[f.source.unitId,...Array.from({length:66},(_,i)=>i.toString(16).padStart(64,'0'))];
    const expected=await batched.readMany(scope,moreIds,'ar');
    const {currentTranslationValueSchema}=await import('../dist/revisions.js');
    assert.deepEqual(await batched.readCurrentMany(scope,moreIds,'ar'),expected.map(value=>currentTranslationValueSchema.parse(value)));
    await assert.rejects(batched.readCurrentMany(scope,[f.source.unitId,f.source.unitId],'ar'),/key_mismatch/);
    const currentEntry={unitId:f.source.unitId,snapshot:currentTranslationValueSchema.parse(expected[0])};
    const expectedHeads = new Map([[currentEntry.unitId, currentEntry.snapshot]]);
    assert.ok((await batched.readCurrentMany(scope, [second.unitId], 'ar'))[0].source);
    assert.deepEqual(await batched.readCurrentHeads(scope, [second.unitId, ...moreIds], 'ar'), expectedHeads);
    let returned=[currentEntry], sparseReads=0;
    const sparse=new PostgrestTranslationJobPersistence({
        async call(){throw Error('Unexpected dense lookup');},
        async readCurrent(){sparseReads++;return returned;},
    });
    assert.deepEqual(await sparse.readCurrentMany(scope,moreIds,'ar'),expected.map(value=>currentTranslationValueSchema.parse(value)));
    assert.equal(sparseReads,1);
    const fullBatch = [
        f.source.unitId,
        ...Array.from({ length: 499 }, (_, index) => index.toString(16).padStart(64, '0')),
    ];
    assert.deepEqual(await sparse.readCurrentHeads(scope, fullBatch, 'ar'), expectedHeads);
    assert.equal(sparseReads, 2);
    returned=[];
    assert.deepEqual(await sparse.readCurrentMany(scope,[f.source.unitId],'ar'),[{version:0,source:null,head:null}]);
    assert.deepEqual(await sparse.readCurrentHeads(scope, fullBatch, 'ar'), new Map());
    await assert.rejects(sparse.readCurrentHeads(scope, [f.source.unitId, f.source.unitId], 'ar'), /key_mismatch/);
    await assert.rejects(sparse.readCurrentHeads(scope, ['a'.repeat(63), 'a'.repeat(65)], 'ar'));
    await assert.rejects(sparse.readCurrentHeads(scope, ['G'.repeat(64)], 'ar'));
    await assert.rejects(sparse.readCurrentHeads(scope, [...fullBatch, 'f'.repeat(64)], 'ar'));
    assert.equal(sparseReads, 4, 'Invalid requests must fail before calling PostgREST');
    returned=[currentEntry,currentEntry];
    await assert.rejects(sparse.readCurrentHeads(scope,moreIds,'ar'),/key_mismatch/);
    returned=[{...currentEntry,unitId:'f'.repeat(64)}];
    await assert.rejects(sparse.readCurrentHeads(scope,moreIds,'ar'),/key_mismatch/);
    returned = [{ ...currentEntry, snapshot: { ...currentEntry.snapshot, head: { ...currentEntry.snapshot.head, locale: 'fr' } } }];
    await assert.rejects(sparse.readCurrentHeads(scope, moreIds, 'ar'), /key_mismatch/);
    returned = [{ ...currentEntry, snapshot: { ...currentEntry.snapshot, head: { ...currentEntry.snapshot.head, scope: { ...scope, projectId: 'foreign' } } } }];
    await assert.rejects(sparse.readCurrentHeads(scope, moreIds, 'ar'), /scope_mismatch/);


    assert.deepEqual(await f.store.readMany(scope,moreIds,'ar'),expected);
    assert.deepEqual(await f.store.readMany({...scope,tenantId:'foreign'},[f.source.unitId],'ar'),[{version:0,source:null,head:null}]);
    const revisionKeys=[{unitId:f.source.unitId,revisionId:'revision'},{unitId:f.source.unitId,revisionId:'missing'}];
    assert.deepEqual(await f.store.readRevisions(scope,revisionKeys,'ar'),await batched.readRevisions(scope,revisionKeys,'ar'));
    const wrongBatch=new PostgrestTranslationJobPersistence({call:async()=>[{unitId:second.unitId,snapshot:await f.store.read(scope,f.source.unitId,'ar')}]});
    await assert.rejects(wrongBatch.readMany(scope,[f.source.unitId],'ar'),/key_mismatch/);
    const foreignBatch=new PostgrestTranslationJobPersistence({call:async()=>[{unitId:f.source.unitId,snapshot:{version:1,source:{...(await f.store.read(scope,f.source.unitId)).source,unit:{...unit,scope:{...scope,tenantId:'foreign'}}},head:null}}]});
    await assert.rejects(foreignBatch.readMany(scope,[f.source.unitId],'ar'),/scope_mismatch/);
    await assert.rejects(foreignBatch.readCurrentMany(scope,[f.source.unitId],'ar'),/scope_mismatch/);
    await assert.rejects(wrongBatch.readCurrentMany(scope,[f.source.unitId],'ar'),/key_mismatch/);
    const wrongRevisionBatch=new PostgrestTranslationJobPersistence({call:async()=>[{unitId:f.source.unitId,revisionId:'revision',revision:{...await f.store.readRevision(scope,f.source.unitId,'ar','revision'),locale:'fr'}}]});
    await assert.rejects(wrongRevisionBatch.readRevisions(scope,[{unitId:f.source.unitId,revisionId:'revision'}],'ar'),/key_mismatch/);
    // By-resource unit-ID resolution: server-side hashing with envelope-echo trust,
    // local fallback for out-of-domain resources, legacy RPC and refusals.
    const {translationUnitIdForScope,canonicalResourceEnvelope}=await import('../dist/identity.js');
    const {translationResourceLookupFallbackCount}=await import('../dist/adapters/postgrest.js');
    const local=translationUnitIdForScope(scope);
    const sample=[
        {kind:'record',connectionId:'ds-live',collection:'programs',key:[{column:'id',value:42},{column:'slug',value:'arizona-state'}],propertyPath:['title']},
        {kind:'component',documentId:'page-1',blockId:'hero',versionId:'default',propertyPath:['heading','text']},
        {kind:'system',componentKind:'x',messageId:'y'},
        {kind:'record',connectionId:'ds-live',collection:'programs',key:[{column:'id',value:1.5}],propertyPath:['p']},
        {kind:'component',documentId:'page-1',blockId:'ctl',versionId:'default',propertyPath:['a\nb']},
    ];
    const localIds=await Promise.all(sample.map(resource=>local(resource)));
    const expectedRows=localIds.map((id,index)=>({index,unitId:id,envelope:canonicalResourceEnvelope(scope,sample[index])}));
    let resolveCalls=0;
    const originOf=resource=>sample.findIndex(item=>JSON.stringify(item)===JSON.stringify(resource));
    const resolving=new PostgrestTranslationJobPersistence({
        async call(){throw Error('Unexpected dense lookup');},
        async resolveByResources(ownerScope,input){resolveCalls++;assert.deepEqual(ownerScope,scope);
            return input.resources.map((resource,position)=>({index:position,unitId:localIds[originOf(resource)],envelope:canonicalResourceEnvelope(scope,resource)}));},
    });
    const before=translationResourceLookupFallbackCount();
    assert.deepEqual(await resolving.resolveUnitIdsByResources(scope,sample),localIds);
    assert.equal(resolveCalls,1,'only in-domain resources reach the RPC');
    const legacy=new PostgrestTranslationJobPersistence({
        async call(){throw Error('Unexpected dense lookup');},
        async resolveByResources(){return undefined;},
    });
    assert.deepEqual(await legacy.resolveUnitIdsByResources(scope,sample),localIds,'legacy SQL falls back to client identity');
    assert.ok(translationResourceLookupFallbackCount()>=before+1,'fallback counter records legacy refusals');
    let echoMismatch=0;
    const divergent=new PostgrestTranslationJobPersistence({
        async call(){throw Error('Unexpected dense lookup');},
        async resolveByResources(ownerScope,input){echoMismatch++;
            const rows=input.resources.map((resource,position)=>({index:position,unitId:localIds[originOf(resource)],envelope:canonicalResourceEnvelope(scope,resource)}));
            rows[0]={...rows[0],envelope:rows[0].envelope.replace('"version":1}','"version":9}')};
            return rows;},
    });
    assert.deepEqual(await divergent.resolveUnitIdsByResources(scope,sample),localIds,'envelope divergence refuses and falls back');
    assert.ok(translationResourceLookupFallbackCount()>=before+2);
    const hostileResolve=new PostgrestTranslationJobPersistence({
        async call(){throw Error('Unexpected dense lookup');},
        async resolveByResources(ownerScope,input){return input.resources.map((resource,position)=>({index:position,unitId:'f'.repeat(64),envelope:canonicalResourceEnvelope(scope,resource)})).slice(1);},
    });
    await assert.rejects(hostileResolve.resolveUnitIdsByResources(scope,sample),/key_mismatch/);
    await assert.rejects(new PostgrestTranslationJobPersistence({async call(){throw Error('x');},async resolveByResources(){throw Error('private connection details');}}).resolveUnitIdsByResources(scope,[sample[0]]),e=>e.message==='translation_rpc_failed');
    const noHook=new PostgrestTranslationJobPersistence({async call(){throw Error('Unexpected dense lookup');}});
    assert.deepEqual(await noHook.resolveUnitIdsByResources(scope,sample),localIds,'transports without the hook fall back entirely');
    await assert.rejects(resolving.resolveUnitIdsByResources(scope,[]));
    await assert.rejects(resolving.resolveUnitIdsByResources(scope,Array.from({length:501},()=>sample[0])));
} finally { f.close(); }
console.log('translation PostgREST adapter: PASS (typed transport test double; live SQL proof is separate)');
