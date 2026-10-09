import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp, MIGRATIONS, schemaFingerprint } from '../dist/db/migrations.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { PageChangeStore, PageChangeConflict } from '../dist/compat/page-change-store.js';
import { createCompatApp } from '../dist/compat/app.js';

const time = '2026-10-08T12:00:00Z';
let count = 0;
async function test(name, fn) { await fn(); count++; console.log(`ok - ${name}`); }
async function fixture() {
    const db = sqliteRunner(':memory:'); await migrateUp(db);
    const pages = new PagesStore(db, 'alpha');
    const page = await pages.create({ name: 'Original', slug: 'original', layout_data: { root: {}, content: [] } }, crypto.randomUUID(), time);
    const store = new PageChangeStore(db, 'alpha');
    const request = { operationId: crypto.randomUUID(), expectedStateHash: (await store.state(page.id)).hash, patch: { title: 'New title' } };
    return { db, page, pages, store, request };
}
await test('fresh and v22-upgraded schemas converge without replacing pages', async () => {
    const db = sqliteRunner(':memory:'); await migrateUp(db, () => time, MIGRATIONS.filter(m => m.version < 23));
    const pages = new PagesStore(db, 'alpha'); const page = await pages.create({ name: 'Old', slug: 'old' }, crypto.randomUUID(), time);
    assert.deepEqual(await migrateUp(db), [23]);
    assert.equal((await pages.get(page.id)).name, 'Old');
    const fresh = sqliteRunner(':memory:'); await migrateUp(fresh);
    assert.equal(await schemaFingerprint(db), await schemaFingerprint(fresh));
    assert.deepEqual(await migrateUp(db), []);
});
await test('durable before-state precedes exact draft update; same retry is no-op', async () => {
    const { db, store, page, request } = await fixture();
    const prepared = await store.begin(page.id, request, time);
    assert.equal(prepared.before.title, null); assert.equal(prepared.phase, 'prepared');
    const first = await store.execute(request.operationId); assert.equal(first.status, 'applied');
    const before = await db.query('SELECT * FROM compat_pages');
    assert.equal((await store.execute(request.operationId)).status, 'applied');
    assert.deepEqual(await db.query('SELECT * FROM compat_pages'), before);
    assert.equal((await store.state(page.id)).hash, first.resultStateHash);
});
await test('same operation id cannot change payload or page', async () => {
    const { store, page, request } = await fixture(); await store.begin(page.id, request, time);
    await assert.rejects(() => store.begin(page.id, { ...request, patch: { name: 'Other' } }, time), PageChangeConflict);
    await assert.rejects(() => store.begin('other', request, time), PageChangeConflict);
});
await test('one owner has one non-expiring active operation; other owners remain independent', async () => {
    const { db, store, page, request } = await fixture();
    await store.begin(page.id, request, time);
    await assert.rejects(() => store.begin(page.id, { ...request, operationId: crypto.randomUUID() }, '2099-01-01'), PageChangeConflict);
    const foreign = new PageChangeStore(db, 'beta'); assert.equal(await foreign.state(page.id), null);
    await assert.rejects(() => foreign.begin(page.id, request, time), PageChangeConflict);
    await assert.rejects(() => foreign.execute(request.operationId), PageChangeConflict);
});
await test('competing reservations and same-operation workers cannot double-write', async () => {
    const { db, store, page, request } = await fixture();
    const results = await Promise.allSettled([store.begin(page.id, request, time), store.begin(page.id, { ...request, operationId: crypto.randomUUID() }, time)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const winner = results.find(r => r.status === 'fulfilled').value;
    let updates = 0;
    const observed = new PageChangeStore({ query: (...args) => db.query(...args), exec: (sql, args) => {
        if (sql.startsWith('UPDATE compat_pages')) updates++; return db.exec(sql, args);
    } }, 'alpha');
    const outcomes = await Promise.all([observed.execute(winner.operationId), observed.execute(winner.operationId)]);
    assert.ok(outcomes.some(r => r.status === 'applied')); assert.equal(updates, 1);
});
await test('stale metadata change with same layout hash and timestamp is refused', async () => {
    const { db, store, page, request } = await fixture();
    await db.exec('UPDATE compat_pages SET description=? WHERE tenant_slug=? AND id=?', ['Owner edit', 'alpha', page.id]);
    await assert.rejects(() => store.begin(page.id, request, time), PageChangeConflict);
});
await test('SQL predicate catches edits after reservation and immediately before write', async () => {
    for (const [column, value] of [['name', 'Owner name'], ['layout_data', '{"root":{},"content":[{"id":"owner","type":"Text","props":{}}]}'], ['is_published', 1], ['deleted_at', time], ['primary_auth_form', 'Owner auth'], ['is_public', 0]]) {
        const { db, store, page, request } = await fixture(); await store.begin(page.id, request, time);
        const raced = new PageChangeStore({ query: (...args) => db.query(...args), exec: async (sql, args) => {
            if (sql.startsWith('UPDATE compat_pages')) await db.exec(`UPDATE compat_pages SET ${column}=? WHERE tenant_slug=? AND id=?`, [value, 'alpha', page.id]);
            return db.exec(sql, args);
        } }, 'alpha');
        assert.equal((await raced.execute(request.operationId)).status, 'conflict');
        const row = (await db.query('SELECT * FROM compat_pages'))[0]; assert.equal(row[column], value); assert.equal(row.title, null);
    }
});
await test('lost page-write response recovers from atomic marker after restart without another update', async () => {
    const { db, store, page, request } = await fixture(); await store.begin(page.id, request, time);
    const lost = new PageChangeStore({ query: (...args) => db.query(...args), exec: async (sql, args) => {
        const result = await db.exec(sql, args); if (sql.startsWith('UPDATE compat_pages')) throw new Error('Lost response'); return result;
    } }, 'alpha');
    await assert.rejects(() => lost.execute(request.operationId));
    let updates = 0;
    const restarted = new PageChangeStore({ query: (...args) => db.query(...args), exec: (sql, args) => {
        if (sql.startsWith('UPDATE compat_pages')) updates++; return db.exec(sql, args);
    } }, 'alpha');
    assert.equal((await restarted.execute(request.operationId)).status, 'applied'); assert.equal(updates, 0);
});
await test('crash after intent before write is uncertain and never replays or expires', async () => {
    const { db, store, page, request } = await fixture(); await store.begin(page.id, request, time);
    const crashed = new PageChangeStore({ query: (...args) => db.query(...args), exec: (sql, args) => {
        if (sql.startsWith('UPDATE compat_pages')) throw new Error('Interrupted before write'); return db.exec(sql, args);
    } }, 'alpha');
    await assert.rejects(() => crashed.execute(request.operationId));
    assert.equal((await new PageChangeStore(db, 'alpha').execute(request.operationId)).status, 'uncertain');
    assert.equal((await db.query('SELECT title FROM compat_pages'))[0].title, null);
    await assert.rejects(() => store.begin(page.id, { ...request, operationId: crypto.randomUUID() }, '2099-01-01'), PageChangeConflict);
});
await test('equal result bytes without operation marker never establish ownership', async () => {
    const { db, store, page, request } = await fixture(); const op = await store.begin(page.id, request, time);
    await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?', [JSON.stringify({ ...op, phase: 'applying' }), 'alpha', 'page_change:active:v1']);
    await db.exec('UPDATE compat_pages SET title=?, updated_at=? WHERE tenant_slug=? AND id=?', [op.after.title, time, 'alpha', page.id]);
    assert.equal((await store.execute(request.operationId)).status, 'uncertain');
});
await test('owner edit after application is preserved; terminal receipt archived before next operation', async () => {
    const { db, store, page, request, pages } = await fixture(); await store.begin(page.id, request, time); await store.execute(request.operationId);
    await pages.update(page.id, { title: 'Owner later edit' }, time);
    assert.equal((await store.execute(request.operationId)).status, 'uncertain');
    const next = { operationId: crypto.randomUUID(), expectedStateHash: (await store.state(page.id)).hash, patch: { description: 'Next' } };
    await store.begin(page.id, next, time); assert.equal((await store.execute(next.operationId)).status, 'applied');
    await store.begin(page.id, request, time); assert.equal((await store.execute(request.operationId)).status, 'uncertain');
    assert.equal((await pages.get(page.id)).title, 'Owner later edit');
    assert.equal((await db.query('SELECT key FROM settings WHERE key=?', [`page_change:receipt:v1:${request.operationId}`])).length, 1);
});
await test('corrupt durable operation fails closed without touching page', async () => {
    const { db, store, page, request } = await fixture(); await store.begin(page.id, request, time);
    await db.exec('UPDATE settings SET value=? WHERE tenant_slug=? AND key=?', ['broken-private-operation', 'alpha', 'page_change:active:v1']);
    await assert.rejects(() => store.execute(request.operationId));
    assert.equal((await db.query('SELECT title FROM compat_pages'))[0].title, null);
});
await test('read-only operation status cannot execute prepared work or leak another page', async () => {
    const { db, store, page, request } = await fixture(); await store.begin(page.id, request, time);
    assert.equal((await store.status(page.id, request.operationId)).status, 'prepared');
    assert.equal((await db.query('SELECT title FROM compat_pages'))[0].title, null);
    assert.equal(await store.status('another-page', request.operationId), null);
    await store.execute(request.operationId);
    assert.equal((await store.status(page.id, request.operationId)).status, 'applied');
    const user = new PageChangeStore(db, 'beta'); assert.equal(await user.status(page.id, request.operationId), null);
});
await test('durable intent and lost-response recovery persist across three independent processes', async () => {
    const parent = realpathSync(tmpdir());
    const root = mkdtempSync(join(parent, 'frontbase-page-change-restart-'));
    const path = join(root, 'app.db');
    const childPath = fileURLToPath(new URL('./page-change-restart-fixture.mjs', import.meta.url));
    const run = (mode, input = {}) => {
        const result = spawnSync(process.execPath, [childPath, mode, path, JSON.stringify(input)], { encoding: 'utf8', timeout: 30000, windowsHide: true });
        assert.equal(result.error, undefined); assert.equal(result.signal, null);
        assert.equal(result.status, 0, 'synthetic child: ' + mode + ': ' + result.stderr);
        return JSON.parse(result.stdout.trim());
    };
    try {
        const prepared = run('prepare');
        assert.deepEqual(run('lose-write-response', prepared), { interrupted: true });
        assert.deepEqual(run('recover', prepared), { before: 'applied', status: 'applied', updates: 0 });
    } finally {
        const checked = realpathSync(root); assert.equal(dirname(checked), parent);
        assert.ok(checked.startsWith(join(parent, 'frontbase-page-change-restart-')));
        rmSync(checked, { recursive: true, force: true });
    }
});
await test('HTTP routes: roles, owner, bounded strict JSON, draft-only and no-leak', async () => {
    const { db, page, request, pages } = await fixture(); let role = 'owner', tenant = 'alpha', authenticated = true;
    const app = await createCompatApp({ makeRunner: async () => db, resolvePrincipal: async () => ({ user: authenticated ? { id: 'admin', role } : null, tenant }), sessionSecret: 'synthetic-change-secret', now: () => time });
    const statePath = `/api/pages/${page.id}/change-state/`, changePath = `/api/pages/${page.id}/changes/`;
    const receiptPath = changePath + request.operationId + '/';
    const change = body => app.request(changePath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const restricted of ['viewer', 'member', 'editor']) { role = restricted; assert.equal((await app.request(statePath)).status, 403); assert.equal((await change(request)).status, 403); assert.equal((await app.request(receiptPath)).status, 403); }
    role = 'owner'; authenticated = false; assert.equal((await change(request)).status, 401); authenticated = true;
    tenant = 'beta'; assert.equal((await app.request(statePath)).status, 404); assert.equal((await change(request)).status, 409); tenant = 'alpha';
    for (const body of [{ ...request, tenant: 'beta' }, { ...request, patch: { slug: 'other' } }, { ...request, patch: {} }, { ...request, expectedStateHash: null }, { ...request, patch: { isPublic: false } }]) assert.equal((await change(body)).status, 422);
    assert.equal((await app.request(changePath, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await app.request(changePath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
    assert.equal((await app.request(statePath + '?tenant=beta')).status, 422);
    const state = await app.request(statePath); assert.equal(state.status, 200); assert.equal(state.headers.get('cache-control'), 'no-store'); assert.deepEqual(Object.keys(await state.json()).sort(), ['draft', 'hash']);
    assert.equal((await app.request(receiptPath)).status, 404);
    const success = await change(request); assert.equal(success.status, 200); const receipt = await success.json(); assert.equal(receipt.status, 'applied'); assert.ok(!JSON.stringify(receipt).includes('New title')); assert.ok(!JSON.stringify(receipt).includes('before'));
    assert.equal((await change(request)).status, 200);
    const readReceipt = await app.request(receiptPath); assert.equal(readReceipt.status, 200); assert.equal((await readReceipt.json()).status, 'applied');
    tenant = 'beta'; assert.equal((await app.request(receiptPath)).status, 404); tenant = 'alpha';
    assert.equal((await app.request(receiptPath + '?tenant=beta')).status, 422);
    await pages.publish(page.id, 'system', time);
    const liveRequest = { ...request, operationId: crypto.randomUUID(), expectedStateHash: (await new PageChangeStore(db, 'alpha').state(page.id)).hash };
    assert.equal((await change(liveRequest)).status, 409);
});
console.log(`${count} guarded page-change groups passed`);
