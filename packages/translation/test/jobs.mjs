import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TranslationLifecycle, TranslationJobRunner, translationContextFingerprint, EMPTY_TRANSLATION_CONTEXT_FINGERPRINT, translationUnitId, messageSourceFingerprint } from '@frontbase/translation';
import { SqliteTranslationJobPersistence } from '@frontbase/translation/adapters/sqlite-jobs';
import { SqliteTranslationPersistence } from '@frontbase/translation/adapters/sqlite';
import { fixture, deferred, scope, unit } from './job-fixtures.mjs';

assert.equal(await translationContextFingerprint({ version: 1 }), EMPTY_TRANSLATION_CONTEXT_FINGERPRINT);
{
    const f = await fixture();
    try {
        const context = { ...f.context, guidance: 'Apply means attach a coating' };
        const updated = await f.engine.syncSource(scope, unit, 1, context);
        assert.equal(updated.sourceVersion, 2); assert.equal(updated.sourceFingerprint, f.source.sourceFingerprint);
        assert.notEqual(updated.contextFingerprint, f.source.contextFingerprint);
        assert.equal((await f.store.readSourceVersion(scope, f.source.unitId, 1)).context.guidance, f.context.guidance);
        assert.equal((await f.store.readSourceVersion(scope, f.source.unitId, 2)).context.guidance, context.guidance);
        assert.equal(await f.store.readSourceVersion({ ...scope, projectId: 'other' }, f.source.unitId, 1), null);
        assert.equal((await f.engine.writeManual(scope, f.revision({ sourceVersion: 2 }))).reason, 'context-fingerprint');
        await assert.rejects(f.engine.syncSource(scope, unit, 2, { version: 1, credentials: 'never' }));
        assert.equal((await f.engine.syncSource(scope, unit, 2, context)).status, 'unchanged');
        assert.equal((await f.engine.syncSource(scope, unit, 2)).status, 'unchanged', 'Omitted context preserves authored hints');
    } finally { f.close(); }
}
{
    const f = await fixture();
    try {
        const intent = f.intent('happy'), provider = f.provider(input => {
            assert.equal(input.source.context.role, 'button'); assert.equal(input.targetLocale, 'ar');
            return { text: 'قدّم', usage: { inputTokens: 5, outputTokens: 2 } };
        });
        assert.equal(await f.store.enqueueJob(scope, intent), 'created');
        assert.equal(await f.store.enqueueJob(scope, intent), 'already-exists');
        assert.equal(await f.store.enqueueJob(scope, { ...intent, providerId: 'other' }), 'id-conflict');
        await assert.rejects(f.store.enqueueJob(scope, { ...intent, apiKey: 'never' }));
        assert.deepEqual(await f.store.listReadyJobs(scope, 4), ['happy']);
        const results = await Promise.all([f.runner(provider).runOnce(scope, 'happy'), f.runner(provider).runOnce(scope, 'happy')]);
        assert.ok(results.some(job => job.status === 'completed')); assert.equal(provider.calls, 1);
        assert.equal((await f.runner(provider).runOnce(scope, 'happy')).status, 'completed'); assert.equal(provider.calls, 1);
        assert.equal((await f.store.read(scope, f.source.unitId, 'ar')).head.text, 'قدّم');
        assert.equal(await f.store.cancelJob(scope, 'happy'), false);
        assert.equal(await f.store.readJob({ ...scope, tenantId: 'other' }, 'happy'), null);
        assert.equal(await f.store.claimJob({ ...scope, projectId: 'other' }, 'happy', 1000), null);
        assert.deepEqual(await f.store.listReadyJobs({ ...scope, projectId: 'other' }, 4), []);
        await assert.rejects(f.store.listReadyJobs(scope, 10000));
    } finally { f.close(); }
}
for (const mode of ['cancel', 'source', 'context', 'manual']) {
    const f = await fixture(), started = deferred(), response = deferred();
    try {
        await f.store.enqueueJob(scope, f.intent(mode));
        const provider = f.provider(() => { started.resolve(); return response.promise; });
        const running = f.runner(provider).runOnce(scope, mode); await started.promise;
        if (mode === 'cancel') await f.store.cancelJob(scope, mode);
        if (mode === 'source') await f.engine.syncSource(scope, { ...unit, text: 'Apply now' }, 1, f.context);
        if (mode === 'context') await f.engine.syncSource(scope, unit, 1, { ...f.context, role: 'verb with changed meaning' });
        if (mode === 'manual') assert.equal((await f.engine.writeManual(scope, f.revision({ revisionId: 'human', text: 'تصحيح' }))).status, 'committed');
        response.resolve({ text: 'قدّم' });
        const result = await running;
        assert.equal(result.status, mode === 'cancel' ? 'cancelled' : 'failed');
        assert.equal(await f.store.readRevision(scope, f.source.unitId, 'ar', 'rev-' + mode), null);
        assert.equal((await f.store.read(scope, f.source.unitId, 'ar')).head?.revisionId ?? null, mode === 'manual' ? 'human' : null);
    } finally { f.close(); }
}
{
    const f = await fixture();
    try {
        await f.store.enqueueJob(scope, f.intent('before-dispatch'));
        await f.engine.syncSource(scope, { ...unit, text: 'Changed before dispatch' }, 1, f.context);
        const provider = f.provider();
        assert.equal((await f.runner(provider).runOnce(scope, 'before-dispatch')).lastError, 'input-changed');
        assert.equal(provider.calls, 0);
    } finally { f.close(); }
}
{
    const f = await fixture(), started = deferred(), response = deferred();
    try {
        await f.store.enqueueJob(scope, f.intent('replace'));
        const oldProvider = f.provider(() => { started.resolve(); return response.promise; });
        const running = f.runner(oldProvider, { leaseMs: 1000, providerTimeoutMs: 999 }).runOnce(scope, 'replace'); await started.promise;
        f.advance(1001);
        const replacement = f.provider(() => ({ text: 'NEW' }));
        assert.equal((await f.runner(replacement).runOnce(scope, 'replace')).status, 'completed');
        response.resolve({ text: 'OLD' }); await running;
        assert.equal((await f.store.read(scope, f.source.unitId, 'ar')).head.text, 'NEW');
        assert.equal(oldProvider.keys[0], replacement.keys[0], 'Scoped provider idempotency key is stable across retries');
        assert.equal((await f.store.readJob(scope, 'replace')).uncertainAttempts, 1);
    } finally { f.close(); }
}
{
    const f = await fixture();
    try {
        await f.store.enqueueJob(scope, f.intent('epoch'));
        const old = await f.store.claimJob(scope, 'epoch', 1000); await f.store.markJobDispatched(scope, 'epoch', old.leaseVersion);
        f.advance(1001);
        const fresh = await f.store.claimJob(scope, 'epoch', 1000); await f.store.markJobDispatched(scope, 'epoch', fresh.leaseVersion);
        assert.equal(await f.store.renewJob(scope, 'epoch', old.leaseVersion, 1000), false);
        assert.equal(await f.store.renewJob(scope, 'epoch', fresh.leaseVersion, 2000), true);
        const result = await f.engine.writeJobResult(scope, f.revision({ revisionId: 'rev-epoch' }), { jobId: 'epoch', leaseVersion: old.leaseVersion });
        assert.equal(result.reason, 'job-fenced');
        assert.equal((await f.store.read(scope, f.source.unitId, 'ar')).head, null);
    } finally { f.close(); }
}
for (const mode of ['denied', 'exception', 'invalid', 'timeout']) {
    const f = await fixture();
    try {
        await f.store.enqueueJob(scope, f.intent(mode, { maxAttempts: 2 }));
        const provider = f.provider((input, options) => {
            if (mode === 'exception') throw Error('SECRET provider response');
            if (mode === 'invalid') return { text: 'bad', credentials: 'SECRET' };
            if (mode === 'timeout') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('SECRET aborted'))));
            return { text: 'قدّم' };
        });
        const runner = f.runner(provider, { authorize: async () => mode !== 'denied', ...(mode === 'timeout' ? { leaseMs: 1000, providerTimeoutMs: 5 } : {}) });
        let result = await runner.runOnce(scope, mode);
        assert.ok(!JSON.stringify(result).includes('SECRET'));
        if (mode === 'denied') { assert.equal(result.status, 'failed'); assert.equal(provider.calls, 0); }
        if (mode === 'invalid') assert.equal(result.status, 'failed');
        if (['exception','timeout'].includes(mode)) {
            assert.equal(result.status, 'queued'); assert.deepEqual(await f.store.listReadyJobs(scope, 5), []);
            f.advance(1000); result = await runner.runOnce(scope, mode);
            assert.equal(result.status, 'failed'); assert.equal(provider.calls, 2); assert.equal(result.uncertainAttempts, 2);
        }
    } finally { f.close(); }
}
// Actual file recovery: dispatched lease survives process-like close/reopen and is rediscovered/reclaimed.
const directory = mkdtempSync(join(tmpdir(), 'frontbase-jobs-')), filename = join(directory, 'jobs.sqlite');
let db = new DatabaseSync(filename), now = 1000;
try {
    let store = new SqliteTranslationJobPersistence(db, { clock: () => now }); store.initialize();
    const source = await new TranslationLifecycle(store).syncSource(scope, unit, null, { version: 1, role: 'button' });
    const intent = { version: 1, jobId: 'restart', revisionId: 'restart-revision', unitId: source.unitId, locale: 'ar', sourceVersion: 1,
        sourceFingerprint: source.sourceFingerprint, contextFingerprint: source.contextFingerprint, expectedHead: null, providerId: 'fixture', promptVersion: 'v1', maxAttempts: 3 };
    await store.enqueueJob(scope, intent); const claim = await store.claimJob(scope, 'restart', 1000); await store.markJobDispatched(scope, 'restart', claim.leaseVersion);
    db.close(); db = new DatabaseSync(filename); now = 2001;
    store = new SqliteTranslationJobPersistence(db, { clock: () => now }); store.initialize();
    assert.deepEqual(await store.listReadyJobs(scope, 5), ['restart']);
    const runner = new TranslationJobRunner(store, { id: 'fixture', generate: async () => ({ text: 'قدّم' }) }, { authorize: async () => true });
    const done = await runner.runOnce(scope, 'restart'); assert.equal(done.status, 'completed'); assert.equal(done.attempt, 2); assert.equal(done.uncertainAttempts, 1);
    db.close(); db = new DatabaseSync(filename); store = new SqliteTranslationJobPersistence(db, { clock: () => now }); store.initialize();
    assert.equal((await store.readJob(scope, 'restart')).status, 'completed');
    assert.equal((await store.read(scope, source.unitId, 'ar')).head.revisionId, 'restart-revision');
} finally { db.close(); rmSync(filename); rmdirSync(directory); }

// Migrate only the current recoverable version from the earlier schema; never fabricate absent versions.
const legacy = new DatabaseSync(':memory:');
try {
    legacy.exec(`CREATE TABLE fb_i18n_meta(id INTEGER PRIMARY KEY, schema_version INTEGER NOT NULL); INSERT INTO fb_i18n_meta VALUES(1,1);
        CREATE TABLE fb_i18n_units(tenant_id TEXT,project_id TEXT,unit_id TEXT,version INTEGER,source_version INTEGER,source_json TEXT,source_fingerprint TEXT,PRIMARY KEY(tenant_id,project_id,unit_id));`);
    const unitId = await translationUnitId(scope, unit.resource), fp = await messageSourceFingerprint(unit);
    legacy.prepare('INSERT INTO fb_i18n_units VALUES(?,?,?,?,?,?,?)').run(scope.tenantId,scope.projectId,unitId,9,7,JSON.stringify(unit),fp);
    legacy.exec(`CREATE TABLE fb_i18n_revisions(tenant_id TEXT,project_id TEXT,unit_id TEXT,locale TEXT,revision_id TEXT,payload_json TEXT,PRIMARY KEY(tenant_id,project_id,unit_id,locale,revision_id));
        CREATE TABLE fb_i18n_heads(tenant_id TEXT,project_id TEXT,unit_id TEXT,locale TEXT,revision_id TEXT,PRIMARY KEY(tenant_id,project_id,unit_id,locale));`);
    const oldRevision = { version: 1, scope, unitId, revisionId: 'legacy-human', locale: 'ar', sourceFingerprint: fp, sourceVersion: 7, text: 'تصحيح سابق', provenance: 'manual', expectedHead: null };
    legacy.prepare('INSERT INTO fb_i18n_revisions VALUES(?,?,?,?,?,?)').run(scope.tenantId,scope.projectId,unitId,'ar','legacy-human',JSON.stringify(oldRevision));
    legacy.prepare('INSERT INTO fb_i18n_heads VALUES(?,?,?,?,?)').run(scope.tenantId,scope.projectId,unitId,'ar','legacy-human');
    const adapter = new SqliteTranslationPersistence(legacy); adapter.initialize();
    assert.equal(legacy.prepare('SELECT schema_version FROM fb_i18n_meta').get().schema_version, 2);
    assert.equal((await adapter.readSourceVersion(scope, unitId, 7)).contextFingerprint, EMPTY_TRANSLATION_CONTEXT_FINGERPRINT);
    assert.equal(await adapter.readSourceVersion(scope, unitId, 6), null);
    assert.equal((await adapter.read(scope, unitId, 'ar')).head.text, oldRevision.text);
    const { scope: oldScope, provenance: oldProvenance, ...oldIntent } = oldRevision;
    const engine = new TranslationLifecycle(adapter);
    assert.equal((await engine.writeManual(scope, oldIntent)).status, 'already-committed');
    assert.equal((await engine.writeGenerated(scope, { ...oldIntent, revisionId: 'after-migration', expectedHead: 'legacy-human' })).reason, 'manual-protected');
} finally { legacy.close(); }
// Failure after head advancement but before job completion must roll back BOTH revisions and job status.
{
    const db = new DatabaseSync(':memory:'); let fail = false;
    const connection = { exec: sql => db.exec(sql), prepare: sql => { const statement = db.prepare(sql); return {
        get: (...args) => statement.get(...args), run: (...args) => { if (fail && sql.startsWith('UPDATE fb_i18n_jobs') && args[0] === 'completed') throw Error('injected completion failure'); return statement.run(...args); }
    }; } };
    const f = await fixture({ db, connection });
    try {
        await f.store.enqueueJob(scope, f.intent('rollback'));
        const claimed = await f.store.claimJob(scope, 'rollback', 1000); await f.store.markJobDispatched(scope, 'rollback', claimed.leaseVersion); fail = true;
        await assert.rejects(f.engine.writeJobResult(scope, f.revision({ revisionId: 'rev-rollback' }), { jobId: 'rollback', leaseVersion: claimed.leaseVersion }), /translation_store_write_failed/);
        assert.equal((await f.store.read(scope, f.source.unitId, 'ar')).head, null);
        assert.equal(await f.store.readRevision(scope, f.source.unitId, 'ar', 'rev-rollback'), null);
        assert.equal((await f.store.readJob(scope, 'rollback')).status, 'leased');
    } finally { f.close(); }
}
console.log('jobs/history: immutable context, fenced atomic completion, scope, competing/recovered leases, renewal, cancellation, stale source/context/manual writes, retry/timeout/denial, opaque errors, SQLite restart/migration/rollback PASS');
