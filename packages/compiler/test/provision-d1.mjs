/**
 * D1 provisioning gate (M-DB.0.4, B2/B6). Mocked wrangler (the live `wrangler d1
 * create` is the user's deploy step). Proves:
 *   - a fresh project gets a `d1 create` + a written `[[d1_databases]]` binding;
 *   - the binding name is `DB`;
 *   - a second run reuses it (no second create) — idempotent (B6).
 */
import { provisionD1, hasD1Binding, parseDatabaseId } from '../dist/cli/provision-d1.js';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// a mock wrangler that records calls + returns a database_id
const FAKE_ID = '11111111-2222-3333-4444-555555555555';
function mockWrangler() {
    const calls = [];
    const run = async (args, opts) => {
        calls.push({ args, cwd: opts.cwd });
        return { stdout: `{ "uuid": "${FAKE_ID}", "name": "demo-db" }`, stderr: '' };
    };
    return { run, calls };
}

// 1. Fresh project → d1 create + binding written
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'), `name = "demo"\nmain = "dist/worker.mjs"\n`);
    const wr = mockWrangler();
    const res = await provisionD1(dir, { appName: 'demo', run: wr.run });
    check('fresh: created = true', res.created === true);
    check('fresh: databaseName = demo-db', res.databaseName === 'demo-db');
    check('fresh: databaseId parsed', res.databaseId === FAKE_ID);
    check('fresh: binding is "DB" (shared by console + public data)', res.binding === 'DB');
    check('fresh: ran `wrangler d1 create demo-db`', wr.calls.length === 1 && wr.calls[0].args.join(' ') === 'd1 create demo-db');
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    check('fresh: wrangler.toml has the [[d1_databases]] block', hasD1Binding(toml));
    check('fresh: binding = "DB" in the block', /binding = "DB"/.test(toml));
    check('fresh: database_id written', toml.includes(FAKE_ID));
}

// 2. Idempotent — second run reuses (no second create)
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'),
        `name = "demo"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "demo-db"\ndatabase_id = "existing-id"\n`);
    const wr = mockWrangler();
    const res = await provisionD1(dir, { appName: 'demo', run: wr.run });
    check('reuse: created = false', res.created === false);
    check('reuse: NO wrangler call (idempotent, B6)', wr.calls.length === 0);
    check('reuse: databaseName reused', res.databaseName === 'demo-db');
}

// 3. parseDatabaseId handles both JSON + toml-ish outputs
check('parseDatabaseId: JSON uuid', parseDatabaseId('{"uuid":"abc-123"}') === 'abc-123');
check('parseDatabaseId: toml database_id', parseDatabaseId('database_id = "def-456"') === 'def-456');
check('parseDatabaseId: null when absent', parseDatabaseId('no id here') === null);

// 4. Explicit --d1-database-id: binds to an EXISTING database, no `d1 create` call
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'), `name = "demo"\nmain = "dist/worker.mjs"\n`);
    const wr = mockWrangler();
    const EXISTING_ID = 'existing-1234-5678-9abc';
    const res = await provisionD1(dir, { appName: 'demo', run: wr.run, databaseId: EXISTING_ID });
    check('explicit id: created = false (bound, not created)', res.created === false);
    check('explicit id: databaseId = the one supplied', res.databaseId === EXISTING_ID);
    check('explicit id: NO `wrangler d1 create` call', wr.calls.length === 0);
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    check('explicit id: wrangler.toml has the [[d1_databases]] block', hasD1Binding(toml));
    check('explicit id: the supplied database_id is written', toml.includes(EXISTING_ID));
}

// 5. Explicit --d1-database-id is IGNORED if a binding already exists (never
//    silently rebinds an existing project to a different database)
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'),
        `name = "demo"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "demo-db"\ndatabase_id = "already-bound-id"\n`);
    const wr = mockWrangler();
    const res = await provisionD1(dir, { appName: 'demo', run: wr.run, databaseId: 'a-different-id-should-be-ignored' });
    check('existing binding wins over --d1-database-id (created=false)', res.created === false);
    check('existing binding: NO wrangler call', wr.calls.length === 0);
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    check('existing binding: original database_id untouched', toml.includes('already-bound-id') && !toml.includes('a-different-id-should-be-ignored'));
}

console.log(failures === 0 ? '\nprovision-d1: PASS ✅' : `\nprovision-d1: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
