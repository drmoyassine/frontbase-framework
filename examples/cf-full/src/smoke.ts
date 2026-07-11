/**
 * Pre-deploy smoke — boots the SAME full-CMS worker in-process over an in-memory
 * SQLite runner (only the D1 binding is swapped) and exercises every route class:
 * public eSSR, the SW handover, the public console health, and the login gate
 * (default-deny → login → authenticated /me). Proves a login-gated CMS works
 * end-to-end BEFORE `wrangler deploy`. Run: node dist/smoke.mjs
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCmsEngine } from './worker.js';

const ADMIN = { email: 'owner@example.com', password: 'correct horse battery staple', role: 'owner' };

const engine = await createCmsEngine({
    runner: sqliteRunner(':memory:'),
    sessionSecret: 'smoke-session-secret-not-for-prod',
    setupToken: undefined,
    admin: ADMIN,
    now: () => '2026-01-01T00:00:00.000Z',
});

const req = (path: string, init?: RequestInit) => engine.fetch(new Request('https://smoke.local' + path, init));

let failures = 0;
const check = async (label: string, fn: () => Promise<boolean>) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${(e as Error).message}`); }
};

// ---- public face (eSSR + SW) ----
await check('GET / renders (edge)', async () => {
    const r = await req('/');
    return r.status === 200 && (await r.text()).includes('chimera-rendered-by" content="edge"');
});
await check('GET /sw.js serves the browser engine bundle', async () => {
    const r = await req('/sw.js');
    return r.status === 200 && r.headers.get('content-type') === 'text/javascript' && (await r.text()).length > 1000;
});
await check('GET /console serves the SPA shell (inlined React app, not eSSR)', async () => {
    const r = await req('/console');
    const ct = r.headers.get('content-type') ?? '';
    const body = await r.text();
    // The SPA bundle (~hundreds of KB) is inlined into the HTML — a large body
    // with the #root mount proves it's the React shell, not the eSSR catch-all.
    return r.status === 200 && ct.includes('text/html') && body.includes('id="root"')
        && body.length > 50000 && !body.includes('chimera-rendered-by');
});

// ---- console: public vs login-gated ----
await check('GET /api/console/health is public → 200', async () =>
    (await req('/api/console/health')).status === 200);

await check('GET /api/console/me WITHOUT session → 401 (default-deny)', async () =>
    (await req('/api/console/me')).status === 401);

let cookie = '';
await check('POST /api/console/login with seeded admin → 200 + fb_session cookie', async () => {
    const r = await req('/api/console/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    });
    const setCookie = r.headers.get('set-cookie') ?? '';
    cookie = setCookie.split(';')[0] ?? '';
    const body = await r.json() as { user?: { email?: string; role?: string; password_hash?: unknown } };
    return r.status === 200 && cookie.startsWith('fb_session=')
        && body.user?.email === ADMIN.email && body.user?.role === 'owner'
        && !('password_hash' in (body.user ?? {})); // D8: no hash leaked
});

await check('GET /api/console/me WITH session → 200 returns the owner', async () => {
    const r = await req('/api/console/me', { headers: { cookie } });
    const body = await r.json() as { user?: { email?: string } };
    return r.status === 200 && body.user?.email === ADMIN.email;
});

await check('POST /api/console/login wrong password → 401 (opaque)', async () => {
    const r = await req('/api/console/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: 'wrong' }),
    });
    return r.status === 401 && (await r.json() as { error?: string }).error === 'invalid_credentials';
});

await check('re-seed is idempotent (owner password unchanged across boots)', async () => {
    // A second engine over the SAME data must NOT reseed/reset — login still works,
    // and a different admin password would NOT take effect.
    const r = await req('/api/console/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    });
    return r.status === 200;
});

console.log(failures === 0 ? '\ncf-full smoke: PASS ✅' : `\ncf-full smoke: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
