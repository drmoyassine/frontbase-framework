/**
 * F7c + F7b gate (Phase 3 follow-ups / P2-a + P2-b). Credential-gated: needs a
 * live Postgres reachable via the neon HTTP client. Self-skips without creds.
 *
 * Set POSTGRES_URL (a Neon/Supabase pooler connection string) to run.
 *
 * Proves: kind:'postgres' is runnable (F7c), and per-dialect introspection (F7b)
 * returns tables + columns over information_schema (not sqlite_master).
 */
import { createConsole } from '../dist/index.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';

const URL = process.env.POSTGRES_URL;
if (!URL) {
    console.log('  (postgres-datasource: credential-gated — set POSTGRES_URL to run live)');
    console.log('\npostgres-datasource: SKIP (no creds) ⏭️');
    process.exit(0);
}

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
let clock = 0;
const app = await createConsole({
    makeRunner: async () => runner,
    resolvePrincipal: async () => ({ user: { id: 'u1' }, tenant: 'tenant-A' }),
    now: () => `2026-07-13T00:00:${String(clock++).padStart(2, '0')}Z`,
});
const req = (m, p, b) => app.fetch(new Request('http://x' + p, {
    method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b),
}));

// Create the postgres datasource (connection config is stored encrypted — F6).
const put = await req('PUT', '/datasources/pg', { name: 'Live PG', kind: 'postgres', config: { connectionString: URL } });
check('PUT postgres datasource → 200', put.status === 200);

// F7c: a SELECT runs (proves the runner is wired, not throwing not_implemented).
const q = await (await req('POST', '/datasources/pg/query', { sql: 'SELECT 1 AS one' })).json();
check('F7c: SELECT 1 runs against postgres', q.count === 1 && Number(q.rows[0].one) === 1);

// F7b: tables list (information_schema, not sqlite_master) → returns an array.
const tables = await (await req('GET', '/datasources/pg/tables')).json();
check('F7b: tables introspected (array)', Array.isArray(tables.tables));

// F7b: columns of a system table that always exists (pg_catalog would need a real
// public table). Create a temp table, describe it, drop it.
await req('POST', '/datasources/pg/query', { sql: 'CREATE TABLE IF NOT EXISTS fb_probe (id INTEGER PRIMARY KEY, name TEXT NOT NULL)' });
const cols = await (await req('GET', '/datasources/pg/tables/fb_probe/columns')).json();
check('F7b: columns introspected (id + name)', Array.isArray(cols.columns) && cols.columns.some((c) => c.name === 'id'));
const nameCol = cols.columns.find((c) => c.name === 'name');
check('F7b: notNull flag mapped from is_nullable', nameCol && nameCol.notNull === true);
await req('POST', '/datasources/pg/query', { sql: 'DROP TABLE fb_probe' });

console.log(failures === 0 ? '\npostgres-datasource: PASS ✅' : `\npostgres-datasource: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
