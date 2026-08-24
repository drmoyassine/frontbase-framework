/**
 * Pre-deploy smoke — boots the SAME full-CMS worker in-process over an in-memory
 * SQLite runner and exercises every route class: public eSSR, the SW handover,
 * retained console health/setup, explicit legacy-console retirement, the
 * product-compatible surface, and the /frontbase-admin SPA shell.
 */
import { sqliteRunner } from '@frontbase/edge-infra';
import { createCmsEngine } from './worker.js';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

// The SPA shell is committed; the hashed bundles it loads are not (posture B), so
// checks that read real bundle BYTES cannot run from a bare checkout or in CI.
// They are skipped loudly rather than quietly weakened — a skip is visible in the
// log and counted in the summary, so "green" never means "these silently passed".
const bundlesPresent = existsSync(join(consoleRoot, 'assets'));
let skipped = 0;
const checkBundles = async (label: string, fn: () => Promise<boolean>) => {
    if (!bundlesPresent) { skipped++; console.log(`  ⏭️  ${label} — SKIPPED (no console bundles; run \`pnpm run fetch:console\`)`); return; }
    await check(label, fn);
};

// ---- public face (eSSR + SW) ----
await check('GET / renders (edge)', async () => {
    const r = await req('/');
    return r.status === 200 && (await r.text()).includes('chimera-rendered-by" content="edge"');
});
await check('GET / serves the seeded homepage template (dynamic, not the baked demo)', async () => {
    const r = await req('/');
    const body = await r.text();
    return r.status === 200 && body.includes('Welcome to your new site');
});
await check('GET / with Accept: application/json returns product API status', async () => {
    const r = await req('/', { headers: { accept: 'application/json' } });
    const body = await r.json() as { message?: string; test_mode?: boolean };
    return r.status === 200 && typeof body.message === 'string' && body.test_mode === false;
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
        && !body.includes('Console bundle not found') && !!asset;
});
await check('GET /frontbase-admin/pages serves the SPA shell (SPA fallback)', async () => {
    const r = await req('/frontbase-admin/pages');
    return r.status === 200 && (await r.text()).includes('id="root"');
});
await checkBundles('shell references resolve to real bundle files', async () => {
    const body = await (await req('/frontbase-admin')).text();
    const assets = [...body.matchAll(/(?:src|href)="\/frontbase-admin\/(assets\/[^"?]+\.(?:js|css))/g)].map((m) => m[1]);
    return assets.length > 0 && assets.every((a) => existsSync(join(consoleRoot, ...a.split('/'))));
});
await checkBundles('hashed console asset is real + immutable', async () => {
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

// ---- Retained setup/health and retired legacy console API ----
await check('GET /api/console/health is public → 200', async () =>
    (await req('/api/console/health')).status === 200);
await check('GET /api/console/setup/status remains available → 200', async () =>
    (await req('/api/console/setup/status')).status === 200);
await check('legacy /api/console routes and methods are explicitly retired → 410', async () => {
    const retiredRequests: Array<[string, RequestInit | undefined]> = [
        ['/api/console', undefined],
        ['/api/console/', undefined],
        ['/api/console/me', undefined],
        ['/api/console/login', { method: 'POST', body: '{}' }],
        ['/api/console/pages', undefined],
        ['/api/console/drafts/home', { method: 'PUT', body: '{}' }],
        ['/api/console/projects/project-1', { method: 'DELETE' }],
        ['/api/console/not-a-route', { method: 'PATCH', body: '{}' }],
    ];
    for (const [path, init] of retiredRequests) {
        const response = await req(path, init);
        if (response.status !== 410) return false;
        const body = await response.json() as { detail?: string };
        if (!body.detail?.includes('retired')) return false;
    }
    return true;
});

// ---- compat API: Meta health (unauthenticated) ----
await check('GET /health (compat Meta) → 200', async () =>
    (await req('/health')).status === 200);
await check('GET /api/queue/health (compat Meta) → 200', async () =>
    (await req('/api/queue/health')).status === 200);

// ---- compat API: auth guard + login ----
await check('GET /api/auth/me WITHOUT session → 401 (default-deny)', async () =>
    (await req('/api/auth/me')).status === 401);

let compatCookie = '';
await check('POST /api/auth/login (compat) with seeded admin → 200 + frontbase_session cookie', async () => {
    const r = await req('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    });
    const setCookie = r.headers.get('set-cookie') ?? '';
    compatCookie = setCookie.split(';')[0] ?? '';
    const body = await r.json() as { user?: { email?: string; is_master?: boolean } };
    return r.status === 200 && compatCookie.startsWith('frontbase_session=')
        && body.user?.email === ADMIN.email && body.user?.is_master === true;
});

await check('GET /api/auth/me (compat) WITH session → 200 returns the owner', async () => {
    const r = await req('/api/auth/me', { headers: { cookie: compatCookie } });
    const body = await r.json() as { user?: { email?: string } };
    return r.status === 200 && body.user?.email === ADMIN.email;
});

await check('POST /api/auth/login (compat) wrong password → 401 with the product detail', async () => {
    const r = await req('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: ADMIN.email, password: 'wrong' }),
    });
    // The product raises HTTPException(401, detail="Invalid email or password")
    // (app/routers/auth.py:680), which FastAPI serializes as {"detail": ...}. The
    // error-envelope middleware normalizes the framework's {error:'invalid_credentials'}
    // to that same shape, so a wrong password now answers exactly as the product does.
    return r.status === 401 && (await r.json() as { detail?: string }).detail === 'Invalid email or password';
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
await check('publishing a page serves it at /<slug> (dynamic eSSR)', async () => {
    const create = await req('/api/pages/', {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: compatCookie },
        body: JSON.stringify({ name: 'Served', slug: 'served', title: 'Served' }),
    });
    const pageId = (await create.json() as { data: { id: string } }).data.id;
    await req(`/api/pages/${pageId}/`, {
        method: 'PUT', headers: { 'content-type': 'application/json', cookie: compatCookie },
        body: JSON.stringify({ name: 'Served', slug: 'served', layoutData: { content: [{ type: 'Heading', props: { content: 'Served live', level: 'h1' } }], root: {} } }),
    });
    const pub = await req(`/api/pages/${pageId}/publish/local-edge/`, { method: 'POST', headers: { cookie: compatCookie } });
    if (pub.status !== 200) return false;
    const r = await req('/served');
    const body = await r.text();
    return r.status === 200 && body.includes('Served live');
});
// ---- builder canvas: /builder/edit/:id must render (regression guard) ----
// This slipped through once (d78b292 mounted the builder at '/builder', doubling
// the prefix to '/builder/builder/...' → 404) because no test hit the route.
await check('GET /builder/edit/:id renders the WYSIWYG canvas (authenticated)', async () => {
    const create = await req('/api/pages/', {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: compatCookie },
        body: JSON.stringify({ name: 'Builder', slug: 'builder-smoke', title: 'Builder' }),
    });
    const pageId = (await create.json() as { data: { id: string } }).data.id;
    const res = await req(`/builder/edit/${pageId}`, { headers: { cookie: compatCookie } });
    const html = await res.text();
    // Full wiring: canvas iframe + injected component tree + the editing-client
    // script tag. If any are missing the panels never build.
    return res.status === 200 && html.includes('id="fb-canvas"') && html.includes('<iframe')
        && html.includes('__FRONTBASE_LAYOUT__') && html.includes('/builder/client.js');
});
await check('GET /builder/edit/:id WITHOUT session → 302 redirect to login', async () => {
    const res = await req('/builder/edit/anything');
    return res.status === 302 && (res.headers.get('location') ?? '').startsWith('/frontbase-admin');
});
// The editing client (tree + property panels) is served at /builder/client.js.
// If this 404s, the canvas template's <script> silently fails and the panels
// never build — the builder shows only a bare iframe. Regression guard.
await check('GET /builder/client.js serves the editing client (authenticated)', async () => {
    const res = await req('/builder/client.js', { headers: { cookie: compatCookie } });
    const ct = res.headers.get('content-type') ?? '';
    return res.status === 200 && ct.includes('javascript') && (await res.text()).length > 1000;
});

// ---- compat API: security endpoints are behind the guard ----
await check('GET /api/auth/security/blocklist WITHOUT session → 401', async () =>
    (await req('/api/auth/security/blocklist')).status === 401);
await check('GET /api/auth/security/blocklist WITH session → 200', async () =>
    (await req('/api/auth/security/blocklist', { headers: { cookie: compatCookie } })).status === 200);
// Audit-trail consistency: a security mutation (WAF) MUST land in the audit log
// that GET /audit-logs reads — same tenant key, same KV bucket. This is the
// framework-side guarantee behind CF-22 #129's audit-logs op; it guards against
// the write/read tenant-key divergence that regressed that op to shape-only.
await check('POST /api/auth/security/waf → audit-logs shows the waf_updated entry', async () => {
    const before = await req('/api/auth/security/audit-logs', { headers: { cookie: compatCookie } });
    const beforeCount = (await before.json() as unknown[]).length;
    const waf = await req('/api/auth/security/waf', {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: compatCookie },
        body: JSON.stringify({ enabled: true }),
    });
    if (waf.status !== 200) return false;
    const after = await req('/api/auth/security/audit-logs', { headers: { cookie: compatCookie } });
    const entries = await after.json() as Array<{ action?: string }>;
    return Array.isArray(entries) && entries.length === beforeCount + 1
        && entries.some((e) => e.action === 'waf_updated');
});
await check('GET /api/edge-engines/active/by-scope/full lists the system edge as default target', async () => {
    const r = await req('/api/edge-engines/active/by-scope/full', { headers: { cookie: compatCookie } });
    const body = await r.json() as Array<{ id?: string; edge_db_id?: string }>;
    return r.status === 200 && Array.isArray(body) && body.length > 0
        && body[0]?.id === 'local-edge' && !!body[0]?.edge_db_id;
});

// ---- storage: provider-configured byte transfer (out-of-the-box S3/R2) ----
// Regression guard for the 503-everywhere gap: byte-transfer ops must resolve a
// live client from the storage_providers record (credentials live on the
// connected account, encrypted at rest) instead of requiring env-wired
// STORAGE_* vars. A local S3-mock receives the signed requests, so the whole
// chain — provider record → EdgeResource decrypt → SigV4 sign → fetch →
// presign — runs for real.
{
    const objects = new Map<string, { bytes: Uint8Array; contentType?: string; authorization?: string }>();
    const s3mock = createServer((incoming, res) => {
        const key = (incoming.url ?? '/').split('?')[0].replace(/^\/+/, '');
        if (incoming.method === 'PUT') {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
            incoming.on('end', () => {
                objects.set(key, {
                    bytes: new Uint8Array(Buffer.concat(chunks)),
                    contentType: incoming.headers['content-type'],
                    authorization: incoming.headers.authorization,
                });
                res.writeHead(200).end();
            });
        } else if (incoming.method === 'GET') {
            const obj = objects.get(key);
            if (!obj) { res.writeHead(404).end('not_found'); return; }
            res.writeHead(200, { 'content-type': obj.contentType ?? 'application/octet-stream' }).end(obj.bytes);
        } else if (incoming.method === 'DELETE') {
            objects.delete(key);
            res.writeHead(204).end();
        } else {
            res.writeHead(405).end();
        }
    });
    await new Promise<void>((resolve) => s3mock.listen(0, '127.0.0.1', resolve));
    const s3Endpoint = `http://127.0.0.1:${(s3mock.address() as AddressInfo).port}`;
    try {
        // Connect an S3 account (the console's ConnectProviderDialog payload)…
        const authed = { 'content-type': 'application/json', cookie: compatCookie } as const;
        const account = await req('/api/edge-providers/', {
            method: 'POST', headers: authed,
            body: JSON.stringify({
                name: 'Smoke S3', provider: 's3',
                provider_credentials: { access_key_id: 'smoke-key', secret_access_key: 'smoke-secret', endpoint: s3Endpoint },
            }),
        });
        const accountId = (await account.json() as { id?: string }).id;
        // …promote it to a storage provider (the StoragePanel payload)…
        const provider = await req('/api/storage/providers/', {
            method: 'POST', headers: authed,
            body: JSON.stringify({ provider_account_id: accountId, name: 'Smoke Storage' }),
        });
        const providerId = (await provider.json() as { id?: string }).id;

        await check('storage: upload resolves a client from stored (encrypted) credentials — no env vars', async () => {
            if (!providerId) return false;
            const form = new FormData();
            form.append('file', new File([new TextEncoder().encode('storage-smoke-bytes')], 'hello.txt', { type: 'text/plain' }));
            form.append('provider_id', providerId);
            form.append('bucket', 'smoke-bucket');
            form.append('path', '/smoke/hello.txt');
            const r = await req('/api/storage/upload', { method: 'POST', headers: { cookie: compatCookie }, body: form });
            const body = await r.json() as { success?: boolean; path?: string; publicUrl?: string };
            return r.status === 200 && body.success === true && body.path === '/smoke/hello.txt'
                && typeof body.publicUrl === 'string' && body.publicUrl.includes('X-Amz-Signature');
        });
        await check('storage: the upload reached the S3 host as a SigV4-signed PUT', async () => {
            const obj = objects.get('smoke-bucket/smoke/hello.txt');
            return !!obj && new TextDecoder().decode(obj.bytes) === 'storage-smoke-bytes'
                && (obj.authorization ?? '').startsWith('AWS4-HMAC-SHA256');
        });
        await check('storage: signed-url presigns through the resolved client and the URL round-trips', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/signed-url?provider_id=${providerId}&bucket=smoke-bucket&path=${encodeURIComponent('/smoke/hello.txt')}`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { success?: boolean; signedUrl?: string };
            if (r.status !== 200 || body.success !== true || !body.signedUrl?.includes('X-Amz-Signature')) return false;
            const direct = await fetch(body.signedUrl);
            return direct.status === 200 && (await direct.text()) === 'storage-smoke-bytes';
        });
        await check('storage: console-shape delete removes the object and the metadata row', async () => {
            if (!providerId) return false;
            const r = await req('/api/storage/delete', {
                method: 'DELETE', headers: authed,
                body: JSON.stringify({ paths: ['/smoke/hello.txt'], bucket: 'smoke-bucket', provider_id: providerId }),
            });
            if (r.status !== 200) return false;
            const probe = await fetch(`${s3Endpoint}/smoke-bucket/smoke/hello.txt`);
            return probe.status === 404;
        });
        await check('storage: unknown provider_id → 404 with the product detail', async () => {
            const r = await req('/api/storage/signed-url?provider_id=does-not-exist&bucket=b&path=p', { headers: { cookie: compatCookie } });
            const body = await r.json() as { detail?: string };
            return r.status === 404 && body.detail?.includes('not found') === true;
        });
        await check('storage: adapter-less provider type → 400 (product registry-miss)', async () => {
            if (!accountId) return false;
            const supa = await req('/api/storage/providers/', {
                method: 'POST', headers: authed,
                body: JSON.stringify({ provider_account_id: accountId, name: 'No Adapter', provider: 'supabase' }),
            });
            const supaId = (await supa.json() as { id?: string }).id;
            const r = await req(`/api/storage/signed-url?provider_id=${supaId}&bucket=b&path=p`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { detail?: string };
            return r.status === 400 && body.detail === "No storage adapter for provider type 'supabase'";
        });
        await check('storage: missing provider_id → 422 (product contract: provider_id is required)', async () => {
            const r = await req('/api/storage/signed-url?bucket=b&path=p', { headers: { cookie: compatCookie } });
            const body = await r.json() as { detail?: Array<{ loc?: string[] }> };
            return r.status === 422 && Array.isArray(body.detail)
                && body.detail.some((d) => d.loc?.join('.') === 'query.provider_id');
        });
    } finally {
        s3mock.close();
    }
}

if (skipped > 0) console.log(`\n⚠ ${skipped} bundle-dependent check(s) skipped — this run did NOT verify the console bundles.`);
console.log(failures === 0 ? '\ncf-full smoke: PASS ✅' : `\ncf-full smoke: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
