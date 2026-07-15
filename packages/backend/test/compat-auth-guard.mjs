/**
 * CF-22 P2 — auth guard regression test (RULE 2). Proves the split of the auth
 * compat surface: UNAUTHENTICATED ops (login/logout/signup/forgot/reset/invite/
 * accept/check-slug) bypass defaultDenyAuth; AUTHENTICATED ops (me + the security
 * console: blocklist/WAF/bot-protection/audit-logs) sit BEHIND it.
 *
 * A P1/P2 review caught these authed ops registered before the guard — reachable
 * by anonymous callers (IP blocklist, WAF toggle, audit logs exposed). This test
 * locks the fix.
 */
import { strict as assert } from 'node:assert';
import { createCompatApp } from '../dist/compat/app.js';
import { sqliteRunner } from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { UserStore } from '../dist/db/users.js';
import { seedOwner } from '../dist/auth/seed.js';

const SECRET = 'test-secret-0123456789012345678901234567';

async function anonApp() {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    await seedOwner(new UserStore(runner, '_default'), { email: 'admin@test.com', password: 'password123', now: '2026-01-01T00:00:00Z' });
    return createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal: async () => ({ user: null, tenant: undefined }), // ANON
        sessionSecret: SECRET,
        userStoreFor: (t) => new UserStore(runner, t),
    });
}
const req = (app, m, p, b) => app.fetch(new Request('http://x' + p, { method: m, headers: b ? { 'content-type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined }));

const tests = [];
const test = (n, f) => tests.push([n, f]);

test('AUTHED auth ops are DENIED to anonymous callers (RULE 2)', async () => {
    const app = await anonApp();
    const authed = [
        ['GET', '/api/auth/me'],
        ['GET', '/api/auth/security/blocklist'],
        ['POST', '/api/auth/security/blocklist'],
        ['DELETE', '/api/auth/security/blocklist/x'],
        ['GET', '/api/auth/security/audit-logs'],
        ['GET', '/api/auth/security/bot-protection'],
        ['POST', '/api/auth/security/bot-protection'],
        ['GET', '/api/auth/security/bot-protection/metrics'],
        ['GET', '/api/auth/security/waf'],
        ['POST', '/api/auth/security/waf'],
    ];
    for (const [m, p] of authed) {
        const r = await req(app, m, p, m !== 'GET' ? {} : undefined);
        assert.equal(r.status, 401, `${m} ${p} must be 401 for anon, got ${r.status}`);
    }
});

test('UNAUTHENTICATED auth ops bypass the guard', async () => {
    const app = await anonApp();
    // check-slug / logout / forgot-password succeed without a session
    assert.notEqual((await req(app, 'GET', '/api/auth/check-slug/foo')).status, 401);
    assert.notEqual((await req(app, 'POST', '/api/auth/logout')).status, 401);
    assert.notEqual((await req(app, 'POST', '/api/auth/forgot-password', { email: 'x' })).status, 401);
});

test('login with valid creds bypasses the guard, issues a session cookie', async () => {
    const app = await anonApp();
    const r = await req(app, 'POST', '/api/auth/login', { email: 'admin@test.com', password: 'password123' });
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('set-cookie'), 'login must set the fb_session cookie');
    assert.equal((await r.json()).user.email, 'admin@test.com');
});

test('login with wrong creds returns 401 invalid_credentials (not a guard block)', async () => {
    const app = await anonApp();
    const r = await req(app, 'POST', '/api/auth/login', { email: 'admin@test.com', password: 'wrong' });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, 'invalid_credentials');
});

let failed = 0;
for (const [name, fn] of tests) {
    try { await fn(); console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}
console.log(`\ncompat-auth-guard: ${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
