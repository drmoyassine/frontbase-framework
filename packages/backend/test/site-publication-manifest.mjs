import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteRunner } from '@frontbase/edge-infra';
import { stableStringify } from '@frontbase/compiler';
import { emptyDirectoryConfiguration } from '@frontbase/edge-core/directory/configuration';
import { SitePublicationManifestStore, sitePublicationManifestSchema } from '../dist/compat/site-publication-manifest.js';
import { migrateUp } from '../dist/db/migrations.js';

const db = sqliteRunner('file:' + join(tmpdir(), `frontbase-manifest-${crypto.randomUUID()}.db`).replaceAll('\\', '/'));
await migrateUp(db);
const config = emptyDirectoryConfiguration();
config.site = { name: 'Education', destination: 'Country', origin: 'https://example.com', locale: 'en' };
config.datasourceId = 'configured-source';
for (const role of ['institution', 'program', 'city']) {
    const m = config.collections[role]; m.table = role; m.scope = { field: 'country', value: 22 };
    Object.assign(m.fields, { id: 'id', title: 'title' }); if (role !== 'city') m.fields.originalPath = 'path';
}
config.collections.institution.fields.cityId = 'city'; config.collections.program.fields.institutionId = 'institution';
const node = (queryId) => ({ id: queryId, type: queryId.endsWith('.list') ? 'Repeater' : 'Container',
    props: { directoryQuery: { version: 1, queryId, params: queryId.endsWith('.detail') ? { path: '/sample/' } : {} } }, children: [] });
const templates = ['directory', 'institution', 'program', 'article-index', 'article'].map((role, i) => ({
    pageId: `00000000-0000-4000-8000-00000000000${i}`, role, title: role, description: '',
    layout: { root: { siteConfiguration: { version: 1, role } }, content: role === 'directory'
        ? [node('directory.institution.list'), node('directory.program.list')]
        : [node(role === 'article-index' ? 'directory.article.list' : `directory.${role}.detail`)] } }));
const header = { configurationRevision: 4, configuration: config, templates };
const base = { summary: '', cover: null, coverAlt: '', logo: null };
const records = { cities: [{ id: 1, title: 'City' }], institutions: [{ ...base, id: 10, title: 'Campus', originalPath: '/campus/', cityId: 1 }],
    programs: Array.from({ length: 121 }, (_, i) => ({ ...base, id: i + 1, title: `Program ${i}`, originalPath: `/campus/program-${i}/`, institutionId: 10, body: '界'.repeat(12000) })),
    articles: [{ ...base, id: 'article-1', title: 'News', originalPath: '/old-news/', revision: 2,
        body: [{ kind: 'paragraph', runs: [{ text: 'Reviewed content' }] }], language: 'en', byline: null, publishedAt: null }] };
const store = new SitePublicationManifestStore(db, 'alpha'), foreign = new SitePublicationManifestStore(db, 'beta');
const now = '2026-10-11T00:00:00Z';
const hash = await store.prepare(header, records, now), manifest = await store.get(hash);
assert.equal(manifest.index.length, 124);
assert.ok(manifest.chunks.reduce((n,c) => n + c.bytes, 0) > 1024 * 1024);
await store.verify(manifest);
assert.equal(await foreign.get(hash), null);
await assert.rejects(() => foreign.verify(manifest), /publication_manifest_chunk_missing/);
assert.equal(await store.prepare(header, { ...records, programs: [...records.programs].reverse() }, now), hash);
const loaded = [];
for (const ref of manifest.chunks) loaded.push(...(await store.loadChunk(manifest, ref)).records);
assert.equal(loaded.length, 124);
for (const mutate of [
    m => m.index.find(r => r.collection === 'programs').parentId = 999,
    m => m.index.find(r => r.collection === 'institutions').parentId = 999,
    m => m.index.find(r => r.collection === 'programs').originalPath = '/campus',
    m => m.index.find(r => r.collection === 'programs').originalPath = '/api/private',
    m => m.index.find(r => r.collection === 'programs').originalPath = '/%63ampus/',
    m => m.index.find(r => r.collection === 'programs').id = m.index.filter(r => r.collection === 'programs')[1].id,
    m => m.index.pop(), m => m.chunks.push(m.chunks[0]),
    m => m.index[0].position = 47, m => m.index[1].chunkHash = '0'.repeat(64),
    m => m.templates.pop(), m => m.templates[0].layout.content = [],
    m => m.templates[0].layout.root.siteConfiguration.role = 'program',
    m => m.templates[0].layout.content[0].props.dataRequest = { secret: true },
]) { const bad = structuredClone(manifest); mutate(bad); assert.equal(sitePublicationManifestSchema.safeParse(bad).success, false); }
const prior = await db.query('SELECT * FROM settings');
const badRecords = structuredClone(records); badRecords.programs[0].institutionId = 999;
await assert.rejects(() => store.prepare(header, badRecords, now));
assert.deepEqual(await db.query('SELECT * FROM settings'), prior);
const forged = structuredClone(manifest); forged.index[0].title = 'Different';
assert.equal(sitePublicationManifestSchema.safeParse(forged).success, true);
await assert.rejects(() => store.verify(forged), /publication_manifest_index_mismatch/);
const ref = manifest.chunks[0];
await assert.rejects(() => store.loadChunk(manifest, { ...ref, count: ref.count + 1 }));
await db.exec('DELETE FROM settings WHERE tenant_slug = ? AND key = ?', ['alpha', `site_publication:chunk:v1:${ref.hash}`]);
await assert.rejects(() => store.verify(manifest), /publication_manifest_chunk_missing/);
await assert.rejects(() => foreign.get('bad'), /publication_hash_invalid/);
const changed = structuredClone(manifest); changed.configurationRevision++;
await db.exec('UPDATE settings SET value = ? WHERE tenant_slug = ? AND key = ?', [stableStringify(changed), 'alpha', `site_publication:manifest:v2:${hash}`]);
await assert.rejects(() => store.get(hash), /publication_manifest_unavailable/);
await assert.rejects(() => store.prepare(header, records, now), /publication_manifest_unavailable/);
assert.equal((await db.query('SELECT * FROM settings WHERE key = ?', ['site_publication:active:v1'])).length, 0);
console.log('publication manifest: large catalog retention, deterministic hashing, global routes/parents, template/index admission, owner isolation and missing/corrupt content refusal pass');
