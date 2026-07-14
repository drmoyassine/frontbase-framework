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

// 6. PLACEHOLDER database_id (the exact bug that shipped in examples/cf-full):
//    a `[[d1_databases]]` block exists but database_id is the shipped
//    "PLACEHOLDER_RUN_WRANGLER_D1_CREATE" string — must be treated as NOT yet
//    provisioned, and the fix must REWRITE the block IN PLACE (not append a
//    second [[d1_databases]] block, which would break wrangler.toml). The
//    database NAME is always driven by appName (`${appName}-db`), never by
//    whatever placeholder name shipped in the checked-in wrangler.toml —
//    otherwise a NEW --app-name still tries to create the OLD hardcoded name,
//    which fails once that name already exists on the account (the reported bug).
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'),
        `name = "demo"\nmain = "dist/worker.mjs"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "demo-cms"\ndatabase_id = "PLACEHOLDER_RUN_WRANGLER_D1_CREATE"\nmigrations_dir = "migrations"\n`);
    const wr = mockWrangler();
    check('placeholder id: hasD1Binding() = false (not yet provisioned)', hasD1Binding(readFileSync(join(dir, 'wrangler.toml'), 'utf8')) === false);
    const res = await provisionD1(dir, { appName: 'demo', run: wr.run });
    check('placeholder id: created = true (provisioning proceeds)', res.created === true);
    check('placeholder id: databaseName is app-name-driven (demo-db, NOT the stale demo-cms)', res.databaseName === 'demo-db');
    check('placeholder id: ran `wrangler d1 create demo-db` (app-name-driven, not the stale placeholder name)', wr.calls.length === 1 && wr.calls[0].args.join(' ') === 'd1 create demo-db');
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    check('placeholder id: the real database_id replaced the placeholder', toml.includes(FAKE_ID) && !toml.includes('PLACEHOLDER_RUN_WRANGLER_D1_CREATE'));
    check('placeholder id: exactly ONE [[d1_databases]] block (rewritten in place, not appended)', (toml.match(/\[\[d1_databases\]\]/g) || []).length === 1);
    check('placeholder id: database_name rewritten to the app-name-driven name', /binding = "DB"/.test(toml) && /database_name = "demo-db"/.test(toml) && !toml.includes('demo-cms'));
    check('placeholder id: migrations_dir preserved', /migrations_dir = "migrations"/.test(toml));
    check('placeholder id: post-fix hasD1Binding() = true (now really provisioned)', hasD1Binding(toml) === true);
}

// 6b. A REAL (non-placeholder) binding left over from a DIFFERENT --app-name's
//     prior local deploy must NOT be silently reused — that would deploy the
//     new app on top of someone else's database. Must provision fresh under
//     the NEW app's name and overwrite the block in place.
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'),
        `name = "demo"\nmain = "dist/worker.mjs"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "old-app-db"\ndatabase_id = "old-app-real-id-0000"\nmigrations_dir = "migrations"\n`);
    const wr = mockWrangler();
    const res = await provisionD1(dir, { appName: 'new-app', run: wr.run });
    check('mismatched real binding: created = true (does NOT silently reuse the old app\'s db)', res.created === true);
    check('mismatched real binding: databaseName is the NEW app\'s name', res.databaseName === 'new-app-db');
    check('mismatched real binding: ran `wrangler d1 create new-app-db`', wr.calls.length === 1 && wr.calls[0].args.join(' ') === 'd1 create new-app-db');
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    check('mismatched real binding: old database_name/id replaced', /database_name = "new-app-db"/.test(toml) && !toml.includes('old-app-db') && !toml.includes('old-app-real-id-0000'));
    check('mismatched real binding: exactly ONE [[d1_databases]] block', (toml.match(/\[\[d1_databases\]\]/g) || []).length === 1);
}

// 7. Placeholder + explicit --d1-database-id: bind-to-existing also rewrites
//    the placeholder in place (no `wrangler d1 create` call either).
{
    const dir = mkdtempSync(join(tmpdir(), 'fb-d1-'));
    writeFileSync(join(dir, 'wrangler.toml'),
        `name = "demo"\nmain = "dist/worker.mjs"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "demo-cms"\ndatabase_id = "PLACEHOLDER_RUN_WRANGLER_D1_CREATE"\n`);
    const wr = mockWrangler();
    const EXISTING_ID = 'real-existing-uuid-0000';
    const res = await provisionD1(dir, { appName: 'demo', run: wr.run, databaseId: EXISTING_ID });
    check('placeholder + explicit id: created = false (bound, not created)', res.created === false);
    check('placeholder + explicit id: NO `wrangler d1 create` call', wr.calls.length === 0);
    const toml = readFileSync(join(dir, 'wrangler.toml'), 'utf8');
    check('placeholder + explicit id: the supplied id replaced the placeholder', toml.includes(EXISTING_ID) && !toml.includes('PLACEHOLDER_RUN_WRANGLER_D1_CREATE'));
    check('placeholder + explicit id: exactly ONE [[d1_databases]] block', (toml.match(/\[\[d1_databases\]\]/g) || []).length === 1);
}

// 8. Other placeholder-shaped ids are also caught (not just the exact CF-full string)
check('placeholder pattern: REPLACE_ME_xxx caught', hasD1Binding('[[d1_databases]]\ndatabase_id = "REPLACE_ME_WITH_REAL_ID"') === false);
check('placeholder pattern: YOUR_DB_ID caught', hasD1Binding('[[d1_databases]]\ndatabase_id = "YOUR_DATABASE_ID_HERE"') === false);
check('placeholder pattern: <fill-in> caught', hasD1Binding('[[d1_databases]]\ndatabase_id = "<your-database-id>"') === false);
check('placeholder pattern: a REAL uuid is NOT flagged as a placeholder', hasD1Binding(`[[d1_databases]]\ndatabase_id = "${FAKE_ID}"`) === true);

console.log(failures === 0 ? '\nprovision-d1: PASS ✅' : `\nprovision-d1: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
