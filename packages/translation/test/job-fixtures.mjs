import { DatabaseSync } from 'node:sqlite';
import { TranslationLifecycle, TranslationJobRunner } from '@frontbase/translation';
import { SqliteTranslationJobPersistence } from '@frontbase/translation/adapters/sqlite-jobs';
export const scope = { tenantId: 'tenant', projectId: 'project' };
export const unit = { version: 1, scope, resource: { kind: 'system', componentKind: 'Button', messageId: 'apply' }, sourceLocale: 'en', format: 'plain', text: 'Apply', placeholders: [], segmenterVersion: 1 };
export async function fixture(options = {}) {
    const db = options.db ?? new DatabaseSync(':memory:');
    let time = 1000;
    const Persistence = options.Persistence ?? SqliteTranslationJobPersistence;
    const store = new Persistence(options.connection ?? db, { clock: () => time }); store.initialize();
    const Lifecycle = options.Lifecycle ?? TranslationLifecycle, Runner = options.Runner ?? TranslationJobRunner;
    const engine = new Lifecycle(store), context = { version: 1, role: 'button', guidance: 'Apply means submit an application' };
    const source = await engine.syncSource(scope, unit, null, context);
    const revision = extra => ({ version: 1, unitId: source.unitId, sourceVersion: source.sourceVersion, sourceFingerprint: source.sourceFingerprint,
        contextFingerprint: source.contextFingerprint, expectedHead: null, locale: 'ar', text: 'قدّم', revisionId: 'revision', ...extra });
    const intent = (jobId, extra = {}) => { const { text, ...rest } = revision(); return { ...rest, revisionId: 'rev-' + jobId, jobId, providerId: 'fixture', promptVersion: 'v1', maxAttempts: 3, ...extra }; };
    const provider = callback => ({ id: 'fixture', calls: 0, keys: [], async generate(input, opts) {
        this.calls++; this.keys.push(input.idempotencyKey);
        return callback ? callback(input, opts) : { text: 'قدّم' };
    } });
    return { db, store, engine, source, context, revision, intent, provider, scope, unit,
        runner: (provider, extra = {}) => new Runner(store, provider, { authorize: async () => true, ...extra }),
        advance: ms => { time += ms; }, now: () => time, close: () => db.close() };
}
export function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
