/**
 * A-25 Phase 4 WA5 — the free-tier plan gates (compat/plans/gates.ts + the
 * route insertion points). The catalog free plan (pages 10, deploys_monthly
 * 50, team_members 1, edge_engines 0, private_pages false, api_access false)
 * is read through Phase2Store.getEffectiveLimits step 3 (`tenants.plan` →
 * `_global` catalog row), so these tests also pin that resolution.
 *
 * Three invariants beyond the per-gate 402/403s:
 *   - planless tenant ⇒ every gate inert (self-host "no plan ⇒ unlimited",
 *     the plan-limits.mjs contract, observed through the real routes);
 *   - master_admin bypass on the SAME tenant with the SAME limits;
 *   - me/plan surfaces the catalog plan + the raw usage counters.
 *
 * RULE 8 targets live in gates.ts: mutation 6 (`if (!limits) return null;` in
 * publishGate → null) must RED the pages/deploys checks here; mutation 7
 * (`=== false` → `=== 'never'` in the two flag helpers) must RED the
 * private_pages/api_access checks.
 */
import { createResolvePrincipal, hashPassword, issueSession, sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { Phase2Store } from '../dist/db/phase2-store.js';
import { seedPlanCatalog } from '../dist/compat/plans/catalog.js';

const NOW = '2026-01-01T00:00:00.000Z';
const SECRET = 'cloud-plan-gates-test-secret-0123456789';
let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);
await seedPlanCatalog(runner, NOW);

const tenants = new TenantStore(runner);
await tenants.createTenant('freeco', 'Freeco', NOW);
await tenants.updateTenant('freeco', { plan: 'free', status: 'active' });
await tenants.createTenant('noplans', 'No Plans', NOW); // plan NULL — gates must be inert
for (const [id, email, tenant, role, pw] of [
    ['free-owner', 'owner@freeco.test', 'freeco', 'owner', 'pw-free-1'],
    ['plain-owner', 'owner@noplans.test', 'noplans', 'owner', 'pw-plain-1'],
    ['master-1', 'master@frontbase.test', 'freeco', 'master_admin', 'pw-master'],
]) {
    await new UserStore(runner, tenant).createUser({
        id, email, passwordHash: await hashPassword(pw), role, tenantSlug: tenant, now: NOW,
    });
}
const freePages = new PagesStore(runner, 'freeco');
await freePages.ensureHomepage(NOW);
// A provider row so the /deploy route reaches the cap gate (its provider
// check runs first — gate placement is after validation).
await new Phase2Store(runner, 'freeco').upsertEdgeResource(
    { id: 'prov-1', kind: 'provider', name: 'Prov' }, NOW,
);

const mint = async (id, email, role, tenantSlug) => `frontbase_session=${await issueSession(
    { sub: id, email, role, tenant_slug: tenantSlug, session_version: 0 }, SECRET, 1_800_000_000,
)}`;
const ownerCookie = await mint('free-owner', 'owner@freeco.test', 'owner', 'freeco');
const masterCookie = await mint('master-1', 'master@frontbase.test', 'master_admin', 'freeco');
const plainCookie = await mint('plain-owner', 'owner@noplans.test', 'owner', 'noplans');

const app = await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: SECRET,
    resolvePrincipal: createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'frontbase_session' }),
    userStoreFor: (t) => new UserStore(runner, t),
    cloudMode: true,
    now: () => NOW,
});
const call = (method, path, body, cookie) => app.fetch(new Request(`https://x.local${path}`, {
    method,
    headers: {
        'content-type': 'application/json',
        host: 'x.local',
        ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}));

console.log('— me/plan: the catalog plan + usage counters —');
check('free tenant resolves the `_global` catalog row (id free, limits applied)', await (async () => {
    const body = await (await call('GET', '/api/tenants/me/plan', undefined, ownerCookie)).json();
    return body.plan?.id === 'free' && body.plan?.name === 'Free'
        && body.plan?.limits?.pages === 10 && body.plan?.limits?.edge_engines === 0
        && body.limits?.pages === 10 && body.limits?.private_pages === false;
})());
check('usage carries the raw counters (1 homepage, 2 freeco members, 0 deploys)', await (async () => {
    const body = await (await call('GET', '/api/tenants/me/plan', undefined, ownerCookie)).json();
    return body.usage?.pages === 1 && body.usage?.team_members === 2
        && body.usage?.workflows === 0 && body.usage?.deploys_monthly === 0;
})());
check('planless tenant stays on the synthetic Community plan (usage all zeros)', await (async () => {
    const body = await (await call('GET', '/api/tenants/me/plan', undefined, plainCookie)).json();
    return body.plan?.id === 'community' && body.usage?.pages === 0
        && body.usage?.team_members === 1 && body.usage?.deploys_monthly === 0;
})());

console.log('— create + publish inside the free budget —');
const homepage = await freePages.homepage();
const about = await call('POST', '/api/pages/', { name: 'About', slug: 'about' }, ownerCookie);
check('plain page create is not gated (no isPublic requested) → 201', about.status === 201);
const aboutId = ((await about.json()).data)?.id;
check('first publish succeeds (2 pages ≤ 10, 0 deploys < 50)', await (async () => {
    const r = await call('POST', `/api/pages/${aboutId}/publish/local/`, {}, ownerCookie);
    return r.status === 200 && (await r.json()).success === true;
})());
check('usage.deploys_monthly counts the Published version row (1)', await (async () => {
    const body = await (await call('GET', '/api/tenants/me/plan', undefined, ownerCookie)).json();
    return body.usage?.deploys_monthly === 1;
})());

console.log('— feature flags (403) —');
check('PUT isPublic:false → 403 "Private pages are not available on your current plan"', await (async () => {
    const r = await call('PUT', `/api/pages/${homepage.id}/`, { isPublic: false }, ownerCookie);
    return r.status === 403 && (await r.json()).detail === 'Private pages are not available on your current plan';
})());
check('POST with isPublic:false → 403 too (honest refusal, not a silently-public page)', await (async () => {
    const r = await call('POST', '/api/pages/', { name: 'S', slug: 'secret', isPublic: false }, ownerCookie);
    return r.status === 403;
})());
check('POST /api/edge-api-keys → 403 "API access is not available on your current plan"', await (async () => {
    const r = await call('POST', '/api/edge-api-keys', { name: 'k', scope: 'user' }, ownerCookie);
    return r.status === 403 && (await r.json()).detail === 'API access is not available on your current plan';
})());

console.log('— counts (402) —');
// Contract validation (url / worker_name are required fields) runs BEFORE the
// handlers, so valid-shaped bodies are what reach the gates.
check('POST /api/edge-engines/ with edge_engines: 0 → 402 limit_exceeded/edge_engines', await (async () => {
    const r = await call('POST', '/api/edge-engines/', { name: 'E1', url: 'https://e1.example.com' }, ownerCookie);
    const body = await r.json();
    return r.status === 402 && body.detail === 'limit_exceeded' && body.limit === 'edge_engines';
})());
check('POST /api/edge-engines/deploy → 402 too (provider check still runs first)', await (async () => {
    const r = await call('POST', '/api/edge-engines/deploy', { name: 'D1', provider_id: 'prov-1', worker_name: 'd1' }, ownerCookie);
    const body = await r.json();
    return r.status === 402 && body.limit === 'edge_engines';
})());
check('deploy with an unknown provider → 400 (validation order preserved)', (await call('POST', '/api/edge-engines/deploy', { name: 'D1', provider_id: 'ghost', worker_name: 'd1' }, ownerCookie)).status === 400);
check('POST /api/settings/invites at team_members cap → 402 limit_exceeded/team_members', await (async () => {
    const r = await call('POST', '/api/settings/invites', { email: 'friend@freeco.test', role: 'admin' }, ownerCookie);
    const body = await r.json();
    return r.status === 402 && body.detail === 'limit_exceeded' && body.limit === 'team_members';
})());

console.log('— publish quotas (pages then deploys_monthly) —');
for (let i = 0; i < 10; i++) {
    await freePages.create({ name: `P${i}`, slug: `p${i}` }, `page-x${i}`, NOW);
}
check('11 non-deleted pages (cap 10) → publish 402 limit_exceeded/pages', await (async () => {
    const r = await call('POST', `/api/pages/${aboutId}/publish/local/`, {}, ownerCookie);
    const body = await r.json();
    return r.status === 402 && body.detail === 'limit_exceeded' && body.limit === 'pages';
})());
for (let i = 0; i < 10; i++) {
    await freePages.permanentDelete(`page-x${i}`);
}
// 50 historical Published rows this month + the real one = 51 ≥ 50.
for (let i = 0; i < 50; i++) {
    await runner.exec(
        'INSERT INTO compat_page_versions (id, page_id, tenant_slug, version_number, layout_data, content_hash, label, created_at) VALUES (?,?,?,?,?,?,?,?)',
        [`v-seed-${i}`, aboutId, 'freeco', 100 + i, '{}', 'h', `Published to seed ${i}`, NOW],
    );
}
check('51 deploys this month (cap 50) → publish 402 limit_exceeded/deploys_monthly', await (async () => {
    const r = await call('POST', `/api/pages/${aboutId}/publish/local/`, {}, ownerCookie);
    const body = await r.json();
    return r.status === 402 && body.detail === 'limit_exceeded' && body.limit === 'deploys_monthly';
})());

console.log('— master_admin bypass (same tenant, same limits) —');
check('master engine create → 201 where the owner got 402', await (async () => {
    const r = await call('POST', '/api/edge-engines/', { name: 'Master Engine', url: 'https://m.example.com' }, masterCookie);
    return r.status === 201;
})());
check('master private-page flip → 200 where the owner got 403', await (async () => {
    const r = await call('PUT', `/api/pages/${homepage.id}/`, { isPublic: false }, masterCookie);
    return r.status === 200;
})());
check('master publish over both quotas → 200', (await call('POST', `/api/pages/${aboutId}/publish/local/`, {}, masterCookie)).status === 200);
check('master invite over the seat cap → 200', (await call('POST', '/api/settings/invites', { email: 'second@freeco.test', role: 'admin' }, masterCookie)).status === 200);

console.log('— planless tenant: every gate inert (self-host "no plan ⇒ unlimited") —');
check('planless engine create → 201', (await call('POST', '/api/edge-engines/', { name: 'Plain Engine', url: 'https://p.example.com' }, plainCookie)).status === 201);
check('planless api key → 201', (await call('POST', '/api/edge-api-keys', { name: 'pk', scope: 'user' }, plainCookie)).status === 201);
check('planless private flip → 200', await (async () => {
    const r = await call('POST', '/api/pages/', { name: 'NP', slug: 'np' }, plainCookie);
    const id = ((await r.json()).data)?.id;
    return r.status === 201 && (await call('PUT', `/api/pages/${id}/`, { isPublic: false }, plainCookie)).status === 200;
})());
check('planless invite → 200', (await call('POST', '/api/settings/invites', { email: 'pal@noplans.test', role: 'admin' }, plainCookie)).status === 200);

console.log('— WA5: the app-host PlansManager edits the `_global` catalog (adminPlansTenant) —');
// The /api/admin/plans* router is per-tenant by default (it reads
// c.get('tenant')). On the cloud app host that would let the operator edit
// their OWN plan rows while `tenants.plan` enforcement resolves against the
// `_global` catalog — the PlansManager would be editing rows nothing reads.
// The `adminPlansTenant` dep re-namespaces the router onto `_global`.
const cloudAdminApp = await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: SECRET,
    resolvePrincipal: createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'frontbase_session' }),
    userStoreFor: (t) => new UserStore(runner, t),
    cloudMode: true,
    adminPlansTenant: () => '_global',
    now: () => NOW,
});
const adminCall = (method, path, body, cookie) => cloudAdminApp.fetch(new Request(`https://x.local${path}`, {
    method,
    headers: {
        'content-type': 'application/json',
        host: 'x.local',
        ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
}));
check('master GET /api/admin/plans lists the seeded `free` catalog row (router reads `_global`)', await (async () => {
    const body = await (await adminCall('GET', '/api/admin/plans', undefined, masterCookie)).json();
    const free = body.plans?.find((p) => p.id === 'free');
    return body.plans?.length === 1 && free?.slug === 'free' && free?.is_active === true;
})());
check('master PUT on a per-tenant-only plan → 404 (the namespacing has a direction)', await (async () => {
    await new Phase2Store(runner, 'freeco').upsertPlan(
        { id: 'local-pro', name: 'Local Pro', priceCents: 0, interval: 'month', limits: { pages: 999 }, isActive: true }, NOW,
    );
    return (await adminCall('PUT', '/api/admin/plans/local-pro', { name: 'Hijack' }, masterCookie)).status === 404;
})());
check('POST /api/admin/plans lands in `_global` and tenants.plan resolves against it', await (async () => {
    const r = await adminCall('POST', '/api/admin/plans', { slug: 'starter', name: 'Starter', limits: { pages: 25 } }, masterCookie);
    if (r.status !== 201) return false;
    // Soft FK: point a fresh tenant at the new catalog id — its me/plan must
    // resolve the `_global` row, proving the CRUD wrote where enforcement reads.
    await tenants.createTenant('starterco', 'Starterco', NOW);
    await tenants.updateTenant('starterco', { plan: 'starter', status: 'active' });
    await new UserStore(runner, 'starterco').createUser({
        id: 'starter-owner', email: 'owner@starterco.test',
        passwordHash: await hashPassword('pw-starter'), role: 'owner', tenantSlug: 'starterco', now: NOW,
    });
    const starterCookie = await mint('starter-owner', 'owner@starterco.test', 'owner', 'starterco');
    const body = await (await call('GET', '/api/tenants/me/plan', undefined, starterCookie)).json();
    return body.plan?.id === 'starter' && body.limits?.pages === 25;
})());
check('per-tenant active plan row still wins precedence over the catalog (freeco on local-pro)', await (async () => {
    const body = await (await call('GET', '/api/tenants/me/plan', undefined, ownerCookie)).json();
    return body.plan?.id === 'local-pro' && body.limits?.pages === 999;
})());
check('default (no dep) stays per-tenant — catalog rows invisible, per-tenant row visible', await (async () => {
    const defaultApp = await createCompatApp({
        makeRunner: async () => runner,
        sessionSecret: SECRET,
        resolvePrincipal: createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'frontbase_session' }),
        userStoreFor: (t) => new UserStore(runner, t),
        cloudMode: true,
        now: () => NOW,
    });
    const body = await (await defaultApp.fetch(new Request('https://x.local/api/admin/plans', {
        headers: { 'content-type': 'application/json', host: 'x.local', cookie: masterCookie },
    }))).json();
    const ids = body.plans?.map((p) => p.id) ?? [];
    return !ids.includes('free') && !ids.includes('starter') && ids.includes('local-pro');
})());

console.log(failures === 0 ? 'cloud-plan-gates: PASS ✅' : `cloud-plan-gates: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
