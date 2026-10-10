import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sqliteRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler';
import { migrateUp } from '../dist/db/migrations.js';
import { packPublicationChunks, parsePublicationChunk, SitePublicationChunkStore, PUBLICATION_CHUNK_BYTES } from '../dist/compat/site-publication-chunks.js';

const db = sqliteRunner('file:' + join(tmpdir(), `frontbase-chunks-${crypto.randomUUID()}.db`).replaceAll('\\', '/'));
await migrateUp(db);
const now = '2026-10-11T00:00:00Z';
const owner = new SitePublicationChunkStore(db, 'alpha'), foreign = new SitePublicationChunkStore(db, 'beta');
const cities = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, title: `City ${i}` }));
const chunks = packPublicationChunks('cities', cities);
assert.deepEqual(chunks.map(c => c.records.length), [48, 48, 4]);
assert.deepEqual(chunks, packPublicationChunks('cities', [...cities].reverse()));
assert.equal(chunks.flatMap(c => c.records).length, 100);
assert.deepEqual(packPublicationChunks('cities', []), []);
assert.throws(() => packPublicationChunks('cities', [cities[0], { ...cities[0], id: '1' }]));
assert.throws(() => packPublicationChunks('cities', [{ ...cities[0], secret: 'PRIVATE' }]));
assert.throws(() => packPublicationChunks('cities', Array(20001).fill(cities[0])));
assert.throws(() => parsePublicationChunk({ ...chunks[0], records: cities.slice(0, 49) }));
assert.throws(() => parsePublicationChunk({ ...chunks[0], collection: 'programs' }));
assert.throws(() => new SitePublicationChunkStore(db, '  '));
const institutions = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: 'Campus', originalPath: `/campus-${i}/`,
    summary: '', cover: null, coverAlt: '', logo: null, cityId: 1, body: '界'.repeat(60000) }));
const unicode = packPublicationChunks('institutions', institutions);
assert.ok(unicode.length > 1);
for (const c of unicode) assert.ok(Buffer.byteLength(stableStringify(c)) <= PUBLICATION_CHUNK_BYTES);
assert.deepEqual(unicode.flatMap(c => c.records), institutions.sort((a,b) => String(a.id) < String(b.id) ? -1 : 1));
const ref = await owner.put(chunks[0], now);
assert.equal(ref.hash, createHash('sha256').update(stableStringify(chunks[0])).digest('hex'));
assert.equal(ref.bytes, Buffer.byteLength(stableStringify(chunks[0])));
assert.deepEqual(await owner.get(ref), chunks[0]);
assert.equal(await foreign.get(ref), null);
assert.deepEqual(await owner.put(chunks[0], now), ref);
for (const change of [{ count: 47 }, { bytes: ref.bytes - 1 }, { collection: 'articles' }])
    await assert.rejects(() => owner.get({ ...ref, ...change }), /publication_chunk_unavailable/);
assert.equal(await owner.get({ ...ref, hash: '0'.repeat(64) }), null);
const key = `site_publication:chunk:v1:${ref.hash}`;
const tampered = structuredClone(chunks[0]); tampered.records[0].title = 'Tamper';
assert.equal(Buffer.byteLength(stableStringify(tampered)), ref.bytes);
for (const raw of ['{', stableStringify(tampered), ' '.repeat(PUBLICATION_CHUNK_BYTES + 1)]) {
    await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?', [raw, 'alpha', key]);
    await assert.rejects(() => owner.get(ref), /publication_chunk_unavailable/);
    await assert.rejects(() => owner.put(chunks[0], now), /publication_chunk_unavailable/);
}
const pointers = await db.query('SELECT key FROM settings WHERE key = ?', ['site_publication:active:v1']);
assert.equal(pointers.length, 0);
console.log('publication chunks: count/UTF-8 bounds, deterministic packing, strict records, owner isolation, hash/descriptor corruption and immutable retry checks pass');
