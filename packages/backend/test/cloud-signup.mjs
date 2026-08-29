/**
 * A-25 Phase 4 — cloud signup semantics: slug grammar/reserved validation
 * (product validate_slug messages verbatim), 409 collisions, full provisioning
 * (tenant plan/status + owner + published homepage + session), compensating
 * delete on provisioning failure, check-slug validation parity, /api/auth/me
 * tenant fields (plan correction 7), and the Resend reset delivery.
 *
 * The SELF-HOST default (`cloudMode` unset → signup 400) is covered by
 * compat-behavior-auth; here cloudMode is ON — that IS the feature.
 */
import { createResolvePrincipal, hashPassword, sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';
import { createResendPasswordResetDelivery, passwordResetLink } from '../dist/compat/email/resend.js';

const NOW = '2026-01-01T00:00:00.000Z';
const SECRET = 'cloud-signup-test-secret-012345678901234';
let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);

// Pre-existing tenant so collision paths have something to collide with, and a
// pre-existing user id so provisioning failure can be injected with a real
// UNIQUE-constraint throw (no mock seams in the auth routes).
await new TenantStore(runner).createTenant('taken', 'Taken Co', NOW);
await new UserStore(runner, 'taken').createUser({
    id: 'dupe-id', email: 'dupe@taken.test', passwordHash: await hashPassword('x'), role: 'owner', tenantSlug: 'taken', now: NOW,
});

const resetDeliveries = [];
const app = await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: SECRET,
    // The production session resolver (same JWT cookie contract) so the me
    // check exercises the real session issue → verify round trip.
    resolvePrincipal: createResolvePrincipal({
        jwtSecret: SECRET,
        jwtCookie: 'frontbase_session',
    }),
    userStoreFor: (t) => new UserStore(runner, t),
    now: () => NOW,
    cloudMode: true,
    // Records the raw capability the route hands off — proves the forgot route
    // actually delivers and stays non-enumerating when the provider explodes.
    passwordResetDelivery: async (email, token) => { resetDeliveries.push({ email, token }); },
});
// Each check is a different visitor: distinct CF-Connecting-IP so the WA6
// cloud rate limiter (cloud-rate-limit.mjs tests IT) never throttles this
// suite's business-logic probing.
let visitorSeq = 0;
const visitor = () => `10.${(visitorSeq = visitorSeq + 1) % 256}.0.1`;
const signup = (body) => app.fetch(new Request('https://app.frontbase.test/api/auth/signup', {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        host: 'app.frontbase.test',
        'cf-connecting-ip': visitor(),
    },
    body: JSON.stringify(body),
}));
const VALID = { email: 'owner@newco.test', password: 'passphrase-for-newco-1', slug: 'newco', workspace_name: 'NewCo' };

console.log('— signup validation (product validate_slug messages verbatim) —');
check('short slug → 400 "Slug must be at least 3 characters"', await (async () => {
    const r = await signup({ ...VALID, slug: 'ab' });
    return r.status === 400 && (await r.json()).detail === 'Slug must be at least 3 characters';
})());
check('long slug → 400 "Slug must be at most 50 characters"', await (async () => {
    const r = await signup({ ...VALID, slug: 'a'.repeat(51) });
    return r.status === 400 && (await r.json()).detail === 'Slug must be at most 50 characters';
})());
check('mixed case slug → 400 lowercase-alnum-with-hyphens message (raw validated, not normalized)', await (async () => {
    const r = await signup({ ...VALID, slug: 'Newco' });
    return r.status === 400 && (await r.json()).detail === 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen';
})());
check('trailing hyphen rejected by the same message', await (async () => {
    const r = await signup({ ...VALID, slug: 'newco-' });
    return r.status === 400;
})());
check('reserved slug → 400 "\'app\' is a reserved name"', await (async () => {
    const r = await signup({ ...VALID, slug: 'app' });
    return r.status === 400 && (await r.json()).detail === "'app' is a reserved name";
})());
check('product reserved slug (www) also rejected', await (async () => {
    const r = await signup({ ...VALID, slug: 'www' });
    return r.status === 400 && (await r.json()).detail === "'www' is a reserved name";
})());
check('slug collision → 409 "Slug \'taken\' is already taken"', await (async () => {
    const r = await signup({ ...VALID, slug: 'taken' });
    return r.status === 409 && (await r.json()).detail === "Slug 'taken' is already taken";
})());
check('malformed body (bad email, missing fields) → 422 product validation', await (async () => {
    const r = await signup({ email: 'nope', slug: 'okslug', password: 'x', workspace_name: 'X' });
    return r.status === 422;
})());

console.log('— signup provisions a LIVE workspace (rows only) —');
let cookie = '';
check('signup → 200 with session + tenant block', await (async () => {
    const r = await signup(VALID);
    cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
    const body = await r.json();
    return r.status === 200
        && body.user?.email === 'owner@newco.test'
        && body.user?.tenant_slug === 'newco'
        && body.tenant?.slug === 'newco'
        && body.tenant?.name === 'NewCo'
        && cookie.startsWith('frontbase_session=');
})());
check('tenant row: plan=free, status=active', await (async () => {
    const t = await new TenantStore(runner).getTenant('newco');
    return t?.plan === 'free' && t?.status === 'active';
})());
check('owner user created with role=owner in the tenant', (await new UserStore(runner, 'newco').findByEmailAnyTenant('owner@newco.test'))[0]?.role === 'owner');
check('published homepage seeded — the site is LIVE at /', await (async () => {
    const rows = await runner.query("SELECT is_homepage, is_published, deleted_at FROM compat_pages WHERE tenant_slug = 'newco'");
    return rows.length === 1 && Number(rows[0].is_homepage) === 1 && Number(rows[0].is_published) === 1 && rows[0].deleted_at == null;
})());
check('duplicate email → 409 (global, cross-workspace)', await (async () => {
    const r = await signup({ ...VALID, slug: 'otherco', email: 'owner@newco.test' });
    return r.status === 409 && (await r.json()).detail === 'An account with this email already exists';
})());
check('session from signup authenticates /api/auth/me (own host)', await (async () => {
    const r = await app.fetch(new Request('https://app.frontbase.test/api/auth/me', { headers: { cookie, host: 'app.frontbase.test' } }));
    const body = await r.json();
    return r.status === 200 && body.user?.email === 'owner@newco.test'
        && body.user?.tenant_slug === 'newco' && body.user?.tenant_id === 'newco';
})());

console.log('— compensating delete on provisioning failure —');
check('user-id collision mid-provision → 500 AND no partial workspace remains', await (async () => {
    const r = await signup({ ...VALID, email: 'owner2@doomed.test', slug: 'doomed', workspace_name: 'Doomed', user_id: 'dupe-id' });
    const tenantGone = !(await new TenantStore(runner).tenantExists('doomed'));
    const usersGone = (await new UserStore(runner, 'doomed').findByEmailAnyTenant('owner2@doomed.test')).length === 0;
    return r.status === 500 && tenantGone && usersGone;
})());

console.log('— check-slug mirrors the signup validator —');
const checkSlug = (slug) => app.fetch(new Request(`https://app.frontbase.test/api/auth/check-slug/${encodeURIComponent(slug)}`, { headers: { host: 'app.frontbase.test' } }));
check('available slug → {available:true}', await (async () => {
    const r = await checkSlug('freeslug');
    return r.status === 200 && (await r.json()).available === true;
})());
check('taken slug → {available:false}', await (async () => {
    const r = await checkSlug('taken');
    return r.status === 200 && (await r.json()).available === false;
})());
check('reserved slug → 400 with the product message (never "available")', await (async () => {
    const r = await checkSlug('api');
    return r.status === 400 && (await r.json()).detail === "'api' is a reserved name";
})());
check('grammar-invalid slug → 400', (await checkSlug('ab')).status === 400);

console.log('— self-host guard stays shut —');
check('cloudMode unset → signup 400 "Signup only available in cloud mode"', await (async () => {
    const selfHost = await createCompatApp({
        makeRunner: async () => runner,
        sessionSecret: SECRET,
        userStoreFor: (t) => new UserStore(runner, t),
        now: () => NOW,
    });
    const r = await selfHost.fetch(new Request('https://x.local/api/auth/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(VALID),
    }));
    return r.status === 400;
})());

console.log('— Resend delivery (transport mocked; route swallows failures) —');
check('link shape: <baseUrl>/admin/reset-password?token=…&email=…', passwordResetLink('https://app.frontbase.test/', 'a@b.c', 'tok en/+/=') === 'https://app.frontbase.test/admin/reset-password?token=tok%20en%2F%2B%2F%3D&email=a%40b.c');
let captured = null;
const deliver = createResendPasswordResetDelivery({
    apiKey: 're_test_key',
    baseUrl: 'https://app.frontbase.test',
    fetchImpl: async (url, init) => {
        captured = { url: String(url), ...JSON.parse(init?.body ?? '{}') };
        return new Response(JSON.stringify({ id: 'e1' }), { status: 200 });
    },
});
await deliver('owner@newco.test', 'token-123');
check('POSTs api.resend.com/emails with from/to/subject', captured?.url === 'https://api.resend.com/emails' && captured?.to?.[0] === 'owner@newco.test' && captured?.subject === 'Reset your password');
check('body HTML carries the reset link with the token', (captured?.html ?? '').includes('/admin/reset-password?token=token-123'));
check('provider failure throws (route swallows → non-enumerating response)', await (async () => {
    const failing = createResendPasswordResetDelivery({
        apiKey: 're_test_key', baseUrl: 'https://app.frontbase.test',
        fetchImpl: async () => new Response('{"message":"boom"}', { status: 422 }),
    });
    let threw = false;
    try { await failing('x@y.z', 't'); } catch { threw = true; }
    return threw;
})());
check('forgot-password delivers a real token yet stays non-enumerating (unknown email ⇒ same 200)', await (async () => {
    const r = await app.fetch(new Request('https://app.frontbase.test/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'app.frontbase.test', 'cf-connecting-ip': visitor() },
        body: JSON.stringify({ email: 'owner@newco.test' }),
    }));
    const body = await r.json();
    const delivered = resetDeliveries.length === 1
        && resetDeliveries[0].email === 'owner@newco.test'
        && typeof resetDeliveries[0].token === 'string' && resetDeliveries[0].token.length >= 16;
    const rUnknown = await app.fetch(new Request('https://app.frontbase.test/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json', host: 'app.frontbase.test', 'cf-connecting-ip': visitor() },
        body: JSON.stringify({ email: 'nobody@nowhere.test' }),
    }));
    return r.status === 200 && body.success === true && body.dev_link === null
        && delivered && rUnknown.status === 200;
})());

console.log(failures === 0 ? 'cloud-signup: PASS ✅' : `cloud-signup: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
