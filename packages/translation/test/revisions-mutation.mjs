import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { TranslationLifecycle } from '@frontbase/translation';
import { SqliteTranslationPersistence } from '@frontbase/translation/adapters/sqlite';
import { MemoryPersistence } from './memory-persistence.mjs';

const scope = { tenantId: 'tenant', projectId: 'project' };
const unit = { version: 1, scope, resource: { kind: 'system', componentKind: 'Text', messageId: 'greeting' }, sourceLocale: 'en', format: 'plain', text: 'Hello', placeholders: [], segmenterVersion: 1 };
const intent = (source, revisionId, expectedHead = null) => ({ version: 1, unitId: source.unitId, sourceFingerprint: source.sourceFingerprint, sourceVersion: source.sourceVersion,
    locale: 'ar', revisionId, expectedHead, text: 'مرحباً' });
const lifecycleUrl = new URL('../dist/revisions.js', import.meta.url), sqliteUrl = new URL('../dist/adapters/sqlite.js', import.meta.url);
let caught = 0;
async function mutate(name, url, before, after, exported, gate) {
    await gate(exported === 'TranslationLifecycle' ? TranslationLifecycle : SqliteTranslationPersistence);
    const original = await readFile(url, 'utf8');
    assert.ok(original.includes(before), 'Missing mutation site: ' + name);
    const changed = original.replace(before, after)
        .replace(/from (['"])(\.{1,2}\/[^'"]+)\1/g, (_, quote, path) => 'from ' + JSON.stringify(new URL(path, url).href))
        .replace(/from (['"])zod\1/g, 'from ' + JSON.stringify(import.meta.resolve('zod')));
    const module = await import('data:text/javascript;base64,' + Buffer.from(changed).toString('base64'));
    await assert.rejects(() => gate(module[exported]), undefined, 'Fault escaped: ' + name);
    caught++; console.log('revision mutation ' + name + ': caught');
}
await mutate('manual-head protection', lifecycleUrl, "snapshot.head?.provenance === 'manual' && provenance !== 'manual'", 'false', 'TranslationLifecycle', async Lifecycle => {
    const engine = new Lifecycle(new MemoryPersistence()), source = await engine.syncSource(scope, unit, null);
    await engine.writeManual(scope, intent(source, 'human'));
    assert.equal((await engine.writeGenerated(scope, intent(source, 'ai', 'human'))).reason, 'manual-protected');
});
await mutate('source ABA fencing', lifecycleUrl, 'snapshot.source.sourceVersion !== request.sourceVersion', 'false', 'TranslationLifecycle', async Lifecycle => {
    const engine = new Lifecycle(new MemoryPersistence()), original = await engine.syncSource(scope, unit, null);
    await engine.syncSource(scope, { ...unit, text: 'New wording' }, 1);
    await engine.syncSource(scope, unit, 2);
    assert.equal((await engine.writeGenerated(scope, intent(original, 'old-job'))).reason, 'source-version');
});
await mutate('trusted scope binding', lifecycleUrl, '!sameScope(scope, unit.scope)', 'false', 'TranslationLifecycle', async Lifecycle => {
    const engine = new Lifecycle(new MemoryPersistence());
    await assert.rejects(engine.syncSource({ ...scope, tenantId: 'other' }, unit, null), /translation_scope_mismatch/);
});
await mutate('atomic SQLite version gate', sqliteUrl, 'currentVersion !== expectedVersion', 'false', 'SqliteTranslationPersistence', async Persistence => {
    const db = new DatabaseSync(':memory:');
    try {
        const store = new Persistence(db); store.initialize();
        const engine = new TranslationLifecycle(store), source = await engine.syncSource(scope, unit, null);
        await engine.writeManual(scope, intent(source, 'human'));
        assert.equal(await store.compareAndSwap(scope, source.unitId, 1, { kind: 'source', source: { unit, sourceVersion: 2, fingerprint: source.sourceFingerprint } }), 'conflict');
        assert.equal((await store.read(scope, source.unitId)).source.sourceVersion, 1);
    } finally { db.close(); }
});
await mutate('SQLite owner read predicate', sqliteUrl, 'WHERE u.tenant_id = ? AND u.project_id = ? AND u.unit_id = ?', 'WHERE (? IS NOT NULL) AND (? IS NOT NULL) AND u.unit_id = ?', 'SqliteTranslationPersistence', async Persistence => {
    const db = new DatabaseSync(':memory:');
    try {
        const store = new Persistence(db); store.initialize();
        const source = await new TranslationLifecycle(store).syncSource(scope, unit, null);
        assert.equal((await store.read({ ...scope, tenantId: 'other' }, source.unitId)).source, null);
    } finally { db.close(); }
});
await mutate('SQLite failed-commit rollback', sqliteUrl, "db.exec('ROLLBACK');\n            throw Error('translation_store_write_failed');", "db.exec('COMMIT');\n            throw Error('translation_store_write_failed');", 'SqliteTranslationPersistence', async Persistence => {
    const db = new DatabaseSync(':memory:');
    try {
        let broken = false;
        const wrapped = { exec: sql => db.exec(sql), prepare: sql => {
            const statement = db.prepare(sql);
            return { get: (...values) => statement.get(...values), run: (...values) => {
                if (broken && sql.startsWith('INSERT INTO fb_i18n_heads')) throw Error('injected head write failure');
                return statement.run(...values);
            } };
        } };
        const store = new Persistence(wrapped); store.initialize();
        const engine = new TranslationLifecycle(store), source = await engine.syncSource(scope, unit, null);
        broken = true;
        await assert.rejects(engine.writeGenerated(scope, intent(source, 'failed')));
        assert.equal(await store.readRevision(scope, source.unitId, 'ar', 'failed'), null);
    } finally { db.close(); }
});
assert.equal(caught, 6);
console.log('revision-mutation: PASS (6/6 in-memory source faults; real SQLite gates; source/index unchanged)');
