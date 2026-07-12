/**
 * Data Studio gate (Phase 3b / F7). Proves datasource CRUD + table introspection
 * + read-only query. Uses a real sqlite datasource pointing at the same migrated
 * DB so introspection returns real tables. Config is stored encrypted (F6).
 */
import { makeConsole, req } from './_helpers.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// Use a file-backed DB so the datasource (a SEPARATE sqlite connection) can open
// the SAME file and see the migrated tables. :memory: would be a different DB.
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { createConsole } from '../dist/index.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'fb-datastudio-'));
const dbFile = join(dir, 'data.db');
// libsql needs a file: URL (bare Windows paths are rejected). Use forward slashes.
const fileUrl = 'file:' + dbFile.replace(/\\/g, '/');
const runner = sqliteRunner(fileUrl);
await migrateUp(runner);
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    now: () => `2026-07-12T00:00:${String(clock++).padStart(2, '0')}Z`,
});
const r = (method, path, body) => app.fetch(new Request('http://x' + path, {
    method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
}));

// ---- 1. Create a sqlite datasource pointing at the migrated file ----
const put = await r('PUT', '/datasources/main-db', {
    name: 'Main DB', kind: 'sqlite', config: { url: fileUrl },
});
check('PUT datasource → 200', put.status === 200);

const list = await r('GET', '/datasources');
const listBody = await list.json();
check('datasource listed (no config leaked)', listBody.datasources.length === 1 && listBody.datasources[0].name === 'Main DB' && !('config' in listBody.datasources[0]));

// ---- 2. Introspection: list tables (the migrated schema tables exist) ----
const tables = await (await r('GET', '/datasources/main-db/tables')).json();
check('tables introspected (includes published_pages)', Array.isArray(tables.tables) && tables.tables.includes('published_pages'));

// ---- 3. Describe a table ----
const cols = await (await r('GET', '/datasources/main-db/tables/published_pages/columns')).json();
check('columns introspected (slug column present)', Array.isArray(cols.columns) && cols.columns.some((c) => c.name === 'slug'));

// ---- 4. Browse rows (empty table → []) ----
const rows = await (await r('GET', '/datasources/main-db/tables/published_pages/rows')).json();
check('rows browsed (empty array)', Array.isArray(rows.rows) && rows.rows.length === 0);

// ---- 5. Read-only query: SELECT works ----
const q = await (await r('POST', '/datasources/main-db/query', { sql: 'SELECT COUNT(*) AS n FROM published_pages' })).json();
check('SELECT query runs', q.count === 1 && Number(q.rows[0].n) === 0);

// ---- 6. Read-only guard: non-SELECT rejected ----
const blocked = await r('POST', '/datasources/main-db/query', { sql: 'DELETE FROM published_pages' });
check('non-SELECT rejected → 400', blocked.status === 400);
check('non-SELECT → only_select_allowed', (await blocked.json()).error === 'only_select_allowed');

// ---- 7. Semicolon-chaining rejected ----
const chained = await r('POST', '/datasources/main-db/query', { sql: 'SELECT 1; DROP TABLE x' });
check('semicolon-chained query rejected', chained.status === 400);

// ---- 8. Missing datasource → 404 ----
const missing = await r('GET', '/datasources/no-such/tables');
check('missing datasource → 404', missing.status === 404);

// ---- 9. Delete ----
const del = await r('DELETE', '/datasources/main-db');
check('DELETE datasource → 200', del.status === 200);
const after = await (await r('GET', '/datasources')).json();
check('datasource gone after delete', after.datasources.length === 0);

console.log(failures === 0 ? '\ndata-studio: PASS ✅' : `\ndata-studio: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
