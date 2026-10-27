import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TranslationLifecycle, TranslationJobRunner } from '@frontbase/translation';
import { SqliteTranslationJobPersistence } from '@frontbase/translation/adapters/sqlite-jobs';
import { fixture, scope, unit } from './job-fixtures.mjs';
let caught = 0;
async function mutation(name, file, before, after, exported, gate) {
    const originalClass = { TranslationLifecycle, TranslationJobRunner, SqliteTranslationJobPersistence }[exported];
    await gate(originalClass);
    const url = new URL('../dist/' + file, import.meta.url), original = await readFile(url, 'utf8');
    assert.ok(original.includes(before), 'Missing mutation site: ' + name);
    const changed = original.replace(before, after)
        .replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, quote, path) => 'from ' + JSON.stringify(new URL(path, url).href))
        .replace(/from (['"])zod\1/g, 'from ' + JSON.stringify(import.meta.resolve('zod')));
    const module = await import('data:text/javascript;base64,' + Buffer.from(changed).toString('base64'));
    await assert.rejects(() => gate(module[exported]), undefined, 'Fault escaped: ' + name);
    caught++; console.log('job mutation ' + name + ': caught');
}
await mutation('context invalidation', 'revisions.js', 'snapshot.source.contextFingerprint === contextHash', 'true', 'TranslationLifecycle', async Lifecycle => {
    const f = await fixture({ Lifecycle });
    try { assert.equal((await f.engine.syncSource(scope, unit, 1, { version: 1, role: 'different meaning' })).status, 'updated'); }
    finally { f.close(); }
});
await mutation('generation authorization', 'jobs.js', 'if (!allowed)', 'if (false)', 'TranslationJobRunner', async Runner => {
    const f = await fixture({ Runner });
    try {
        await f.store.enqueueJob(scope, f.intent('denied')); const provider = f.provider();
        await f.runner(provider, { authorize: async () => false }).runOnce(scope, 'denied'); assert.equal(provider.calls, 0);
    } finally { f.close(); }
});
await mutation('lease epoch fencing', 'adapters/sqlite-jobs.js', 'job.leaseVersion === epoch &&', 'true &&', 'SqliteTranslationJobPersistence', async Persistence => {
    const f = await fixture({ Persistence });
    try {
        await f.store.enqueueJob(scope, f.intent('epoch')); const old = await f.store.claimJob(scope, 'epoch', 1000);
        await f.store.markJobDispatched(scope, 'epoch', old.leaseVersion); f.advance(1001);
        const replacement = await f.store.claimJob(scope, 'epoch', 1000); await f.store.markJobDispatched(scope, 'epoch', replacement.leaseVersion);
        const result = await f.engine.writeJobResult(scope, f.revision({ revisionId: 'rev-epoch' }), { jobId: 'epoch', leaseVersion: old.leaseVersion });
        assert.equal(result.reason, 'job-fenced');
    } finally { f.close(); }
});
await mutation('retry attempt ceiling', 'adapters/sqlite-jobs.js', 'job.attempt >= job.intent.maxAttempts', 'false', 'SqliteTranslationJobPersistence', async Persistence => {
    const f = await fixture({ Persistence });
    try {
        await f.store.enqueueJob(scope, f.intent('limit', { maxAttempts: 1 })); const first = await f.store.claimJob(scope, 'limit', 1000);
        await f.store.markJobDispatched(scope, 'limit', first.leaseVersion); f.advance(1001);
        assert.equal(await f.store.claimJob(scope, 'limit', 1000), null); assert.equal((await f.store.readJob(scope, 'limit')).status, 'failed');
    } finally { f.close(); }
});
await mutation('job tenant read predicate', 'adapters/sqlite-jobs.js', 'WHERE tenant_id = ? AND project_id = ? AND job_id = ?', 'WHERE (? IS NOT NULL) AND (? IS NOT NULL) AND job_id = ?', 'SqliteTranslationJobPersistence', async Persistence => {
    const f = await fixture({ Persistence });
    try { await f.store.enqueueJob(scope, f.intent('private')); assert.equal(await f.store.readJob({ ...scope, tenantId: 'other' }, 'private'), null); }
    finally { f.close(); }
});
await mutation('persisted completion', 'adapters/sqlite-jobs.js', 'job.lastError = null;\n        this.saveJob(job);', 'job.lastError = null;\n        // fault: omit completed state', 'SqliteTranslationJobPersistence', async Persistence => {
    const f = await fixture({ Persistence });
    try { await f.store.enqueueJob(scope, f.intent('complete')); assert.equal((await f.runner(f.provider()).runOnce(scope, 'complete')).status, 'completed'); }
    finally { f.close(); }
});
assert.equal(caught, 6);
console.log('jobs-mutation: PASS (6/6 in-memory source faults; real SQLite recovery/fencing gates; source/index unchanged)');
