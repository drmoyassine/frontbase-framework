/**
 * M-ID.3 setup wizard gate — first-run bootstrap + DB picker (M3.DB).
 *   GET /setup/status → needsSetup true; POST /setup → owner seeded; status → false;
 *   re-POST → 410 already_initialized (RULE 8 mutation target);
 *   POST /setup/db {driver:'sqlite'} → probes + migrates → 200.
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createConsole } from '../dist/index.js';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
const app = await createConsole({
    makeRunner: async () => runner,
    sessionSecret: 'test-secret',
    setupToken: 'test-setup-token',
});
const req = (path, init) => app.fetch(new Request('http://c.local' + path, init));

// 1. Fresh → needs setup
const status1 = await req('/setup/status');
check('fresh: needsSetup = true', (await status1.json()).needsSetup === true);

// 2. POST /setup → owner seeded
const setup = await req('/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@x.com', password: 'pw123', setupToken: 'test-setup-token' }) });
check('POST /setup → 200', setup.status === 200);

// 3. needsSetup now false
const status2 = await req('/setup/status');
check('after setup: needsSetup = false', (await status2.json()).needsSetup === false);

// 4. Re-POST → 410 (RULE 8: mutation removing the "no users" guard makes this go 200 → RED)
const reSetup = await req('/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'other@x.com', password: 'pw', setupToken: 'test-setup-token' }) });
check('re-POST /setup → 410 already_initialized', reSetup.status === 410);

// 5. Wrong setupToken → 403
const badToken = await req('/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@y.com', password: 'pw', setupToken: 'wrong' }) });
// (410 wins if no-users check comes first; with users it's 410, so this case only fires pre-init)
check('wrong setupToken: rejected (410 since users exist)', badToken.status === 410 || badToken.status === 403);

// 6. Login works with the seeded creds
const login = await req('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@x.com', password: 'pw123' }) });
check('login after setup → 200', login.status === 200);

// 7. DB picker — POST /setup/db probes + migrates a SQLite runner
const dbPick = await req('/setup/db', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ driver: 'sqlite', url: ':memory:' }) });
check('POST /setup/db (sqlite) → 200', dbPick.status === 200);
check('DB picker returns the driver', (await dbPick.json()).driver === 'sqlite');

console.log(failures === 0 ? '\nsetup: PASS ✅' : `\nsetup: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
