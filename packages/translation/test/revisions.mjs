import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationLifecycle, translationUnitId } from '@frontbase/translation';
import { SqliteTranslationPersistence } from '@frontbase/translation/adapters/sqlite';
import { MemoryPersistence } from './memory-persistence.mjs';

const scope = { tenantId: 'tenant', projectId: 'site' };
const unit = { version: 1, scope, resource: { kind: 'record', connectionId: 'live-content', collection: 'articles', key: [{ column: 'id', value: 7 }], propertyPath: ['title'] },
    sourceLocale: 'en', format: 'plain', text: 'Hello {{record.name}}', segmenterVersion: 1, placeholders: ['record.name'] };
const request = (source, revisionId, extra = {}) => ({ version: 1, unitId: source.unitId, revisionId, locale: 'AR', sourceFingerprint: source.sourceFingerprint,
    sourceVersion: source.sourceVersion, expectedHead: null, text: 'مرحباً {{record.name}}', ...extra });

async function conformance(store, label) {
    const engine = new TranslationLifecycle(store), source = await engine.syncSource(scope, unit, null);
    assert.equal(source.status, 'created');
    assert.equal((await engine.syncSource(scope, unit, null)).status, 'conflict');
    assert.equal((await engine.syncSource(scope, unit, 1)).status, 'unchanged');
    const initial = await store.read(scope, source.unitId, 'ar');
    assert.equal(initial.version, 1);
    initial.source.unit.text = 'MUTATED CLIENT COPY';
    assert.equal((await store.read(scope, source.unitId)).source.unit.text, unit.text);
    const ai = request(source, 'ai-1');
    assert.equal((await engine.writeGenerated(scope, ai)).status, 'committed');
    assert.equal((await engine.writeGenerated(scope, ai)).status, 'already-committed');
    assert.equal((await engine.writeGenerated(scope, { ...ai, text: 'Different {{record.name}}' })).reason, 'revision-id-conflict');
    assert.equal((await engine.writeGenerated(scope, request(source, 'stale-head'))).reason, 'head');
    assert.equal((await engine.writeManual(scope, request(source, 'manual-1', { expectedHead: 'ai-1', text: 'تصحيح {{record.name}}' }))).status, 'committed');
    assert.equal((await engine.writeGenerated(scope, request(source, 'late-ai', { expectedHead: 'manual-1' }))).reason, 'manual-protected');
    assert.equal((await engine.writeImported(scope, request(source, 'late-import', { expectedHead: 'manual-1' }))).reason, 'manual-protected');
    // Replaying an old successful job acknowledges history, without restoring its head.
    assert.equal((await engine.writeGenerated(scope, ai)).status, 'already-committed');
    assert.equal((await store.read(scope, source.unitId, 'ar')).head.revisionId, 'manual-1');
    assert.equal((await store.readRevision(scope, source.unitId, 'ar', 'ai-1')).text, ai.text);
    assert.equal((await engine.writeManual(scope, request(source, 'manual-2', { expectedHead: 'manual-1' }))).status, 'committed');
    const foreign = { tenantId: 'other', projectId: 'site' }, otherProject = { ...scope, projectId: 'other' };
    const history = await store.listRevisions(scope, source.unitId, 'ar', 2);
    assert.deepEqual(history.map(item => item.revisionId), ['manual-2', 'manual-1'], label + ' bounded newest-first history in storage order');
    assert.equal((await store.listRevisions(scope, source.unitId, 'ar', 100)).length, 3);
    assert.deepEqual(await store.listRevisions(scope, source.unitId, 'fr', 10), [], 'unknown locale history is empty');
    assert.deepEqual(await store.listRevisions(foreign, source.unitId, 'ar', 10), [], 'foreign scope history is empty');
    for (const owner of [foreign, otherProject]) {
        assert.equal((await store.read(owner, source.unitId, 'ar')).source, null);
        assert.equal(await store.readRevision(owner, source.unitId, 'ar', 'ai-1'), null);
        assert.equal((await engine.writeGenerated(owner, request(source, 'foreign'))).reason, 'missing-source');
    }
    await assert.rejects(engine.syncSource(foreign, unit, null), /translation_scope_mismatch/);
    await assert.rejects(engine.writeGenerated(scope, { ...ai, provenance: 'manual' }));
    await assert.rejects(engine.writeGenerated(scope, { ...ai, published: true }));
    const invalids = [request(source, 'missing-token', { expectedHead: 'manual-2', text: 'No binding' }),
        request(source, 'extra-token', { expectedHead: 'manual-2', text: '{{record.name}} {{record.secret}}' }),
        request(source, 'repeated-token', { expectedHead: 'manual-2', text: '{{record.name}} {{record.name}}' })];
    for (const invalid of invalids) assert.equal((await engine.writeManual(scope, invalid)).reason, 'invalid-tokens');
    assert.equal((await engine.writeManual(scope, request(source, 'bad-hash', { expectedHead: 'manual-2', sourceFingerprint: '0'.repeat(64) }))).reason, 'source-fingerprint');
    assert.equal((await engine.writeManual(scope, request(source, 'source-locale', { locale: 'en' }))).reason, 'source-locale');
    const changed = await engine.syncSource(scope, { ...unit, text: 'Welcome {{record.name}}' }, 1);
    assert.equal(changed.sourceVersion, 2);
    assert.equal((await engine.writeManual(scope, request(source, 'old-source', { expectedHead: 'manual-2' }))).reason, 'source-version');
    const restored = await engine.syncSource(scope, unit, 2);
    assert.equal(restored.sourceVersion, 3); assert.equal(restored.sourceFingerprint, source.sourceFingerprint);
    assert.equal((await engine.writeManual(scope, request(source, 'aba-stale', { expectedHead: 'manual-2' }))).reason, 'source-version');
    assert.equal((await store.read(scope, source.unitId, 'ar')).head.revisionId, 'manual-2');
    const competitors = await Promise.all(['one', 'two'].map(id => engine.writeManual(scope, request(restored, id, { expectedHead: 'manual-2' }))));
    assert.equal(competitors.filter(result => result.status === 'committed').length, 1, label + ' single CAS winner');
    const writes = await Promise.all(['three', 'four'].map(text => engine.syncSource(scope, { ...unit, text: text + ' {{record.name}}' }, 3)));
    assert.equal(writes.filter(result => result.status === 'updated').length, 1, label + ' source CAS winner');
    const otherLocale = request(await engine.syncSource(scope, (await store.read(scope, source.unitId)).source.unit, 4), 'fr-1', { locale: 'fr', text: (await store.read(scope, source.unitId)).source.unit.text });
    assert.equal((await engine.writeGenerated(scope, otherLocale)).status, 'committed');
    const unsupportedUnit = { ...unit, resource: { kind: 'system', componentKind: 'Label', messageId: 'icu' }, format: 'icu-v1', text: '{count, plural, other {Records}}', placeholders: ['count'] };
    const unsupported = await engine.syncSource(scope, unsupportedUnit, null);
    assert.equal((await engine.writeGenerated(scope, request(unsupported, 'unsupported'))).reason, 'unsupported-format');
    const sameKey = await engine.syncSource(otherProject, { ...unit, scope: otherProject }, null);
    assert.notEqual(sameKey.unitId, source.unitId);
    assert.equal((await engine.writeGenerated(otherProject, request(sameKey, 'ai-1'))).status, 'committed');
    const duplicateSource = await engine.syncSource(scope, { ...unit, resource: { ...unit.resource, propertyPath: ['summary'] } }, null);
    const duplicateIntent = request(duplicateSource, 'same-job');
    const duplicates = await Promise.all([engine.writeGenerated(scope, duplicateIntent), engine.writeGenerated(scope, duplicateIntent)]);
    assert.deepEqual(duplicates.map(result => result.status).sort(), ['already-committed', 'committed']);
    assert.equal((await store.read(scope, duplicateSource.unitId, 'ar')).version, 2, 'Duplicate delivery does not append/advance twice');
    const quoted = { tenantId: "O'Reilly", projectId: 'site; DROP TABLE units' };
    const quotedSource = await engine.syncSource(quoted, { ...unit, scope: quoted }, null);
    assert.equal((await engine.writeGenerated(quoted, request(quotedSource, 'quoted-id'))).status, 'committed');
    await assert.rejects(engine.syncSource(scope, unit, Number.MAX_SAFE_INTEGER + 1));
    console.log(`revision conformance ${label}: isolation, CAS races, manual/import protection, immutable replay, source ABA, tokens and format refusal PASS`);
}

await conformance(new MemoryPersistence(), 'memory test double');
const directory = mkdtempSync(join(tmpdir(), 'frontbase-translation-revisions-'));
const filename = join(directory, 'translation.sqlite');
let db = new DatabaseSync(filename);
try {
    let store = new SqliteTranslationPersistence(db); store.initialize(); store.initialize();
    await conformance(store, 'SQLite file');
    const id = await translationUnitId(scope, unit.resource), before = await store.read(scope, id, 'ar');
    db.close(); db = new DatabaseSync(filename);
    store = new SqliteTranslationPersistence(db); store.initialize();
    assert.deepEqual(await store.read(scope, id, 'ar'), before, 'Source/head survive close and reopen');
    assert.ok(await store.readRevision(scope, id, 'ar', 'ai-1'), 'Immutable history survives close and reopen');
    const db2 = new DatabaseSync(filename), store2 = new SqliteTranslationPersistence(db2); store2.initialize();
    try {
        const source = { unitId: id, sourceVersion: before.source.sourceVersion, sourceFingerprint: before.source.fingerprint };
        const results = await Promise.all([store, store2].map((adapter, i) => new TranslationLifecycle(adapter).writeManual(scope, request(source, `connection-${i}`, { expectedHead: before.head.revisionId }))));
        assert.equal(results.filter(result => result.status === 'committed').length, 1, 'Two separate SQLite connections admit one CAS winner');
    } finally { db2.close(); }
    const isolated = new SqliteTranslationPersistence(db, { tablePrefix: 'other_' }); isolated.initialize();
    assert.equal((await isolated.read(scope, id)).source, null, 'Separate destinations/namespaces keep the same API');
    await conformance(isolated, 'SQLite second table namespace');
    assert.throws(() => new SqliteTranslationPersistence(db, { tablePrefix: 'x;DROP TABLE x' }), /invalid_translation_table_prefix/);
    db.exec('UPDATE other_meta SET schema_version = 999');
    assert.throws(() => isolated.initialize(), /unsupported_translation_schema/);
    console.log('SQLite persistence: reopen/history, separate connections/namespaces, initialization and future-schema refusal PASS');
} finally { db.close(); rmSync(filename); rmdirSync(directory); }

// Force a failure after history INSERT but before head UPDATE. Every part must roll back.
const rollbackDb = new DatabaseSync(':memory:');
try {
    let failHead = false;
    const connection = { exec: sql => rollbackDb.exec(sql), prepare: sql => {
        const statement = rollbackDb.prepare(sql);
        return { get: (...values) => statement.get(...values), run: (...values) => {
            if (failHead && sql.startsWith('INSERT INTO fb_i18n_heads')) throw Error('injected failure');
            return statement.run(...values);
        } };
    } };
    const store = new SqliteTranslationPersistence(connection); store.initialize();
    const engine = new TranslationLifecycle(store), source = await engine.syncSource(scope, unit, null);
    failHead = true;
    await assert.rejects(engine.writeGenerated(scope, request(source, 'rolled-back')), /translation_store_write_failed/);
    assert.equal(await store.readRevision(scope, source.unitId, 'ar', 'rolled-back'), null);
    assert.equal((await store.read(scope, source.unitId, 'ar')).version, 1);
    assert.equal((await store.read(scope, source.unitId, 'ar')).head, null);
    failHead = false;
    assert.equal((await engine.writeGenerated(scope, request(source, 'rolled-back'))).status, 'committed');
    console.log('SQLite failed commit: no orphan revision/head/version; retry succeeds PASS');
} finally { rollbackDb.close(); }

// History exposure: bounded validated newest-first listing, and restore composed as a fresh auditable manual revision.
{
    const historyDb = new DatabaseSync(':memory:');
    try {
        const store = new SqliteTranslationPersistence(historyDb); store.initialize();
        const engine = new TranslationLifecycle(store);
        const source = await engine.syncSource(scope, unit, null);
        await engine.writeGenerated(scope, request(source, 'h-1'));
        await engine.writeManual(scope, request(source, 'h-2', { expectedHead: 'h-1', text: 'تحديث {{record.name}}' }));
        await engine.writeManual(scope, request(source, 'h-3', { expectedHead: 'h-2', text: 'نهائي {{record.name}}' }));
        assert.deepEqual((await store.listRevisions(scope, source.unitId, 'ar', 2)).map(item => item.revisionId), ['h-3', 'h-2']);
        await assert.rejects(store.listRevisions(scope, source.unitId, 'ar', 0), /invalid_translation_history_limit/);
        await assert.rejects(store.listRevisions(scope, source.unitId, 'ar', 2.5), /invalid_translation_history_limit/);
        await assert.rejects(store.listRevisions(scope, source.unitId, 'ar', Number.MAX_SAFE_INTEGER + 1), /invalid_translation_history_limit/);
        const head = (await store.read(scope, source.unitId, 'ar')).head;
        const target = await store.readRevision(scope, source.unitId, 'ar', 'h-1');
        const restored = await engine.writeManual(scope, { version: 1, unitId: source.unitId, revisionId: 'restore-1', locale: 'ar',
            sourceFingerprint: target.sourceFingerprint, sourceVersion: target.sourceVersion, contextFingerprint: target.contextFingerprint,
            expectedHead: head.revisionId, text: target.text });
        assert.equal(restored.status, 'committed');
        const restoredHead = (await store.read(scope, source.unitId, 'ar')).head;
        assert.equal(restoredHead.revisionId, 'restore-1');
        assert.equal(restoredHead.text, 'مرحباً {{record.name}}');
        assert.equal(restoredHead.provenance, 'manual');
        assert.equal((await store.listRevisions(scope, source.unitId, 'ar', 10)).map(item => item.revisionId).join(','), 'restore-1,h-3,h-2,h-1');
        // A restore replayed against a moved head refuses instead of silently rewinding history.
        assert.equal((await engine.writeManual(scope, { version: 1, unitId: source.unitId, revisionId: 'restore-2', locale: 'ar',
            sourceFingerprint: target.sourceFingerprint, sourceVersion: target.sourceVersion, contextFingerprint: target.contextFingerprint,
            expectedHead: 'h-2', text: target.text })).reason, 'head');
        console.log('SQLite revision history: bounded validated newest-first listing, restore as fresh manual revision, stale-head restore refusal PASS');
    } finally { historyDb.close(); }
}

for (const separate of [false, true]) {
    const content = new DatabaseSync(':memory:'), destination = separate ? new DatabaseSync(':memory:') : content;
    try {
        content.exec('CREATE TABLE articles(id INTEGER PRIMARY KEY, title TEXT NOT NULL)');
        content.prepare('INSERT INTO articles(id, title) VALUES(?, ?)').run(7, unit.text);
        const store = new SqliteTranslationPersistence(destination); store.initialize();
        const engine = new TranslationLifecycle(store);
        const source = await engine.syncSource(scope, { ...unit, text: content.prepare('SELECT title FROM articles WHERE id = ?').get(7).title }, null);
        assert.equal((await engine.writeGenerated(scope, request(source, 'destination-test'))).status, 'committed');
        assert.equal(content.prepare('SELECT title FROM articles WHERE id = ?').get(7).title, unit.text);
        assert.equal((await store.read(scope, source.unitId, 'ar')).head.text, 'مرحباً {{record.name}}');
        if (separate) assert.equal(content.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'fb_i18n_units'").get().n, 0);
    } finally { if (separate) destination.close(); content.close(); }
}
console.log('SQLite same/separate source and translation databases: identical lifecycle, original content unchanged PASS');
