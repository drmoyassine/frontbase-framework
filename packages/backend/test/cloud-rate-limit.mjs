/**
 * A-25 Phase 4 WA6 — cloud-only per-IP rate limiting on the unauthenticated
 * auth ops (signup 5/hour, login 10/15min, forgot 5/hour), CF-16's
 * `rateLimitGuard` over a durable D1-shaped store (`rate_limit_counters`,
 * migration v21) instead of isolate memory.
 *
 * Pinned behavior:
 *   - EVERY attempt counts (invalid ones too — anti-brute-force), and the
 *     counter runs BEFORE the handler, so a request that would 422 still
 *     burns a token;
 *   - buckets are per source IP (`CF-Connecting-IP`); headerless callers all
 *     share the 'unknown' bucket (documented degradation);
 *   - windows expire (fixed window anchored at the first hit);
 *   - counters really land in `rate_limit_counters` (the D1 backing the
 *     RULE 8 mutation "remove the rateLimitGuard call" must flip these red);
 *   - self-host (cloudMode off) is untouched: no 429s at any volume.
 */
import { createResolvePrincipal, hashPassword, issueSession, sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';

const NOW = '2026-01-01T00:00:00.000Z';
const SECRET = 'cloud-rate-limit-test-secret-0123456789';
let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

// Movable clock — the limiter's windows derive from it.
let t = Date.parse(NOW);
const runner = sqliteRunner(':memory:');
await migrateUp(runner);
await new TenantStore(runner).createTenant('taken', 'Taken Co', NOW);
await new UserStore(runner, 'taken').createUser({
    id: 'seed-1', email: 'seed@taken.test', passwordHash: await hashPassword('pw-seed-1'),
    role: 'owner', tenantSlug: 'taken', now: NOW,
});

const buildApp = async (cloudMode) => await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: SECRET,
    resolvePrincipal: createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'frontbase_session' }),
    userStoreFor: (tenant) => new UserStore(runner, tenant),
    cloudMode,
    now: () => new Date(t).toISOString(),
});
const cloud = await buildApp(true);
const selfHost = await buildApp(false);

// `ip` rides CF-Connecting-IP — the platform-set header the bucket keys on.
const call = (app, path, body, ip, method = 'POST') => app.fetch(new Request(`https://app.frontbase.test${path}`, {
    method,
    headers: {
        'content-type': 'application/json',
        host: 'app.frontbase.test',
        ...(ip ? { 'cf-connecting-ip': ip } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}));

console.log('— signup bucket: 5/hour, every attempt counts —');
check('4 malformed signups burn 4 tokens (422s, not 429)', await (async () => {
    for (let i = 0; i < 4; i++) {
        const r = await call(cloud, '/api/auth/signup', { email: 'not-an-email' }, '1.1.1.1');
        if (r.status !== 422) return false;
    }
    return true;
})());
check('5th attempt also counts, 6th (a VALID signup shape) → 429 opaque rate_limited', await (async () => {
    const fifth = await call(cloud, '/api/auth/signup', { email: 'x@y.z' }, '1.1.1.1');
    const sixth = await call(cloud, '/api/auth/signup', {
        email: 'fifth@newco.test', password: 'pw-newco-1', slug: 'newco', name: 'Newco',
    }, '1.1.1.1');
    const body = await sixth.json();
    // The guard's {error:'rate_limited'} is rewrapped by the compat error
    // envelope into the product's FastAPI shape — either way it stays opaque.
    return fifth.status === 422 && sixth.status === 429
        && (body.error === 'rate_limited' || body.detail === 'rate_limited');
})());
check('the valid signup never ran (no tenant created — burned by the earlier 422s)', (await new TenantStore(runner).getTenant('newco')) == null);
check('counters really live in rate_limit_counters (D1 backing)', await (async () => {
    const rows = await runner.query("SELECT bucket_key, count FROM rate_limit_counters WHERE bucket_key LIKE 'rl:rl-anon:1.1.1.1%'");
    return rows.some((r) => Number(r.count) === 5);
})());

console.log('— per-IP isolation —');
check('a different IP has a fresh signup bucket', (await call(cloud, '/api/auth/signup', { email: 'not-an-email' }, '2.2.2.2')).status === 422);
check('headerless callers share the `unknown` bucket with each other', await (async () => {
    for (let i = 0; i < 5; i++) await call(cloud, '/api/auth/signup', { email: 'x@y.z' }); // no IP header
    const r = await call(cloud, '/api/auth/signup', { email: 'x@y.z' });
    return r.status === 429;
})());

console.log('— login bucket: 10 per 15 minutes —');
check('10 wrong-password logins pass through (401s), the 11th → 429', await (async () => {
    for (let i = 0; i < 10; i++) {
        const r = await call(cloud, '/api/auth/login', { email: 'seed@taken.test', password: 'wrong' }, '3.3.3.3');
        if (r.status !== 401) return false;
    }
    const r = await call(cloud, '/api/auth/login', { email: 'seed@taken.test', password: 'wrong' }, '3.3.3.3');
    return r.status === 429;
})());

console.log('— forgot-password bucket: 5/hour —');
check('5 forgot-password attempts pass, the 6th → 429', await (async () => {
    for (let i = 0; i < 5; i++) {
        const r = await call(cloud, '/api/auth/forgot-password', { email: 'seed@taken.test' }, '4.4.4.4');
        if (r.status !== 200) return false;
    }
    return (await call(cloud, '/api/auth/forgot-password', { email: 'seed@taken.test' }, '4.4.4.4')).status === 429;
})());

console.log('— window expiry —');
check('advancing the clock past the signup window frees the bucket', await (async () => {
    t += 3601 * 1000;
    const r = await call(cloud, '/api/auth/signup', { email: 'not-an-email' }, '1.1.1.1');
    return r.status === 422;
})());

console.log('— unrelated auth ops are not bucketed —');
check('check-slug stays unlimited in cloud', await (async () => {
    for (let i = 0; i < 12; i++) {
        const r = await call(cloud, `/api/auth/check-slug/slug${i}`, undefined, '5.5.5.5', 'GET');
        if (r.status === 429) return false;
    }
    return true;
})());

console.log('— self-host: no limiter at all —');
check('cloudMode off → 30 logins, zero 429s', await (async () => {
    for (let i = 0; i < 30; i++) {
        const r = await call(selfHost, '/api/auth/login', { email: 'seed@taken.test', password: 'wrong' }, '6.6.6.6');
        if (r.status === 429) return false;
    }
    return true;
})());
check('self-host wrote no rate_limit_counters rows', await (async () => {
    const rows = await runner.query("SELECT COUNT(*) AS n FROM rate_limit_counters WHERE bucket_key LIKE 'rl:rl-anon:6.6.6.6%'");
    return Number(rows[0].n) === 0;
})());

console.log(failures === 0 ? 'cloud-rate-limit: PASS ✅' : `cloud-rate-limit: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
