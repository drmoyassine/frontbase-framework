/**
 * M-ID.3 setup wizard gate — first-run bootstrap + DB picker (M3.DB), hardened
 * per the security audit:
 *   - /setup and /setup/db are FIRST-RUN ONLY (410 once a user exists).
 *   - SETUP_TOKEN is REQUIRED; without it setup is disabled (fail closed).
 *   - the seeded role is fixed by deploy (seedRole), NOT the request body
 *     (a caller cannot mint themselves master_admin — CRIT-2).
 *   - /setup/db is token-gated + first-run only (a live instance can't be
 *     re-pointed at an attacker DB — CRIT-3).
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createConsole, UserStore } from '../dist/index.js';
import { migrateUp } from '../dist/db/migrations.js';

let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const TOKEN = 'test-setup-token';
const req = (app, path, init) => app.fetch(new Request('http://c.local' + path, init));
const post = (app, path, body) => req(app, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// --- fresh instance (no users) ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret', setupToken: TOKEN });

    check('fresh: needsSetup = true', (await (await req(app, '/setup/status')).json()).needsSetup === true);

    // CRIT-3: /setup/db pre-init requires the token
    check('/setup/db without token → 403', (await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:' })).status === 403);
    const dbOk = await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:', setupToken: TOKEN });
    check('/setup/db with token (pre-init) → 200', dbOk.status === 200);

    // CRIT-2: the request body cannot choose the role — deploy fixes it (default owner)
    const escalate = await post(app, '/setup', { email: 'evil@x.com', password: 'pw', setupToken: TOKEN, role: 'master_admin' });
    check('POST /setup → 200', escalate.status === 200);
    check('CRIT-2: body role IGNORED — seeded as owner, not master_admin', (await escalate.json()).user.role === 'owner');

    // now initialized
    check('after setup: needsSetup = false', (await (await req(app, '/setup/status')).json()).needsSetup === false);
    check('CRIT-3: /setup/db LOCKED post-init → 410', (await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:', setupToken: TOKEN })).status === 410);
    check('re-POST /setup → 410 already_initialized', (await post(app, '/setup', { email: 'x@y.com', password: 'pw', setupToken: TOKEN })).status === 410);
    check('login after setup → 200', (await post(app, '/login', { email: 'evil@x.com', password: 'pw' })).status === 200);
}

// --- fail closed: no SETUP_TOKEN configured → setup disabled ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret' }); // no setupToken
    check('no SETUP_TOKEN: POST /setup → 403 setup_disabled', (await post(app, '/setup', { email: 'a@b.com', password: 'pw' })).status === 403);
    check('no SETUP_TOKEN: /setup/db → 403', (await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:' })).status === 403);
    check('no SETUP_TOKEN: still no users seeded', await new UserStore(runner, '_default').countUsers() === 0);
}

// --- wrong token → 403 (pre-init) ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret', setupToken: TOKEN });
    check('wrong token (pre-init) → 403', (await post(app, '/setup', { email: 'a@b.com', password: 'pw', setupToken: 'nope' })).status === 403);
    check('wrong token: no user seeded', await new UserStore(runner, '_default').countUsers() === 0);
}

// --- master_admin deploy: seedRole = master_admin seeds into _root and can log in (CRIT-1) ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret', setupToken: TOKEN, seedRole: 'master_admin' });
    const r = await post(app, '/setup', { email: 'master@x.com', password: 'pw', setupToken: TOKEN });
    check('master_admin deploy: setup → 200', r.status === 200);
    check('master_admin deploy: seeded as master_admin', (await r.json()).user.role === 'master_admin');
    check('master_admin seeded into _root', await new UserStore(runner, '_root').countUsers() === 1);
    check('CRIT-1: master_admin can LOG IN (cross-tenant email lookup)', (await post(app, '/login', { email: 'master@x.com', password: 'pw' })).status === 200);
}

console.log(failures === 0 ? '\nsetup: PASS ✅' : `\nsetup: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
