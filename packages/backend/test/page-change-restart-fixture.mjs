/** Child-process synthetic persistence fixture. Never accepts a live DB path. */
import assert from 'node:assert/strict';
import { basename, dirname, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { PageChangeStore } from '../dist/compat/page-change-store.js';

const [mode, dbPath, raw] = process.argv.slice(2);
const target = resolve(dbPath);
const root = realpathSync(dirname(target));
assert.equal(dirname(root), realpathSync(tmpdir()));
assert.ok(basename(root).startsWith('frontbase-page-change-restart-'));
assert.equal(basename(target), 'app.db');
const db = sqliteRunner(pathToFileURL(target).href);
const time = '2026-10-08T12:00:00Z';
const store = new PageChangeStore(db, 'synthetic-restart');
if (mode === 'prepare') {
    await migrateUp(db);
    const pages = new PagesStore(db, 'synthetic-restart');
    const page = await pages.create({ name: 'Synthetic restart', slug: 'synthetic-restart' }, crypto.randomUUID(), time);
    const request = { operationId: crypto.randomUUID(), expectedStateHash: (await store.state(page.id)).hash, patch: { title: 'Synthetic desired title' } };
    await store.begin(page.id, request, time);
    console.log(JSON.stringify({ pageId: page.id, request }));
} else if (mode === 'lose-write-response') {
    const { request } = JSON.parse(raw);
    const interrupted = new PageChangeStore({ query: (...args) => db.query(...args), exec: async (sql, args) => {
        const count = await db.exec(sql, args);
        if (sql.startsWith('UPDATE compat_pages')) throw new Error('Synthetic lost write reply');
        return count;
    } }, 'synthetic-restart');
    await assert.rejects(() => interrupted.execute(request.operationId), /Synthetic lost write reply/);
    console.log(JSON.stringify({ interrupted: true }));
} else if (mode === 'recover') {
    const { pageId, request } = JSON.parse(raw);
    const before = await store.status(pageId, request.operationId);
    let updates = 0;
    const restarted = new PageChangeStore({ query: (...args) => db.query(...args), exec: (sql, args) => {
        if (sql.startsWith('UPDATE compat_pages')) updates++;
        return db.exec(sql, args);
    } }, 'synthetic-restart');
    const result = await restarted.execute(request.operationId);
    const rows = await db.query('SELECT value FROM settings WHERE tenant_slug=? AND key=?', ['synthetic-restart', 'page_change:active:v1']);
    assert.equal(JSON.parse(rows[0].value).phase, 'applied');
    console.log(JSON.stringify({ before: before.status, status: result.status, updates }));
} else throw new Error('Invalid synthetic fixture mode');
process.exit(0); // Release the child's libsql handles before the next process/cleanup.
