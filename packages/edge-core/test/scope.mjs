/**
 * Edge Data Proxy scope enforcement + tenant isolation (SEC-2 regression).
 *
 * Verifies:
 *   - public queries served to anyone;
 *   - tenant-scoped queries DENIED without a resolved tenant, served with one;
 *   - user-scoped queries DENIED without an authenticated user, served with one;
 *   - unknown scope fails closed (403);
 *   - the executor receives the resolved user + tenant (isolation: it can scope
 *     its own data access), and DIFFERENT tenants get DIFFERENT rows.
 */
import { createEngine, directProvider, configureEngine, enforceScope } from '../dist/index.js';

let failures = 0;
const check = async (label, fn) => {
    try { (await fn()) ? console.log(`  ✅ ${label}`) : (failures++, console.log(`  ❌ ${label}`)); }
    catch (e) { failures++; console.log(`  ❌ ${label} — threw: ${e.message}`); }
};

// A manifest whose executor echoes the tenant it was called with — so we can
// prove isolation: tenant A must never see tenant B's rows.
const manifest = {
    version: 'scope-1',
    queries: {
        'public.q': { queryId: 'public.q', scope: 'public', rows: [{ ok: 1 }] },
        'tenant.q': {
            queryId: 'tenant.q', scope: 'tenant',
            execute: async (_params, ctx) => [{ tenant: ctx.tenant, secret: `data-for-${ctx.tenant}` }],
        },
        'user.q': {
            queryId: 'user.q', scope: 'user',
            execute: async (_params, ctx) => [{ userId: ctx.user?.id ?? null }],
        },
        'weird.q': { queryId: 'weird.q', scope: 'admin', rows: [{ nope: 1 }] }, // unknown scope
    },
    // Pages backed by scoped queries — the eSSR page path must enforce scope +
    // thread the tenant exactly like the proxy (SEC-P2-1 regression).
    pages: {
        '/public-page': { title: 'Public', slug: 'public-page', queryId: 'public.q', layout: { root: {}, content: [] } },
        '/tenant-page': { title: 'Tenant', slug: 'tenant-page', queryId: 'tenant.q', layout: { root: {}, content: [{ id: 't', type: 'Text', props: { content: '{% for r in records %}{{ r.secret }}{% endfor %}' } }] } },
    },
};

const post = (app, id, init) => app.fetch(new Request('http://e.local/api/data/' + id, { method: 'POST', body: '{}', ...init }));

// --- unit: enforceScope directly ---
await check('enforceScope: public allowed anonymously', async () =>
    enforceScope({ scope: 'public' }, { user: null }) === null);
await check('enforceScope: tenant denied without tenant (401)', async () =>
    enforceScope({ scope: 'tenant' }, { user: null }).status === 401);
await check('enforceScope: user denied without user (401)', async () =>
    enforceScope({ scope: 'user' }, { user: null }).status === 401);
await check('enforceScope: unknown scope fails closed (403)', async () =>
    enforceScope({ scope: 'admin' }, { user: { id: 'u1' }, tenant: 't1' }).status === 403);
await check('enforceScope: unset scope treated as public', async () =>
    enforceScope({}, { user: null }) === null);

// --- integration: ANONYMOUS caller (default resolvePrincipal) ---
configureEngine({}); // reset to defaults → anonymous, no tenant
const anon = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
await check('anon: public query → 200', async () => (await post(anon, 'public.q')).status === 200);
await check('anon: tenant query → 401 (DENIED)', async () => (await post(anon, 'tenant.q')).status === 401);
await check('anon: user query → 401 (DENIED)', async () => (await post(anon, 'user.q')).status === 401);
await check('anon: unknown-scope query → 403', async () => (await post(anon, 'weird.q')).status === 403);

// --- integration: tenant A principal ---
configureEngine({ resolvePrincipal: async () => ({ user: { id: 'alice' }, tenant: 'tenant-A' }) });
const engineA = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
await check('tenant A: tenant query → 200', async () => (await post(engineA, 'tenant.q')).status === 200);
const rowsA = await (await post(engineA, 'tenant.q')).json();
await check('tenant A: executor received tenant-A', async () => rowsA[0].tenant === 'tenant-A' && rowsA[0].secret === 'data-for-tenant-A');
await check('tenant A: user query → 200 with alice', async () => {
    const rows = await (await post(engineA, 'user.q')).json();
    return rows[0].userId === 'alice';
});

// --- integration: tenant B principal — ISOLATION: must not see tenant A's data ---
configureEngine({ resolvePrincipal: async () => ({ user: { id: 'bob' }, tenant: 'tenant-B' }) });
const engineB = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const rowsB = await (await post(engineB, 'tenant.q')).json();
await check('tenant B: executor received tenant-B (isolated from A)', async () =>
    rowsB[0].tenant === 'tenant-B' && rowsB[0].secret === 'data-for-tenant-B' && rowsB[0].secret !== rowsA[0].secret);

// --- SEC-P2-1: eSSR PAGE path must enforce scope + thread tenant ---
const getPage = (app, path) => app.fetch(new Request('http://e.local' + path));

// anonymous
configureEngine({});
const pAnon = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
await check('page(anon): public-page → 200', async () => (await getPage(pAnon, '/public-page')).status === 200);
await check('page(anon): tenant-page → 401 (DENIED, not empty render)', async () =>
    (await getPage(pAnon, '/tenant-page')).status === 401);

// tenant A renders its own data; tenant B never sees A's
configureEngine({ resolvePrincipal: async () => ({ user: { id: 'alice' }, tenant: 'tenant-A' }) });
const pA = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const htmlA = await (await getPage(pA, '/tenant-page')).text();
await check('page(tenant A): renders tenant-A data', async () => htmlA.includes('data-for-tenant-A'));

configureEngine({ resolvePrincipal: async () => ({ user: { id: 'bob' }, tenant: 'tenant-B' }) });
const pB = createEngine({ manifest, data: directProvider(manifest), environment: 'edge' });
const htmlB = await (await getPage(pB, '/tenant-page')).text();
await check('page(tenant B): renders tenant-B data, NOT tenant-A (isolation)', async () =>
    htmlB.includes('data-for-tenant-B') && !htmlB.includes('data-for-tenant-A'));

// reset defaults so other suites are unaffected
configureEngine({});

console.log(failures === 0 ? '\nscope: PASS ✅' : `\nscope: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
