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
const post = (app, path, body, cookie) => req(app, path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

// --- fresh instance (no users) ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret', setupToken: TOKEN });

    const status = await (await req(app, '/setup/status')).json();
    check('fresh: needsSetup = true', status.needsSetup === true);
    check('fresh: setupEnabled = true when SETUP_TOKEN configured', status.setupEnabled === true);
    check('fresh: setupTokenRequired = true when SETUP_TOKEN configured', status.setupTokenRequired === true);
    check('fresh: setupExpired = false', status.setupExpired === false);

    // Secure-link UX: exchange the fragment capability once for a short-lived,
    // HttpOnly, setup-path-scoped cookie. The admin form never needs to render
    // or persist the raw token.
    const claim = await post(app, '/setup/claim', { setupToken: TOKEN });
    const claimCookie = claim.headers.get('set-cookie')?.split(';')[0];
    check('setup claim exchange → 200', claim.status === 200);
    check('claim cookie is HttpOnly + SameSite=Strict', /HttpOnly/i.test(claim.headers.get('set-cookie') ?? '') && /SameSite=Strict/i.test(claim.headers.get('set-cookie') ?? ''));
    check('claim cookie is scoped to setup API', /Path=\/api\/console\/setup/i.test(claim.headers.get('set-cookie') ?? ''));

    // CRIT-3: /setup/db pre-init requires the token when configured
    check('/setup/db without token → 403', (await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:' })).status === 403);
    const dbOk = await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:', setupToken: TOKEN });
    check('/setup/db with token (pre-init) → 200', dbOk.status === 200);

    // CRIT-2: the request body cannot choose the role — deploy fixes it (default owner)
    const escalate = await post(app, '/setup', { email: 'evil@x.com', password: 'pw', role: 'master_admin' }, claimCookie);
    check('POST /setup → 200', escalate.status === 200);
    check('CRIT-2: body role IGNORED — seeded as owner, not master_admin', (await escalate.json()).user.role === 'owner');
    check('successful setup clears the claim cookie', /Max-Age=0/i.test(escalate.headers.get('set-cookie') ?? ''));

    // now initialized
    check('after setup: needsSetup = false', (await (await req(app, '/setup/status')).json()).needsSetup === false);
    check('CRIT-3: /setup/db LOCKED post-init → 410', (await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:', setupToken: TOKEN })).status === 410);
    check('re-POST /setup → 410 already_initialized', (await post(app, '/setup', { email: 'x@y.com', password: 'pw', setupToken: TOKEN })).status === 410);
    check('login after setup → 200', (await post(app, '/login', { email: 'evil@x.com', password: 'pw' })).status === 200);
}

// --- expired deploy link fails closed and cannot issue a cookie ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({
        makeRunner: async () => runner,
        sessionSecret: 'test-secret',
        setupToken: TOKEN,
        setupExpiresAt: '2026-07-15T00:00:00.000Z',
        now: () => '2026-07-16T00:00:00.000Z',
    });
    const status = await (await req(app, '/setup/status')).json();
    check('expired link: setup disabled', status.setupEnabled === false);
    check('expired link: setupExpired = true', status.setupExpired === true);
    check('expired link: claim rejected → 403', (await post(app, '/setup/claim', { setupToken: TOKEN })).status === 403);
    check('expired link: direct setup rejected → 403', (await post(app, '/setup', { email: 'a@b.com', password: 'pw', setupToken: TOKEN })).status === 403);
}

// --- no SETUP_TOKEN configured: fail closed (prevents first-visitor takeover) ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret' }); // no setupToken
    const status = await (await req(app, '/setup/status')).json();
    check('no SETUP_TOKEN: needsSetup = true', status.needsSetup === true);
    check('no SETUP_TOKEN: setupEnabled = false', status.setupEnabled === false);
    check('no SETUP_TOKEN: setupTokenRequired = false', status.setupTokenRequired === false);
    check('no SETUP_TOKEN: /setup/db denied → 403', (await post(app, '/setup/db', { driver: 'sqlite', url: ':memory:' })).status === 403);
    check('no SETUP_TOKEN: POST /setup denied → 403', (await post(app, '/setup', { email: 'a@b.com', password: 'pw' })).status === 403);
    check('no SETUP_TOKEN: no attacker-controlled admin seeded', await new UserStore(runner, '_default').countUsers() === 0);
}

// --- wrong token → 403 (pre-init) ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret', setupToken: TOKEN });
    check('wrong setup-link claim → 403', (await post(app, '/setup/claim', { setupToken: 'nope' })).status === 403);
    check('wrong token (pre-init) → 403', (await post(app, '/setup', { email: 'a@b.com', password: 'pw', setupToken: 'nope' })).status === 403);
    check('wrong token: no user seeded', await new UserStore(runner, '_default').countUsers() === 0);
}

// --- concurrent first-admin submissions: the setup_state CAS has one winner ---
{
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    const app = await createConsole({ makeRunner: async () => runner, sessionSecret: 'test-secret', setupToken: TOKEN });
    const responses = await Promise.all([
        post(app, '/setup', { email: 'first@x.com', password: 'password-1', setupToken: TOKEN }),
        post(app, '/setup', { email: 'second@x.com', password: 'password-2', setupToken: TOKEN }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    check('concurrent setup: exactly one 200 and one 410', JSON.stringify(statuses) === JSON.stringify([200, 410]));
    check('concurrent setup: exactly one administrator exists', await new UserStore(runner, '_default').countUsers() === 1);
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
