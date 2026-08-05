/**
 * CF-22 Gate 1c(2) + Gate 3 — derived authentication/security behavior.
 *
 * Statuses are outcomes, not annotations:
 *   - stub: runtime 501
 *   - external-disabled: runtime explicitly reports a missing external capability
 *   - functional: the scenario observes a state/session transition through a
 *     subsequent public API read (or, for signup/reset, the credential store)
 *   - shape-only: a conformant success with no observable transition
 *
 * The operation scope is derived from the vendored contract. Scenario code
 * supplies stimuli and observations but never supplies a status.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCompatApp } from '../dist/compat/app.js';
import { KeyValueStore } from '../dist/compat/store.js';
import {
    createResolvePrincipal,
    hashPassword,
    sqliteRunner,
} from '@frontbase/edge-infra';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', 'contracts', 'openapi.community.json'), 'utf8'));
const expected = JSON.parse(readFileSync(join(here, '..', 'contracts', 'behavior.auth.json'), 'utf8'));
const SECRET = 'behavior-auth-secret-012345678901234567890';
const NOW = '2026-07-28T00:00:00.000Z';
const OWNER = { email: 'behavior-owner@example.com', password: 'Behavior-owner-password-1!' };

const opKey = (method, path) => `${method.toUpperCase()} ${path}`;
const scopedOps = new Set();
for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(item)) {
        if (
            op.tags?.includes('Authentication')
            || path === '/'
            || path === '/api/settings/invites'
        ) {
            scopedOps.add(opKey(method, path));
        }
    }
}

async function makeHarness() {
    const runner = sqliteRunner(':memory:');
    await migrateUp(runner);
    await new TenantStore(runner).createTenant('_default', 'Default workspace', NOW);
    await new UserStore(runner, '_default').createUser({
        id: 'behavior-owner',
        email: OWNER.email,
        passwordHash: await hashPassword(OWNER.password),
        role: 'master_admin',
        now: NOW,
    });
    const resolvePrincipal = createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'frontbase_session' });
    const passwordResetTokens = new Map();
    const app = await createCompatApp({
        makeRunner: async () => runner,
        resolvePrincipal,
        sessionSecret: SECRET,
        userStoreFor: (tenant) => new UserStore(runner, tenant),
        now: () => NOW,
        includeProductRoot: true,
        passwordResetDelivery: async (email, token) => {
            passwordResetTokens.set(email.toLowerCase(), token);
        },
        cloudMode: true,
    });
    const request = async (method, path, body, cookie) => {
        const headers = {};
        if (body !== undefined) headers['content-type'] = 'application/json';
        if (cookie) headers.cookie = cookie;
        return app.fetch(new Request('http://behavior.local' + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        }));
    };
    const login = async (email = OWNER.email, password = OWNER.password) => {
        const response = await request('POST', '/api/auth/login', { email, password });
        assert.equal(response.status, 200);
        const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
        assert.ok(cookie);
        return { response, cookie };
    };
    const invite = async (email) => {
        const { cookie } = await login();
        const response = await request('POST', '/api/settings/invites', { email, role: 'admin' }, cookie);
        assert.equal(response.status, 200);
        const body = await response.clone().json();
        // The product answers `{success, message}` and nothing more
        // (app/routers/settings.py:530) — the token is emailed, never echoed. Read it
        // from the store so the scenarios below still drive a real invite rather than
        // one the API conveniently handed back.
        const rows = await runner.query(
            "SELECT key FROM settings WHERE key LIKE 'community_invite:%' ORDER BY updated_at DESC LIMIT 1",
        );
        const token = String(rows[0]?.key ?? '').slice('community_invite:'.length);
        assert.ok(token, 'invite must be persisted even though the response omits the token');
        return { response, body: { ...body, token }, cookie };
    };
    return { runner, app, request, login, invite, passwordResetTokens };
}

const scenarios = new Map();
const scenario = (method, path, run) => {
    const key = opKey(method, path);
    assert.ok(!scenarios.has(key), `duplicate behavior scenario: ${key}`);
    scenarios.set(key, run);
};

scenario('GET', '/', async () => {
    const h = await makeHarness();
    return { response: await h.request('GET', '/'), observations: [] };
});
scenario('OPTIONS', '/api/auth/login', async () => {
    const h = await makeHarness();
    return { response: await h.request('OPTIONS', '/api/auth/login'), observations: [] };
});
scenario('OPTIONS', '/api/auth/signup', async () => {
    const h = await makeHarness();
    return { response: await h.request('OPTIONS', '/api/auth/signup'), observations: [] };
});
scenario('POST', '/api/auth/login', async () => {
    const h = await makeHarness();
    const { response, cookie } = await h.login();
    const me = await h.request('GET', '/api/auth/me', undefined, cookie);
    const body = await me.json();
    return {
        response,
        observations: [
            me.status === 200 && body.user?.email === OWNER.email
                ? 'issued session is observed by GET /api/auth/me'
                : null,
        ].filter(Boolean),
    };
});
scenario('POST', '/api/auth/logout', async () => {
    const h = await makeHarness();
    const response = await h.request('POST', '/api/auth/logout');
    const cleared = response.headers.get('set-cookie') ?? '';
    return {
        response,
        observations: /Max-Age=0/i.test(cleared)
            ? ['session cookie is explicitly invalidated']
            : [],
    };
});
scenario('POST', '/api/auth/signup', async () => {
    const h = await makeHarness();
    const body = {
        email: 'new-owner@example.com',
        password: 'New-owner-password-1!',
        workspace_name: 'New workspace',
        slug: 'new-workspace',
    };
    const response = await h.request('POST', '/api/auth/signup', body);
    const user = await new UserStore(h.runner, body.slug).findByEmailForVerify(body.email);
    const tenant = await new TenantStore(h.runner).tenantExists(body.slug);
    const login = await h.request('POST', '/api/auth/login', { email: body.email, password: body.password });
    return {
        response,
        observations: user && tenant && login.status === 200
            ? ['created tenant/user are observable through credential login']
            : [],
    };
});
scenario('GET', '/api/auth/check-slug/{slug}', async () => {
    const h = await makeHarness();
    const slug = 'availability-probe';
    const before = await (await h.request('GET', `/api/auth/check-slug/${slug}`)).json();
    await new TenantStore(h.runner).createTenant(slug, 'Taken', NOW);
    const response = await h.request('GET', `/api/auth/check-slug/${slug}`);
    const after = await response.clone().json();
    return {
        response,
        observations: before.available === true && after.available === false
            ? ['response changes when the tenant slug is persisted']
            : [],
    };
});
scenario('POST', '/api/auth/forgot-password', async () => {
    const h = await makeHarness();
    const response = await h.request('POST', '/api/auth/forgot-password', { email: OWNER.email });
    const token = h.passwordResetTokens.get(OWNER.email);
    const stored = await h.runner.query(
        'SELECT token_hash FROM password_reset_tokens WHERE email = ?',
        [OWNER.email],
    );
    return {
        response,
        observations: token
            && stored.length === 1
            && String(stored[0].token_hash).length === 64
            && !JSON.stringify(stored).includes(token)
            ? ['opaque response delivers a capability while only its SHA-256 hash persists']
            : [],
    };
});
scenario('POST', '/api/auth/reset-password', async () => {
    const h = await makeHarness();
    const { cookie: oldCookie } = await h.login();
    await h.request('POST', '/api/auth/forgot-password', { email: OWNER.email });
    const token = h.passwordResetTokens.get(OWNER.email);
    assert.ok(token);
    const replacement = 'Replacement-password-1!';
    const response = await h.request('POST', '/api/auth/reset-password', {
        email: OWNER.email,
        password: replacement,
        token,
    });
    const oldLogin = await h.request('POST', '/api/auth/login', OWNER);
    const newLogin = await h.request('POST', '/api/auth/login', { email: OWNER.email, password: replacement });
    const replay = await h.request('POST', '/api/auth/reset-password', {
        email: OWNER.email,
        password: 'Another-password-2!',
        token,
    });
    const oldSession = await h.request('GET', '/api/auth/me', undefined, oldCookie);
    return {
        response,
        observations: oldLogin.status === 401
            && newLogin.status === 200
            && replay.status === 400
            && oldSession.status === 401
            ? ['password changes, token is single-use, and pre-reset session is invalidated']
            : [],
    };
});
scenario('POST', '/api/settings/invites', async () => {
    const h = await makeHarness();
    const { response, body } = await h.invite('settings-invite@example.com');
    const read = await h.request('GET', `/api/auth/invite/${body.token}`);
    const info = await read.json();
    return {
        response,
        observations: read.status === 200 && info.email === 'settings-invite@example.com'
            ? ['created token is observable through GET /api/auth/invite/{token}']
            : [],
    };
});
scenario('GET', '/api/auth/invite/{token}', async () => {
    const h = await makeHarness();
    const { body } = await h.invite('invite-read@example.com');
    const response = await h.request('GET', `/api/auth/invite/${body.token}`);
    const info = await response.clone().json();
    return {
        response,
        observations: info.email === 'invite-read@example.com'
            ? ['response reflects the persisted invite']
            : [],
    };
});
scenario('POST', '/api/auth/accept-invite', async () => {
    const h = await makeHarness();
    const email = 'accepted-invite@example.com';
    const password = 'Accepted-invite-password-1!';
    const { body } = await h.invite(email);
    const response = await h.request('POST', '/api/auth/accept-invite', { token: body.token, password });
    const user = await new UserStore(h.runner, '_default').findByEmailForVerify(email);
    const replay = await h.request('POST', '/api/auth/accept-invite', { token: body.token, password });
    const login = await h.request('POST', '/api/auth/login', { email, password });
    return {
        response,
        observations: user && replay.status === 404 && login.status === 200
            ? ['user login succeeds and the one-time token cannot be replayed']
            : [],
    };
});
scenario('GET', '/api/auth/me', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const response = await h.request('GET', '/api/auth/me', undefined, cookie);
    const body = await response.clone().json();
    return {
        response,
        observations: body.user?.email === OWNER.email
            ? ['response reflects the authenticated session principal']
            : [],
    };
});

const botBody = {
    enabled: true,
    provider: 'cloudflare',
    site_key: 'site-key',
    secret_key: 'secret-key',
    protect_login: true,
    protect_forgot_password: true,
    recaptcha_v3_threshold: 0.7,
    widget_theme: 'dark',
    widget_size: 'compact',
    auto_ban_lockout_hours: 12,
};

scenario('GET', '/api/auth/security/blocklist', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const before = await (await h.request('GET', '/api/auth/security/blocklist', undefined, cookie)).json();
    await h.request('POST', '/api/auth/security/blocklist', { ip_or_range: '192.0.2.1', reason: 'test' }, cookie);
    const response = await h.request('GET', '/api/auth/security/blocklist', undefined, cookie);
    const after = await response.clone().json();
    return { response, observations: before.length === 0 && after.length === 1 ? ['list reflects a persisted ban'] : [] };
});
scenario('POST', '/api/auth/security/blocklist', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const response = await h.request('POST', '/api/auth/security/blocklist', { ip_or_range: '192.0.2.2' }, cookie);
    const list = await (await h.request('GET', '/api/auth/security/blocklist', undefined, cookie)).json();
    return { response, observations: list.some((x) => x.ip_or_range === '192.0.2.2') ? ['ban is observable in blocklist'] : [] };
});
scenario('DELETE', '/api/auth/security/blocklist/{ban_id}', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    await h.request('POST', '/api/auth/security/blocklist', { ip_or_range: '192.0.2.3' }, cookie);
    const before = await (await h.request('GET', '/api/auth/security/blocklist', undefined, cookie)).json();
    const response = await h.request('DELETE', `/api/auth/security/blocklist/${before[0].id}`, undefined, cookie);
    const after = await (await h.request('GET', '/api/auth/security/blocklist', undefined, cookie)).json();
    return { response, observations: after.length === 0 ? ['deleted ban disappears from blocklist'] : [] };
});
scenario('GET', '/api/auth/security/bot-protection', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const before = await (await h.request('GET', '/api/auth/security/bot-protection', undefined, cookie)).json();
    await h.request('POST', '/api/auth/security/bot-protection', botBody, cookie);
    const response = await h.request('GET', '/api/auth/security/bot-protection', undefined, cookie);
    const after = await response.clone().json();
    return { response, observations: !before.enabled && after.enabled ? ['read reflects persisted bot settings'] : [] };
});
scenario('POST', '/api/auth/security/bot-protection', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const response = await h.request('POST', '/api/auth/security/bot-protection', botBody, cookie);
    const after = await (await h.request('GET', '/api/auth/security/bot-protection', undefined, cookie)).json();
    return { response, observations: after.enabled && after.widget_theme === 'dark' ? ['update is observable through bot settings read'] : [] };
});
scenario('GET', '/api/auth/security/bot-protection/metrics', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const before = await (await h.request('GET', '/api/auth/security/bot-protection/metrics', undefined, cookie)).json();
    await h.request('POST', '/api/auth/security/blocklist', { ip_or_range: '192.0.2.4' }, cookie);
    const response = await h.request('GET', '/api/auth/security/bot-protection/metrics', undefined, cookie);
    const after = await response.clone().json();
    return { response, observations: before.banned_ips === 0 && after.banned_ips === 1 ? ['metric reflects persisted blocklist state'] : [] };
});
scenario('GET', '/api/auth/security/waf', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const before = await (await h.request('GET', '/api/auth/security/waf', undefined, cookie)).json();
    await h.request('POST', '/api/auth/security/waf', { enabled: true }, cookie);
    const response = await h.request('GET', '/api/auth/security/waf', undefined, cookie);
    const after = await response.clone().json();
    return { response, observations: !before.enabled && after.enabled ? ['read reflects persisted WAF state'] : [] };
});
scenario('POST', '/api/auth/security/waf', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const response = await h.request('POST', '/api/auth/security/waf', { enabled: true }, cookie);
    const after = await (await h.request('GET', '/api/auth/security/waf', undefined, cookie)).json();
    return { response, observations: after.enabled ? ['update is observable through WAF read'] : [] };
});
scenario('GET', '/api/auth/security/audit-logs', async () => {
    const h = await makeHarness();
    const { cookie } = await h.login();
    const before = await (await h.request('GET', '/api/auth/security/audit-logs', undefined, cookie)).json();
    await h.request('POST', '/api/auth/security/waf', { enabled: true }, cookie);
    const response = await h.request('GET', '/api/auth/security/audit-logs', undefined, cookie);
    const after = await response.clone().json();
    // The harness shares one app across scenarios, so earlier security mutations
    // (blocklist, bot-protection) have already written entries — `before` is not
    // empty. The audit write is observed if the log grew AND the newest entry is the
    // waf_updated we just posted. `details` is a string (the product's Text column),
    // never the raw payload object that used to crash the Audit Trail (React #31).
    const grew = Array.isArray(after) && Array.isArray(before) && after.length > before.length;
    const observations = grew && after[0]?.action === 'waf_updated'
        ? ['security mutation appears in audit log']
        : [];
    return { response, observations };
});

const missing = [...scopedOps].filter((key) => !scenarios.has(key));
const extra = [...scenarios.keys()].filter((key) => !scopedOps.has(key));
assert.deepEqual(missing, [], `missing behavior scenarios: ${missing.join(', ')}`);
assert.deepEqual(extra, [], `non-contract behavior scenarios: ${extra.join(', ')}`);

async function classify({ response, observations }) {
    if (response.status === 501) return 'stub';
    if (!response.ok) {
        const body = await response.clone().json().catch(() => ({}));
        const message = String(body.detail ?? body.message ?? '').toLowerCase();
        if (/not configured|not available|disabled/.test(message)) return 'external-disabled';
        throw new Error(`behavior scenario returned unexpected HTTP ${response.status}`);
    }
    return observations.length > 0 ? 'functional' : 'shape-only';
}

const operations = {};
for (const key of [...scopedOps].sort()) {
    const evidence = await scenarios.get(key)();
    const status = await classify(evidence);
    operations[key] = { status, evidence: evidence.observations };
}
const counts = {};
for (const { status } of Object.values(operations)) counts[status] = (counts[status] ?? 0) + 1;
const actual = { scope: 'authentication/security + closed root/invite producer', counts, operations };

// Regression (CF-22 Audit Trail React #31): an older framework build persisted audit
// `details` as a JSON object — the raw request payload. The product's AuditLog.details is
// a Text column and SecuritySettingsForm renders `{log.details}` raw into the DOM, so a
// stale object entry crashes the whole Settings → Security screen. Seed exactly that stale
// shape straight into the store — bypassing the route's write coercion — and prove the
// READ path normalises it to a string, so the live console cannot crash on old data.
{
    const h = await makeHarness();
    const { cookie } = await h.login();
    await new KeyValueStore(h.runner, '_default').setJson('auth_security_audit', [{
        id: 'stale-object-details',
        action: 'bot_protection_updated',
        details: { enabled: true },
        created_at: NOW,
        user_id: null, ip_address: null, user_agent: null,
    }], NOW);
    const res = await h.request('GET', '/api/auth/security/audit-logs', undefined, cookie);
    const body = await res.clone().json();
    const stale = body.find((e) => e.id === 'stale-object-details');
    assert.equal(res.status, 200, 'audit-logs read must succeed');
    assert.ok(stale, 'seeded stale audit entry must be served');
    assert.equal(typeof stale.details, 'string', 'stale object details must be coerced to a string on read');
    assert.equal(stale.details, '{"enabled":true}', 'object details must be JSON-stringified on read');
    console.log('  regression: stale object audit.details is coerced to string on read ✅');
}

console.log('\ncompat behavior — authentication/security wave\n');
for (const status of ['functional', 'shape-only', 'external-disabled', 'stub']) {
    console.log(`  ${status.padEnd(18)} ${String(counts[status] ?? 0).padStart(2)}`);
}
for (const [key, value] of Object.entries(operations)) {
    console.log(`  ${value.status.padEnd(18)} ${key}`);
}

if (process.argv.includes('--json')) console.log('\n' + JSON.stringify(actual, null, 2));
if (process.argv.includes('--gate')) assert.deepEqual(actual, expected, 'behavior.auth.json is stale');
