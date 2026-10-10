// Counterexamples against current stores, not installer acceptance or an HTTP race suite.
import assert from 'node:assert/strict';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { ConsoleStore } from '../dist/db/store.js';

const now = '2026-10-09T12:00:00Z';
let count = 0;
async function test(name, run) {
    const db = sqliteRunner(':memory:');
    await migrateUp(db);
    await run(db, new PagesStore(db, 'alpha'));
    console.log(`observed - ${name}`);
    count++;
}
const create = (store, id, slug) => store.create({ name: id, slug }, id, now);
const active = (db, slug) => db.query('SELECT id FROM compat_pages WHERE tenant_slug=? AND slug=? AND deleted_at IS NULL ORDER BY id', ['alpha', slug]);

await test('paused create observation permits duplicate same-owner slug', async (db, pages) => {
    assert.equal(await pages.getBySlug('directory'), null);
    await create(pages, 'installer', 'directory');
    await create(pages, 'paused-legacy', 'directory');
    assert.equal((await active(db, 'directory')).length, 2);
});
await test('paused rename observation permits duplicate same-owner slug', async (db, pages) => {
    await create(pages, 'owner-edit', 'old-path');
    assert.equal(await pages.getBySlug('directory'), null);
    await create(pages, 'installer', 'directory');
    assert.ok(await pages.update('owner-edit', { slug: 'directory' }, now));
    assert.equal((await active(db, 'directory')).length, 2);
});
await test('soft-deleted alias can be reused and restored into a collision', async (db, pages) => {
    await create(pages, 'trashed', 'directory');
    await pages.softDelete('trashed', now);
    assert.equal(await pages.getBySlug('directory'), null);
    assert.ok(await pages.getBySlug('directory', true));
    await create(pages, 'legacy-replacement', 'directory');
    await pages.restore('trashed', now);
    assert.equal((await active(db, 'directory')).length, 2);
});
await test('two boot seeders can both pass homepage absence', async (db) => {
    let arrived = 0;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    const runner = {
        query: async (sql, params) => {
            const rows = await db.query(sql, params);
            if (sql.startsWith('SELECT id FROM compat_pages') && sql.includes('is_homepage = 1')) {
                arrived++;
                if (arrived === 2) release();
                await barrier;
            }
            return rows;
        },
        exec: (...args) => db.exec(...args),
    };
    await Promise.all([new PagesStore(runner, 'alpha').ensureHomepage(now), new PagesStore(runner, 'alpha').ensureHomepage(now)]);
    assert.equal((await db.query('SELECT id FROM compat_pages WHERE tenant_slug=? AND is_homepage=1', ['alpha'])).length, 2);
});
await test('different owners may intentionally share a slug and cannot rename each other', async (db, pages) => {
    const other = new PagesStore(db, 'beta');
    await create(pages, 'alpha-id', 'directory');
    await create(other, 'beta-id', 'directory');
    assert.equal(await other.update('alpha-id', { slug: 'foreign' }, now), null);
    assert.equal((await active(db, 'directory')).length, 1);
    assert.equal((await other.list()).length, 1);
});
await test('separate framework and compat stores allow the same public path identity', async (db, pages) => {
    await create(pages, 'compat-directory', 'directory');
    const framework = new ConsoleStore(db, 'alpha');
    await framework.upsertDraft('directory', '{"root":{},"content":[]}', now);
    await framework.publishPage({ slug: 'directory', title: 'Framework directory', layoutData: '{"root":{},"content":[]}' }, now);
    assert.ok(await framework.getPage('directory'));
    assert.equal((await active(db, 'directory')).length, 1);
    // This establishes two persistence namespaces, not which a specific host serves first.
});
console.log(`${count}/6 synthetic diagnostic groups observed; unsafe cases remain deliberately reproducible.`);
