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
    const buckets = new Set<string>(['smoke-bucket']);
    const s3mock = createServer((incoming, res) => {
        const url = new URL(incoming.url ?? '/', 'http://s3mock.local');
        const key = url.pathname.replace(/^\/+/, '');
        if (incoming.method === 'PUT' && !key.includes('/')) {
            buckets.add(key); // bucket create = PUT /{bucket}
            res.writeHead(200).end();
        } else if (incoming.method === 'PUT') {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
            incoming.on('end', () => {
                // CopyObject (server-side move) — x-amz-copy-source carries the
                // source, the body is unused.
                const copySource = incoming.headers['x-amz-copy-source'];
                if (typeof copySource === 'string') {
                    const src = objects.get(copySource.replace(/^\/+/, ''));
                    if (!src) { res.writeHead(404).end('NoSuchKey'); return; }
                    objects.set(key, src);
                } else {
                    objects.set(key, {
                        bytes: new Uint8Array(Buffer.concat(chunks)),
                        contentType: incoming.headers['content-type'],
                        authorization: incoming.headers.authorization,
                    });
                }
                res.writeHead(200).end();
            });
        } else if (incoming.method === 'GET' && url.searchParams.get('list-type') === '2') {
            // ListObjectsV2 — Contents for files, CommonPrefixes for delimiter folders.
            const bucket = key;
            const prefix = url.searchParams.get('prefix') ?? '';
            const scoped = [...objects.keys()].filter((k) => k.startsWith(`${bucket}/`));
            const contents = scoped.filter((k) => {
                const rel = k.slice(bucket.length + 1);
                if (!rel.startsWith(prefix)) return false;
                const rest = rel.slice(prefix.length);
                return rest !== '' && !rest.includes('/');
            });
            const folders = new Set<string>();
            for (const k of scoped) {
                const rel = k.slice(bucket.length + 1);
                if (!rel.startsWith(prefix)) continue;
                const rest = rel.slice(prefix.length);
                const slash = rest.indexOf('/');
                if (slash > 0) folders.add(rest.slice(0, slash + 1));
            }
            const xml = '<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>'
                + `<Name>${bucket}</Name><Prefix>${prefix}</Prefix><KeyCount>${contents.length + folders.size}</KeyCount>`
                + contents.map((k) => `<Contents><Key>${k.slice(bucket.length + 1)}</Key><Size>${objects.get(k)!.bytes.length}</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>`).join('')
                + [...folders].map((p) => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`).join('')
                + '</ListBucketResult>';
            res.writeHead(200, { 'content-type': 'application/xml' }).end(xml);
        } else if (incoming.method === 'GET' && !key) {
            // ListBuckets
            const xml = '<?xml version="1.0" encoding="UTF-8"?><ListAllMyBucketsResult><Buckets>'
                + [...buckets].map((b) => `<Bucket><Name>${b}</Name></Bucket>`).join('')
                + '</Buckets></ListAllMyBucketsResult>';
            res.writeHead(200, { 'content-type': 'application/xml' }).end(xml);
        } else if (incoming.method === 'GET') {
            const obj = objects.get(key);
            if (!obj) { res.writeHead(404).end('not_found'); return; }
            res.writeHead(200, { 'content-type': obj.contentType ?? 'application/octet-stream' }).end(obj.bytes);
        } else if (incoming.method === 'DELETE') {
            if (!key.includes('/')) buckets.delete(key);
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

        await check('storage: s3 bucket create reaches the host as a signed PUT', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/buckets?provider_id=${providerId}`, {
                method: 'POST', headers: authed,
                body: JSON.stringify({ name: 'smoke-bucket', public: false }),
            });
            const body = await r.json() as { success?: boolean; bucket?: { id?: string } };
            return r.status === 200 && body.success === true && body.bucket?.id === 'smoke-bucket' && buckets.has('smoke-bucket');
        });
        await check('storage: s3 bucket list parses the ListBuckets XML', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/buckets?provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { success?: boolean; buckets?: Array<{ id?: string; provider?: string }> };
            return r.status === 200 && body.success === true
                && body.buckets?.some((b) => b.id === 'smoke-bucket' && b.provider === 'S3') === true;
        });
        await check('storage: upload resolves a client from stored (encrypted) credentials — no env vars', async () => {
            if (!providerId) return false;
            const form = new FormData();
            form.append('file', new File([new TextEncoder().encode('storage-smoke-bytes')], 'hello.txt', { type: 'text/plain' }));
            form.append('provider_id', providerId);
            form.append('bucket', 'smoke-bucket');
            // Console shape (useStorageMutations): bucket-relative, no leading slash.
            form.append('path', 'smoke/hello.txt');
            const r = await req('/api/storage/upload', { method: 'POST', headers: { cookie: compatCookie }, body: form });
            const body = await r.json() as { success?: boolean; path?: string; publicUrl?: string };
            return r.status === 200 && body.success === true && body.path === 'smoke/hello.txt'
                && body.publicUrl === `${s3Endpoint}/smoke-bucket/smoke/hello.txt`;
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
        await check('storage: s3 file list uses ListObjectsV2 (delimiter folders, sizes)', async () => {
            if (!providerId) return false;
            const top = await req(`/api/storage/list?bucket=smoke-bucket&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const topBody = await top.json() as { success?: boolean; files?: Array<{ name?: string; isFolder?: boolean }>; total?: number };
            if (top.status !== 200 || topBody.success !== true) return false;
            if (!topBody.files?.some((f) => f.name === 'smoke' && f.isFolder === true)) return false;
            const nested = await req(`/api/storage/list?bucket=smoke-bucket&path=smoke&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const nestedBody = await nested.json() as { files?: Array<{ name?: string; isFolder?: boolean; size?: number }> };
            return nested.status === 200
                && nestedBody.files?.some((f) => f.name === 'hello.txt' && f.isFolder === false && f.size === 'storage-smoke-bytes'.length) === true;
        });
        await check('storage: console-shape move is a server-side copy+delete and the folder opens', async () => {
            if (!providerId) return false;
            // Exactly the FileBrowser's payload: {sourceKey, destinationKey,
            // sourceBucket, destBucket, provider_id} — no `bucket` key, no file id.
            const r = await req('/api/storage/move', {
                method: 'POST', headers: authed,
                body: JSON.stringify({
                    sourceKey: 'smoke/hello.txt', destinationKey: 'smoke/moved.txt',
                    sourceBucket: 'smoke-bucket', destBucket: 'smoke-bucket', provider_id: providerId,
                }),
            });
            const body = await r.json() as { success?: boolean; message?: string };
            if (r.status !== 200 || body.success !== true || body.message !== 'File moved') return false;
            if (objects.has('smoke-bucket/smoke/hello.txt') || !objects.has('smoke-bucket/smoke/moved.txt')) return false;
            // The moved bytes must survive the copy (not an empty overwrite).
            if (new TextDecoder().decode(objects.get('smoke-bucket/smoke/moved.txt')!.bytes) !== 'storage-smoke-bytes') return false;
            // Folder-open: list with path=smoke shows the renamed file.
            const nested = await req(`/api/storage/list?bucket=smoke-bucket&path=smoke&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const nestedBody = await nested.json() as { files?: Array<{ name?: string }> };
            return nested.status === 200 && nestedBody.files?.some((f) => f.name === 'moved.txt') === true;
        });
        await check('storage: console-shape delete uses the list response id (bucket-relative key)', async () => {
            if (!providerId) return false;
            // Single delete sends [file.id] — the id from the list response.
            const listed = await req(`/api/storage/list?bucket=smoke-bucket&path=smoke&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const entry = ((await listed.json() as { files?: Array<{ id?: string; name?: string }> }).files ?? []).find((f) => f.name === 'moved.txt');
            if (!entry?.id) return false;
            const r = await req('/api/storage/delete', {
                method: 'DELETE', headers: authed,
                body: JSON.stringify({ paths: [entry.id], bucket: 'smoke-bucket', provider_id: providerId }),
            });
            const body = await r.json() as { success?: boolean; message?: string };
            if (r.status !== 200 || body.success !== true || body.message !== undefined) return false;
            const probe = await fetch(`${s3Endpoint}/smoke-bucket/smoke/moved.txt`);
            return probe.status === 404;
        });
        await check('storage: unknown provider_id → 404 with the product detail', async () => {
            const r = await req('/api/storage/signed-url?provider_id=does-not-exist&bucket=b&path=p', { headers: { cookie: compatCookie } });
            const body = await r.json() as { detail?: string };
            return r.status === 404 && body.detail?.includes('not found') === true;
        });
        await check('storage: adapter-less provider type → 400 (product registry-miss)', async () => {
            if (!accountId) return false;
            const na = await req('/api/storage/providers/', {
                method: 'POST', headers: authed,
                body: JSON.stringify({ provider_account_id: accountId, name: 'No Adapter', provider: 'vercel' }),
            });
            const naId = (await na.json() as { id?: string }).id;
            const r = await req(`/api/storage/signed-url?provider_id=${naId}&bucket=b&path=p`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { detail?: string };
            return r.status === 400 && body.detail === "No storage adapter for provider type 'vercel'";
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

// The live frontbase-site flow: provider type 'supabase' with credentials from
// connect-time enrichment (api_url + service_role_key on the EdgeResource).
// A local mock of the Supabase Storage REST surface proves the adapter's
// request shapes — Bearer headers, object/sign → absolutized URL, prefixes
// delete — without touching a real project.
{
    const objects = new Map<string, { bytes: Uint8Array; contentType?: string; authorization?: string }>();
    const buckets = new Map<string, { name: string; public: boolean }>();
    const supaMock = createServer((incoming, res) => {
        const path = (incoming.url ?? '/').split('?')[0];
        const readBody = () => new Promise<Buffer>((resolve) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
            incoming.on('end', () => resolve(Buffer.concat(chunks)));
        });
        const json = (code: number, body: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
        // Path segments are per-segment encoded by the adapter — decode back.
        const objectKey = (prefix: string) => path.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
        if (path === '/storage/v1/bucket') {
            if (incoming.method === 'GET') {
                json(200, [...buckets.entries()].map(([id, b]) => ({ id, name: b.name, public: b.public, created_at: '2026-01-01T00:00:00Z' })));
            } else if (incoming.method === 'POST') {
                void readBody().then((buf) => {
                    const b = JSON.parse(buf.toString() || '{}') as { id?: string; name?: string; public?: boolean };
                    buckets.set(String(b.id ?? b.name ?? ''), { name: String(b.name ?? b.id ?? ''), public: Boolean(b.public) });
                    json(200, { name: String(b.name ?? b.id ?? '') });
                });
            } else {
                res.writeHead(405).end();
            }
        } else if (path.startsWith('/storage/v1/bucket/')) {
            const id = decodeURIComponent(path.slice('/storage/v1/bucket/'.length));
            if (incoming.method === 'GET') {
                const b = buckets.get(id);
                if (b) json(200, { id, name: b.name, public: b.public });
                else json(404, { message: 'Bucket not found' });
            } else if (incoming.method === 'PUT') {
                void readBody().then((buf) => {
                    const b = buckets.get(id);
                    if (b) b.public = Boolean((JSON.parse(buf.toString() || '{}') as { public?: boolean }).public);
                    json(200, {});
                });
            } else if (incoming.method === 'DELETE') {
                buckets.delete(id);
                json(200, {});
            } else if (incoming.method === 'POST' && id.endsWith('/empty')) {
                const bucketId = id.slice(0, -'/empty'.length);
                for (const k of [...objects.keys()]) if (k.startsWith(`${bucketId}/`)) objects.delete(k);
                json(200, {});
            } else {
                res.writeHead(405).end();
            }
        } else if (incoming.method === 'POST' && path.startsWith('/storage/v1/object/list/')) {
            void readBody().then((buf) => {
                const prefix = ((JSON.parse(buf.toString() || '{}') as { prefix?: string }).prefix ?? '').replace(/^\/+|\/+$/g, '');
                const bucket = decodeURIComponent(path.slice('/storage/v1/object/list/'.length));
                const entries: Array<Record<string, unknown>> = [];
                const folders = new Set<string>();
                for (const [k, obj] of objects) {
                    if (!k.startsWith(`${bucket}/`)) continue;
                    const rel = k.slice(bucket.length + 1);
                    if (prefix && !rel.startsWith(`${prefix}/`)) continue;
                    const rest = prefix ? rel.slice(prefix.length + 1) : rel;
                    if (rest.includes('/')) { folders.add(rest.split('/')[0]); continue; }
                    // Real Supabase shape: id is the BUCKET-RELATIVE key — the
                    // console's single-delete and folder navigation rely on it.
                    entries.push({
                        name: rest, id: rel,
                        updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
                        metadata: { size: obj.bytes.length, mimetype: obj.contentType ?? 'application/octet-stream' },
                    });
                }
                // Folder ids carry a trailing slash (the console deletes folders by id).
                for (const f of folders) entries.push({ name: f, id: `${prefix ? `${prefix}/` : ''}${f}/` });
                json(200, entries);
            });
        } else if (incoming.method === 'POST' && path === '/storage/v1/object/move') {
            void readBody().then((buf) => {
                const { bucketId, sourceKey, destinationKey } = JSON.parse(buf.toString() || '{}') as {
                    bucketId?: string; sourceKey?: string; destinationKey?: string;
                };
                if (!bucketId || !sourceKey || !destinationKey) { json(400, { message: 'missing fields' }); return; }
                const from = `${bucketId}/${sourceKey.replace(/^\/+/, '')}`;
                const to = `${bucketId}/${destinationKey.replace(/^\/+/, '')}`;
                if (!objects.has(from)) { json(404, { message: 'Object not found' }); return; }
                objects.set(to, objects.get(from)!);
                objects.delete(from);
                json(200, { message: 'Successfully moved' });
            });
        } else if (incoming.method === 'POST' && path.startsWith('/storage/v1/object/sign/')) {
            res.writeHead(200, { 'content-type': 'application/json' })
                .end(JSON.stringify({ signedURL: `${path}?token=smoke` }));
        } else if (incoming.method === 'POST' && path.startsWith('/storage/v1/object/')) {
            void readBody().then((buf) => {
                objects.set(objectKey('/storage/v1/object/'), {
                    bytes: new Uint8Array(buf),
                    contentType: incoming.headers['content-type'],
                    authorization: incoming.headers.authorization,
                });
                res.writeHead(200).end();
            });
        } else if (incoming.method === 'GET' && path.startsWith('/storage/v1/object/public/')) {
            // Public object serving: /object/public/{bucket}/{key}
            const key = objectKey('/storage/v1/object/public/');
            const obj = objects.get(key);
            if (!obj) { res.writeHead(404).end(); return; }
            res.writeHead(200, { 'content-type': obj.contentType ?? 'application/octet-stream' }).end(obj.bytes);
        } else if (incoming.method === 'GET' && (path.startsWith('/storage/v1/object/sign/') || path.startsWith('/storage/v1/object/'))) {
            const key = path.startsWith('/storage/v1/object/sign/')
                ? objectKey('/storage/v1/object/sign/')
                : objectKey('/storage/v1/object/');
            const obj = objects.get(key);
            if (!obj) { res.writeHead(404).end(); return; }
            res.writeHead(200, { 'content-type': obj.contentType ?? 'application/octet-stream' }).end(obj.bytes);
        } else if (incoming.method === 'DELETE' && path.startsWith('/storage/v1/object/')) {
            void readBody().then((buf) => {
                const prefixes = (JSON.parse(buf.toString() || '{}') as { prefixes?: string[] }).prefixes ?? [];
                const bucket = objectKey('/storage/v1/object/');
                for (const rawPrefix of prefixes) {
                    const prefix = rawPrefix.replace(/^\/+/, '');
                    // Real Supabase semantics: a trailing slash deletes the subtree.
                    if (prefix.endsWith('/')) {
                        const base = `${bucket}/${prefix.slice(0, -1)}`;
                        for (const k of [...objects.keys()]) {
                            if (k === base || k.startsWith(`${base}/`)) objects.delete(k);
                        }
                    } else {
                        objects.delete(`${bucket}/${prefix}`);
                    }
                }
                res.writeHead(200).end();
            });
        } else {
            res.writeHead(405).end();
        }
    });
    await new Promise<void>((resolve) => supaMock.listen(0, '127.0.0.1', resolve));
    const supaOrigin = `http://127.0.0.1:${(supaMock.address() as AddressInfo).port}`;
    try {
        const authed = { 'content-type': 'application/json', cookie: compatCookie } as const;
        // Connect a supabase account the way enrichment leaves it: api_url + the
        // service-role key stored on the EdgeResource (no PAT → enricher no-ops).
        const account = await req('/api/edge-providers/', {
            method: 'POST', headers: authed,
            body: JSON.stringify({
                name: 'Smoke Supabase', provider: 'supabase',
                provider_credentials: { api_url: supaOrigin, service_role_key: 'smoke-service-key' },
            }),
        });
        const accountId = (await account.json() as { id?: string }).id;
        const provider = await req('/api/storage/providers/', {
            method: 'POST', headers: authed,
            body: JSON.stringify({ provider_account_id: accountId, name: 'Smoke Supabase Storage' }),
        });
        const providerId = (await provider.json() as { id?: string }).id;
        let publicUrl = '';

        await check('storage: supabase bucket create reaches the real API', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/buckets?provider_id=${providerId}`, {
                method: 'POST', headers: authed,
                body: JSON.stringify({ name: 'frontbase-assets', public: true }),
            });
            const body = await r.json() as { success?: boolean; bucket?: { id?: string } };
            return r.status === 200 && body.success === true && body.bucket?.id === 'frontbase-assets' && buckets.has('frontbase-assets');
        });
        await check('storage: supabase bucket list comes from the provider (labeled)', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/buckets?provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { success?: boolean; buckets?: Array<{ id?: string; name?: string; provider?: string; public?: boolean }> };
            const entry = body.buckets?.find((b) => b.id === 'frontbase-assets');
            return r.status === 200 && body.success === true
                && !!entry && entry.provider === 'Supabase' && entry.public === true;
        });
        await check('storage: supabase upload resolves the service-role client (no more registry-miss 400)', async () => {
            if (!providerId) return false;
            const form = new FormData();
            form.append('file', new File([new TextEncoder().encode('supabase-smoke-bytes')], 'hello.txt', { type: 'text/plain' }));
            form.append('provider_id', providerId);
            form.append('bucket', 'frontbase-assets');
            // Console shape (useStorageMutations): bucket-relative, no leading slash.
            form.append('path', 'smoke/hello.txt');
            const r = await req('/api/storage/upload', { method: 'POST', headers: { cookie: compatCookie }, body: form });
            const body = await r.json() as { success?: boolean; path?: string; publicUrl?: string };
            publicUrl = body.publicUrl ?? '';
            return r.status === 200 && body.success === true && body.path === 'smoke/hello.txt'
                && publicUrl === `${supaOrigin}/storage/v1/object/public/frontbase-assets/smoke/hello.txt`;
        });
        await check('storage: supabase PUT carried the Bearer service key and exact bytes', async () => {
            const obj = objects.get('frontbase-assets/smoke/hello.txt');
            return !!obj && new TextDecoder().decode(obj.bytes) === 'supabase-smoke-bytes'
                && obj.authorization === 'Bearer smoke-service-key';
        });
        await check('storage: supabase public URL round-trips through /object/public', async () => {
            if (!publicUrl) return false;
            const direct = await fetch(publicUrl);
            return direct.status === 200 && (await direct.text()) === 'supabase-smoke-bytes';
        });
        await check('storage: supabase public-url endpoint returns the product shape', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/public-url?provider_id=${providerId}&bucket=frontbase-assets&path=${encodeURIComponent('smoke/hello.txt')}`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { success?: boolean; publicUrl?: string };
            return r.status === 200 && body.success === true
                && body.publicUrl === `${supaOrigin}/storage/v1/object/public/frontbase-assets/smoke/hello.txt`;
        });
        await check('storage: supabase signed-url endpoint returns the product shape', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/signed-url?provider_id=${providerId}&bucket=frontbase-assets&path=${encodeURIComponent('smoke/hello.txt')}`, { headers: { cookie: compatCookie } });
            const body = await r.json() as { success?: boolean; signedUrl?: string };
            if (r.status !== 200 || body.success !== true || !body.signedUrl?.startsWith(supaOrigin)) return false;
            const direct = await fetch(body.signedUrl);
            return direct.status === 200 && (await direct.text()) === 'supabase-smoke-bytes';
        });
        await check('storage: supabase file list reflects provider objects', async () => {
            if (!providerId) return false;
            const top = await req(`/api/storage/list?bucket=frontbase-assets&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const topBody = await top.json() as { success?: boolean; files?: Array<{ name?: string; isFolder?: boolean }> };
            if (top.status !== 200 || topBody.success !== true) return false;
            if (!topBody.files?.some((f) => f.name === 'smoke' && f.isFolder === true)) return false;
            const nested = await req(`/api/storage/list?bucket=frontbase-assets&path=smoke&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const nestedBody = await nested.json() as { files?: Array<{ name?: string; isFolder?: boolean; size?: number; mimetype?: string | null }>; total?: number };
            return nested.status === 200 && (nestedBody.total ?? 0) >= 1
                && nestedBody.files?.some((f) => f.name === 'hello.txt' && f.isFolder === false
                    && f.size === 'supabase-smoke-bytes'.length && f.mimetype === 'text/plain') === true;
        });
        await check('storage: supabase create-folder writes the .folder marker', async () => {
            if (!providerId) return false;
            const r = await req('/api/storage/create-folder', {
                method: 'POST', headers: authed,
                body: JSON.stringify({ bucket: 'frontbase-assets', folderPath: 'new-folder', provider_id: providerId }),
            });
            const marker = objects.get('frontbase-assets/new-folder/.folder');
            return r.status === 200
                && !!marker && marker.bytes.length === 0 && marker.contentType === 'application/x-directory';
        });
        // ---- the live console flow, replayed with the console's exact payloads ----
        // (FileBrowser: create folder → upload at root → move into folder → open
        // folder → delete by the list response's id)
        await check('storage: console flow — move file into folder, then the folder opens', async () => {
            if (!providerId) return false;
            const folder = await req('/api/storage/create-folder', {
                method: 'POST', headers: authed,
                body: JSON.stringify({ bucket: 'frontbase-assets', folderPath: 'docs', provider_id: providerId }),
            });
            if (folder.status !== 200) return false;
            const form = new FormData();
            form.append('file', new File([new TextEncoder().encode('greeting-bytes')], 'greeting.txt', { type: 'text/plain' }));
            form.append('provider_id', providerId);
            form.append('bucket', 'frontbase-assets');
            form.append('path', 'greeting.txt'); // root upload — the console's no-prefix shape
            const upload = await req('/api/storage/upload', { method: 'POST', headers: { cookie: compatCookie }, body: form });
            if (upload.status !== 200) return false;
            // The FileBrowser's move payload: sourceKey/destinationKey plus BOTH
            // buckets — no `bucket` key, no file id.
            const move = await req('/api/storage/move', {
                method: 'POST', headers: authed,
                body: JSON.stringify({
                    sourceKey: 'greeting.txt', destinationKey: 'docs/greeting.txt',
                    sourceBucket: 'frontbase-assets', destBucket: 'frontbase-assets', provider_id: providerId,
                }),
            });
            const moveBody = await move.json() as { success?: boolean; message?: string };
            if (move.status !== 200 || moveBody.success !== true || moveBody.message !== 'File moved') return false;
            if (objects.has('frontbase-assets/greeting.txt') || !objects.has('frontbase-assets/docs/greeting.txt')) return false;
            // Folder open: list with path=docs must show the moved file.
            const open = await req(`/api/storage/list?bucket=frontbase-assets&path=docs&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const openBody = await open.json() as { success?: boolean; files?: Array<{ name?: string; id?: string; isFolder?: boolean }> };
            const entry = openBody.files?.find((f) => f.name === 'greeting.txt');
            return open.status === 200 && openBody.success === true
                && !!entry && entry.isFolder === false && entry.id === 'docs/greeting.txt';
        });
        await check('storage: console flow — single delete sends [file.id] and the object disappears', async () => {
            if (!providerId) return false;
            const listed = await req(`/api/storage/list?bucket=frontbase-assets&path=docs&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const entry = ((await listed.json() as { files?: Array<{ id?: string; name?: string }> }).files ?? []).find((f) => f.name === 'greeting.txt');
            if (!entry?.id) return false;
            const r = await req('/api/storage/delete', {
                method: 'DELETE', headers: authed,
                body: JSON.stringify({ paths: [entry.id], bucket: 'frontbase-assets', provider_id: providerId }),
            });
            const body = await r.json() as { success?: boolean; message?: string };
            return r.status === 200 && body.success === true && body.message === undefined
                && !objects.has('frontbase-assets/docs/greeting.txt');
        });
        await check('storage: console flow — folder delete by trailing-slash id removes the subtree', async () => {
            if (!providerId) return false;
            // Put something inside new-folder first, then delete the folder by id.
            const form = new FormData();
            form.append('file', new File([new TextEncoder().encode('nested')], 'nested.txt', { type: 'text/plain' }));
            form.append('provider_id', providerId);
            form.append('bucket', 'frontbase-assets');
            form.append('path', 'new-folder/nested.txt');
            const upload = await req('/api/storage/upload', { method: 'POST', headers: { cookie: compatCookie }, body: form });
            if (upload.status !== 200) return false;
            const listed = await req(`/api/storage/list?bucket=frontbase-assets&provider_id=${providerId}`, { headers: { cookie: compatCookie } });
            const folder = ((await listed.json() as { files?: Array<{ id?: string; name?: string; isFolder?: boolean }> }).files ?? []).find((f) => f.name === 'new-folder' && f.isFolder);
            if (!folder?.id) return false;
            const r = await req('/api/storage/delete', {
                method: 'DELETE', headers: authed,
                body: JSON.stringify({ paths: [folder.id], bucket: 'frontbase-assets', provider_id: providerId }),
            });
            if (r.status !== 200) return false;
            return !objects.has('frontbase-assets/new-folder/nested.txt') && !objects.has('frontbase-assets/new-folder/.folder');
        });
        await check('storage: compute-size walks the provider recursively, then caches', async () => {
            if (!providerId) return false;
            const form = new FormData();
            form.append('file', new File([new TextEncoder().encode('report-bytes')], 'report.txt', { type: 'text/plain' }));
            form.append('provider_id', providerId);
            form.append('bucket', 'frontbase-assets');
            form.append('path', 'docs/report.txt');
            const upload = await req('/api/storage/upload', { method: 'POST', headers: { cookie: compatCookie }, body: form });
            if (upload.status !== 200) return false;
            const first = await req(`/api/storage/compute-size?provider_id=${providerId}&bucket=frontbase-assets&path=docs`, { headers: { cookie: compatCookie } });
            const firstBody = await first.json() as { success?: boolean; bucket?: string; path?: string; size?: number; cached?: boolean };
            if (first.status !== 200 || firstBody.success !== true || firstBody.bucket !== 'frontbase-assets' || firstBody.path !== 'docs') return false;
            if (firstBody.cached !== false || firstBody.size !== 'report-bytes'.length) return false;
            const second = await req(`/api/storage/compute-size?provider_id=${providerId}&bucket=frontbase-assets&path=docs`, { headers: { cookie: compatCookie } });
            const secondBody = await second.json() as { size?: number; cached?: boolean };
            return second.status === 200 && secondBody.cached === true && secondBody.size === 'report-bytes'.length;
        });
        await check('storage: move-cross returns the flat product shape and moves the bytes', async () => {
            if (!providerId || !accountId) return false;
            const second = await req('/api/storage/providers/', {
                method: 'POST', headers: authed,
                body: JSON.stringify({ provider_account_id: accountId, name: 'Smoke Supabase Archive' }),
            });
            const secondId = (await second.json() as { id?: string }).id;
            if (!secondId) return false;
            await req(`/api/storage/buckets?provider_id=${secondId}`, {
                method: 'POST', headers: authed,
                body: JSON.stringify({ name: 'frontbase-archive', public: false }),
            });
            const r = await req('/api/storage/move-cross', {
                method: 'POST', headers: authed,
                body: JSON.stringify({
                    source_provider_id: providerId, source_bucket: 'frontbase-assets', source_key: 'smoke/hello.txt',
                    dest_provider_id: secondId, dest_bucket: 'frontbase-archive', dest_key: 'smoke/hello.txt',
                }),
            });
            const body = await r.json() as { success?: boolean; source?: string; destination?: string; bytes?: number; data?: unknown };
            if (r.status !== 200 || body.success !== true || body.data !== undefined) return false;
            if (body.source !== 'frontbase-assets/smoke/hello.txt' || body.destination !== 'frontbase-archive/smoke/hello.txt') return false;
            if (body.bytes !== 'supabase-smoke-bytes'.length) return false;
            if (objects.has('frontbase-assets/smoke/hello.txt') || !objects.has('frontbase-archive/smoke/hello.txt')) return false;
            const status = await req('/api/storage/move-status/00000000-0000-4000-8000-000000000000', { headers: { cookie: compatCookie } });
            const statusBody = await status.json() as { detail?: string };
            return status.status === 404 && statusBody.detail === 'Move job not found';
        });
        await check('storage: supabase bucket delete reaches the real API', async () => {
            if (!providerId) return false;
            const r = await req(`/api/storage/buckets/frontbase-assets?provider_id=${providerId}`, {
                method: 'DELETE', headers: authed,
            });
            return r.status === 200 && !buckets.has('frontbase-assets');
        });
    } finally {
        supaMock.close();
    }
}

// The live frontbase-site branding flow (console settings → navbar logo +
// browser favicon). Branding bytes are stored in the settings KV — NOT the
// configured storage provider — so the checks run without any provider.
{
    await check('branding: homepage falls back to the framework icon before any upload', async () => {
        const r = await req('/');
        return r.status === 200 && (await r.text()).includes('<link rel="icon" href="/static/icon.png">');
    });
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
    let assetUrl = '';
    await check('branding: favicon upload returns the /static/assets publicUrl', async () => {
        const form = new FormData();
        form.append('file', new File([pngBytes], 'favicon.png', { type: 'image/png' }));
        form.append('asset_type', 'favicon');
        const r = await req('/api/project/assets/upload/', { method: 'POST', headers: { cookie: compatCookie }, body: form });
        const body = await r.json() as { success?: boolean; publicUrl?: string; url?: string };
        assetUrl = body.publicUrl ?? '';
        return r.status === 200 && body.success === true && /^\/static\/assets\/favicon-[0-9a-f]{8}\.png$/.test(assetUrl)
            && body.url === assetUrl;
    });
    await check('branding: asset is served publicly with exact bytes + immutable cache', async () => {
        if (!assetUrl) return false;
        const r = await req(assetUrl); // no cookie — public by design
        const bytes = new Uint8Array(await r.arrayBuffer());
        return r.status === 200 && r.headers.get('content-type') === 'image/png'
            && r.headers.get('cache-control') === 'public, max-age=31536000, immutable'
            && bytes.length === pngBytes.length && bytes.every((b, i) => b === pngBytes[i]);
    });
    await check('branding: bad extension is rejected with the product 400', async () => {
        const form = new FormData();
        form.append('file', new File([new TextEncoder().encode('nope')], 'favicon.txt', { type: 'text/plain' }));
        form.append('asset_type', 'favicon');
        const r = await req('/api/project/assets/upload/', { method: 'POST', headers: { cookie: compatCookie }, body: form });
        const body = await r.json() as { detail?: string };
        return r.status === 400 && (body.detail ?? '').includes('Invalid file type for favicon');
    });
    await check('branding: oversize favicon is rejected with the product 413', async () => {
        const form = new FormData();
        form.append('file', new File([new Uint8Array(256 * 1024 + 1)], 'favicon.png', { type: 'image/png' }));
        form.append('asset_type', 'favicon');
        const r = await req('/api/project/assets/upload/', { method: 'POST', headers: { cookie: compatCookie }, body: form });
        const body = await r.json() as { detail?: string };
        return r.status === 413 && (body.detail ?? '').includes('256KB');
    });
    await check('branding: multi-chunk logo (over one KV chunk) round-trips byte-exact', async () => {
        const big = new Uint8Array(150 * 1024).fill(7); // > 64KB b64 chunk boundary
        const form = new FormData();
        form.append('file', new File([big], 'logo.png', { type: 'image/png' }));
        form.append('asset_type', 'logo');
        const r = await req('/api/project/assets/upload/', { method: 'POST', headers: { cookie: compatCookie }, body: form });
        const body = await r.json() as { publicUrl?: string };
        if (r.status !== 200 || !body.publicUrl) return false;
        const served = await req(body.publicUrl);
        const bytes = new Uint8Array(await served.arrayBuffer());
        return served.status === 200 && bytes.length === big.length && bytes.every((b, i) => b === big[i]);
    });
    await check('branding: faviconUrl from project settings reaches the published page head', async () => {
        if (!assetUrl) return false;
        const put = await req('/api/project/', {
            method: 'PUT', headers: { 'content-type': 'application/json', cookie: compatCookie },
            body: JSON.stringify({ faviconUrl: assetUrl }),
        });
        if (put.status !== 200) return false;
        const home = await req('/');
        const html = await home.text();
        return home.status === 200
            && html.includes(`<link rel="icon" href="${assetUrl}">`)
            && html.includes(`<link rel="apple-touch-icon" href="${assetUrl}">`);
    });
}

if (skipped > 0) console.log(`\n⚠ ${skipped} bundle-dependent check(s) skipped — this run did NOT verify the console bundles.`);
console.log(failures === 0 ? '\ncf-full smoke: PASS ✅' : `\ncf-full smoke: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
