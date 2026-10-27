import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PostgrestTranslationJobPersistence } from '@frontbase/translation/adapters/postgrest';
import { fixture, scope } from './job-fixtures.mjs';
const f = await fixture();
try {
    await f.store.enqueueJob(scope, f.intent('fixture'));
    const gates = [
        ['scope projection', "if (actual.tenantId !== expected.tenantId || actual.projectId !== expected.projectId)", 'if (false)', async Store => {
            const job = await f.store.readJob(scope, 'fixture');
            const store = new Store({ call: async () => ({ ...job, scope: { ...scope, tenantId: 'foreign' } }) });
            await assert.rejects(store.readJob(scope, 'fixture'), /scope_mismatch/);
        }],
        ['job key projection', 'job.intent.jobId !== jobId', 'false', async Store => {
            const job = await f.store.readJob(scope, 'fixture');
            const store = new Store({ call: async () => ({ ...job, intent: { ...job.intent, jobId: 'foreign' } }) });
            await assert.rejects(store.readJob(scope, 'fixture'), /key_mismatch/);
        }],
        ['response bound', 'z.array(id).max(128)', 'z.array(id).max(1000)', async Store => {
            const store = new Store({ call: async () => Array.from({ length: 129 }, (_, n) => 'job-' + n) });
            await assert.rejects(store.listReadyJobs(scope, 128));
        }],
        ['safe transport error', "catch {\n            throw Error('translation_rpc_failed');\n        }", 'catch (error) { throw error; }', async Store => {
            const store = new Store({ call: async () => { throw Error('private credentials'); } });
            await assert.rejects(store.readJob(scope, 'fixture'), e => e.message === 'translation_rpc_failed');
        }],
        ['memory scope binding', 'owner(value.revision.scope, scope);', '', async Store => {
            const revision = { ...f.revision(), provenance: 'manual', scope: { ...scope, tenantId: 'foreign' } };
            const store = new Store({ call: async () => ({ unitId: f.source.unitId, revision }) });
            await assert.rejects(store.findApprovedHead(scope, 'ar', f.source.sourceFingerprint, 'f'.repeat(64)), /scope_mismatch/);
        }],
    ];
    const url = new URL('../dist/adapters/postgrest.js', import.meta.url), source = await readFile(url, 'utf8');
    for (const [name, before, after, gate] of gates) {
        await gate(PostgrestTranslationJobPersistence); assert.ok(source.includes(before), name);
        const code = source.replace(before, after).replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, q, path) => 'from ' + JSON.stringify(new URL(path, url).href))
            .replace(/from (['"])zod\1/g, 'from ' + JSON.stringify(import.meta.resolve('zod')));
        const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
        await assert.rejects(gate(module.PostgrestTranslationJobPersistence), undefined, 'Fault escaped: ' + name);
        console.log('HTTP mutation ' + name + ': caught');
    }
} finally { f.close(); }
console.log('HTTP adapter mutations: PASS (5/5; in-memory module faults, no source/index mutation)');
