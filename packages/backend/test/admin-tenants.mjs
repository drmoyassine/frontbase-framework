/**
 * A-25 Phase 4 WA4 — the platform-admin tenant surface (/api/admin/tenants*).
 * Every handler must require the MASTER admin specifically: the app-level
 * '/api/admin/' prefix guard only requires ANY admin, so a tenant `owner`
 * must still be rejected with the product's "Master admin required" (RULE 8
 * mutation target: relaxing the per-handler gate must go red here). Shapes and
 * status codes mirror product tenant_admin.py verbatim — including the create
 * endpoint's lowercase-then-validate order (deliberately looser than signup's)
 * and the team_members cap message on POST users.
 */
import { createResolvePrincipal, hashPassword, issueSession, sqliteRunner } from '@frontbase/edge-infra';
import { createCompatApp } from '../dist/compat/app.js';
import { migrateUp } from '../dist/db/migrations.js';
import { TenantStore } from '../dist/db/tenants.js';
import { UserStore } from '../dist/db/users.js';
import { PagesStore } from '../dist/compat/pages-store.js';
import { seedPlanCatalog } from '../dist/compat/plans/catalog.js';

const NOW = '2026-01-01T00:00:00.000Z';
const SECRET = 'admin-tenants-test-secret-0123456789012';
let failures = 0;
const check = (l, c) => { if (c) console.log(`  ✅ ${l}`); else { failures++; console.log(`  ❌ ${l}`); } };

const runner = sqliteRunner(':memory:');
await migrateUp(runner);

const tenants = new TenantStore(runner);
await tenants.createTenant('acme', 'Acme Inc', NOW);
await tenants.updateTenant('acme', { plan: 'free', status: 'active' });
await tenants.createTenant('globex', 'Globex', NOW); // plan/status NULL — fallback display
await new UserStore(runner, 'acme').createUser({ id: 'acme-owner', email: 'owner@acme.test', passwordHash: await hashPassword('pw-acme-1'), role: 'owner', tenantSlug: 'acme', now: NOW });
await new UserStore(runner, 'acme').createUser({ id: 'acme-editor', email: 'editor@acme.test', passwordHash: await hashPassword('pw-acme-2'), role: 'editor', tenantSlug: 'acme', now: NOW });
await new UserStore(runner, 'globex').createUser({ id: 'globex-owner', email: 'owner@globex.test', passwordHash: await hashPassword('pw-globex'), role: 'owner', tenantSlug: 'globex', now: NOW });
await new UserStore(runner, '_root').createUser({ id: 'master-1', email: 'master@frontbase.test', passwordHash: await hashPassword('pw-master'), role: 'master_admin', tenantSlug: '_root', now: NOW });
await new PagesStore(runner, 'acme').ensureHomepage(NOW);
// One workflow execution this month → usage_stats.executions_current = 1.
await runner.exec(
    'INSERT INTO workflow_executions (id, tenant_slug, workflow_id, status, started_at) VALUES (?,?,?,?,?)',
    ['exec-1', 'acme', 'wf-1', 'success', '2026-01-05T00:00:00.000Z'],
);

const mint = async (id, email, role, tenantSlug) => await issueSession(
    { sub: id, email, role, tenant_slug: tenantSlug, session_version: 0 },
    SECRET,
    1_800_000_000,
);
const masterCookie = `frontbase_session=${await mint('master-1', 'master@frontbase.test', 'master_admin', '_root')}`;
const ownerCookie = `frontbase_session=${await mint('acme-owner', 'owner@acme.test', 'owner', 'acme')}`;

const app = await createCompatApp({
    makeRunner: async () => runner,
    sessionSecret: SECRET,
    resolvePrincipal: createResolvePrincipal({ jwtSecret: SECRET, jwtCookie: 'frontbase_session' }),
    userStoreFor: (t) => new UserStore(runner, t),
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

console.log('— the per-handler master gate —');
check('anonymous list → 401 (default-deny)', (await call('GET', '/api/admin/tenants/')).status === 401);
check('tenant owner list → 403 "Master admin required" (prefix guard alone is not enough)', await (async () => {
    const r = await call('GET', '/api/admin/tenants/', undefined, ownerCookie);
    return r.status === 403 && (await r.json()).detail === 'Master admin required';
})());
check('tenant owner create → 403 too', (await call('POST', '/api/admin/tenants/', { slug: 'evil', name: 'Evil' }, ownerCookie)).status === 403);
check('master list → 200', (await call('GET', '/api/admin/tenants/', undefined, masterCookie)).status === 200);

console.log('— list: product response shape with framework model mapping —');
check('list carries both tenants with counts, owner email, plan/status fallbacks', await (async () => {
    const r = await call('GET', '/api/admin/tenants/', undefined, masterCookie);
    const { tenants: list } = await r.json();
    const acme = list.find((t) => t.slug === 'acme');
    const globex = list.find((t) => t.slug === 'globex');
    return r.status === 200
        && acme?.id === 'acme'
        && acme?.name === 'Acme Inc'
        && acme?.plan === 'free'
        && acme?.status === 'active'
        && acme?.member_count === 2
        && acme?.owner_email === 'owner@acme.test'
        && acme?.owner_last_login_at === null
        && acme?.project_count === 0
        && acme?.active_resources?.pages === 1
        && acme?.active_resources?.workflows === 0
        && acme?.active_resources?.app_users === 0
        && acme?.usage_stats?.executions_current === 1
        && acme?.usage_stats?.executions_limit === -1 // no catalog ⇒ unlimited (product BYO semantics)
        && acme?.usage_stats?.executions_percentage === 0
        && globex?.plan === 'free' && globex?.status === 'active' // NULL → product fallbacks
        && globex?.member_count === 1
        && globex?.owner_email === 'owner@globex.test'
        && globex?.usage_stats?.executions_current === 0;
})());

console.log('— detail —');
check('detail returns members with roles and null project_id', await (async () => {
    const r = await call('GET', '/api/admin/tenants/acme', undefined, masterCookie);
    const { tenant } = await r.json();
    return r.status === 200
        && tenant?.member_count === 2
        && tenant?.project_id === null
        && Array.isArray(tenant?.members)
        && tenant.members.length === 2
        && tenant.members.some((m) => m.email === 'owner@acme.test' && m.role === 'owner' && m.user_id === 'acme-owner')
        && tenant.members.some((m) => m.email === 'editor@acme.test' && m.role === 'editor' && m.created_at === NOW);
})());
check('detail unknown tenant → 404 "Tenant not found"', await (async () => {
    const r = await call('GET', '/api/admin/tenants/nope', undefined, masterCookie);
    return r.status === 404 && (await r.json()).detail === 'Tenant not found';
})());

console.log('— create (product admin semantics: lowercase-then-validate, shorter message) —');
check('create → 201, tenant row active with the requested plan, homepage live', await (async () => {
    const r = await call('POST', '/api/admin/tenants/', { slug: 'initech', name: 'Initech', plan: 'free' }, masterCookie);
    const body = await r.json();
    const row = await tenants.getTenant('initech');
    const pages = await runner.query("SELECT is_homepage, is_published FROM compat_pages WHERE tenant_slug = 'initech'");
    return r.status === 201
        && body.tenant?.slug === 'initech' && body.tenant?.status === 'active' && body.tenant?.project_id === null
        && row?.plan === 'free' && row?.status === 'active'
        && pages.length === 1 && Number(pages[0].is_homepage) === 1 && Number(pages[0].is_published) === 1;
})());
check('mixed-case slug is LOWERCASED first (admin endpoint — deliberately unlike signup)', await (async () => {
    const r = await call('POST', '/api/admin/tenants/', { slug: 'TempCo', name: 'Temp' }, masterCookie);
    return r.status === 201 && (await tenants.getTenant('tempco')) != null && (await tenants.tenantExists('tempco'));
})());
check('short slug → 400 "Slug must be 3-50 characters"', await (async () => {
    const r = await call('POST', '/api/admin/tenants/', { slug: 'ab', name: 'X' }, masterCookie);
    return r.status === 400 && (await r.json()).detail === 'Slug must be 3-50 characters';
})());
check('bad grammar → 400 with the standard message', await (async () => {
    const r = await call('POST', '/api/admin/tenants/', { slug: 'initech-', name: 'X' }, masterCookie);
    return r.status === 400 && (await r.json()).detail === 'Slug must be lowercase alphanumeric with hyphens, cannot start/end with hyphen';
})());
check('framework-internal scopes rejected (`_root` fails the grammar first, either way 400, never created)', await (async () => {
    const r = await call('POST', '/api/admin/tenants/', { slug: '_root', name: 'X' }, masterCookie);
    return r.status === 400 && !(await tenants.tenantExists('_root'));
})());
check('slug collision → 409', (await call('POST', '/api/admin/tenants/', { slug: 'acme', name: 'X' }, masterCookie)).status === 409);
check('malformed body (missing name) → 422 product validation', (await call('POST', '/api/admin/tenants/', { slug: 'okslug' }, masterCookie)).status === 422);

console.log('— POST users: team_members cap, override, collisions —');
await seedPlanCatalog(runner, NOW); // free plan: team_members 1
check('unknown tenant → 404', (await call('POST', '/api/admin/tenants/ghost/users', { email: 'a@b.test', password: 'pw' }, masterCookie)).status === 404);
check('planless globex → cap not applied (no plan ⇒ unlimited), 201', (await call('POST', '/api/admin/tenants/globex/users', { email: 'second@globex.test', password: 'pw-globex-2', role: 'viewer' }, masterCookie)).status === 201);
check('free-plan acme at cap (1) → 403 with the product message', await (async () => {
    const r = await call('POST', '/api/admin/tenants/acme/users', { email: 'third@acme.test', password: 'pw-acme-3' }, masterCookie);
    const body = await r.json();
    return r.status === 403 && body.detail === "Tenant 'acme' is on plan 'free', which allows 1 team member(s). Upgrade the plan or pass override_limit=true.";
})());
check('override_limit=true exceeds the cap deliberately → 201', (await call('POST', '/api/admin/tenants/acme/users', { email: 'third@acme.test', password: 'pw-acme-3', role: 'admin', override_limit: true }, masterCookie)).status === 201);
check('duplicate email (cross-workspace) → 409', await (async () => {
    const r = await call('POST', '/api/admin/tenants/initech/users', { email: 'owner@acme.test', password: 'pw' }, masterCookie);
    return r.status === 409 && (await r.json()).detail === "User with email 'owner@acme.test' already exists";
})());
check('created member can actually log in (framework pbkdf2 hash, not the product sha256)', await (async () => {
    const r = await call('POST', '/api/auth/login', { email: 'third@acme.test', password: 'pw-acme-3' });
    return r.status === 200 && (await r.json()).user?.role === 'admin';
})());

console.log('— PUT update + DELETE soft-suspend —');
check('PUT sets name/plan/status, echoes the row', await (async () => {
    const r = await call('PUT', '/api/admin/tenants/globex', { name: 'Globex Corp', plan: 'free', status: 'active' }, masterCookie);
    const body = await r.json();
    const row = await tenants.getTenant('globex');
    return r.status === 200 && body.success === true
        && body.tenant?.name === 'Globex Corp' && body.tenant?.plan === 'free' && body.tenant?.status === 'active'
        && row?.name === 'Globex Corp' && row?.plan === 'free' && row?.status === 'active';
})());
check('PUT unknown → 404', (await call('PUT', '/api/admin/tenants/ghost', { name: 'X' }, masterCookie)).status === 404);
check('DELETE suspends (soft) → 200 "Tenant \'acme\' suspended", row still exists', await (async () => {
    const r = await call('DELETE', '/api/admin/tenants/acme', undefined, masterCookie);
    const row = await tenants.getTenant('acme');
    return r.status === 200
        && (await r.json()).message === "Tenant 'acme' suspended"
        && row != null && row.status === 'suspended';
})());
check('DELETE unknown → 404', (await call('DELETE', '/api/admin/tenants/ghost', undefined, masterCookie)).status === 404);

console.log(failures === 0 ? 'admin-tenants: PASS ✅' : `admin-tenants: FAIL ❌ (${failures})`);
process.exit(failures === 0 ? 0 : 1);
