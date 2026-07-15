/**
 * Pre-deploy smoke — boots the SAME full-CMS worker in-process over an in-memory
 * SQLite runner and exercises every route class: public eSSR, the SW handover,
 * the OLD console health + login gate (default-deny → login → /me), the NEW
 * compat surface (product /api/auth/login → /api/auth/me → /api/pages CRUD),
 * and the /frontbase-admin SPA shell.
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCmsEngine } from './worker.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN = { email: 'owner@example.com', password: 'correct horse battery staple', role: 'master_admin' };
const here = dirname(fileURLToPath(import.meta.url));
const consoleRoot = join(here, '..', 'console-dist', 'frontbase-admin');
const assetBinding = {
    async fetch(request: Request): Promise<Response> {
        const path = decodeURIComponent(new URL(request.url).pathname).replace(/^\//, '');
        const file = join(here, '..', 'console-dist', ...path.split('/'));
        if (!existsSync(file)) return new Response('not_found', { status: 404 });
        const type = file.endsWith('.js') ? 'text/javascript'
            : file.endsWith('.css') ? 'text/css'
                : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
        return new Response(readFileSync(file), { headers: { 'content-type': type } });
    },
};

const engine = await createCmsEngine({
    runner: sqliteRunner(':memory:'),
    sessionSecret: 'smoke-session-secret-not-for-prod',
    setupToken: undefined,
    admin: ADMIN,
    assets: assetBinding,
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
    const asset = body.match(/(?:src|href)="\/frontbase-admin\/(assets\/[^"?]+\.(?:js|css))/)?.[1];
    return r.status === 200 && ct.includes('text/html') && body.includes('id="root"')
        && !body.includes('Console bundle not found') && !!asset
        && existsSync(join(consoleRoot, ...asset.split('/')));
});
await check('GET /frontbase-admin/pages serves the SPA shell (SPA fallback)', async () => {
    const r = await req('/frontbase-admin/pages');
    return r.status === 200 && (await r.text()).includes('id="root"');
});
await check('hashed console asset is real + immutable', async () => {
    const html = readFileSync(join(consoleRoot, 'index.html'), 'utf8');
    const path = html.match(/src="(\/frontbase-admin\/assets\/[^"]+\.js)"/)?.[1];
    if (!path) return false;
    const r = await req(path);
    return r.status === 200 && r.headers.get('content-type')?.includes('javascript') === true
        && r.headers.get('cache-control') === 'public, max-age=31536000, immutable';
});

await check('fresh instance redirects console to existing setup surface', async () => {
    const fresh = await createCmsEngine({
        runner: sqliteRunner(':memory:'),
        sessionSecret: 'fresh-smoke-session-secret',
        assets: assetBinding,
        now: () => '2026-01-01T00:00:00.000Z',
    });
    const redirect = await fresh.fetch(new Request('https://smoke.local/frontbase-admin'));
    const setup = await fresh.fetch(new Request('https://smoke.local/setup'));
    return redirect.status === 302 && redirect.headers.get('location') === '/setup'
        && setup.status === 200 && (await setup.text()).includes('id="root"');
});

await check('initialized instance redirects /setup to product dashboard', async () => {
    const r = await req('/setup');
    return r.status === 302 && r.headers.get('location') === '/frontbase-admin/dashboard';
});

await check('setup asset is setup-only and hands off to product console', async () => {
    const r = await req('/frontbase-setup/spa.js');
    const body = await r.text();
    return r.status === 200
        && body.includes('/frontbase-admin/dashboard')
        && body.includes('/api/auth/login')
        && !body.includes('Admin Tools')
        && !body.includes('Tenants Table')
        && !body.includes('Subscription Plans');
});

await check('secure setup link → HttpOnly claim → first master admin', async () => {
    const fresh = await createCmsEngine({
        runner: sqliteRunner(':memory:'),
        sessionSecret: 'fresh-setup-smoke-session-secret',
        setupToken: 'smoke-setup-capability',
        setupExpiresAt: '2026-01-01T00:30:00.000Z',
        assets: assetBinding,
        now: () => '2026-01-01T00:00:00.000Z',
    });
    const claim = await fresh.fetch(new Request('https://smoke.local/api/console/setup/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'smoke-setup-capability' }),
    }));
    const setCookie = claim.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0] ?? '';
    if (claim.status !== 200 || !/HttpOnly/i.test(setCookie) || !/SameSite=Strict/i.test(setCookie)) return false;
    const setup = await fresh.fetch(new Request('https://smoke.local/api/console/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ email: 'first-admin@example.com', password: 'correct horse battery staple' }),
    }));
    const body = await setup.json() as { user?: { role?: string } };
    return setup.status === 200 && body.user?.role === 'master_admin';
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
    const body = await r.json() as { user?: { email?: string; is_master?: boolean } };
    return r.status === 200 && compatCookie.startsWith('fb_session=')
        && body.user?.email === ADMIN.email && body.user?.is_master === true;
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
