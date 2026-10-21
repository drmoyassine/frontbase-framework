import assert from 'node:assert/strict';
import { allowanceFixture, now } from './translation-allowance-fixture.mjs';
import { createCompatApp } from '../dist/compat/app.js';
import { PagesStore } from '../dist/compat/pages-store.js';

const f = await allowanceFixture(), tenant = 'alpha';
const pageId = '00000000-0000-4000-8000-00000000000031', evolvingId = '00000000-0000-4000-8000-00000000000032';
const pages = new PagesStore(f.db, tenant);
const layout = text => ({ root: {}, content: [{ id: 'h1', type: 'Heading', props: { text } }] });
await pages.create({ name: 'About', slug: 'about', is_homepage: false, layout_data: layout('Explore institutions') }, pageId, now);
await pages.create({ name: 'Evolving', slug: 'evolving', is_homepage: false, layout_data: layout('Welcome students') }, evolvingId, now);
let auth = true, role = 'owner', owner = tenant;
const app = await createCompatApp({ makeRunner: () => f.db, sessionSecret: 'allowance-private-fixture', now: () => now,
    externalFetch: f.host.externalFetch, resolvePrincipal: async () => ({ user: auth ? { id: 'editor', role } : null, tenant: owner }) });
const root = '/api/project/translation-batches/';
const selection = pageId => ({ pageId, blockId: 'h1', field: 'text' });
async function call(path, body, status = 200) {
    const r = await app.request('https://site.test' + root + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    assert.equal(r.status, status, await r.clone().text());
    const value = await r.json();
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE_|serviceKey|data\.example/);
    return value;
}
try {
    // Shape refusals before any storage work: no selection, out-of-range limit, unconfigured locale.
    await call('history/', {}, 422);
    await call('history/', { selection: selection(pageId), locale: 'ar', limit: 0 }, 422);
    await call('history/', { selection: selection(pageId), locale: 'ar', limit: 101 }, 422);
    await call('history/', { selection: selection(pageId), locale: 'fr' }, 422);
    await call('history/restore/', { selection: selection(pageId), locale: 'fr', revisionId: 'x' }, 422);
    // Before any save the unit is not even registered: history is an honest empty snapshot.
    const empty = await call('history/', { selection: selection(pageId), locale: 'ar' });
    assert.equal(empty.version, 1); assert.equal(empty.sourceLocale, 'en');
    assert.equal(empty.source, null); assert.equal(empty.head, null);
    assert.equal(empty.manualProtected, false); assert.deepEqual(empty.revisions, []);
    // Two manual saves (manual may overwrite a manual head) create immutable history.
    let preview = await call('page-preview/' + pageId + '/?locale=ar');
    const field = preview.fields[0];
    assert.equal(field.state, 'missing');
    const saved = await call('page-preview/field/', { selection: field.selection, locale: 'ar', token: field.token, text: 'مؤسسات استكشاف' });
    assert.equal(saved.fields[0].state, 'draft'); assert.equal(saved.fields[0].provenance, 'manual');
    const saved2 = await call('page-preview/field/', { selection: field.selection, locale: 'ar', token: saved.fields[0].token, text: 'استكشف المؤسسات' });
    assert.equal(saved2.fields[0].state, 'draft');
    const history = await call('history/', { selection: selection(pageId), locale: 'ar' });
    assert.ok(history.source, 'saved unit must expose its source snapshot');
    assert.match(history.source.text, /Explore institutions/); assert.equal(history.source.textTruncated, false);
    assert.equal(history.source.sourceVersion, 1);
    assert.equal(history.manualProtected, true);
    assert.equal(history.revisions.length, 2);
    const [newest, oldest] = history.revisions;
    assert.equal(newest.isHead, true); assert.equal(oldest.isHead, false);
    assert.equal(newest.text, 'استكشف المؤسسات'); assert.equal(oldest.text, 'مؤسسات استكشاف');
    assert.equal(newest.provenance, 'manual');
    assert.equal(history.head.revisionId, newest.revisionId);
    const bounded = await call('history/', { selection: selection(pageId), locale: 'ar', limit: 1 });
    assert.equal(bounded.revisions.length, 1); assert.equal(bounded.revisions[0].revisionId, newest.revisionId);
    // Restore composes a NEW auditable manual revision; history never rewinds.
    const restored = await call('history/restore/', { selection: selection(pageId), locale: 'ar', revisionId: oldest.revisionId });
    assert.equal(restored.head.text, 'مؤسسات استكشاف');
    assert.equal(restored.head.provenance, 'manual');
    assert.notEqual(restored.restoredRevisionId, oldest.revisionId);
    const after = await call('history/', { selection: selection(pageId), locale: 'ar' });
    assert.deepEqual(after.revisions.map(item => item.revisionId), [restored.restoredRevisionId, newest.revisionId, oldest.revisionId]);
    assert.equal(after.head.revisionId, restored.restoredRevisionId);
    assert.equal(after.head.isHead, true); assert.equal(after.revisions[2].isHead, false);
    // Unknown revisions are an honest 404, never a silent empty restore.
    await call('history/restore/', { selection: selection(pageId), locale: 'ar', revisionId: 'no-such-revision' }, 404);
    await call('history/restore/', { selection: selection(pageId), locale: 'ar', revisionId: '' }, 422);
    // Source evolution: the restored wording still translates today's source, so the new revision
    // carries the CURRENT source identity (token drift refuses at the engine, proven by the gate).
    await pages.setLayout(evolvingId, layout('Welcome new students'), now);
    let evoPreview = await call('page-preview/' + evolvingId + '/?locale=ar');
    await call('page-preview/field/', { selection: evoPreview.fields[0].selection, locale: 'ar', token: evoPreview.fields[0].token, text: 'أهلاً بالطلبة' });
    await pages.setLayout(evolvingId, layout('Welcome new students and families'), now);
    evoPreview = await call('page-preview/' + evolvingId + '/?locale=ar');
    await call('page-preview/field/', { selection: evoPreview.fields[0].selection, locale: 'ar', token: evoPreview.fields[0].token, text: 'أهلاً بالطلبة وأسرهم' });
    const evoHistory = await call('history/', { selection: selection(evolvingId), locale: 'ar' });
    assert.equal(evoHistory.source.sourceVersion, 2);
    assert.equal(evoHistory.revisions.length, 2);
    const evoRestore = await call('history/restore/', { selection: selection(evolvingId), locale: 'ar', revisionId: evoHistory.revisions[1].revisionId });
    assert.equal(evoRestore.head.text, 'أهلاً بالطلبة');
    assert.equal(evoRestore.head.sourceVersion, 2, 'restore tags the CURRENT source identity');
    // Role and tenant fences.
    auth = false; await call('history/', { selection: selection(pageId), locale: 'ar' }, 401);
    await call('history/restore/', { selection: selection(pageId), locale: 'ar', revisionId: 'x' }, 401);
    auth = true; role = 'viewer'; await call('history/', { selection: selection(pageId), locale: 'ar' }, 403);
    await call('history/restore/', { selection: selection(pageId), locale: 'ar', revisionId: 'x' }, 403);
    role = 'owner'; owner = 'beta';
    await call('history/', { selection: selection(pageId), locale: 'ar' }, 422);
    owner = tenant;
    console.log('translation-history: bounded newest-first storage-order history, restore as fresh current-identity manual revision,'
        + ' honest 404/422 refusals, role/tenant fences PASS');
} finally { f.close(); }
