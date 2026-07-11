/**
 * DbRunner factories gate (M-DB.0.1, Decision B1). Each runner does a
 * CREATE/INSERT/SELECT round-trip; `exec` returns affected rows.
 *   - sqliteRunner: live (:memory:)
 *   - d1RunnerFromBinding: live against a mock D1 binding (no CF needed)
 *   - d1RunnerFromRest: credential-gated (D1_* env — A-17)
 *   - supabaseRunner: credential-gated (SUPABASE_URL/SUPABASE_SERVICE_KEY — CF-20)
 */
import { sqliteRunner, d1RunnerFromBinding, d1RunnerFromRest, supabaseRunner } from '../dist/providers/runners.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// ---- sqliteRunner (live, CI reference) ----
{
    const r = sqliteRunner(':memory:');
    await r.exec('CREATE TABLE t (id INTEGER, name TEXT)');
    const n = await r.exec('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'a']);
    await r.exec('INSERT INTO t (id, name) VALUES (?, ?)', [2, 'b']);
    check('sqliteRunner: exec returns affected rows (1)', n === 1);
    const rows = await r.query('SELECT name FROM t WHERE id = ?', [1]);
    check('sqliteRunner: query returns the row', rows.length === 1 && rows[0].name === 'a');
    const all = await r.query('SELECT * FROM t ORDER BY id');
    check('sqliteRunner: query returns all rows', all.length === 2);
}

// ---- d1RunnerFromBinding (live against a mock D1 binding) ----
{
    const binding = makeMockD1();
    const r = d1RunnerFromBinding(binding);
    await r.exec('CREATE TABLE t (id INTEGER, name TEXT)');
    const n = await r.exec('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'x']);
    check('d1Binding: exec returns affected rows (1)', n === 1);
    const rows = await r.query('SELECT name FROM t WHERE id = ?', [1]);
    check('d1Binding: query returns the row', rows.length === 1 && rows[0].name === 'x');
}

// ---- d1RunnerFromRest (credential-gated) ----
if (process.env.D1_ACCOUNT_ID && process.env.D1_DATABASE_ID && process.env.D1_API_TOKEN) {
    const r = d1RunnerFromRest({ accountId: process.env.D1_ACCOUNT_ID, databaseId: process.env.D1_DATABASE_ID, apiToken: process.env.D1_API_TOKEN });
    await r.exec('CREATE TABLE IF NOT EXISTS fb_probe (id INTEGER)');
    await r.exec('DELETE FROM fb_probe');
    await r.exec('INSERT INTO fb_probe VALUES (1)');
    const rows = await r.query('SELECT id FROM fb_probe');
    check('d1Rest (live): round-trip', rows.length === 1 && Number(rows[0].id) === 1);
} else {
    console.log('  (d1RunnerFromRest: credential-gated — set D1_ACCOUNT_ID/D1_DATABASE_ID/D1_API_TOKEN to run live)');
}

// ---- supabaseRunner (credential-gated, CF-20) ----
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    const r = supabaseRunner({
        url: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_KEY,
        jwt: process.env.SUPABASE_JWT,
        schema: process.env.SUPABASE_SCHEMA,
    });
    try {
        // Create test table via raw SQL (requires execute_sql function in Supabase)
        await r.exec('CREATE TABLE IF NOT EXISTS fb_probe (id INTEGER PRIMARY KEY, name TEXT)');
        await r.exec('DELETE FROM fb_probe');
        const n = await r.exec('INSERT INTO fb_probe (id, name) VALUES (?, ?)', [1, 'test']);
        check('supabase (live): exec returns affected rows (1)', n === 1);
        const rows = await r.query('SELECT name FROM fb_probe WHERE id = ?', [1]);
        check('supabase (live): query returns the row', rows.length === 1 && rows[0].name === 'test');
        // Cleanup
        await r.exec('DROP TABLE IF EXISTS fb_probe');
    } catch (e) {
        if ((e.message || '').includes('execute_sql')) {
            console.log('  (supabase: requires execute_sql function — see CF-20 edge-parity audit for setup)');
        } else {
            failures++;
            console.log(`  ❌ supabase (live): ${e.message}`);
        }
    }
} else {
    console.log('  (supabaseRunner: credential-gated — set SUPABASE_URL/SUPABASE_SERVICE_KEY to run live)');
}

console.log(failures === 0 ? '\nrunners: PASS ✅' : `\nrunners: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);

/** A minimal in-memory D1 binding mock (prepare/bind/all/run) for unit-testing
 *  d1RunnerFromBinding without a Cloudflare account. NOT a real SQL engine —
 *  supports the simple CREATE/INSERT/SELECT the gate uses. */
function makeMockD1() {
    const tables = new Map(); // table -> rows[]
    function cols(sql) { const m = sql.match(/\(([^)]+)\)/); return m ? m[1].split(',').map((s) => s.trim().split(/\s+/)[0]) : []; }
    function tbl(sql) { const m = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i) || sql.match(/CREATE TABLE (\w+)/i) || sql.match(/INSERT INTO (\w+)/i) || sql.match(/DELETE FROM (\w+)/i) || sql.match(/FROM (\w+)/i); return m ? m[1] : ''; }
    return {
        prepare(sql) {
            return {
                bind(...args) { this._args = args; return this; },
                async all() {
                    const t = tbl(sql);
                    const rows = tables.get(t) ?? [];
                    // naive WHERE col = ? filter for SELECT ... WHERE col = ?
                    const w = sql.match(/WHERE (\w+) = \?/);
                    let out = rows;
                    if (w) {
                        const col = w[1];
                        // SELECT col FROM t WHERE col = ? — args map positionally; assume single
                        const val = this._args?.[0];
                        out = rows.filter((r) => r[col] === val);
                    }
                    return { results: out.map((r) => ({ ...r })), meta: { changes: { count: 0 } } };
                },
                async run() {
                    const t = tbl(sql);
                    if (/^CREATE/i.test(sql)) { tables.set(t, []); return { meta: { changes: { count: 0 } } }; }
                    if (/^INSERT/i.test(sql)) {
                        const rows = tables.get(t) ?? [];
                        const c = cols(sql.match(/\(([^)]+)\)/)?.[1] && sql.match(/INSERT INTO \w+ \(([^)]+)\)/)?.[1] || '');
                        const obj = {};
                        (sql.match(/INSERT INTO \w+ \(([^)]+)\)/)?.[1].split(',').map((s) => s.trim()) ?? []).forEach((k, i) => { obj[k] = this._args?.[i]; });
                        rows.push(obj); tables.set(t, rows);
                        return { meta: { changes: { count: 1 } } };
                    }
                    if (/^DELETE/i.test(sql)) { const n = (tables.get(t) ?? []).length; tables.set(t, []); return { meta: { changes: { count: n } } }; }
                    return { meta: { changes: { count: 0 } } };
                },
            };
        },
    };
}
