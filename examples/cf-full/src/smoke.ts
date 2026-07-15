/**
 * Pre-deploy smoke — boots the SAME full-CMS worker in-process over an in-memory
 * SQLite runner and exercises every route class: public eSSR, the SW handover,
 * the OLD console health + login gate (default-deny → login → /me), the NEW
 * compat surface (product /api/auth/login → /api/auth/me → /api/pages CRUD),
 * and the /frontbase-admin SPA shell.
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

// ---- OLD console (/console → 301 redirect to /frontbase-admin) ----
await check('GET /console → 301 redirect to /frontbase-admin', async () => {
    const r = await req('/console');
    return r.status === 301 && (r.headers.get('location') === '/frontbase-admin');
});

// ---- /frontbase-admin SPA shell ----
await check('GET /frontbase-admin serves the SPA shell', async () => {
    const r = await req('/frontbase-admin');
    const ct = r.headers.get('content-type') ?? '';
    const body = await r.text();
    return r.status === 200 && ct.includes('text/html') && body.includes('id="root"');
});
await check('GET /frontbase-admin/pages serves the SPA shell (SPA fallback)', async () => {
    const r = await req('/frontbase-admin/pages');
    return r.status === 200 && (await r.text()).includes('id="root"');
});

// ---- OLD console API (still live during parallel run) ----
await check('GET /api/console/health is public → 200', async () =>
    (await req('/api/console/health')).status === 200);
await check('GET /api/console/me WITHOUT session → 401', async () =>
    (await req('/api/console/me')).status === 401);

// ---- compat API: Meta health (unauthenticated) ----
await check('GET /health (compat Meta) → 200', async () =>
    (await req('/health')).status === 200);
await check('GET /api/queue/health (compat Meta) → 200', async () =>
    (await req('/api/queue/health')).status === 200);

// ---- compat API: auth guard + login ----
await check('GET /api/auth/me WITHOUT session → 401 (default-deny)', async () =>
    (await req('/api/auth/me')).status === 401);

let compatCookie = '';
await check('POST /api/auth/login (compat) with seeded admin → 200 + fb_session cookie', async () => {
    const r = await req('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    });
    const setCookie = r.headers.get('set-cookie') ?? '';
    compatCookie = setCookie.split(';')[0] ?? '';
    const body = await r.json() as { user?: { email?: string } };
    return r.status === 200 && compatCookie.startsWith('fb_session=') && body.user?.email === ADMIN.email;
});

await check('GET /api/auth/me (compat) WITH session → 200 returns the owner', async () => {
    const r = await req('/api/auth/me', { headers: { cookie: compatCookie } });
    const body = await r.json() as { user?: { email?: string } };
    return r.status === 200 && body.user?.email === ADMIN.email;
});

await check('POST /api/auth/login (compat) wrong password → 401 invalid_credentials', async () => {
    const r = await req('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: 'wrong' }),
    });
    return r.status === 401 && (await r.json() as { error?: string }).error === 'invalid_credentials';
});

// ---- compat API: pages CRUD round-trip ----
await check('POST /api/pages/ → create page → GET list → 200', async () => {
    const create = await req('/api/pages/', {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: compatCookie },
        body: JSON.stringify({ name: 'Smoke Page', slug: 'smoke', title: 'Smoke' }),
    });
    if (create.status !== 201) return false;
    const list = await req('/api/pages/', { headers: { cookie: compatCookie } });
    const body = await list.json() as { data?: unknown[] };
    return list.status === 200 && (body.data?.length ?? 0) >= 1;
});

// ---- compat API: security endpoints are behind the guard ----
await check('GET /api/auth/security/blocklist WITHOUT session → 401', async () =>
    (await req('/api/auth/security/blocklist')).status === 401);
await check('GET /api/auth/security/blocklist WITH session → 200', async () =>
    (await req('/api/auth/security/blocklist', { headers: { cookie: compatCookie } })).status === 200);

console.log(failures === 0 ? '\ncf-full smoke: PASS ✅' : `\ncf-full smoke: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
