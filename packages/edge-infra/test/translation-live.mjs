/** Explicit credential-gated conformance against an owner-authorized HTTPS deployment.
 * Usage: node test/translation-live.mjs <private-credentials.json> <https-postgrest-root>.
 * Requires the temporary, scope-limited completion-failure trigger documented in the receipt.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { translationPersistenceFromSupabase } from '../dist/translation.js';
import { TranslationLifecycle, TranslationJobRunner } from '@frontbase/translation';

const [credentialFile, endpoint, receiptFile] = process.argv.slice(2);
if (!credentialFile || !endpoint || !receiptFile) throw Error('Explicit credentials, HTTPS endpoint and private receipt path required');
const credentials = JSON.parse(await readFile(credentialFile, 'utf8')), requests = [];
const origin = new URL(endpoint).origin;
const transport = async (url, options) => {
    const address = new URL(url), body = JSON.parse(options.body);
    assert.equal(address.protocol, 'https:'); assert.equal(address.origin, origin);
    assert.equal(address.pathname, '/rpc/translation_request'); assert.equal(options.method, 'POST');
    assert.equal(new Headers(options.headers).get('content-profile'), 'translations');
    assert.ok(!('sql' in body.p_input)); requests.push(body.p_operation);
    return fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
};
const store = translationPersistenceFromSupabase({ url: endpoint, restUrl: endpoint, serviceKey: credentials.SERVICE_ROLE_KEY, fetchImpl: transport });
await store.initialize();
const scope = { tenantId: 'http-conformance-' + randomUUID(), projectId: 'rpc-contract-test' }, engine = new TranslationLifecycle(store);
const baseUnit = { version: 1, scope, resource: { kind: 'system', componentKind: 'Button', messageId: 'apply' }, sourceLocale: 'en', format: 'plain', text: 'Apply', placeholders: [], segmenterVersion: 1 };
const source = await engine.syncSource(scope, baseUnit, null, { version: 1, role: 'button' });
assert.equal(source.status, 'created');
const revision = (id, extra = {}) => ({ version: 1, unitId: source.unitId, sourceVersion: 1, sourceFingerprint: source.sourceFingerprint,
    contextFingerprint: source.contextFingerprint, locale: 'ar', revisionId: 'rev-' + id, expectedHead: null, text: 'قدّم', ...extra });
const intent = (id, extra = {}) => { const { text, ...r } = revision(id); return { ...r, jobId: id, providerId: 'fixture', promptVersion: 'v1', maxAttempts: 3, ...extra }; };
assert.equal((await store.read({ ...scope, tenantId: scope.tenantId + '-foreign' }, source.unitId)).source, null);
assert.equal(await store.readSourceVersion({ ...scope, projectId: 'foreign' }, source.unitId, 1), null);
assert.equal(await store.enqueueJob(scope, intent('happy')), 'created');
assert.equal(await store.enqueueJob(scope, intent('happy')), 'already-exists');
assert.equal(await store.enqueueJob(scope, intent('happy', { providerId: 'other' })), 'id-conflict');
assert.deepEqual(await store.listReadyJobs(scope, 8), ['happy']);
assert.deepEqual(await store.listReadyJobs({ ...scope, tenantId: 'foreign' }, 8), []);
let generated = 0;
const provider = { id: 'fixture', async generate() { generated++; return { text: 'قدّم' }; } };
await Promise.all(Array.from({ length: 8 }, () => new TranslationJobRunner(store, provider, { authorize: async () => true }).runOnce(scope, 'happy')));
assert.equal(generated, 1); assert.equal((await store.readJob(scope, 'happy')).status, 'completed');
assert.equal((await store.read(scope, source.unitId, 'ar')).head.revisionId, 'rev-happy');
assert.equal((await engine.writeGenerated(scope, revision('happy'))).status, 'already-committed');
assert.equal(await store.readRevision({ ...scope, tenantId: 'foreign' }, source.unitId, 'ar', 'rev-happy'), null);
assert.equal(await store.readJob({ ...scope, projectId: 'foreign' }, 'happy'), null);

assert.equal(await store.enqueueJob(scope, intent('epoch', { expectedHead: 'rev-happy' })), 'created');
const old = await store.claimJob(scope, 'epoch', 1000); assert.equal(await store.markJobDispatched(scope, 'epoch', old.leaseVersion), true);
await new Promise(resolve => setTimeout(resolve, 1100));
const replacement = await store.claimJob(scope, 'epoch', 60000); assert.ok(replacement.leaseVersion > old.leaseVersion);
assert.equal(await store.renewJob(scope, 'epoch', old.leaseVersion, 60000), false);
assert.equal(await store.markJobDispatched(scope, 'epoch', replacement.leaseVersion), true);
assert.equal((await engine.writeJobResult(scope, revision('epoch', { expectedHead: 'rev-happy' }), { jobId: 'epoch', leaseVersion: old.leaseVersion })).reason, 'job-fenced');
assert.equal(await store.cancelJob(scope, 'epoch'), true);
assert.equal((await engine.writeJobResult(scope, revision('epoch', { expectedHead: 'rev-happy' }), { jobId: 'epoch', leaseVersion: replacement.leaseVersion })).reason, 'job-fenced');

assert.equal(await store.enqueueJob(scope, intent('rollback', { expectedHead: 'rev-happy' })), 'created');
const rollback = await store.claimJob(scope, 'rollback', 60000); await store.markJobDispatched(scope, 'rollback', rollback.leaseVersion);
const beforeRollback = await store.read(scope, source.unitId, 'ar');
await assert.rejects(engine.writeJobResult(scope, revision('rollback', { expectedHead: 'rev-happy' }), { jobId: 'rollback', leaseVersion: rollback.leaseVersion }), /translation_rpc_failed/);
assert.equal(await store.readRevision(scope, source.unitId, 'ar', 'rev-rollback'), null);
assert.deepEqual(await store.read(scope, source.unitId, 'ar'), beforeRollback);
assert.equal((await store.readJob(scope, 'rollback')).status, 'leased');

assert.equal(await store.enqueueJob(scope, intent('retry', { expectedHead: 'rev-happy', maxAttempts: 1 })), 'created');
const retry = await store.claimJob(scope, 'retry', 60000); await store.markJobDispatched(scope, 'retry', retry.leaseVersion);
assert.equal(await store.failJob(scope, 'retry', retry.leaseVersion, { code: 'provider-error', retryable: true, delayMs: 0 }), true);
assert.equal((await store.readJob(scope, 'retry')).status, 'failed');
assert.equal((await engine.writeManual(scope, revision('manual', { expectedHead: 'rev-happy' }))).status, 'committed');
assert.equal(await store.enqueueJob(scope, intent('manual-protected', { expectedHead: 'rev-manual' })), 'manual-protected');
assert.equal((await engine.writeGenerated(scope, revision('late', { expectedHead: 'rev-manual' }))).reason, 'manual-protected');
const updates = await Promise.all([engine.syncSource(scope, { ...baseUnit, text: 'Apply now' }, 1), engine.syncSource(scope, { ...baseUnit, text: 'Submit now' }, 1)]);
assert.equal(updates.filter(r => r.status === 'updated').length, 1);
assert.equal((await store.readSourceVersion(scope, source.unitId, 1)).unit.text, 'Apply');
assert.equal(await store.enqueueJob(scope, intent('stale')), 'input-changed');
const current = await store.read(scope, source.unitId);
const changed = await engine.syncSource(scope, current.source.unit, 2, { version: 1, role: 'changed context' });
assert.equal(changed.sourceVersion, 3);

// No-credential/invalid-credential requests and malformed operations fail at actual HTTP/SQL boundaries.
for (const token of [null, 'invalid']) {
    const response = await fetch(endpoint + '/rpc/translation_request', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ p_operation: 'capabilities', p_scope: scope, p_input: {} }) });
    assert.equal(response.status, 401);
}
for (const body of [{ p_operation: 'execute_sql', p_scope: scope, p_input: { sql: 'SELECT 1' } },
    { p_operation: 'cas', p_scope: scope, p_input: { unitId: source.unitId, expectedVersion: null, change: {} } },
    { p_operation: 'claim', p_scope: scope, p_input: { jobId: 'happy' } },
    { p_operation: 'read', p_scope: { ...scope, injected: true }, p_input: {} }]) {
    const response = await fetch(endpoint + '/rpc/translation_request', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + credentials.SERVICE_ROLE_KEY }, body: JSON.stringify(body) });
    assert.ok(response.status >= 400); assert.ok(!(await response.text()).includes(credentials.SERVICE_ROLE_KEY));
}
const receipt = { scope, unitId: source.unitId, protocol: 'HTTPS/PostgREST', requests: requests.length, operations: [...new Set(requests)].sort(), generatedFixtureCalls: generated,
    eightConcurrentClaims: true, sourceRace: true, immutableReplay: true, manualProtection: true, scopedReads: true,
    databaseLeaseEpoch: true, cancelFence: true, retryLimit: true, sourceContextInvalidation: true,
    forcedCompletionRollback: true, missingInvalidAuthDenied: true, arbitrarySqlRefused: true, realAI: false };
await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
console.log('Actual HTTPS translation persistence: PASS (' + requests.length + ' RPC calls; no AI service or socket client)');
