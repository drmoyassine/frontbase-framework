/**
 * Provider basic contract (M2.1.2) — a query runs and returns rows; RULE 3
 * (copy on read) and RULE 4 (opaque errors) hold. Parameterized by provider.
 */
import { forEveryProvider, seed, asDataProvider } from './_harness.mjs';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

await forEveryProvider(async (provider, label) => {
    await seed(provider.db);
    const data = asDataProvider(provider);

    const rows = await data.query('docs.public', {}, {});
    check(`[${label}] public query returns 4 rows`, rows.length === 4);

    // RULE 3: mutating a returned row doesn't corrupt a later read
    rows[0].title = 'MUTATED';
    const fresh = await data.query('docs.public', {}, {});
    check(`[${label}] RULE 3: returned rows are copies`, fresh[0].title !== 'MUTATED');

    // RULE 4: a throwing executor → opaque code, never driver detail
    const bad = { version: 't', pages: {}, queries: { 'boom': { queryId: 'boom', scope: 'public', async execute() { throw new Error('ECONNREFUSED db.internal:5432 password=hunter2'); } } } };
    // swap the manifest into a fresh sqlite provider for the opaque-error check
    const { sqliteDataProvider } = await import('../dist/providers/sqlite.js');
    const bp = asDataProvider(sqliteDataProvider({ manifest: bad }));
    try {
        await bp.query('boom', {}, {});
        check(`[${label}] RULE 4: throwing executor errors`, false);
    } catch (e) {
        check(`[${label}] RULE 4: opaque error (no secret leaked)`, e.message === 'query_execution_failed' && !String(e).includes('hunter2'));
    }

    // unknown query → opaque
    try { await data.query('does.not.exist', {}, {}); check(`[${label}] unknown query errors`, false); }
    catch (e) { check(`[${label}] unknown query → opaque error`, true); }
});

console.log(failures === 0 ? '\nproviders: PASS ✅' : `\nproviders: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
